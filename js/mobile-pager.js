export function buildMobileTextPagerPages(sourceHtml, options = {}) {
  const plan = normalizePlan(options.plan);
  const template = document.createElement("template");
  template.innerHTML = sourceHtml || "";
  const chapterEls = Array.from(template.content.querySelectorAll("section.chapter"));
  const sourceChapters = chapterEls.length ? chapterEls : [template.content];
  const pages = [];
  const chapterPageMap = new Map();

  sourceChapters.forEach((chapter, index) => {
    const chapterId = chapter.getAttribute?.("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    const title = chapter.querySelector?.("h1,h2,h3")?.textContent?.trim() || "";
    const textSource = chapter.cloneNode?.(true) || chapter;
    textSource.querySelectorAll?.("h1,h2,h3").forEach((heading) => heading.remove());
    const tokens = tokenizeMobilePageContent(textSource);
    const chapterPages = splitTokensIntoPages(tokens, plan, { chapterId, title });
    const startPage = pages.length;

    chapterPageMap.set(chapterId, startPage);
    chapterPages.forEach((page, pageOffset) => {
      const pageIndex = pages.length;
      page.anchorIds.forEach((id) => {
        if (id && !chapterPageMap.has(id)) chapterPageMap.set(id, pageIndex);
      });
      pages.push({
        chapterId,
        title: pageOffset === 0 ? title : "",
        html: page.html,
        anchorIds: page.anchorIds
      });
    });
  });

  if (!pages.length) pages.push({ chapterId: "chapter-001", title: "", html: "", anchorIds: [] });
  return { pages, chapterPageMap, plan };
}

function normalizePlan(plan = {}) {
  const chars = Math.max(8, Math.floor(Number(plan.chars) || 20));
  const lines = Math.max(4, Math.floor(Number(plan.lines) || 10));
  return {
    chars,
    lines,
    titleLineReserve: Math.max(2, Math.min(4, Math.floor(Number(plan.titleLineReserve) || 3)))
  };
}

function tokenizeMobilePageContent(root) {
  const tokens = [];
  const walk = (node, marks = {}) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      pushTextTokens(tokens, node.textContent || "", marks);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    if (tag === "br") {
      tokens.push({ type: "newline" });
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const id = node.getAttribute("id");
      if (id) tokens.push({ type: "anchor", id });
    }

    const nextMarks = { ...marks };
    if (isStrikeElement(node)) nextMarks.strike = true;

    if (tag === "ruby") {
      const html = decorateInlineHtml(node.outerHTML || escapeHtml(node.textContent || ""), nextMarks);
      tokens.push({ type: "inline", html, weight: measureRubyBaseText(node) });
      return;
    }

    if (node.classList?.contains("txt-gap")) {
      tokens.push({ type: "newline" });
      return;
    }

    node.childNodes?.forEach((child) => walk(child, nextMarks));
    if (tag === "p" || tag === "section" || (tag === "div" && !node.classList?.contains("txt-line"))) {
      tokens.push({ type: "newline" });
    }
  };

  root.childNodes?.forEach((node) => walk(node));
  return trimBoundaryNewlines(tokens);
}

function pushTextTokens(tokens, value, marks = {}) {
  const text = normalizeMobileText(value);
  for (const char of Array.from(text)) {
    if (char === "\n") {
      tokens.push({ type: "newline" });
    } else {
      tokens.push({ type: "inline", html: decorateInlineHtml(escapeHtml(char), marks), weight: 1 });
    }
  }
}

function splitTokensIntoPages(tokens, plan, chapterMeta) {
  const pages = [];
  let page = createPage(chapterMeta, plan, true);

  const flushPage = () => {
    if (page.html.trim() || page.anchorIds.size || pages.length === 0) {
      pages.push({ html: page.html.trim(), anchorIds: [...page.anchorIds] });
    }
    page = createPage(chapterMeta, plan, false);
  };

  const ensureSpace = (weight) => {
    if (weight <= 0) return;
    if (page.charIndex > 0 && page.charIndex + weight > page.charsPerLine) {
      page.lineIndex += 1;
      page.charIndex = 0;
    }
    if (page.lineIndex >= page.linesPerPage) flushPage();
  };

  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (token.type === "anchor") {
      if (token.id) page.anchorIds.add(token.id);
      continue;
    }

    if (token.type === "newline") {
      if (page.charIndex > 0) {
        page.html += "\n";
        page.lineIndex += 1;
        page.charIndex = 0;
        if (page.lineIndex >= page.linesPerPage) flushPage();
      } else if (page.html.trim()) {
        page.html += "\n";
        page.lineIndex += 1;
        if (page.lineIndex >= page.linesPerPage) flushPage();
      }
      continue;
    }

    const weight = Math.max(1, Number(token.weight) || 1);
    ensureSpace(weight);
    page.html += token.html || "";
    page.charIndex += weight;
  }

  if (page.html.trim() || page.anchorIds.size || pages.length === 0) {
    pages.push({ html: page.html.trim(), anchorIds: [...page.anchorIds] });
  }
  return pages;
}

function createPage(chapterMeta, plan, firstPage) {
  const reserve = firstPage && chapterMeta?.title ? plan.titleLineReserve : 0;
  return {
    html: "",
    anchorIds: new Set(),
    charsPerLine: Math.max(6, plan.chars - 2),
    linesPerPage: Math.max(3, plan.lines - 1 - reserve),
    charIndex: 0,
    lineIndex: 0
  };
}

function normalizeMobileText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, "")
    .replace(/[―—]/g, "︱")
    .replace(/\n{3,}/g, "\n\n");
}

function trimBoundaryNewlines(tokens) {
  const result = Array.isArray(tokens) ? [...tokens] : [];
  while (result[0]?.type === "newline") result.shift();
  while (result[result.length - 1]?.type === "newline") result.pop();
  return result;
}

function isStrikeElement(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "s" || tag === "del" || tag === "strike") return true;
  const inlineStyle = String(node.getAttribute("style") || "").toLowerCase();
  if (/text-decoration[^;]*line-through/.test(inlineStyle)) return true;
  const className = String(node.getAttribute("class") || "").toLowerCase();
  return /(^|[-_\s])(strike|strikethrough|line-through|deleted)([-_\s]|$)/.test(className);
}

function decorateInlineHtml(html, marks = {}) {
  if (!marks.strike) return html;
  return `<span class="mp-strike">${html}</span>`;
}

function measureRubyBaseText(rubyNode) {
  const clone = rubyNode.cloneNode(true);
  clone.querySelectorAll?.("rt,rp").forEach((node) => node.remove());
  return Math.max(1, Array.from(normalizeMobileText(clone.textContent || "").replace(/\n/g, "")).length);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

