// Parent-side description of the sandbox that runs a webapp pack.
//
// Security contract (design §8, verified by the spike on Chromium / Firefox / WebKit / Android Chrome):
//  1. The iframe is sandboxed WITHOUT allow-same-origin -> opaque origin: no access to the Reader's
//     localStorage / IndexedDB / cookies / DOM. Never add allow-same-origin (or top-navigation, popups, forms,
//     modals, downloads).
//  2. A Content-Security-Policy is mandatory and denies all network access by default (a sandbox alone still lets
//     a pack fire requests at the Reader's origin, and Firefox even attaches the HttpOnly session cookie).
//  3. Blob URLs are created INSIDE the iframe (a blob: URL minted by the parent cannot be read by an opaque origin).
import { SHIM_SOURCE } from "./sandbox-shim.js";
import { LEXER_SOURCE } from "./lexer-source.js";

export const SANDBOX_ATTR = "allow-scripts allow-pointer-lock";
export const PACK_ORIGIN_ROOT = "https://tk-pack.invalid/";

export const PACK_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "style-src 'unsafe-inline' blob:",
  "img-src blob: data:",
  "media-src blob: data:",
  "font-src blob: data:",
  "connect-src blob: data:",
  "worker-src blob:",
  "child-src blob:",
  "frame-src 'none'",
  "form-action 'none'"
].join("; ");

const FORBIDDEN_SANDBOX_TOKENS = [
  "allow-same-origin", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-popups",
  "allow-popups-to-escape-sandbox", "allow-forms", "allow-modals", "allow-downloads", "allow-storage-access-by-user-activation"
];

/** Throws when the sandbox attribute is weaker than the contract allows. */
export function assertSafeSandbox(attr = SANDBOX_ATTR) {
  const tokens = String(attr || "").split(/\s+/).filter(Boolean);
  if (!tokens.includes("allow-scripts")) throw new Error("sandbox must allow scripts");
  const bad = tokens.filter((t) => FORBIDDEN_SANDBOX_TOKENS.includes(t));
  if (bad.length > 0) throw new Error(`sandbox must not include: ${bad.join(", ")}`);
  return attr;
}

/** Throws unless the CSP denies all network access by default. */
export function assertSafeCsp(csp = PACK_CSP) {
  const text = String(csp || "");
  const directives = new Map(text.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values];
  }));
  if ((directives.get("default-src") || []).join(" ") !== "'none'") throw new Error("CSP must start from default-src 'none'");
  const networkish = ["connect-src", "img-src", "media-src", "font-src", "style-src", "script-src", "worker-src", "child-src", "frame-src", "form-action"];
  for (const name of networkish) {
    for (const value of directives.get(name) || []) {
      if (/^(https?:|wss?:|\*|'self')/i.test(value) || value.includes("://")) throw new Error(`CSP ${name} must not allow ${value}`);
    }
  }
  if (!directives.has("connect-src")) throw new Error("CSP must restrict connect-src");
  return text;
}

// Inline <script> content must not contain a script end tag or an HTML comment opener (the HTML parser would
// treat them specially). Our own sources never do; fail loudly if that ever changes instead of escaping blindly.
function escapeForInlineScript(source) {
  const text = String(source);
  if (/<\/script/i.test(text) || text.includes("<!--")) throw new Error("inline script source contains </script or <!--");
  return text;
}

/** The iframe document: CSP first, then the lexer and the shim. Everything else arrives via postMessage. */
export function buildSrcdoc({ csp = PACK_CSP, shimSource = SHIM_SOURCE, lexerSource = LEXER_SOURCE } = {}) {
  assertSafeCsp(csp);
  const cspAttr = String(csp).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${cspAttr}"><base href="${PACK_ORIGIN_ROOT}"><script>${escapeForInlineScript(lexerSource)}\n${escapeForInlineScript(shimSource)}</script></head><body></body></html>`;
}

/** import maps (circular imports) where supported; otherwise the dependency-ordered blob strategy. */
export function chooseModuleStrategy(scriptCtor = globalThis.HTMLScriptElement) {
  try {
    return scriptCtor && typeof scriptCtor.supports === "function" && scriptCtor.supports("importmap") ? "importmap" : "topo";
  } catch {
    return "topo";
  }
}
