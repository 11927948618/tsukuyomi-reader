import { escapeHtml } from "./utils.js";

const TOKEN_KEY = "tsukuyomi:adminToken";
const adminToken = document.getElementById("adminToken");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const clearTokenBtn = document.getElementById("clearTokenBtn");
const bookForm = document.getElementById("bookForm");
const resetFormBtn = document.getElementById("resetFormBtn");
const reloadBooksBtn = document.getElementById("reloadBooksBtn");
const reloadAnalyticsBtn = document.getElementById("reloadAnalyticsBtn");
const reloadStorageBtn = document.getElementById("reloadStorageBtn");
const adminBookList = document.getElementById("adminBookList");
const adminStatus = document.getElementById("adminStatus");
const storageStatus = document.getElementById("storageStatus");
const storageSummary = document.getElementById("storageSummary");
const storagePrefixes = document.getElementById("storagePrefixes");
const analyticsStatus = document.getElementById("analyticsStatus");
const analyticsSummary = document.getElementById("analyticsSummary");
const analyticsRecent = document.getElementById("analyticsRecent");
const usageGuardStatus = document.getElementById("usageGuardStatus");
const updatedAt = document.getElementById("updatedAt");
const openAdminHelpBtn = document.getElementById("openAdminHelpBtn");
const closeAdminHelpBtn = document.getElementById("closeAdminHelpBtn");
const adminHelpOverlay = document.getElementById("adminHelpOverlay");
const adminHelpContent = document.getElementById("adminHelpContent");
const adminHelpButtons = Array.from(document.querySelectorAll("[data-help-kind], [data-help-doc]"));

const QUICK_HELP_HTML = `
  <h3>管理画面でよく使う操作</h3>
  <ol>
    <li><strong>管理トークン</strong>: Cloudflare Pages の環境変数 <code>TSUKUYOMI_ADMIN_TOKEN</code> と同じ値を入れて保存します。</li>
    <li><strong>作品ID</strong>: 英数字、ハイフン、アンダースコアだけ使えます。空欄でも自動作成できます。差し替え時は同じIDを使います。</li>
    <li><strong>本文ファイル</strong>: EPUBまたはTXTを登録できます。表紙はJPG、PNG、WebPを指定できます。</li>
    <li><strong>公開停止</strong>: 作品一覧の「公開停止」で個別に非公開化できます。全体停止はCloudflare環境変数 <code>TSUKUYOMI_PUBLICATION_PAUSED=true</code> です。</li>
    <li><strong>R2使用状況</strong>: 保存容量の概算を確認できます。Class A/B操作数はCloudflare R2 Metricsで確認します。</li>
    <li><strong>読書ログ</strong>: 作品別の開始、読了、平均進捗を軽く確認できます。個人特定目的ではなく、作品傾向の把握用です。</li>
    <li><strong>限定レビュー</strong>: 賞応募候補は公開版に置かず、別のレビュー版ReaderをCloudflare Access等で認証必須にします。</li>
    <li><strong>古いiPhone</strong>: iOS 12.5以降は警告後に試せますが、iPhone 6 Plus実機では描画不可を確認済みです。将来のレガシー対応候補です。</li>
  </ol>
  <p class="admin-note">左のボタンから既存マニュアルや作業ログをこの画面内で確認できます。</p>
`;

adminToken.value = localStorage.getItem(TOKEN_KEY) || "";
updatedAt.value = new Date().toISOString().slice(0, 10);

saveTokenBtn?.addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, adminToken.value || "");
  setStatus("管理トークンを保存しました", "ok");
  loadBooks();
  loadStorage();
  loadAnalytics();
});

clearTokenBtn?.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  adminToken.value = "";
  setStatus("管理トークンを消去しました");
  clearStorage();
  clearAnalytics();
});

reloadBooksBtn?.addEventListener("click", loadBooks);
reloadAnalyticsBtn?.addEventListener("click", loadAnalytics);
reloadStorageBtn?.addEventListener("click", loadStorage);
resetFormBtn?.addEventListener("click", resetForm);
openAdminHelpBtn?.addEventListener("click", openAdminHelp);
closeAdminHelpBtn?.addEventListener("click", closeAdminHelp);

adminHelpOverlay?.addEventListener("click", (event) => {
  if (event.target === adminHelpOverlay) closeAdminHelp();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminHelpOverlay && !adminHelpOverlay.hidden) {
    closeAdminHelp();
  }
});

adminHelpButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.helpKind === "quick") {
      renderQuickHelp(button);
      return;
    }
    loadHelpDocument(button);
  });
});

bookForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください", "error");
    return;
  }

  const formData = new FormData(bookForm);
  formData.set("published", document.getElementById("publishedCheck")?.checked ? "true" : "false");

  setStatus("保存中...");
  try {
    const res = await fetch("./api/admin/books", {
      method: "POST",
      headers: authHeaders(token),
      body: formData
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "保存に失敗しました");
    setStatus("保存しました", "ok");
    resetForm();
    loadBooks();
  } catch (err) {
    setStatus(err.message || "保存に失敗しました", "error");
  }
});

async function loadBooks() {
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください");
    return;
  }

  setStatus("作品一覧を読み込み中...");
  try {
    const res = await fetch("./api/admin/books", {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "作品一覧の読み込みに失敗しました");
    renderUsageGuard(payload?.guard || null);
    renderBooks(Array.isArray(payload?.books) ? payload.books : []);
    setStatus(`${payload.books?.length || 0}件`, "ok");
  } catch (err) {
    adminBookList.innerHTML = "";
    renderUsageGuard(null);
    setStatus(err.message || "作品一覧の読み込みに失敗しました", "error");
  }
}

async function loadAnalytics() {
  const token = getToken();
  if (!token) {
    clearAnalytics("管理トークンを入力してください");
    return;
  }

  setAnalyticsStatus("読書ログを読み込み中...");
  try {
    const res = await fetch("./api/admin/analytics", {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "読書ログの読み込みに失敗しました");
    if (payload?.enabled === false) {
      clearAnalytics(payload.reason || "読書ログDBが未設定です");
      return;
    }
    renderAnalytics(payload);
  } catch (err) {
    clearAnalytics(err.message || "読書ログの読み込みに失敗しました", "error");
  }
}

function renderAnalytics(payload) {
  const summary = Array.isArray(payload?.summary) ? payload.summary : [];
  const recent = Array.isArray(payload?.recent) ? payload.recent : [];
  const source = payload?.source === "r2-lite" ? "R2軽量集計" : "D1";
  setAnalyticsStatus(`${source}: ${summary.length}作品 / 最近${recent.length}件`, "ok");

  if (analyticsSummary) {
    analyticsSummary.innerHTML = summary.length
      ? summary.map(renderAnalyticsSummaryRow).join("")
      : `<p class="admin-note">読書ログはまだありません。</p>`;
  }

  if (analyticsRecent) {
    analyticsRecent.innerHTML = recent.length
      ? recent.map(renderAnalyticsRecentRow).join("")
      : "";
  }
}

function renderAnalyticsSummaryRow(row) {
  const readers = Number(row.readers) || 0;
  const opens = Number(row.opens) || 0;
  const finishes = Number(row.finishes) || 0;
  const finishRate = opens > 0 ? Math.round((finishes / opens) * 100) : 0;
  const progress = Number(row.avgProgress) || 0;
  return `
    <div class="admin-analytics-row">
      <strong>${escapeHtml(row.bookId || "-")}</strong>
      <span><span class="admin-analytics-label">読者</span> ${readers}</span>
      <span><span class="admin-analytics-label">開始</span> ${opens}</span>
      <span><span class="admin-analytics-label">読了</span> ${finishes}</span>
      <span><span class="admin-analytics-label">率</span> ${finishRate}% / 平均${progress}%</span>
    </div>
  `;
}

function renderAnalyticsRecentRow(row) {
  return `
    <div class="admin-analytics-row">
      <span>${escapeHtml(formatDateTime(row.createdAt))}</span>
      <strong>${escapeHtml(row.eventType || "-")}</strong>
      <span>${escapeHtml(row.bookId || "-")}</span>
      <span>${row.progressPercent == null ? "-" : `${Number(row.progressPercent) || 0}%`}</span>
    </div>
  `;
}

function clearAnalytics(message = "管理トークン保存後に読み込みます", type = "") {
  setAnalyticsStatus(message, type);
  if (analyticsSummary) analyticsSummary.innerHTML = "";
  if (analyticsRecent) analyticsRecent.innerHTML = "";
}

async function loadStorage() {
  const token = getToken();
  if (!token) {
    clearStorage("管理トークンを入力してください");
    return;
  }

  setStorageStatus("R2使用状況を読み込み中...");
  try {
    const res = await fetch("./api/admin/storage", {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "R2使用状況の読み込みに失敗しました");
    renderStorage(payload);
  } catch (err) {
    clearStorage(err.message || "R2使用状況の読み込みに失敗しました", "error");
  }
}

function renderStorage(payload) {
  const storage = payload?.storage || {};
  const usedBytes = Number(storage.usedBytes) || 0;
  const freeTierBytes = Number(storage.freeTierBytes) || 0;
  const remainingBytes = Number(storage.remainingBytes) || 0;
  const usedPercent = Number(storage.usedPercent) || 0;
  const objectCount = Number(storage.objectCount) || 0;
  const truncated = storage.truncated === true;
  setStorageStatus(
    `${formatBytes(usedBytes)} 使用 / ${objectCount.toLocaleString()} objects${truncated ? " / 走査上限あり" : ""}`,
    usedPercent >= 90 ? "error" : usedPercent >= 70 ? "warn" : "ok"
  );

  if (storageSummary) {
    storageSummary.innerHTML = `
      <div class="admin-storage-meter" aria-label="R2 storage usage">
        <span style="width:${Math.max(0, Math.min(100, usedPercent))}%"></span>
      </div>
      <div class="admin-storage-grid">
        <div><span class="admin-analytics-label">使用量</span><strong>${formatBytes(usedBytes)}</strong></div>
        <div><span class="admin-analytics-label">無料枠目安</span><strong>${formatBytes(freeTierBytes)}</strong></div>
        <div><span class="admin-analytics-label">残り目安</span><strong>${formatBytes(remainingBytes)}</strong></div>
        <div><span class="admin-analytics-label">使用率</span><strong>${Number.isFinite(usedPercent) ? `${usedPercent}%` : "-"}</strong></div>
      </div>
    `;
  }

  if (storagePrefixes) {
    const prefixes = payload?.prefixes && typeof payload.prefixes === "object" ? payload.prefixes : {};
    const rows = Object.entries(prefixes)
      .sort((a, b) => (Number(b[1]?.bytes) || 0) - (Number(a[1]?.bytes) || 0))
      .map(([prefix, value]) => `
        <div class="admin-storage-row">
          <strong>${escapeHtml(prefix)}</strong>
          <span>${formatBytes(Number(value?.bytes) || 0)}</span>
          <span>${(Number(value?.count) || 0).toLocaleString()} objects</span>
        </div>
      `);
    storagePrefixes.innerHTML = rows.length ? rows.join("") : `<p class="admin-note">R2オブジェクトはまだありません。</p>`;
  }
}

function clearStorage(message = "管理トークン保存後に読み込みます", type = "") {
  setStorageStatus(message, type);
  if (storageSummary) storageSummary.innerHTML = "";
  if (storagePrefixes) storagePrefixes.innerHTML = "";
}

function setStorageStatus(message, type = "") {
  if (!storageStatus) return;
  storageStatus.textContent = message;
  storageStatus.className = `status ${type}`.trim();
}

function setAnalyticsStatus(message, type = "") {
  if (!analyticsStatus) return;
  analyticsStatus.textContent = message;
  analyticsStatus.className = `status ${type}`.trim();
}

function renderUsageGuard(guard) {
  if (!usageGuardStatus) return;
  if (!guard || !guard.level || guard.level === "ok") {
    usageGuardStatus.hidden = true;
    usageGuardStatus.textContent = "";
    usageGuardStatus.className = "admin-guard";
    return;
  }

  const labels = {
    watch: "使用量注意",
    "restrict-publishing": "新規公開停止",
    paused: "公開一時停止"
  };
  const projected = guard.metrics?.classBProjected
    ? ` / 月間見込み ${Number(guard.metrics.classBProjected).toLocaleString()}回`
    : "";
  const reason = guard.reason ? ` / ${guard.reason}` : "";
  usageGuardStatus.hidden = false;
  usageGuardStatus.className = `admin-guard level-${guard.level}`;
  usageGuardStatus.textContent = `${labels[guard.level] || guard.level}${projected}${reason}`;
}

function renderBooks(books) {
  if (!books.length) {
    adminBookList.innerHTML = `<p class="admin-note">作品はまだ登録されていません。</p>`;
    return;
  }

  adminBookList.innerHTML = books
    .map((book) => {
      const cover = book.published === true && book.cover
        ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title || "")} 表紙" />`
        : "";
      const published = book.published === true;
      return `
        <article class="admin-book-card" data-book-id="${escapeHtml(book.id || "")}">
          <div class="admin-book-cover">${cover}</div>
          <div class="admin-book-info">
            <h3 class="admin-book-title">${escapeHtml(book.title || "Untitled")}</h3>
            <p class="admin-book-meta">${escapeHtml(book.author || "")}</p>
            <p class="admin-book-meta">${escapeHtml(book.description || "")}</p>
            <p class="admin-book-meta">ID: ${escapeHtml(book.id || "")} / 更新日: ${escapeHtml(book.updatedAt || "-")}</p>
            <span class="admin-pill ${published ? "published" : "private"}">${published ? "公開中" : "非公開"}</span>
            <div class="admin-book-actions">
              <button class="button ghost" type="button" data-action="edit">編集に読み込む</button>
              <button class="button ghost" type="button" data-action="toggle">${published ? "公開停止" : "公開する"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  adminBookList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-book-id]");
      const id = card?.dataset.bookId || "";
      const book = books.find((entry) => entry.id === id);
      if (!book) return;
      if (button.dataset.action === "edit") {
        fillForm(book);
      } else {
        togglePublished(book);
      }
    });
  });
}

async function togglePublished(book) {
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください", "error");
    return;
  }

  const nextPublished = book.published !== true;
  setStatus(nextPublished ? "公開へ変更中..." : "公開停止中...");
  try {
    const res = await fetch(`./api/admin/books/${encodeURIComponent(book.id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ published: nextPublished })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "公開状態の変更に失敗しました");
    setStatus(nextPublished ? "公開しました" : "公開停止しました", "ok");
    loadBooks();
  } catch (err) {
    setStatus(err.message || "公開状態の変更に失敗しました", "error");
  }
}

function fillForm(book) {
  bookForm.elements.id.value = book.id || "";
  bookForm.elements.title.value = book.title || "";
  bookForm.elements.author.value = book.author || "";
  bookForm.elements.description.value = book.description || "";
  bookForm.elements.updatedAt.value = book.updatedAt || new Date().toISOString().slice(0, 10);
  document.getElementById("publishedCheck").checked = book.published === true;
  setStatus("編集内容をフォームに読み込みました。本文ファイル/表紙は必要な場合だけ選択してください。");
}

function resetForm() {
  bookForm.reset();
  bookForm.elements.author.value = "hal the juggernaut";
  bookForm.elements.updatedAt.value = new Date().toISOString().slice(0, 10);
  document.getElementById("publishedCheck").checked = true;
}

function openAdminHelp() {
  if (!adminHelpOverlay) return;
  adminHelpOverlay.hidden = false;
  if (adminHelpContent && !adminHelpContent.innerHTML.trim()) {
    renderQuickHelp(adminHelpButtons.find((button) => button.dataset.helpKind === "quick"));
  }
  closeAdminHelpBtn?.focus();
}

function closeAdminHelp() {
  if (!adminHelpOverlay) return;
  adminHelpOverlay.hidden = true;
  openAdminHelpBtn?.focus();
}

function renderQuickHelp(button) {
  if (!adminHelpContent) return;
  setActiveHelpButton(button);
  adminHelpContent.innerHTML = QUICK_HELP_HTML;
}

async function loadHelpDocument(button) {
  if (!adminHelpContent) return;
  const path = button?.dataset.helpDoc || "";
  if (!path) return;

  setActiveHelpButton(button);
  adminHelpContent.innerHTML = `<p class="admin-note">読み込み中: ${escapeHtml(path)}</p>`;
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const title = button.textContent?.trim() || "ヘルプ";
    adminHelpContent.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <pre>${escapeHtml(text)}</pre>
    `;
    adminHelpContent.scrollTop = 0;
  } catch (err) {
    adminHelpContent.innerHTML = `
      <h3>読み込み失敗</h3>
      <p class="admin-note">${escapeHtml(path)} を読み込めませんでした。${escapeHtml(err.message || "")}</p>
    `;
  }
}

function setActiveHelpButton(activeButton) {
  adminHelpButtons.forEach((button) => {
    button.classList.toggle("active", Boolean(activeButton && button === activeButton));
  });
}

function getToken() {
  return adminToken.value || localStorage.getItem(TOKEN_KEY) || "";
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`
  };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (err) {
    return null;
  }
}

function setStatus(message, type = "") {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  adminStatus.className = `status ${type}`.trim();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.max(0, value);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : size >= 100 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

loadBooks();
loadStorage();
loadAnalytics();
