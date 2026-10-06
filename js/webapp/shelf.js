// Library UI for webapp packs: cards (download / update / open / delete), the offline shelf, and the storage panel.
// Everything installed stays usable without network or login; deleting is always an explicit action here
// ("ダウンロード済みコンテンツを削除") and is never tied to logout or to a pack being withdrawn from the catalog.
import { formatBytes, needsUpdate } from "./pack-validate.js";
import { deletePack, gc, listPacks, requestPersist, storageSummary } from "./pack-store.js";
import { PackError, installPack } from "./pack-installer.js";
import { launchWebapp } from "./launcher.js";

let storagePanelEl = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function placeholderCover(cover) {
  cover.innerHTML = "";
  cover.append(el("span", "book-cover-placeholder", "Web"));
}

function buildCover({ coverUrl, coverBlob, alt }) {
  const cover = el("div", "book-cover");
  let src = coverUrl || "";
  if (!src && coverBlob) {
    try { src = URL.createObjectURL(coverBlob); } catch { src = ""; }
  }
  if (!src) { placeholderCover(cover); return cover; }
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";
  img.draggable = false;
  img.addEventListener("error", () => placeholderCover(cover));
  cover.append(img);
  return cover;
}

const STATE_TEXT = {
  none: "未ダウンロード",
  ready: "ダウンロード済み",
  update: "更新あり",
  damaged: "破損（再ダウンロードが必要）",
  localOnly: "端末内のみ（配信終了またはオフライン）"
};

/**
 * One card. `entry` = catalog entry (online), `pack` = installed record (may be null before download).
 * When `entry` is null the card is "local only": it can open and delete but never download or update.
 */
export function mountPackCard({ entry, pack, resolveUrl, listEl, onChange = refreshStoragePanel }) {
  const data = entry || pack;
  const id = data.id;
  const displayTitle = data.title || id;
  const article = el("article", "book-card webapp-card");
  article.dataset.searchText = [displayTitle, data.author, data.description, "web webapp"].map((v) => String(v || "").toLowerCase()).join(" ");

  const cover = buildCover({ coverUrl: entry?.cover && resolveUrl ? resolveUrl(entry.cover) : "", coverBlob: pack?.cover, alt: `${displayTitle} 表紙` });
  const info = el("div", "book-info");
  info.append(el("h2", "book-title", displayTitle));
  info.append(el("p", "book-author", data.author || "作者未設定"));
  info.append(el("p", "book-description", data.description || "Webコンテンツ"));

  const meta = el("div", "book-meta-row");
  const badge = el("span", "webapp-badge", "Webコンテンツ");
  const stateText = el("span", "book-stats webapp-state-text");
  const updated = el("span", "book-updated", entry?.updatedAt ? `更新日 ${entry.updatedAt}` : "");
  updated.hidden = !entry?.updatedAt;
  meta.append(badge, stateText, updated);
  info.append(meta);

  const progressRow = el("div", "webapp-progress-row");
  progressRow.hidden = true;
  const progress = document.createElement("progress");
  progress.className = "webapp-progress";
  progress.max = 100;
  progress.value = 0;
  const progressText = el("span", "webapp-progress-text");
  const cancelBtn = el("button", "button ghost compact-button", "キャンセル");
  cancelBtn.type = "button";
  progressRow.append(progress, progressText, cancelBtn);
  info.append(progressRow);

  const message = el("p", "webapp-message");
  message.hidden = true;
  message.setAttribute("role", "status");
  info.append(message);

  const actions = el("div", "webapp-actions");
  const primary = el("button", "button book-read-button");
  primary.type = "button";
  const removeBtn = el("button", "button ghost danger compact-button", "削除");
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", `${displayTitle} をこの端末から削除`);
  actions.append(primary, removeBtn);
  info.append(actions);
  article.append(cover, info);
  listEl.append(article);

  let controller = null;
  let current = pack || null;

  const showMessage = (text, type = "") => {
    message.textContent = text || "";
    message.className = `webapp-message ${type}`.trim();
    message.hidden = !text;
  };

  function paint() {
    if (!entry && !current) { article.remove(); return; } // a local-only card whose pack was deleted
    const busy = Boolean(controller);
    const installed = current && current.status !== "installing";
    let kind = "none";
    if (installed && current.status === "damaged") kind = "damaged";
    else if (installed && !entry) kind = "localOnly";
    else if (installed && entry && needsUpdate(entry, current)) kind = "update";
    else if (installed) kind = "ready";

    const versionText = installed ? ` v${current.version}` : entry?.version ? ` v${entry.version}` : "";
    const sizeBytes = installed ? current.unpackedBytes || current.size : entry?.size;
    let text = STATE_TEXT[kind];
    if (kind === "ready") text += versionText;
    if (kind === "update") text += ` (v${current.version} → v${entry.version})`;
    if (kind === "none" && entry) text += `（${formatBytes(entry.size)}）${versionText ? ` ・${versionText.trim()}` : ""}`;
    if (kind !== "none" && sizeBytes) text += ` ・ ${formatBytes(sizeBytes)}`;
    stateText.textContent = text;
    article.dataset.state = kind;

    progressRow.hidden = !busy;
    primary.disabled = busy;
    removeBtn.disabled = busy;
    removeBtn.hidden = !installed;
    if (kind === "ready" || kind === "localOnly") { primary.textContent = "開く"; primary.dataset.action = "open"; }
    else if (kind === "update") { primary.textContent = `更新（v${entry.version}）`; primary.dataset.action = "install"; }
    else if (kind === "damaged") { primary.textContent = entry ? "再ダウンロード" : "再ダウンロード（要ネット）"; primary.dataset.action = entry ? "install" : "none"; primary.disabled = busy || !entry; }
    else { primary.textContent = `ダウンロード（${formatBytes(entry?.size)}）`; primary.dataset.action = "install"; }
    primary.setAttribute("aria-label", `${displayTitle}: ${primary.textContent}`);
    if (kind === "update") {
      // an update never removes the runnable old version: offer opening it too
      if (!actions.querySelector("[data-action=open-old]")) {
        const openOld = el("button", "button ghost compact-button", "今のバージョンを開く");
        openOld.type = "button";
        openOld.dataset.action = "open-old";
        openOld.addEventListener("click", openPack);
        actions.insertBefore(openOld, removeBtn);
      }
    } else {
      actions.querySelector("[data-action=open-old]")?.remove();
    }
  }

  async function refresh() {
    const packs = await listPacks().catch(() => []);
    current = packs.find((p) => p.id === id) || null;
    paint();
    onChange?.();
  }

  function onProgress({ phase, loaded, total }) {
    if (phase === "download") {
      progress.max = total || 100;
      progress.value = total ? loaded : 0;
      progressText.textContent = total ? `ダウンロード中 ${Math.round((loaded / total) * 100)}%（${formatBytes(loaded)} / ${formatBytes(total)}）` : `ダウンロード中 ${formatBytes(loaded)}`;
    } else if (phase === "verify") {
      progress.removeAttribute("value");
      progressText.textContent = "検証中…";
    } else if (phase === "unpack") {
      progress.max = total || 1;
      progress.value = loaded;
      progressText.textContent = `保存中 ${loaded} / ${total} ファイル`;
    }
  }

  async function install() {
    if (!entry || controller) return;
    controller = new AbortController();
    showMessage("");
    progress.value = 0;
    progressText.textContent = "準備中…";
    paint();
    void requestPersist(); // inside the user gesture; never awaited
    try {
      await installPack(entry, { resolveUrl, signal: controller.signal, onProgress });
      showMessage(current ? "更新しました" : "ダウンロードしました。ネットワークなしでも開けます", "ok");
    } catch (err) {
      showMessage(err instanceof PackError ? err.message : `失敗しました: ${err?.message || err}`, err?.code === "aborted" ? "" : "error");
    } finally {
      controller = null;
      await refresh();
    }
  }

  async function openPack() {
    if (!current || controller) return;
    showMessage("");
    try {
      const { closed } = await launchWebapp(id);
      await closed;
    } catch (err) {
      showMessage(err instanceof PackError ? err.message : `起動できません: ${err?.message || err}`, "error");
    } finally {
      await refresh();
    }
  }

  async function remove() {
    if (!current || controller) return;
    const size = current.unpackedBytes || current.size || 0;
    if (!window.confirm(`「${displayTitle}」をこの端末から削除します（${formatBytes(size)}）。\n再び使うにはもう一度ダウンロードが必要です。`)) return;
    try {
      await deletePack(id);
      showMessage("削除しました", "ok");
    } catch (err) {
      showMessage(`削除に失敗しました: ${err?.message || err}`, "error");
    }
    if (!entry) { article.remove(); onChange?.(); return; }
    await refresh();
  }

  const onChanged = () => {
    if (!article.isConnected) { document.removeEventListener("tsukuyomi:webapps-changed", onChanged); return; }
    refresh();
  };
  document.addEventListener("tsukuyomi:webapps-changed", onChanged);

  primary.addEventListener("click", () => {
    if (primary.dataset.action === "open") openPack();
    else if (primary.dataset.action === "install") install();
  });
  cancelBtn.addEventListener("click", () => controller?.abort());
  removeBtn.addEventListener("click", remove);
  paint();
  return article;
}

/** Installed packs only (offline Library, withdrawn packs, the login screen). Returns the number of cards. */
export async function mountInstalledShelf(listEl, { onChange, skipIds = new Set() } = {}) {
  const packs = (await listPacks().catch(() => [])).filter((p) => p.status !== "installing" && !skipIds.has(p.id));
  for (const pack of packs) mountPackCard({ entry: null, pack, resolveUrl: null, listEl, onChange });
  return packs.length;
}

export async function countInstalledPacks() {
  try { return (await listPacks()).filter((p) => p.status !== "installing").length; } catch { return 0; }
}

// ---- storage panel ("ダウンロード済みコンテンツの管理") ---------------------------------------------------

export function bindStoragePanel(container) {
  storagePanelEl = container || null;
  return refreshStoragePanel();
}

export async function refreshStoragePanel() {
  const panel = storagePanelEl;
  if (!panel) return;
  const packs = (await listPacks().catch(() => [])).filter((p) => p.status !== "installing");
  panel.hidden = packs.length === 0;
  if (packs.length === 0) { panel.innerHTML = ""; return; }
  const total = packs.reduce((sum, p) => sum + (p.unpackedBytes || p.size || 0), 0);
  const summary = await storageSummary();
  panel.innerHTML = "";
  panel.append(el("p", "label", "ダウンロード済みコンテンツ"));
  const persistedText = summary.persisted === true ? "永続化: 許可" : summary.persisted === false ? "永続化: 未許可（端末の空き容量が少ないと消える場合があります）" : "";
  panel.append(el("p", "webapp-storage-text", `${packs.length}件 ・ ${formatBytes(total)}${summary.quota ? ` ・ 端末の空き 約${formatBytes(Math.max(0, summary.quota - (summary.usage || 0)))}` : ""}${persistedText ? ` ・ ${persistedText}` : ""}`));
  const clearBtn = el("button", "button ghost danger", "ダウンロード済みコンテンツをすべて削除");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", async () => {
    if (!window.confirm(`ダウンロード済みのWebコンテンツ ${packs.length}件（${formatBytes(total)}）をすべてこの端末から削除します。\n再び使うにはもう一度ダウンロードが必要です。`)) return;
    clearBtn.disabled = true;
    for (const pack of packs) await deletePack(pack.id).catch(() => {});
    document.dispatchEvent(new CustomEvent("tsukuyomi:webapps-changed"));
    await refreshStoragePanel();
  });
  panel.append(clearBtn);
}

/** Start-up housekeeping (orphan installs, stale half-installs). Never throws. */
export function housekeeping() {
  return gc().catch(() => ({ removedInstalls: 0 }));
}
