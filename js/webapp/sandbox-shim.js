// Loader that runs INSIDE the sandboxed (opaque-origin) iframe.
//
// The security boundary is the iframe's `sandbox` attribute (no allow-same-origin) plus its CSP - this code is a
// convenience layer that lets a multi-file web app (relative URLs, CSS url()/@import, ES modules, fetch, Workers)
// run from blobs received via postMessage. If a pack overwrites or bypasses it, it gains nothing.
//
// The function below is serialised with Function.prototype.toString() and injected into `srcdoc`, so it MUST be
// self-contained (no references to module scope). `ESL` (es-module-lexer) is provided by a script placed before it.
export function sandboxShimMain() {
  "use strict";
  var ROOT = "https://tk-pack.invalid/";
  var S = { files: Object.create(null), entry: "index.html", opts: {}, cssCache: Object.create(null), mod: Object.create(null) };
  var origFetch = window.fetch.bind(window);
  var origOpen = XMLHttpRequest.prototype.open;
  var origSetAttr = Element.prototype.setAttribute;
  var OrigWorker = window.Worker;
  var CSP_META = "";

  function post(m) { try { parent.postMessage(m, "*"); } catch (e) { /* ignore */ } }
  window.addEventListener("error", function (e) { post({ type: "tk:error", message: String(e && (e.message || e.error)).slice(0, 300) }); });
  window.addEventListener("unhandledrejection", function (e) { post({ type: "tk:error", message: "unhandledrejection: " + String(e && e.reason && (e.reason.message || e.reason)).slice(0, 300) }); });

  // ---- URL mapping -------------------------------------------------------
  function toPath(raw, base) {
    try {
      var u = new URL(String(raw), base || document.baseURI);
      if (u.origin + "/" !== ROOT) return null;
      return decodeURIComponent(u.pathname.slice(1));
    } catch (e) { return null; }
  }
  function blobUrl(path) {
    var f = S.files[path]; if (!f) return null;
    if (!f.url) f.url = URL.createObjectURL(f.blob);
    return f.url;
  }
  function mapUrl(raw) {
    var s = String(raw);
    if (/^(blob:|data:|about:|#|javascript:)/i.test(s)) return s;
    var p = toPath(s); if (p == null || !S.files[p]) return s;
    var hash = ""; try { hash = new URL(s, document.baseURI).hash; } catch (e) { /* ignore */ }
    return blobUrl(p) + hash;
  }
  function mapSrcset(v) {
    return String(v).split(",").map(function (part) {
      var t = part.trim(); if (!t) return t;
      var bits = t.split(/\s+/); bits[0] = mapUrl(bits[0]); return bits.join(" ");
    }).join(", ");
  }

  // ---- runtime patches ---------------------------------------------------
  function installPatches() {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
      var p = toPath(url);
      if (p != null) {
        var f = S.files[p];
        if (!f) return Promise.resolve(new Response(null, { status: 404, statusText: "Not Found" }));
        return Promise.resolve(new Response(f.blob, { status: 200, headers: { "Content-Type": f.mime, "Content-Length": String(f.blob.size) } }));
      }
      return origFetch(input, init);
    };
    XMLHttpRequest.prototype.open = function (m, u) { var a = Array.prototype.slice.call(arguments); a[1] = mapUrl(u); return origOpen.apply(this, a); };
    function patchProp(proto, prop, mapper) {
      var d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, mapper(v)); } });
    }
    patchProp(HTMLImageElement.prototype, "src", mapUrl);
    patchProp(HTMLImageElement.prototype, "srcset", mapSrcset);
    patchProp(HTMLMediaElement.prototype, "src", mapUrl);
    patchProp(HTMLSourceElement.prototype, "src", mapUrl);
    patchProp(HTMLSourceElement.prototype, "srcset", mapSrcset);
    patchProp(HTMLScriptElement.prototype, "src", mapUrl);
    patchProp(HTMLLinkElement.prototype, "href", mapUrl);
    patchProp(HTMLTrackElement.prototype, "src", mapUrl);
    Element.prototype.setAttribute = function (name, value) {
      var n = String(name).toLowerCase();
      if (n === "src" || n === "poster" || (n === "href" && this instanceof HTMLLinkElement)) value = mapUrl(value);
      else if (n === "srcset") value = mapSrcset(value);
      return origSetAttr.call(this, name, value);
    };
    window.Worker = function (url, opts) { return new OrigWorker(mapUrl(url), opts); };
    window.Worker.prototype = OrigWorker.prototype;
    try {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) fixTree(n); }); });
      }).observe(document, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
  }
  function fixTree(root) {
    var list = [root].concat(Array.prototype.slice.call(root.querySelectorAll ? root.querySelectorAll("[src],[srcset],[poster]") : []));
    list.forEach(function (el) {
      ["src", "poster"].forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v && !/^(blob:|data:)/i.test(v)) { var m = mapUrl(v); if (m !== v) origSetAttr.call(el, a, m); } });
      var ss = el.getAttribute && el.getAttribute("srcset"); if (ss) { var ms = mapSrcset(ss); if (ms !== ss) origSetAttr.call(el, "srcset", ms); }
    });
  }

  // ---- CSS ---------------------------------------------------------------
  async function replaceAsync(str, re, fn) {
    var out = "", last = 0, m, jobs = [];
    re.lastIndex = 0;
    while ((m = re.exec(str))) { jobs.push({ m: m, p: fn.apply(null, m) }); }
    for (var i = 0; i < jobs.length; i++) { var j = jobs[i]; out += str.slice(last, j.m.index) + (await j.p); last = j.m.index + j.m[0].length; }
    return out + str.slice(last);
  }
  async function cssFileText(path, seen) {
    if (S.cssCache[path] !== undefined) return S.cssCache[path];
    var f = S.files[path]; if (!f) return "";
    var text = await f.blob.text();
    var out = await rewriteCss(text, ROOT + path, (seen || []).concat(path));
    S.cssCache[path] = out; return out;
  }
  async function rewriteCss(text, baseUrl, seen) {
    text = await replaceAsync(text, /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)\s*[^;]*;/g, async function (m, q1, s1, q2, s2) {
      var spec = s1 || s2; var p = toPath(spec, baseUrl);
      if (p && S.files[p] && seen.indexOf(p) < 0) return await cssFileText(p, seen);
      return "";
    });
    return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, spec) {
      if (/^(data:|blob:|#)/i.test(spec)) return m;
      var p = toPath(spec, baseUrl); return p && S.files[p] ? 'url("' + blobUrl(p) + '")' : m;
    });
  }

  // ---- JS modules (es-module-lexer based; never regular expressions) ------
  function isRelSpec(sp) { return /^(\.{0,2}\/|https:\/\/tk-pack\.invalid\/)/.test(sp); }
  function specToPath(spec, baseUrl) { return isRelSpec(spec) ? toPath(spec, baseUrl) : null; }
  function vurl(p) { return ROOT + p.split("/").map(encodeURIComponent).join("/"); }
  // mapStatic(path) -> replacement URL string, or null to leave as is.
  function rewriteSource(text, baseUrl, mapStatic) {
    var imports = ESL.parse(text)[0], out = "", last = 0, dyn = false, meta = false;
    imports.forEach(function (i) {
      if (i.d === -1) {
        var p = specToPath(text.slice(i.s, i.e), baseUrl), rep = p && S.files[p] ? mapStatic(p) : null;
        if (rep) { out += text.slice(last, i.s) + rep; last = i.e; }
      } else if (i.d > -1) { out += text.slice(last, i.ss) + "__tkImport"; last = i.ss + 6; dyn = true; }
      else if (i.d === -2) { out += text.slice(last, i.ss) + "__tkMeta"; last = i.se; meta = true; }
    });
    out += text.slice(last);
    var pre = (dyn ? "const __tkImport=(s)=>window.__tkDynImport(s," + JSON.stringify(baseUrl) + ");\n" : "") + (meta ? "const __tkMeta={url:" + JSON.stringify(baseUrl) + "};\n" : "");
    return pre + out;
  }
  function staticDeps(text, baseUrl) {
    var deps = [];
    ESL.parse(text)[0].forEach(function (i) { if (i.d === -1) { var p = specToPath(text.slice(i.s, i.e), baseUrl); if (p && S.files[p] && deps.indexOf(p) < 0) deps.push(p); } });
    return deps;
  }
  // topo: static specifiers -> blob URLs of already-built dependencies. Static cycles are impossible => error.
  async function moduleUrlTopo(path) {
    var st = S.mod[path];
    if (st && st.url) return st.url;
    if (st && st.building) throw new Error("circular static import involving " + path);
    st = S.mod[path] = { building: true };
    var f = S.files[path]; if (!f) throw new Error("module not found: " + path);
    var text = await f.blob.text(), baseUrl = ROOT + path, urls = {};
    var deps = staticDeps(text, baseUrl);
    for (var i = 0; i < deps.length; i++) urls[deps[i]] = await moduleUrlTopo(deps[i]);
    var out = rewriteSource(text, baseUrl, function (p) { return urls[p]; });
    st.url = URL.createObjectURL(new Blob([out], { type: "text/javascript" })); st.building = false;
    return st.url;
  }
  // importmap: static specifiers -> absolute virtual URL; each file blob registered in an import map (cycles allowed).
  async function buildImportMap() {
    var imports = {}, paths = Object.keys(S.files).filter(function (p) { return /\.m?js$/i.test(p); });
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i], text = await S.files[p].blob.text(), out;
      try { out = rewriteSource(text, ROOT + p, function (dp) { return vurl(dp); }); } catch (e) { out = text; }
      var u = URL.createObjectURL(new Blob([out], { type: "text/javascript" }));
      S.mod[p] = { url: u }; imports[vurl(p)] = u;
    }
    return imports;
  }
  function rewriteClassic(text, baseUrl) { return /\bimport\s*\(/.test(text) ? rewriteSource(text, baseUrl, function () { return null; }) : text; }
  window.__tkDynImport = async function (spec, baseUrl) {
    var p = toPath(spec, baseUrl);
    if (p == null) return import(spec);
    if (S.opts.moduleStrategy === "importmap") return import(vurl(p));
    if (S.opts.moduleStrategy === "topo") return import(await moduleUrlTopo(p));
    return import(spec);
  };

  // ---- entry document ----------------------------------------------------
  async function bootEntry() {
    var strategy = S.opts.moduleStrategy || "topo";
    var entryFile = S.files[S.entry]; if (!entryFile) throw new Error("entry missing: " + S.entry);
    var entryDir = S.entry.indexOf("/") >= 0 ? S.entry.slice(0, S.entry.lastIndexOf("/") + 1) : "";
    var baseUrl = ROOT + entryDir;
    var doc = new DOMParser().parseFromString(await entryFile.blob.text(), "text/html");
    Array.prototype.forEach.call(doc.querySelectorAll("base"), function (b) { b.remove(); });
    var links = Array.prototype.slice.call(doc.querySelectorAll("link[href]"));
    var i;
    for (i = 0; i < links.length; i++) {
      var l = links[i], rel = (l.getAttribute("rel") || "").toLowerCase(), p = toPath(l.getAttribute("href"), baseUrl);
      if (/\bstylesheet\b/.test(rel) && p && S.files[p]) { var st = doc.createElement("style"); st.textContent = await cssFileText(p); l.replaceWith(st); }
      else if (p && S.files[p]) l.setAttribute("href", blobUrl(p));
    }
    var styles = Array.prototype.slice.call(doc.querySelectorAll("style"));
    for (i = 0; i < styles.length; i++) styles[i].textContent = await rewriteCss(styles[i].textContent, baseUrl, []);
    Array.prototype.forEach.call(doc.querySelectorAll("[style]"), function (el) {
      el.setAttribute("style", el.getAttribute("style").replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, s) { var pp = toPath(s, baseUrl); return pp && S.files[pp] ? 'url("' + blobUrl(pp) + '")' : m; }));
    });
    Array.prototype.forEach.call(doc.querySelectorAll("[src],[poster],[srcset],[data]"), function (el) {
      if (el.tagName === "SCRIPT") return;
      ["src", "poster", "data"].forEach(function (a) { var v = el.getAttribute(a); if (v && !/^(data:|blob:)/i.test(v)) { var pp = toPath(v, baseUrl); if (pp && S.files[pp]) el.setAttribute(a, blobUrl(pp)); } });
      var ss = el.getAttribute("srcset"); if (ss) el.setAttribute("srcset", ss.split(",").map(function (part) { var b = part.trim().split(/\s+/); var pp = toPath(b[0], baseUrl); if (pp && S.files[pp]) b[0] = blobUrl(pp); return b.join(" "); }).join(", "));
    });
    var importMap = null;
    if (strategy === "importmap") importMap = await buildImportMap();
    var scripts = Array.prototype.slice.call(doc.querySelectorAll("script"));
    for (i = 0; i < scripts.length; i++) {
      var sc = scripts[i], isMod = (sc.getAttribute("type") || "").toLowerCase() === "module", src = sc.getAttribute("src");
      if (src) {
        var sp = toPath(src, baseUrl); if (!sp || !S.files[sp]) continue;
        if (isMod && strategy === "topo") sc.setAttribute("src", await moduleUrlTopo(sp));
        else if (isMod && strategy === "importmap") sc.setAttribute("src", S.mod[sp].url);
        else if (!isMod && /\bimport\s*\(/.test(await S.files[sp].blob.text())) sc.setAttribute("src", URL.createObjectURL(new Blob([rewriteClassic(await S.files[sp].blob.text(), ROOT + sp)], { type: "text/javascript" })));
        else sc.setAttribute("src", blobUrl(sp));
      } else if (isMod) {
        var txt = sc.textContent, bu = baseUrl + "__inline__.js";
        if (strategy === "topo") {
          var du = {}, dps = staticDeps(txt, bu);
          for (var k = 0; k < dps.length; k++) du[dps[k]] = await moduleUrlTopo(dps[k]);
          sc.textContent = rewriteSource(txt, bu, function (pp) { return du[pp]; });
        } else sc.textContent = rewriteSource(txt, bu, function (pp) { return vurl(pp); });
      }
    }
    var head = doc.head || doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
    var first = doc.createElement("base"); first.setAttribute("href", baseUrl);
    head.insertBefore(first, head.firstChild);
    if (importMap) { var im = doc.createElement("script"); im.setAttribute("type", "importmap"); im.textContent = JSON.stringify({ imports: importMap }); head.insertBefore(im, first.nextSibling); }
    // Defence in depth: the CSP survives document.open() in every engine tested, but re-assert it anyway.
    if (CSP_META) { var cm = doc.createElement("meta"); cm.setAttribute("http-equiv", "Content-Security-Policy"); cm.setAttribute("content", CSP_META); head.insertBefore(cm, head.firstChild); }
    document.open(); document.write("<!doctype html>" + doc.documentElement.outerHTML); document.close();
    post({ type: "tk:booted" });
  }

  // The only API exposed to a pack.
  window.tk = Object.freeze({
    url: function (path) { var entryDir = S.entry.indexOf("/") >= 0 ? S.entry.slice(0, S.entry.lastIndexOf("/") + 1) : ""; return mapUrl(ROOT + entryDir + path); },
    exit: function () { post({ type: "tk:exit" }); },
    get packId() { return S.opts.packId; },
    get version() { return S.opts.version; }
  });

  function onMessage(ev) {
    if (ev.source !== parent) return;
    var m = ev.data; if (!m || m.type !== "tk:init") return;
    window.removeEventListener("message", onMessage);
    S.opts = m; S.entry = m.entry || "index.html";
    var meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); CSP_META = meta ? meta.getAttribute("content") : "";
    (m.files || []).forEach(function (f) { S.files[f.path] = { blob: f.blob, mime: f.mime }; });
    installPatches();
    bootEntry().catch(function (e) { post({ type: "tk:error", message: "boot failed: " + ((e && (e.stack || e.message)) || e) }); });
  }
  window.addEventListener("message", onMessage);
  post({ type: "tk:hello" });
}

export const SHIM_SOURCE = `(${sandboxShimMain.toString()})();`;
