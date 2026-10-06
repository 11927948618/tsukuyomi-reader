import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import {
  SANDBOX_ATTR, PACK_CSP, PACK_ORIGIN_ROOT, assertSafeSandbox, assertSafeCsp, buildSrcdoc, chooseModuleStrategy
} from "../js/webapp/sandbox-host.js";
import { SHIM_SOURCE, sandboxShimMain } from "../js/webapp/sandbox-shim.js";
import { LEXER_SOURCE } from "../js/webapp/lexer-source.js";

test("the sandbox attribute never weakens isolation", () => {
  assert.equal(assertSafeSandbox(SANDBOX_ATTR), SANDBOX_ATTR);
  assert.ok(!SANDBOX_ATTR.includes("allow-same-origin"));
  for (const token of ["allow-same-origin", "allow-top-navigation", "allow-popups", "allow-forms", "allow-modals", "allow-downloads"]) {
    assert.throws(() => assertSafeSandbox(`allow-scripts ${token}`), /must not include/);
  }
  assert.throws(() => assertSafeSandbox(""), /allow scripts/);
});

test("the CSP is mandatory and denies network by default", () => {
  assert.equal(assertSafeCsp(PACK_CSP), PACK_CSP);
  assert.throws(() => assertSafeCsp(""), /default-src 'none'/);
  assert.throws(() => assertSafeCsp("default-src *"), /default-src 'none'/);
  assert.throws(() => assertSafeCsp("default-src 'none'"), /connect-src/);
  assert.throws(() => assertSafeCsp("default-src 'none'; connect-src https://example.com"), /must not allow/);
  assert.throws(() => assertSafeCsp("default-src 'none'; connect-src 'self'"), /must not allow/);
  assert.throws(() => assertSafeCsp("default-src 'none'; connect-src blob: wss://x"), /must not allow/);
  assert.throws(() => assertSafeCsp("default-src 'none'; connect-src blob:; img-src *"), /must not allow/);
});

test("the iframe document starts with the CSP, then the lexer and the shim", () => {
  const doc = buildSrcdoc();
  const cspAt = doc.indexOf("Content-Security-Policy");
  const scriptAt = doc.indexOf("<script>");
  assert.ok(cspAt > 0 && cspAt < scriptAt, "CSP meta must precede every script");
  assert.ok(doc.includes(`<base href="${PACK_ORIGIN_ROOT}">`));
  assert.ok(doc.indexOf("ESL") > scriptAt && doc.includes("tk:hello"));
  assert.equal((doc.match(/<script>/g) || []).length, 1);
  assert.equal((doc.match(/<\/script>/g) || []).length, 1);
  assert.ok(doc.endsWith("</body></html>"));
});

test("buildSrcdoc refuses an unsafe CSP and unsafe inline sources", () => {
  assert.throws(() => buildSrcdoc({ csp: "default-src *" }));
  assert.throws(() => buildSrcdoc({ shimSource: "x = '</script>'" }), /<\/script/);
  assert.throws(() => buildSrcdoc({ lexerSource: "x = '<!--'" }), /<!--/);
});

test("the shim source is syntactically valid, self-contained and exposes only the closed message set", () => {
  assert.doesNotThrow(() => new vm.Script(`${LEXER_SOURCE}\n${SHIM_SOURCE}`));
  assert.ok(SHIM_SOURCE.startsWith("(function sandboxShimMain()") && SHIM_SOURCE.endsWith(")();"));
  // messages the pack side can emit toward the Reader: nothing but these
  const types = new Set(Array.from(SHIM_SOURCE.matchAll(/type:\s*"(tk:[a-z]+)"/g), (m) => m[1]));
  assert.deepEqual(Array.from(types).sort(), ["tk:booted", "tk:error", "tk:exit", "tk:hello"]);
  // no reference to anything outside the function (it is injected as text)
  assert.ok(!/\bimport\.meta\b/.test(sandboxShimMain.toString().replace(/"[^"\n]*"/g, "")));
  // no regular-expression based module rewriting
  assert.ok(!/\.replace\([^)]*import/.test(SHIM_SOURCE));
});

test("module strategy: importmap when supported, otherwise dependency-ordered blobs", () => {
  assert.equal(chooseModuleStrategy({ supports: (t) => t === "importmap" }), "importmap");
  assert.equal(chooseModuleStrategy({ supports: () => false }), "topo");
  assert.equal(chooseModuleStrategy({}), "topo");
  assert.equal(chooseModuleStrategy(undefined), "topo");
  assert.equal(chooseModuleStrategy({ supports() { throw new Error("x"); } }), "topo");
});

test("the shim turns every anchor click into a non-navigation (pack iframes are single-page)", () => {
  assert.match(SHIM_SOURCE, /function guardLinks\(\)/);
  assert.match(SHIM_SOURCE, /ev\.preventDefault\(\)/);
  // guardLinks must be (re)installed after document.close(), which drops earlier listeners
  assert.ok(SHIM_SOURCE.indexOf("document.close();\n    guardLinks();") > 0 || /document\.close\(\);\s*guardLinks\(\);/.test(SHIM_SOURCE));
});
