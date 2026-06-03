import { escapeHtml } from "./utils.js";

const TOKEN_KEY = "tsukuyomi:adminToken";
const adminToken = document.getElementById("adminToken");
const adminTokenAuth = document.getElementById("adminTokenAuth");
const adminOtpAuth = document.getElementById("adminOtpAuth");
const adminOtpEmail = document.getElementById("adminOtpEmail");
const adminOtpCode = document.getElementById("adminOtpCode");
const sendAdminOtpBtn = document.getElementById("sendAdminOtpBtn");
const verifyAdminOtpBtn = document.getElementById("verifyAdminOtpBtn");
const adminOtpLogoutBtn = document.getElementById("adminOtpLogoutBtn");
const adminOtpNote = document.getElementById("adminOtpNote");
const adminAuthLogBlock = document.getElementById("adminAuthLogBlock");
const adminAuthLog = document.getElementById("adminAuthLog");
const downloadAdminAuthLogBtn = document.getElementById("downloadAdminAuthLogBtn");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const clearTokenBtn = document.getElementById("clearTokenBtn");
const bookForm = document.getElementById("bookForm");
const resetFormBtn = document.getElementById("resetFormBtn");
const reloadBooksBtn = document.getElementById("reloadBooksBtn");
const reloadAnalyticsBtn = document.getElementById("reloadAnalyticsBtn");
const reloadStorageBtn = document.getElementById("reloadStorageBtn");
const reloadReviewAccessBtn = document.getElementById("reloadReviewAccessBtn");
const adminBookList = document.getElementById("adminBookList");
const adminStatus = document.getElementById("adminStatus");
const promotionSummary = document.getElementById("promotionSummary");
const storageStatus = document.getElementById("storageStatus");
const storageSummary = document.getElementById("storageSummary");
const storagePrefixes = document.getElementById("storagePrefixes");
const reviewAccessStatus = document.getElementById("reviewAccessStatus");
const reviewAccessList = document.getElementById("reviewAccessList");
const reviewName = document.getElementById("reviewName");
const reviewerId = document.getElementById("reviewerId");
const reviewEmail = document.getElementById("reviewEmail");
const reviewStatus = document.getElementById("reviewStatus");
const reviewNote = document.getElementById("reviewNote");
const addReviewAccessBtn = document.getElementById("addReviewAccessBtn");
const quickIssueReviewPasswordBtn = document.getElementById("quickIssueReviewPasswordBtn");
const generateReviewerIdBtn = document.getElementById("generateReviewerIdBtn");
const reviewPasswordResult = document.getElementById("reviewPasswordResult");
const reviewAuthSummary = document.getElementById("reviewAuthSummary");
const reviewAuthLog = document.getElementById("reviewAuthLog");
const downloadReviewAuthLogBtn = document.getElementById("downloadReviewAuthLogBtn");
const analyticsStatus = document.getElementById("analyticsStatus");
const analyticsSummary = document.getElementById("analyticsSummary");
const analyticsRecent = document.getElementById("analyticsRecent");
const usageGuardStatus = document.getElementById("usageGuardStatus");
const updatedAt = document.getElementById("updatedAt");
const openAdminHelpBtn = document.getElementById("openAdminHelpBtn");
const copyReaderUrlBtn = document.getElementById("copyReaderUrlBtn");
const closeAdminHelpBtn = document.getElementById("closeAdminHelpBtn");
const adminHelpOverlay = document.getElementById("adminHelpOverlay");
const adminHelpContent = document.getElementById("adminHelpContent");
const adminHelpButtons = Array.from(document.querySelectorAll("[data-help-kind], [data-help-doc]"));
let reviewAccessEntries = [];
let reviewAuthSummaryData = null;
let reviewAuthLogEvents = [];
let reviewAuthLogUpdatedAt = "";
let adminAuthLogEvents = [];
let adminAuthMode = "token";
let adminAuthenticated = false;
let adminOtpChallengeId = "";
let loadedBookScope = "limited";

const QUICK_HELP_HTML = `
  <h3>管理画面でよく使う操作</h3>
  <ol>
    <li><strong>管理者認証</strong>: 当面は <code>token</code> モードで <code>TSUKUYOMI_ADMIN_TOKEN</code> を保存します。<code>email_otp</code> モードはメール送信設定を使う場合のオプションです。</li>
    <li><strong>作品ID</strong>: 英数字、ハイフン、アンダースコアだけ使えます。空欄でも自動作成できます。差し替え時は同じIDを使います。</li>
    <li><strong>本文ファイル</strong>: EPUB、TXT、PDFを登録できます。PDFは固定レイアウト作品として表示します。表紙はJPG、PNG、WebPを指定できます。</li>
    <li><strong>一般公開</strong>: 作品は限定レビューへ保存し、一般公開する時だけ「一般公開へ昇格」で公開用R2へ7日間コピーします。全体停止はCloudflare環境変数 <code>TSUKUYOMI_PUBLICATION_PAUSED=true</code> です。</li>
    <li><strong>限定レビュー案内</strong>: 作品を保存し、相手に <code>PW発行</code> した後、ヘッダーの「限定URLコピー」で読者画面URLをコピーして送ります。</li>
    <li><strong>表紙削除・作品削除</strong>: 表紙だけ外す場合は「表紙削除」、本文ごとR2から消す場合は「作品削除」を使います。</li>
    <li><strong>R2使用状況</strong>: 保存容量の概算を確認できます。Class A/B操作数はCloudflare R2 Metricsで確認します。</li>
    <li><strong>読書ログ</strong>: 作品別の開始、読了、平均進捗を軽く確認できます。読者同士には公開せず、管理側で一元保管・集計して作品傾向や将来分析に使います。</li>
    <li><strong>限定レビュー</strong>: 賞応募候補は公開版に置かず、別のレビュー版ReaderをCloudflare AccessまたはReader内パスワード認証で保護します。</li>
    <li><strong>古いiPhone</strong>: iOS 12.5以降は警告後に試せますが、iPhone 6 Plus実機では描画不可を確認済みです。将来のレガシー対応候補です。</li>
  </ol>
  <p class="admin-note">左のボタンから既存マニュアルや作業ログをこの画面内で確認できます。</p>
`;

const ACCESS_HELP_HTML = `
  <h3>個別アクセス許可の手順</h3>
  <ol>
    <li><strong>Reader内パスワード認証</strong>: <code>TSUKUYOMI_REVIEW_PASSWORD_AUTH=true</code> を設定し、管理画面で相手のメールアドレスまたは仮IDにパスワードを発行します。平文は発行時だけ表示されます。</li>
    <li><strong>案内URL</strong>: ヘッダーの「限定URLコピー」で、この管理画面と同じPages projectの読者画面URLをコピーできます。仮IDまたはメールアドレス、発行パスワードと一緒に相手へ送ります。</li>
    <li><strong>Cloudflare側で許可する</strong>: Cloudflare Accessを使う場合は、Dashboardで限定レビュー版Pagesを開き、Accessの許可ポリシーに相手のメールアドレスを追加します。</li>
    <li><strong>保護範囲を確認する</strong>: Reader画面だけでなく、<code>/api/books</code>、本文API、表紙APIも未認証で読めないようにします。</li>
    <li><strong>One-time PIN</strong>: 友人側にアカウント作成を求めない場合は、One-time PIN方式を使います。</li>
    <li><strong>パスワードを発行する</strong>: 下の「限定レビュー認証管理」に名前、仮ID、メールのいずれかを入力し、<code>PW発行</code> で登録、閲覧許可、パスワード発行をまとめて行います。</li>
    <li><strong>読書ログへ紐づける</strong>: 限定レビュー版で <code>TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS=true</code> を設定すると、Access認証済みメールと読書ログを管理用に紐づけます。</li>
    <li><strong>閲覧保留</strong>: <code>TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK=true</code> を設定した限定レビュー版では、状態を「閲覧保留」にした相手へ作品一覧を空で返します。Access許可は残すため、ログイン拒否より気づかれにくい保留になります。</li>
    <li><strong>停止時</strong>: Cloudflare Accessから相手を外し、管理画面の記録も「停止済み」にします。</li>
  </ol>
  <p class="admin-note">Cloudflare Accessの許可リスト全員が自動表示されるわけではありません。Reader内パスワード認証では、この一覧に登録したメールアドレスまたは仮IDが認証対象です。</p>
  <p class="admin-note">これは読者同士に進捗を公開する機能ではありません。管理側が一元的に保管・集計し、将来の文芸分析や作品改善に使うための記録です。</p>
  <p class="admin-note">賞応募候補は公開版Readerに置かず、認証付きの限定レビュー版だけで扱います。案内文には、閲覧データを管理側で分析目的に利用することがある旨を入れます。</p>
  <p class="admin-note">閲覧保留は読者側に理由を表示しません。管理上の保留として使い、連絡が必要になった場合は個別に対応します。</p>
`;

adminToken.value = localStorage.getItem(TOKEN_KEY) || "";
updatedAt.value = new Date().toISOString().slice(0, 10);

saveTokenBtn?.addEventListener("click", () => {
  adminAuthenticated = true;
  localStorage.setItem(TOKEN_KEY, adminToken.value || "");
  setStatus("管理トークンを保存しました", "ok");
  loadBooks();
  loadStorage();
  loadAnalytics();
  loadReviewAccess();
  loadAdminAuthLog();
});

clearTokenBtn?.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  adminToken.value = "";
  adminAuthenticated = false;
  setStatus("管理トークンを消去しました");
  clearAdminAuthLog();
  clearStorage();
  clearAnalytics();
  clearReviewAccess();
});
sendAdminOtpBtn?.addEventListener("click", requestAdminOtp);
verifyAdminOtpBtn?.addEventListener("click", verifyAdminOtp);
adminOtpLogoutBtn?.addEventListener("click", logoutAdminOtp);
downloadAdminAuthLogBtn?.addEventListener("click", downloadAdminAuthLog);
downloadReviewAuthLogBtn?.addEventListener("click", downloadReviewAuthLog);

reloadBooksBtn?.addEventListener("click", loadBooks);
reloadAnalyticsBtn?.addEventListener("click", loadAnalytics);
reloadStorageBtn?.addEventListener("click", loadStorage);
reloadReviewAccessBtn?.addEventListener("click", loadReviewAccess);
resetFormBtn?.addEventListener("click", resetForm);
openAdminHelpBtn?.addEventListener("click", openAdminHelp);
copyReaderUrlBtn?.addEventListener("click", copyReaderUrl);
closeAdminHelpBtn?.addEventListener("click", closeAdminHelp);
addReviewAccessBtn?.addEventListener("click", addReviewAccessEntry);
quickIssueReviewPasswordBtn?.addEventListener("click", quickIssueReviewPassword);
generateReviewerIdBtn?.addEventListener("click", () => {
  if (reviewerId) reviewerId.value = createReviewerId();
});

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
    if (button.dataset.helpKind === "access") {
      renderAccessHelp(button);
      return;
    }
    loadHelpDocument(button);
  });
});

bookForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
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
    setStatus(adminAuthRequiredMessage());
    return;
  }

  const scope = selectedBookScope();
  setStatus(`${bookScopeLabel(scope)}の作品一覧を読み込み中...`);
  try {
    const res = await fetch(`./api/admin/books?scope=${encodeURIComponent(scope)}`, {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "作品一覧の読み込みに失敗しました");
    loadedBookScope = normalizeBookScope(payload?.scope || scope);
    renderUsageGuard(payload?.guard || null);
    renderPromotionSummary(payload, loadedBookScope);
    renderBooks(Array.isArray(payload?.books) ? payload.books : [], loadedBookScope);
    setStatus(`${bookScopeLabel(loadedBookScope)} ${payload.books?.length || 0}件`, payload?.promotionSummary?.error ? "warn" : "ok");
  } catch (err) {
    adminBookList.innerHTML = "";
    renderPromotionSummary(null, loadedBookScope);
    renderUsageGuard(null);
    setStatus(err.message || "作品一覧の読み込みに失敗しました", "error");
  }
}

function renderPromotionSummary(payload, scope) {
  if (!promotionSummary) return;
  const text = promotionSummaryText(payload, scope);
  promotionSummary.hidden = !text;
  promotionSummary.textContent = text;
  promotionSummary.className = `admin-promotion-summary ${payload?.promotionSummary?.error ? "warn" : ""}`.trim();
}

function promotionSummaryText(payload, scope) {
  if (!payload || normalizeBookScope(scope) !== "limited") return "";
  const count = Array.isArray(payload?.books) ? payload.books.length : 0;
  const parts = [`${bookScopeLabel(scope)} ${count}件`];
  const summary = payload?.promotionSummary || null;
  if (summary) {
    parts.push(`一般公開中 ${Number(summary.active) || 0}件`);
    if (summary.nearestRemainingDays != null) {
      parts.push(`最短残り${Number(summary.nearestRemainingDays) || 0}日`);
    }
    if (Number(summary.expired) > 0) {
      parts.push(`期限切れ ${Number(summary.expired)}件`);
    }
    if (summary.error) {
      parts.push(`公開用R2確認不可: ${summary.error}`);
    }
  }
  return parts.join(" / ");
}

async function loadAnalytics() {
  const token = getToken();
  if (!token) {
    clearAnalytics(adminAuthRequiredMessage());
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
  const reviewers = Array.isArray(payload?.reviewers) ? payload.reviewers : [];
  const source = payload?.source === "r2-lite" ? "R2軽量集計" : "D1";
  setAnalyticsStatus(`${source}: ${summary.length}作品 / 個別${reviewers.length}件 / 最近${recent.length}件`, "ok");

  if (analyticsSummary) {
    const summaryHtml = summary.length
      ? summary.map(renderAnalyticsSummaryRow).join("")
      : `<p class="admin-note">読書ログはまだありません。</p>`;
    const reviewerHtml = reviewers.length
      ? `<h3 class="admin-subhead">Access別読書ログ（管理用）</h3><p class="admin-note">読者間には公開せず、管理側の将来分析用に保管・集計します。</p>${reviewers.map(renderReviewerAnalyticsRow).join("")}`
      : "";
    analyticsSummary.innerHTML = `${summaryHtml}${reviewerHtml}`;
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
  const accessEmail = row.accessEmail ? ` / ${row.accessEmail}` : "";
  return `
    <div class="admin-analytics-row">
      <span>${escapeHtml(formatDateTime(row.createdAt))}</span>
      <strong>${escapeHtml(row.eventType || "-")}</strong>
      <span>${escapeHtml(`${row.bookId || "-"}${accessEmail}`)}</span>
      <span>${row.progressPercent == null ? "-" : `${Number(row.progressPercent) || 0}%`}</span>
    </div>
  `;
}

function renderReviewerAnalyticsRow(row) {
  const opens = Number(row.opens) || 0;
  const finishes = Number(row.finishes) || 0;
  const maxProgress = Number(row.maxProgress) || 0;
  return `
    <div class="admin-analytics-row">
      <strong>${escapeHtml(row.reviewerEmail || "-")}</strong>
      <span><span class="admin-analytics-label">作品</span> ${escapeHtml(row.bookId || "-")}</span>
      <span><span class="admin-analytics-label">開始</span> ${opens}</span>
      <span><span class="admin-analytics-label">読了</span> ${finishes}</span>
      <span><span class="admin-analytics-label">最大</span> ${maxProgress}%</span>
    </div>
  `;
}

function clearAnalytics(message = adminAuthRequiredMessage(), type = "") {
  setAnalyticsStatus(message, type);
  if (analyticsSummary) analyticsSummary.innerHTML = "";
  if (analyticsRecent) analyticsRecent.innerHTML = "";
}

async function loadReviewAccess() {
  const token = getToken();
  if (!token) {
    clearReviewAccess(adminAuthRequiredMessage());
    return;
  }

  setReviewAccessStatus("限定レビュー認証管理を読み込み中...");
  try {
    const res = await fetch("./api/admin/review-access", {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "限定レビュー認証管理の読み込みに失敗しました");
    reviewAccessEntries = Array.isArray(payload?.entries) ? payload.entries : [];
    reviewAuthSummaryData = payload?.authSummary || null;
    reviewAuthLogEvents = Array.isArray(payload?.authLog?.events) ? payload.authLog.events : [];
    reviewAuthLogUpdatedAt = payload?.authLog?.updatedAt || "";
    renderReviewAccess(payload?.updatedAt || "");
    renderReviewAuthSummary();
    renderReviewAuthLog();
  } catch (err) {
    clearReviewAccess(err.message || "限定レビュー認証管理の読み込みに失敗しました", "error");
  }
}

async function addReviewAccessEntry() {
  const draft = createReviewAccessDraft({ autoReviewerId: true });
  if (!draft) {
    setReviewAccessStatus("名前、仮ID、メールアドレスのいずれかを入力してください", "error");
    return;
  }

  reviewAccessEntries = [...reviewAccessEntries, draft];
  const saved = await saveReviewAccessEntries("一覧に追加しました");
  if (saved) resetReviewAccessForm();
}

async function quickIssueReviewPassword() {
  const draft = createReviewAccessDraft({ autoReviewerId: true, status: "applied" });
  if (!draft) {
    setReviewAccessStatus("名前、仮ID、メールアドレスのいずれかを入力してください", "error");
    return;
  }

  let index = findReviewAccessEntryIndex(draft);
  if (index >= 0) {
    const existing = reviewAccessEntries[index];
    const label = existing.email || existing.reviewerId;
    if (existing.hasPassword && !window.confirm(`${label} のパスワードを再発行します。古いパスワードと既存セッションは無効になります。`)) {
      return;
    }
    reviewAccessEntries = reviewAccessEntries.map((entry, itemIndex) => (
      itemIndex === index ? mergeReviewAccessDraft(entry, draft) : entry
    ));
  } else {
    reviewAccessEntries = [...reviewAccessEntries, draft];
  }

  const saved = await saveReviewAccessEntries("閲覧許可を保存しました");
  if (!saved) return;

  index = findReviewAccessEntryIndex(draft);
  if (index < 0) {
    setReviewAccessStatus("パスワード発行対象を保存後に見つけられませんでした", "error");
    return;
  }

  const issued = await issueReviewPassword(index, {
    clearForm: true,
    skipConfirm: true,
    successMessage: "閲覧許可とパスワードを発行しました。平文はこの表示で控えてください。"
  });
  if (!issued) return;
}

function createReviewAccessDraft(options = {}) {
  const name = String(reviewName?.value || "").trim();
  const email = normalizeReviewEmail(reviewEmail?.value || "");
  const note = String(reviewNote?.value || "").trim();
  const hasAnyInput = Boolean(name || email || String(reviewerId?.value || "").trim());
  let reviewerIdValue = normalizeReviewerId(reviewerId?.value || "");
  if (!reviewerIdValue && options.autoReviewerId && hasAnyInput) reviewerIdValue = createReviewerId();
  if (!name && !email && !reviewerIdValue) return null;

  const now = new Date().toISOString();
  const status = options.status || reviewStatus?.value || "pending";
  return {
    id: `${email || reviewerIdValue || name}-${Date.now()}`,
    reviewerId: reviewerIdValue,
    name,
    email,
    status,
    note,
    addedAt: now,
    appliedAt: status === "applied" ? now : "",
    mutedAt: status === "muted" ? now : "",
    revokedAt: status === "revoked" ? now : ""
  };
}

function mergeReviewAccessDraft(entry, draft) {
  const now = new Date().toISOString();
  return {
    ...entry,
    reviewerId: entry.reviewerId || draft.reviewerId,
    name: draft.name || entry.name,
    email: draft.email || entry.email,
    note: draft.note || entry.note,
    status: "applied",
    appliedAt: entry.appliedAt || now,
    mutedAt: "",
    revokedAt: ""
  };
}

function findReviewAccessEntryIndex(target) {
  const email = normalizeReviewEmail(target?.email || "");
  const reviewerIdValue = normalizeReviewerId(target?.reviewerId || "");
  return reviewAccessEntries.findIndex((entry) => (
    (email && normalizeReviewEmail(entry.email || "") === email) ||
    (reviewerIdValue && normalizeReviewerId(entry.reviewerId || "") === reviewerIdValue)
  ));
}

function resetReviewAccessForm() {
  if (reviewName) reviewName.value = "";
  if (reviewerId) reviewerId.value = "";
  if (reviewEmail) reviewEmail.value = "";
  if (reviewNote) reviewNote.value = "";
  if (reviewStatus) reviewStatus.value = "pending";
}

async function saveReviewAccessEntries(successMessage = "保存しました") {
  const token = getToken();
  if (!token) {
    setReviewAccessStatus(adminAuthRequiredMessage(), "error");
    return null;
  }

  setReviewAccessStatus("限定レビュー認証管理を保存中...");
  try {
    const res = await fetch("./api/admin/review-access", {
      method: "PUT",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ entries: reviewAccessEntries })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "限定レビュー認証管理の保存に失敗しました");
    reviewAccessEntries = Array.isArray(payload?.entries) ? payload.entries : [];
    applyReviewAuthDiagnostics(payload);
    renderReviewAccess(payload?.updatedAt || "");
    setReviewAccessStatus(successMessage, "ok");
    return payload;
  } catch (err) {
    setReviewAccessStatus(err.message || "限定レビュー認証管理の保存に失敗しました", "error");
    return null;
  }
}

function renderReviewAccess(updatedAt = "") {
  if (!reviewAccessList) return;
  const applied = reviewAccessEntries.filter((entry) => entry.status === "applied").length;
  const pending = reviewAccessEntries.filter((entry) => entry.status === "pending").length;
  const muted = reviewAccessEntries.filter((entry) => entry.status === "muted").length;
  const revoked = reviewAccessEntries.filter((entry) => entry.status === "revoked").length;
  const passwords = reviewAccessEntries.filter((entry) => entry.hasPassword).length;
  const updated = updatedAt ? ` / 更新 ${formatDateTime(updatedAt)}` : "";
  setReviewAccessStatus(`合計${reviewAccessEntries.length}件 / 許可${applied} / 未適用${pending} / 保留${muted} / 停止${revoked} / PW発行${passwords}${updated}`, "ok");

  if (!reviewAccessEntries.length) {
    reviewAccessList.innerHTML = `<p class="admin-note">許可メモはまだありません。</p>`;
    return;
  }

  reviewAccessList.innerHTML = reviewAccessEntries
    .map((entry, index) => {
      const status = reviewStatusLabel(entry.status);
      const appliedAt = entry.appliedAt ? `適用: ${formatDateTime(entry.appliedAt)}` : "";
      const mutedAt = entry.mutedAt ? `保留: ${formatDateTime(entry.mutedAt)}` : "";
      const revokedAt = entry.revokedAt ? `停止: ${formatDateTime(entry.revokedAt)}` : "";
      const passwordAt = entry.passwordIssuedAt ? `PW発行: ${formatDateTime(entry.passwordIssuedAt)}` : "";
      const passwordExpiresAt = entry.passwordExpiresAt ? `PW期限: ${formatDateTime(entry.passwordExpiresAt)}` : "";
      const lastLogin = entry.lastLoginAt ? `最終ログイン: ${formatDateTime(entry.lastLoginAt)}` : "";
      const lastFailed = entry.lastFailedAt ? `失敗: ${formatDateTime(entry.lastFailedAt)} (${Number(entry.failedLoginCount) || 0})` : "";
      const lockedUntil = entry.loginLockedUntil && new Date(entry.loginLockedUntil).getTime() > Date.now()
        ? `ロック中: ${formatDateTime(entry.loginLockedUntil)}まで`
        : "";
      const dateNote = [appliedAt, mutedAt, revokedAt, passwordAt, passwordExpiresAt, lastLogin, lastFailed, lockedUntil].filter(Boolean).join(" / ");
      const passwordLabel = entry.hasPassword ? "PW発行済み" : "PW未発行";
      return `
        <article class="admin-review-row" data-review-index="${index}">
          <div class="admin-review-main">
            <strong>${escapeHtml(entry.name || "-")}</strong>
            <span class="admin-analytics-label">仮ID: ${escapeHtml(entry.reviewerId || "-")}</span>
            <span class="admin-analytics-label">追加: ${escapeHtml(formatDateTime(entry.addedAt))}</span>
          </div>
          <span>${escapeHtml(entry.email || "-")}</span>
          <span class="admin-pill ${escapeHtml(entry.status || "pending")}">${escapeHtml(status)}</span>
          <div class="admin-review-note">
            <span>${escapeHtml(entry.note || "")}</span>
            <div class="admin-analytics-label">${escapeHtml(passwordLabel)}</div>
            ${dateNote ? `<div class="admin-analytics-label">${escapeHtml(dateNote)}</div>` : ""}
          </div>
          <div class="admin-review-actions">
            <button class="button ghost" type="button" data-review-action="applied">閲覧許可</button>
            <button class="button ghost" type="button" data-review-action="muted">保留</button>
            <button class="button ghost" type="button" data-review-action="revoked">停止</button>
            ${entry.email || entry.reviewerId ? `<button class="button ghost" type="button" data-review-action="issue-password">${entry.hasPassword ? "PW再発行" : "PW発行"}</button>` : ""}
            ${entry.hasPassword ? `<button class="button ghost danger" type="button" data-review-action="revoke-password">PW無効化</button>` : ""}
            <button class="button ghost" type="button" data-review-action="remove">削除</button>
          </div>
        </article>
      `;
    })
    .join("");

  reviewAccessList.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("[data-review-index]");
      const index = Number(row?.dataset.reviewIndex);
      if (!Number.isInteger(index) || !reviewAccessEntries[index]) return;
      if (button.dataset.reviewAction === "issue-password") {
        issueReviewPassword(index);
        return;
      }
      if (button.dataset.reviewAction === "revoke-password") {
        revokeReviewPassword(index);
        return;
      }
      updateReviewAccessEntry(index, button.dataset.reviewAction);
    });
  });
}

async function updateReviewAccessEntry(index, action) {
  const entry = reviewAccessEntries[index];
  if (!entry) return;

  if (action === "remove") {
    reviewAccessEntries = reviewAccessEntries.filter((_, itemIndex) => itemIndex !== index);
    await saveReviewAccessEntries("削除しました");
    return;
  }

  const now = new Date().toISOString();
  const next = { ...entry };
  if (action === "applied") {
    next.status = "applied";
    next.appliedAt = now;
    next.mutedAt = "";
    next.revokedAt = "";
  } else if (action === "muted") {
    next.status = "muted";
    next.mutedAt = now;
    next.revokedAt = "";
  } else if (action === "revoked") {
    next.status = "revoked";
    next.revokedAt = now;
  }
  reviewAccessEntries = reviewAccessEntries.map((item, itemIndex) => (itemIndex === index ? next : item));
  const message =
    action === "applied"
      ? "閲覧許可として記録しました"
      : action === "muted"
        ? "閲覧保留として記録しました"
        : "停止済みとして記録しました";
  await saveReviewAccessEntries(message);
}

async function issueReviewPassword(index, options = {}) {
  const entry = reviewAccessEntries[index];
  if (!entry?.email && !entry?.reviewerId) {
    setReviewAccessStatus("パスワード発行にはメールアドレスまたは仮IDが必要です", "error");
    return false;
  }
  const label = entry.email || entry.reviewerId;
  if (!options.skipConfirm && entry.hasPassword && !window.confirm(`${label} のパスワードを再発行します。古いパスワードと既存セッションは無効になります。`)) {
    return false;
  }

  setReviewAccessStatus("パスワードを発行中...");
  try {
    const payload = await postReviewPasswordAction(entry, "issue");
    reviewAccessEntries = Array.isArray(payload?.entries) ? payload.entries : reviewAccessEntries;
    reviewAuthSummaryData = payload?.authSummary || reviewAuthSummaryData;
    reviewAuthLogEvents = Array.isArray(payload?.authLog?.events) ? payload.authLog.events : reviewAuthLogEvents;
    reviewAuthLogUpdatedAt = payload?.authLog?.updatedAt || reviewAuthLogUpdatedAt;
    renderReviewAccess(payload?.updatedAt || "");
    renderReviewAuthSummary();
    renderReviewAuthLog();
    renderReviewPasswordResult(entry, payload?.password || "");
    if (options.clearForm) resetReviewAccessForm();
    setReviewAccessStatus(options.successMessage || "パスワードを発行しました。平文はこの表示で控えてください。", "ok");
    return true;
  } catch (err) {
    setReviewAccessStatus(err.message || "パスワード発行に失敗しました", "error");
    return false;
  }
}

async function revokeReviewPassword(index) {
  const entry = reviewAccessEntries[index];
  if (!entry?.email && !entry?.reviewerId) return;
  const label = entry.email || entry.reviewerId;
  if (!window.confirm(`${label} のパスワードを無効化し、状態を停止済みにします。`)) return;

  setReviewAccessStatus("パスワードを無効化中...");
  try {
    const payload = await postReviewPasswordAction(entry, "revoke");
    reviewAccessEntries = Array.isArray(payload?.entries) ? payload.entries : reviewAccessEntries;
    reviewAuthSummaryData = payload?.authSummary || reviewAuthSummaryData;
    reviewAuthLogEvents = Array.isArray(payload?.authLog?.events) ? payload.authLog.events : reviewAuthLogEvents;
    reviewAuthLogUpdatedAt = payload?.authLog?.updatedAt || reviewAuthLogUpdatedAt;
    renderReviewAccess(payload?.updatedAt || "");
    renderReviewAuthSummary();
    renderReviewAuthLog();
    if (reviewPasswordResult) {
      reviewPasswordResult.hidden = true;
      reviewPasswordResult.innerHTML = "";
    }
    setReviewAccessStatus("パスワードを無効化しました", "ok");
  } catch (err) {
    setReviewAccessStatus(err.message || "パスワード無効化に失敗しました", "error");
  }
}

async function postReviewPasswordAction(entry, action) {
  const token = getToken();
  if (!token) throw new Error(adminAuthRequiredMessage());
  const res = await fetch("./api/admin/review-access/password", {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "content-type": "application/json"
    },
    body: JSON.stringify({ email: entry?.email || "", reviewerId: entry?.reviewerId || "", action })
  });
  const payload = await readJson(res);
  if (!res.ok) {
    applyReviewAuthDiagnostics(payload);
    throw new Error(payload?.error || "パスワード操作に失敗しました");
  }
  return payload;
}

function applyReviewAuthDiagnostics(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.authSummary) reviewAuthSummaryData = payload.authSummary;
  if (Array.isArray(payload.authLog?.events)) reviewAuthLogEvents = payload.authLog.events;
  if (payload.authLog?.updatedAt) reviewAuthLogUpdatedAt = payload.authLog.updatedAt;
  renderReviewAuthSummary();
  renderReviewAuthLog();
}

function renderReviewPasswordResult(entry, password) {
  if (!reviewPasswordResult) return;
  if (!password) {
    reviewPasswordResult.hidden = true;
    reviewPasswordResult.innerHTML = "";
    return;
  }

  const email = entry?.email || "";
  const reviewerIdValue = entry?.reviewerId || "";
  const label = [email, reviewerIdValue ? `仮ID: ${reviewerIdValue}` : ""].filter(Boolean).join(" / ");
  reviewPasswordResult.hidden = false;
  reviewPasswordResult.innerHTML = `
    <div>
      <strong>発行パスワード</strong>
      <span>${escapeHtml(label || "-")}</span>
    </div>
    <code>${escapeHtml(password)}</code>
    <button class="button ghost" type="button" data-copy-password>コピー</button>
  `;
  reviewPasswordResult.querySelector("[data-copy-password]")?.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(password);
      setReviewAccessStatus("パスワードをコピーしました", "ok");
    } catch (err) {
      setReviewAccessStatus("コピーできませんでした。表示されたパスワードを控えてください。", "error");
    }
  });
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) throw new Error("copy text is empty");

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (err) {
      // Fall back for browsers or Access-wrapped pages that block Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("execCommand copy failed");
  } finally {
    textarea.remove();
  }
}

function clearReviewAccess(message = adminAuthRequiredMessage(), type = "") {
  reviewAccessEntries = [];
  reviewAuthSummaryData = null;
  reviewAuthLogEvents = [];
  reviewAuthLogUpdatedAt = "";
  setReviewAccessStatus(message, type);
  if (reviewAccessList) reviewAccessList.innerHTML = "";
  if (reviewPasswordResult) {
    reviewPasswordResult.hidden = true;
    reviewPasswordResult.innerHTML = "";
  }
  renderReviewAuthSummary();
  renderReviewAuthLog();
}

function setReviewAccessStatus(message, type = "") {
  if (!reviewAccessStatus) return;
  reviewAccessStatus.textContent = message;
  reviewAccessStatus.className = `status ${type}`.trim();
}

function renderReviewAuthSummary() {
  if (!reviewAuthSummary) return;
  const failures = reviewAuthSummaryData?.unknownIdentifierFailures || {};
  const byDay = failures.byDay && typeof failures.byDay === "object" ? failures.byDay : {};
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = Number(byDay[todayKey]) || 0;
  const total = Number(failures.total) || 0;
  const lastAt = failures.lastAt ? formatDateTime(failures.lastAt) : "-";
  const updatedAtSource = reviewAuthLogUpdatedAt || reviewAuthSummaryData?.updatedAt || "";
  const updatedAtText = updatedAtSource ? formatDateTime(updatedAtSource) : "-";

  if (!reviewAuthSummaryData && !total) {
    reviewAuthSummary.innerHTML = `<p class="admin-note">認証集計はまだありません。</p>`;
    return;
  }

  reviewAuthSummary.innerHTML = `
    <div class="admin-auth-summary-row">
      <span class="admin-analytics-label">未知ID失敗</span>
      <strong>${total.toLocaleString()}件</strong>
      <span>今日 ${today.toLocaleString()}件</span>
      <span>最終 ${escapeHtml(lastAt)}</span>
    </div>
    <div class="admin-auth-summary-row">
      <span class="admin-analytics-label">詳細イベント</span>
      <strong>${(Array.isArray(reviewAuthLogEvents) ? reviewAuthLogEvents.length : 0).toLocaleString()}件</strong>
      <span>閲覧許可、PW発行、PW失敗、ロック、期限切れ、同時利用</span>
      <span>更新 ${escapeHtml(updatedAtText)}</span>
    </div>
  `;
}

function renderReviewAuthLog() {
  if (!reviewAuthLog) return;
  const events = Array.isArray(reviewAuthLogEvents) ? reviewAuthLogEvents.slice(0, 30) : [];
  if (!events.length) {
    reviewAuthLog.innerHTML = `<p class="admin-note">認証ログはまだありません。</p>`;
    return;
  }

  reviewAuthLog.innerHTML = events
    .map((event) => `
      <div class="admin-auth-log-row">
        <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
        <strong>${escapeHtml(authLogTypeLabel(event.type, event.result))}</strong>
        <span>${escapeHtml([event.email, event.reviewerId ? `仮ID:${event.reviewerId}` : ""].filter(Boolean).join(" / ") || "-")}</span>
        <span>${escapeHtml(event.reason || "")}</span>
      </div>
    `)
    .join("");
}

function authLogTypeLabel(type, result) {
  const suffix = result === "failed" ? "失敗" : result === "ok" ? "成功" : result || "";
  if (type === "login") return `ログイン${suffix ? ` ${suffix}` : ""}`;
  if (type === "logout") return "ログアウト";
  if (type === "password-issued") return "PW発行";
  if (type === "password-revoked") return "PW無効化";
  if (type === "password-issue-failed") return "PW発行失敗";
  if (type === "password-revoke-failed") return "PW無効化失敗";
  if (type === "review-access-added") return "閲覧者追加";
  if (type === "review-access-status-changed") return "閲覧状態変更";
  if (type === "review-access-removed") return "閲覧者削除";
  if (type === "concurrent-session") return "同時利用検知";
  if (type === "valid-id-password-mismatch") return "有効IDのPW失敗";
  if (type === "account-locked") return "ロック発生";
  if (type === "password-expired") return "PW期限切れ";
  if (type === "valid-id-login-denied") return "有効IDの認証拒否";
  return `${type || "-"}${suffix ? ` ${suffix}` : ""}`;
}

function reviewStatusLabel(status) {
  if (status === "applied") return "閲覧許可";
  if (status === "muted") return "閲覧保留";
  if (status === "revoked") return "停止済み";
  return "未適用";
}

async function loadStorage() {
  const token = getToken();
  if (!token) {
    clearStorage(adminAuthRequiredMessage());
    return;
  }

  const scope = selectedBookScope();
  setStorageStatus(`${bookScopeLabel(scope)}のR2使用状況を読み込み中...`);
  try {
    const res = await fetch(`./api/admin/storage?scope=${encodeURIComponent(scope)}`, {
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
  const scopeLabel = payload?.scopeLabel || bookScopeLabel(payload?.scope || selectedBookScope());
  const storage = payload?.storage || {};
  const usedBytes = Number(storage.usedBytes) || 0;
  const freeTierBytes = Number(storage.freeTierBytes) || 0;
  const remainingBytes = Number(storage.remainingBytes) || 0;
  const usedPercent = Number(storage.usedPercent) || 0;
  const objectCount = Number(storage.objectCount) || 0;
  const truncated = storage.truncated === true;
  setStorageStatus(
    `${scopeLabel} ${formatBytes(usedBytes)} 使用 / ${objectCount.toLocaleString()} objects${truncated ? " / 走査上限あり" : ""}`,
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

function clearStorage(message = adminAuthRequiredMessage(), type = "") {
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

function renderBooks(books, scope = selectedBookScope()) {
  if (!books.length) {
    adminBookList.innerHTML = `<p class="admin-note">${escapeHtml(bookScopeLabel(scope))}の作品はまだ登録されていません。</p>`;
    return;
  }

  const normalizedScope = normalizeBookScope(scope);
  adminBookList.innerHTML = books
    .map((book) => {
      const published = book.published === true;
      const hasCover = Boolean(book.coverKey || book.cover);
      const promotion = book.publicPromotion || null;
      const promoted = promotion?.published === true;
      const promotionVisible = promotion?.visible === true;
      const promotionLabel = promoted
        ? promotionVisible
          ? `一般公開中: ${formatDateTime(promotion.publicExpiresAt)}まで`
          : `一般公開期限切れ: ${formatDateTime(promotion.publicExpiresAt)}`
        : "";
      const promotionUnchecked = normalizedScope === "limited" && !promotion;
      const cover = published && book.cover
        ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title || "")} 表紙" />`
        : `<span class="admin-book-cover-label">${hasCover ? "表紙あり" : "表紙なし"}</span>`;
      const format = String(book.format || "-").toUpperCase();
      return `
        <article class="admin-book-card" data-book-id="${escapeHtml(book.id || "")}">
          <div class="admin-book-cover">${cover}</div>
          <div class="admin-book-info">
            <h3 class="admin-book-title">${escapeHtml(book.title || "Untitled")}</h3>
            <p class="admin-book-meta">保存先: ${escapeHtml(bookScopeLabel(normalizedScope))}</p>
            <p class="admin-book-meta">${escapeHtml(book.author || "")}</p>
            <p class="admin-book-meta">${escapeHtml(book.description || "")}</p>
            <p class="admin-book-meta">ID: ${escapeHtml(book.id || "")} / 更新日: ${escapeHtml(book.updatedAt || "-")}</p>
            <p class="admin-book-meta">形式: ${escapeHtml(format)} / 表紙: ${hasCover ? "あり" : "なし"}</p>
            ${promotionLabel ? `<p class="admin-book-meta">${escapeHtml(promotionLabel)}</p>` : ""}
            ${promotionUnchecked ? `<p class="admin-book-meta">一般公開: 未昇格または状態未確認</p>` : ""}
            <span class="admin-pill ${published ? "published" : "private"}">${published ? "公開中" : "非公開"}</span>
            ${promoted ? `<span class="admin-pill ${promotionVisible ? "public" : "private"}">${promotionVisible ? "一般公開中" : "一般期限切れ"}</span>` : ""}
            <div class="admin-book-actions">
              <button class="button ghost" type="button" data-action="edit">編集に読み込む</button>
              <button class="button ghost" type="button" data-action="toggle">${published ? "一覧から外す" : "一覧に表示"}</button>
              ${normalizedScope === "limited" ? `<button class="button ghost ${promotionVisible ? "public-action" : ""}" type="button" data-action="promote">${promoted ? "延長" : "一般公開へ昇格"}</button>` : ""}
              ${hasCover ? `<button class="button ghost danger" type="button" data-action="remove-cover">表紙削除</button>` : ""}
              <button class="button ghost danger" type="button" data-action="delete">作品削除</button>
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
      const actionScope = normalizedScope;
      const action = button.dataset.action;
      if (action === "edit") {
        fillForm(book, actionScope);
      } else if (action === "toggle") {
        togglePublished(book, actionScope);
      } else if (action === "remove-cover") {
        removeCover(book, actionScope);
      } else if (action === "delete") {
        deleteBook(book, actionScope);
      } else if (action === "promote") {
        promoteBook(book);
      }
    });
  });
}

async function promoteBook(book) {
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  const title = book.title || book.id || "この作品";
  const alreadyPromoted = book.publicPromotion?.published === true;
  const confirmed = window.prompt(
    alreadyPromoted
      ? `「${title}」の一般公開期限を7日後まで延長します。\n限定レビュー認証は一般公開側には適用されません。\n続行するには PUBLIC と入力してください。`
      : `「${title}」を一般公開用R2へコピーし、7日間だけ一般作品一覧に表示します。\n限定レビュー認証は一般公開側には適用されません。\n続行するには PUBLIC と入力してください。`
  );
  if (confirmed !== "PUBLIC") {
    setStatus("一般公開への昇格をキャンセルしました");
    return;
  }

  setStatus(alreadyPromoted ? "一般公開を延長中..." : "一般公開へ昇格中...");
  try {
    const res = await fetch(`./api/admin/books/${encodeURIComponent(book.id)}/promote`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "一般公開への昇格に失敗しました");
    setStatus(`${alreadyPromoted ? "一般公開を延長しました" : "一般公開へ昇格しました"}（期限: ${formatDateTime(payload?.publicExpiresAt || "")}）`, "ok");
    loadBooks();
  } catch (err) {
    setStatus(err.message || "一般公開への昇格に失敗しました", "error");
  }
}

async function togglePublished(book, scope = loadedBookScope) {
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  const nextPublished = book.published !== true;
  setStatus(nextPublished ? "一覧へ表示中..." : "一覧から外しています...");
  try {
    const res = await fetch(adminBookUrl(book.id, scope), {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ published: nextPublished })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "公開状態の変更に失敗しました");
    setStatus(nextPublished ? "作品一覧に表示しました" : "作品一覧から外しました", "ok");
    loadBooks();
  } catch (err) {
    setStatus(err.message || "公開状態の変更に失敗しました", "error");
  }
}

async function removeCover(book, scope = loadedBookScope) {
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  if (!book.coverKey && !book.cover) {
    setStatus("削除できる表紙はありません");
    return;
  }

  const title = book.title || book.id || "この作品";
  if (!window.confirm(`「${title}」の表紙だけを削除します。作品本文は残ります。`)) return;

  setStatus("表紙を削除中...");
  try {
    const res = await fetch(adminBookUrl(book.id, scope), {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ removeCover: true })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "表紙削除に失敗しました");
    setStatus(cleanupStatus("表紙を削除しました", payload), "ok");
    loadBooks();
    loadStorage();
  } catch (err) {
    setStatus(err.message || "表紙削除に失敗しました", "error");
  }
}

async function deleteBook(book, scope = loadedBookScope) {
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  const title = book.title || book.id || "この作品";
  const message = `「${title}」を作品一覧から削除し、現在参照中の本文ファイルと表紙ファイルもR2から削除します。元に戻せません。`;
  if (!window.confirm(message)) return;

  setStatus("作品を削除中...");
  try {
    const res = await fetch(adminBookUrl(book.id, scope), {
      method: "DELETE",
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "作品削除に失敗しました");
    if (bookForm?.elements?.id?.value === book.id) resetForm();
    setStatus(cleanupStatus("作品を削除しました", payload), "ok");
    loadBooks();
    loadStorage();
  } catch (err) {
    setStatus(err.message || "作品削除に失敗しました", "error");
  }
}

function cleanupStatus(message, payload) {
  const failed = Array.isArray(payload?.cleanup?.failed) ? payload.cleanup.failed : [];
  if (!failed.length) return message;
  return `${message}（一部R2ファイル削除は未完了です）`;
}

async function copyReaderUrl() {
  try {
    await copyTextToClipboard(readerUrl());
    setStatus("限定レビューURLをコピーしました", "ok");
    setReviewAccessStatus("限定レビューURLをコピーしました", "ok");
  } catch (err) {
    setStatus("URLをコピーできませんでした", "error");
  }
}

function readerUrl() {
  return new URL("./", window.location.href).href;
}

function selectedBookScope() {
  return normalizeBookScope(loadedBookScope);
}

function normalizeBookScope(value) {
  return String(value || "").trim().toLowerCase() === "public" ? "public" : "limited";
}

function bookScopeLabel(scope) {
  return normalizeBookScope(scope) === "public" ? "一般公開" : "限定レビュー";
}

function adminBookUrl(id, scope = selectedBookScope()) {
  return `./api/admin/books/${encodeURIComponent(id)}?scope=${encodeURIComponent(normalizeBookScope(scope))}`;
}

function fillForm(book, scope = loadedBookScope) {
  loadedBookScope = normalizeBookScope(scope);
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

function renderAccessHelp(button) {
  if (!adminHelpContent) return;
  setActiveHelpButton(button);
  adminHelpContent.innerHTML = ACCESS_HELP_HTML;
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

async function initAdminAuth() {
  try {
    const res = await fetch("./api/admin-auth/status", { cache: "no-store" });
    const payload = await readJson(res);
    adminAuthMode = payload?.mode === "email_otp" ? "email_otp" : "token";
    adminAuthenticated = adminAuthMode === "email_otp"
      ? payload?.authenticated === true
      : Boolean(getStoredToken());
    renderAdminAuth(payload);
  } catch (err) {
    adminAuthMode = "token";
    adminAuthenticated = Boolean(getStoredToken());
    renderAdminAuth(null);
  }

  if (isAdminReady()) {
    loadBooks();
    loadStorage();
    loadAnalytics();
    loadReviewAccess();
    loadAdminAuthLog();
  } else {
    setStatus(adminAuthRequiredMessage());
    clearStorage(adminAuthRequiredMessage());
    clearAnalytics(adminAuthRequiredMessage());
    clearReviewAccess(adminAuthRequiredMessage());
    clearAdminAuthLog();
  }
}

function renderAdminAuth(status) {
  const emailMode = adminAuthMode === "email_otp";
  if (adminTokenAuth) adminTokenAuth.hidden = emailMode;
  if (adminOtpAuth) adminOtpAuth.hidden = !emailMode;

  if (!emailMode) {
    if (adminToken) adminToken.value = getStoredToken();
    return;
  }

  const email = status?.email || adminOtpEmail?.value || "";
  if (adminOtpEmail && email) adminOtpEmail.value = email;
  if (adminOtpLogoutBtn) adminOtpLogoutBtn.hidden = !adminAuthenticated;
  if (sendAdminOtpBtn) sendAdminOtpBtn.disabled = adminAuthenticated;
  if (verifyAdminOtpBtn) verifyAdminOtpBtn.disabled = adminAuthenticated;
  if (adminOtpCode) adminOtpCode.disabled = adminAuthenticated;
  if (adminOtpNote) {
    const expires = status?.expiresAt ? ` / 有効期限 ${formatDateTime(status.expiresAt)}` : "";
    adminOtpNote.textContent = adminAuthenticated
      ? `管理者メールでログイン中: ${email || "-"}${expires}`
      : "許可された管理者メールにだけログインコードを送信します。";
  }
}

async function requestAdminOtp() {
  const email = String(adminOtpEmail?.value || "").trim().toLowerCase();
  if (!email) {
    setStatus("管理者メールを入力してください", "error");
    return;
  }

  setStatus("ログインコードを送信中...");
  try {
    const res = await fetch("./api/admin-auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "ログインコード送信に失敗しました");
    adminOtpChallengeId = payload?.challengeId || "";
    setStatus(payload?.message || "ログインコードを送信しました", "ok");
    adminOtpCode?.focus();
  } catch (err) {
    setStatus(err.message || "ログインコード送信に失敗しました", "error");
  }
}

async function verifyAdminOtp() {
  const email = String(adminOtpEmail?.value || "").trim().toLowerCase();
  const otp = String(adminOtpCode?.value || "").trim();
  if (!email || !adminOtpChallengeId || !otp) {
    setStatus("管理者メールとログインコードを入力してください", "error");
    return;
  }

  setStatus("ログイン中...");
  try {
    const res = await fetch("./api/admin-auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp, challengeId: adminOtpChallengeId })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "ログインに失敗しました");
    adminAuthenticated = true;
    adminOtpChallengeId = "";
    if (adminOtpCode) adminOtpCode.value = "";
    renderAdminAuth(payload);
    setStatus("ログインしました", "ok");
    loadBooks();
    loadStorage();
    loadAnalytics();
    loadReviewAccess();
    loadAdminAuthLog();
  } catch (err) {
    setStatus(err.message || "ログインに失敗しました", "error");
  }
}

async function logoutAdminOtp() {
  try {
    await fetch("./api/admin-auth/logout", { method: "POST" });
  } catch (err) {
    // Cookie clearing is best-effort.
  }
  adminAuthenticated = false;
  adminOtpChallengeId = "";
  if (adminOtpCode) adminOtpCode.value = "";
  renderAdminAuth(null);
  setStatus("ログアウトしました");
  clearAdminAuthLog();
  clearStorage(adminAuthRequiredMessage());
  clearAnalytics(adminAuthRequiredMessage());
  clearReviewAccess(adminAuthRequiredMessage());
}

async function loadAdminAuthLog() {
  if (!adminAuthLog) return;
  const token = getToken();
  if (!token) {
    clearAdminAuthLog();
    return;
  }

  try {
    const res = await fetch("./api/admin-auth/log", {
      headers: authHeaders(token),
      cache: "no-store"
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "管理者認証ログの読み込みに失敗しました");
    adminAuthLogEvents = Array.isArray(payload?.authLog?.events) ? payload.authLog.events : [];
    renderAdminAuthLog();
  } catch (err) {
    adminAuthLogEvents = [];
    renderAdminAuthLog(err.message || "管理者認証ログの読み込みに失敗しました");
  }
}

async function downloadAdminAuthLog() {
  const token = getToken();
  if (!token) {
    setStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  try {
    const res = await fetch("./api/admin-auth/log", {
      headers: authHeaders(token),
      cache: "no-store"
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "管理者認証ログの取得に失敗しました");
    adminAuthLogEvents = Array.isArray(payload?.authLog?.events) ? payload.authLog.events : [];
    renderAdminAuthLog();
    downloadJsonFile(`tsukuyomi-admin-auth-log-${todayStamp()}.json`, {
      exportedAt: new Date().toISOString(),
      source: "admin-auth",
      authLog: payload?.authLog || { events: [], updatedAt: "" }
    });
    setStatus("管理者認証ログを取得しました", "ok");
  } catch (err) {
    setStatus(err.message || "管理者認証ログの取得に失敗しました", "error");
  }
}

async function downloadReviewAuthLog() {
  const token = getToken();
  if (!token) {
    setReviewAccessStatus(adminAuthRequiredMessage(), "error");
    return;
  }

  try {
    const res = await fetch("./api/admin/review-access", {
      headers: authHeaders(token),
      cache: "no-store"
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "限定レビュー認証ログの取得に失敗しました");
    reviewAccessEntries = Array.isArray(payload?.entries) ? payload.entries : reviewAccessEntries;
    applyReviewAuthDiagnostics(payload);
    renderReviewAccess(payload?.updatedAt || "");
    downloadJsonFile(`tsukuyomi-review-auth-log-${todayStamp()}.json`, {
      exportedAt: new Date().toISOString(),
      source: "review-auth",
      updatedAt: payload?.updatedAt || "",
      entries: Array.isArray(payload?.entries) ? payload.entries : [],
      authSummary: payload?.authSummary || null,
      authLog: payload?.authLog || { events: [], updatedAt: "" }
    });
    setReviewAccessStatus("限定レビュー認証ログを取得しました", "ok");
  } catch (err) {
    setReviewAccessStatus(err.message || "限定レビュー認証ログの取得に失敗しました", "error");
  }
}

function clearAdminAuthLog() {
  adminAuthLogEvents = [];
  renderAdminAuthLog("");
}

function renderAdminAuthLog(message = "") {
  if (adminAuthLogBlock) adminAuthLogBlock.hidden = !isAdminReady();
  if (!adminAuthLog) return;
  if (!isAdminReady()) {
    adminAuthLog.innerHTML = "";
    return;
  }
  if (message) {
    adminAuthLog.innerHTML = `<p class="admin-note">${escapeHtml(message)}</p>`;
    return;
  }
  const events = adminAuthLogEvents.slice(0, 20);
  if (!events.length) {
    adminAuthLog.innerHTML = `<p class="admin-note">管理者認証ログはまだありません。</p>`;
    return;
  }
  adminAuthLog.innerHTML = events
    .map((event) => `
      <div class="admin-auth-log-row">
        <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
        <strong>${escapeHtml(adminAuthLogTypeLabel(event.type, event.result))}</strong>
        <span>${escapeHtml(event.email || "-")}</span>
        <span>${escapeHtml(event.reason || "")}</span>
      </div>
    `)
    .join("");
}

function adminAuthLogTypeLabel(type, result) {
  const suffix = result === "failed" ? "失敗" : result === "ok" ? "成功" : result || "";
  if (type === "otp-sent") return "OTP送信";
  if (type === "otp-send-failed") return "OTP送信失敗";
  if (type === "otp-verified") return "OTP検証成功";
  if (type === "otp-verify-failed") return "OTP検証失敗";
  if (type === "logout") return "管理ログアウト";
  return `${type || "-"}${suffix ? ` ${suffix}` : ""}`;
}

function getToken() {
  if (adminAuthMode === "email_otp") return adminAuthenticated ? "__cookie__" : "";
  return adminToken.value || getStoredToken();
}

function authHeaders(token) {
  if (adminAuthMode === "email_otp") return {};
  return { authorization: `Bearer ${token}` };
}

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function isAdminReady() {
  return adminAuthMode === "email_otp" ? adminAuthenticated : Boolean(getToken());
}

function adminAuthRequiredMessage() {
  return adminAuthMode === "email_otp" ? "管理者メールでログインしてください" : "管理トークンを入力してください";
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
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

function createReviewerId() {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
  return `rv-${suffix}`;
}

function normalizeReviewerId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeReviewEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

initAdminAuth();
