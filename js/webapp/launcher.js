// Full-screen launcher for an installed webapp pack.
//
// The pack never runs as Reader JavaScript: it lives in a sandboxed iframe (opaque origin, CSP, no network)
// that receives its files from IndexedDB via postMessage. The Reader's chrome (the "戻る" bar) is OUTSIDE the
// iframe so a hung or misbehaving pack can always be left. Nothing here needs the network or a login.
import { getPack, patchPack, readInstallFiles, verifyInstall } from "./pack-store.js";
import { SANDBOX_ATTR, assertSafeSandbox, buildSrcdoc, chooseModuleStrategy } from "./sandbox-host.js";
import { PackError } from "./pack-installer.js";

const HELLO_TIMEOUT_MS = 15000;
let active = null;

/**
 * Opens the pack. Resolves once the overlay is on screen; `closed` resolves when it has been closed.
 * Throws PackError("damaged" | "not-installed" | "busy") before showing anything when the pack cannot be run.
 */
export async function launchWebapp(packId, { onClosed } = {}) {
  if (active) throw new PackError("busy", "別のコンテンツが起動中です");
  const pack = await getPack(packId);
  if (!pack || pack.status === "installing") throw new PackError("not-installed", "このコンテンツは端末に保存されていません");

  const verdict = await verifyInstall(pack);
  if (!verdict.ok) {
    await patchPack(pack.id, { status: "damaged", damagedAt: new Date().toISOString(), damagedReason: verdict.reason });
    throw new PackError("damaged", "保存されたコンテンツが壊れています。ネットワークに接続して「再ダウンロード」してください", verdict);
  }
  const files = await readInstallFiles(pack.installId);
  if (files.length !== pack.fileCount) throw new PackError("damaged", "保存されたコンテンツが壊れています", { reason: "count" });

  assertSafeSandbox(SANDBOX_ATTR);
  const srcdoc = buildSrcdoc();

  const overlay = document.createElement("div");
  overlay.className = "webapp-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", pack.title || "Webコンテンツ");

  const bar = document.createElement("div");
  bar.className = "webapp-bar";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "webapp-back";
  back.textContent = "← 戻る";
  const title = document.createElement("span");
  title.className = "webapp-title";
  title.textContent = pack.title || "";
  const state = document.createElement("span");
  state.className = "webapp-state";
  state.setAttribute("aria-live", "polite");
  state.textContent = "読み込み中…";
  bar.append(back, title, state);

  const stage = document.createElement("div");
  stage.className = "webapp-stage";
  const iframe = document.createElement("iframe");
  iframe.className = "webapp-frame";
  iframe.setAttribute("sandbox", SANDBOX_ATTR);
  iframe.setAttribute("allow", "fullscreen");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", pack.title || "Webコンテンツ");
  stage.append(iframe);
  overlay.append(bar, stage);

  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let initSent = false;
  let isClosed = false;
  let pushed = false;
  let helloTimer = 0;

  const showState = (text) => { state.textContent = String(text || "").slice(0, 160); };

  const onMessage = (event) => {
    if (event.source !== iframe.contentWindow) return; // anything else is ignored
    const msg = event.data;
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "tk:hello":
        if (initSent) return;
        initSent = true;
        window.clearTimeout(helloTimer);
        iframe.contentWindow.postMessage({
          type: "tk:init",
          files: files.map((f) => ({ path: f.path, mime: f.mime, blob: f.blob })),
          entry: pack.entry,
          packId: pack.id,
          version: pack.version,
          moduleStrategy: chooseModuleStrategy()
        }, "*");
        break;
      case "tk:booted":
        bootedAt = Date.now();
        showState("");
        break;
      case "tk:exit":
        close();
        break;
      case "tk:error":
        showState(`エラー: ${typeof msg.message === "string" ? msg.message : "不明"}`);
        break;
      default:
        break; // closed message set: unknown types are dropped
    }
  };

  // Backstop for navigation the shim cannot intercept (e.g. `location.href = ...`): after the pack has booted the
  // iframe must never load another document; if it does, the pack is ended instead of showing foreign content.
  let bootedAt = 0;
  const onFrameLoad = () => {
    if (isClosed || !bootedAt) return;
    if (Date.now() - bootedAt < 1500) return; // the document.write() of our own loader may still be settling
    bootedAt = 0;
    showState("コンテンツがページ移動を試みたため終了しました");
    window.setTimeout(close, 1200);
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
  };

  const onPopState = () => {
    pushed = false; // the browser/Android back key already popped our entry
    close();
  };

  function close() {
    if (isClosed) return;
    isClosed = true;
    window.clearTimeout(helloTimer);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", onPopState);
    iframe.removeAttribute("srcdoc");
    overlay.remove();
    document.body.classList.remove("webapp-open");
    // the popstate listener is already removed, so this pops our own history entry silently
    if (pushed && history.state && history.state.tkWebapp) history.back();
    active = null;
    patchPack(pack.id, { lastLaunchedAt: new Date().toISOString() }).catch(() => {});
    try { onClosed?.(); } catch { /* ignore */ }
    resolveClosed();
  }

  back.addEventListener("click", close);
  iframe.addEventListener("load", onFrameLoad);
  window.addEventListener("message", onMessage);
  window.addEventListener("popstate", onPopState);
  try {
    history.pushState({ tkWebapp: true }, "");
    pushed = true;
  } catch { /* history is a convenience (Android back key) */ }

  document.body.append(overlay);
  document.body.classList.add("webapp-open");
  active = { packId: pack.id, close };
  helloTimer = window.setTimeout(() => { if (!initSent) showState("起動できませんでした（応答なし）。「戻る」を押してください"); }, HELLO_TIMEOUT_MS);
  iframe.srcdoc = srcdoc;
  back.focus({ preventScroll: true });
  return { closed, close };
}

export function isWebappOpen() {
  return Boolean(active);
}
