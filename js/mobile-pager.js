import { textWithoutRuby } from "./utils.js";

const NO_LINE_START_CHARS = new Set(Array.from(
  "、。，．・･…‥：；？！‼⁇⁈⁉ヽヾ々ー︱ァィゥェォッャュョヮぁぃぅぇぉっゃゅょゎ」』）〕］｝〉》】〙〗〟’”»)]}"
));
const NO_LINE_END_CHARS = new Set(Array.from("「『（〔［｛〈《【〘〖〝‘“«([{"));

export function buildMobileTextPagerPages(sourceHtml, options = {}) {
  const plan = normalizePlan(options.plan);
  const sourceChapters = tokenizeMobilePagerSource(sourceHtml, plan.writingMode);
  const pages = [];
  const chapterPageMap = new Map();
  let nextLineNumber = 1;

  sourceChapters.forEach(({ chapterId, title, tokens }) => {
    const chapterPages = splitMobilePagerTokens(tokens, plan, { chapterId, title });
    const startPage = pages.length;

    chapterPageMap.set(chapterId, startPage);
    chapterPages.forEach((page, pageOffset) => {
      const pageIndex = pages.length;
      const lineCount = countPageLines(page.html);
      page.anchorIds.forEach((id) => {
        if (id && !chapterPageMap.has(id)) chapterPageMap.set(id, pageIndex);
      });
      pages.push({
        chapterId,
        title: pageOffset === 0 ? title : "",
        html: page.html,
        anchorIds: page.anchorIds,
        sourceStart: page.sourceStart,
        sourceEnd: page.sourceEnd,
        lineStart: nextLineNumber,
        lineCount
      });
      nextLineNumber += lineCount;
    });
  });

  if (!pages.length) {
    pages.push({ chapterId: "chapter-001", title: "", html: "", anchorIds: [], sourceStart: 0, sourceEnd: 0 });
  }
  return { pages, chapterPageMap, plan };
}

export function tokenizeMobilePagerSource(sourceHtml, writingMode = "vertical") {
  const template = document.createElement("template");
  template.innerHTML = sourceHtml || "";
  const chapterEls = Array.from(template.content.querySelectorAll("section.chapter"));
  const sourceChapters = chapterEls.length ? chapterEls : [template.content];

  return sourceChapters.map((chapter, index) => {
    const chapterId = chapter.getAttribute?.("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    const heading = chapter.querySelector?.("h1,h2,h3");
    const title = heading ? textWithoutRuby(heading).trim() : "";
    const textSource = chapter.cloneNode?.(true) || chapter;
    textSource.querySelectorAll?.("h1,h2,h3").forEach((element) => element.remove());
    return {
      chapterId,
      title,
      tokens: tokenizeMobilePageContent(textSource, writingMode)
    };
  });
}

function normalizePlan(plan = {}) {
  const chars = Math.max(8, Math.floor(Number(plan.chars) || 20));
  const lines = Math.max(4, Math.floor(Number(plan.lines) || 10));
  return {
    ...plan,
    chars,
    lines,
    writingMode: String(plan.writingMode || "vertical").toLowerCase() === "horizontal" ? "horizontal" : "vertical",
    charSafetyReserve: Math.max(0, Math.min(3, Math.floor(Number(plan.charSafetyReserve) || 1))),
    lineSafetyReserve: Math.max(0, Math.min(2, Math.floor(Number(plan.lineSafetyReserve) || 0))),
    titleLineReserve: Math.max(2, Math.min(4, Math.floor(Number(plan.titleLineReserve) || 3)))
  };
}

function tokenizeMobilePageContent(root, writingMode = "vertical") {
  const tokens = [];
  const walk = (node, marks = {}) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (/^[\s　]*$/.test(text)) return;
      pushTextTokens(tokens, text, marks, writingMode);
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

    const nextMarks = extendInlineMarks(node, marks);

    if (tag === "ruby") {
      const html = decorateInlineHtml(node.outerHTML || escapeHtml(node.textContent || ""), nextMarks);
      tokens.push({ type: "inline", html, weight: measureRubyBaseText(node, writingMode) });
      return;
    }

    if (tag === "img" || tag === "svg") {
      const html = decorateInlineHtml(node.outerHTML || "", nextMarks);
      tokens.push({ type: "inline", html, weight: 1, char: "\uFFFC", atomic: true });
      return;
    }

    if (node.classList?.contains("txt-gap")) {
      tokens.push({ type: "newline" });
      return;
    }

    node.childNodes?.forEach((child) => walk(child, nextMarks));
    if (tag === "div" && node.classList?.contains("txt-line")) {
      if (tokens.length && tokens[tokens.length - 1]?.type !== "newline") {
        tokens.push({ type: "newline" });
      }
      return;
    }
    if (tag === "p" || tag === "section" || (tag === "div" && !node.classList?.contains("txt-line"))) {
      tokens.push({ type: "newline" });
    }
  };

  root.childNodes?.forEach((node) => walk(node));
  return trimBoundaryNewlines(tokens);
}

function pushTextTokens(tokens, value, marks = {}, writingMode = "vertical") {
  const text = normalizeMobileText(value, writingMode);
  for (const char of Array.from(text)) {
    if (char === "\n") {
      tokens.push({ type: "newline" });
    } else {
      tokens.push({ type: "inline", html: decorateInlineHtml(escapeHtml(char), marks), weight: 1, char });
    }
  }
}

export function splitMobilePagerTokens(tokens, plan, chapterMeta = {}) {
  const pages = [];
  let sourceOffset = 0;
  let page = createPage(chapterMeta, plan, true, sourceOffset);

  const flushPage = () => {
    if (page.html.trim() || page.anchorIds.size || pages.length === 0) {
      pages.push({
        html: page.html.trim(),
        anchorIds: [...page.anchorIds],
        sourceStart: page.sourceStart,
        sourceEnd: sourceOffset
      });
    }
    page = createPage(chapterMeta, plan, false, sourceOffset);
  };

  const breakLine = () => {
    page.html += "\n";
    page.lineIndex += 1;
    page.charIndex = 0;
    if (page.lineIndex >= page.linesPerPage) flushPage();
  };

  const ensureSpace = (weight, char = "", trailingNoLineStartWeight = 0) => {
    if (weight <= 0) return;
    const noLineStart = NO_LINE_START_CHARS.has(char);
    const noLineEnd = NO_LINE_END_CHARS.has(char);
    if (noLineEnd && page.charIndex > 0 && page.charIndex + weight >= page.charsPerLine) {
      breakLine();
    }
    if (!noLineStart && !noLineEnd && trailingNoLineStartWeight > 0) {
      const groupedLimit = page.charsPerLine + 1;
      if (page.charIndex > 0 && page.charIndex + weight + trailingNoLineStartWeight > groupedLimit) {
        breakLine();
      }
    }
    const lineLimit = page.charsPerLine + (noLineStart ? 1 : 0);
    if (page.charIndex > 0 && page.charIndex + weight > lineLimit) breakLine();
  };

  const sourceTokens = Array.isArray(tokens) ? tokens : [];
  for (let tokenIndex = 0; tokenIndex < sourceTokens.length; tokenIndex += 1) {
    const token = sourceTokens[tokenIndex];
    if (token.type === "anchor") {
      if (token.id) page.anchorIds.add(token.id);
      continue;
    }

    if (token.type === "newline") {
      sourceOffset += 1;
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
    const trailingNoLineStartWeight = getTrailingNoLineStartWeight(sourceTokens, tokenIndex + 1);
    ensureSpace(weight, String(token.char || ""), trailingNoLineStartWeight);
    page.html += token.html || "";
    page.charIndex += weight;
    sourceOffset += weight;
  }

  if (page.html.trim() || page.anchorIds.size || pages.length === 0) {
    pages.push({
      html: page.html.trim(),
      anchorIds: [...page.anchorIds],
      sourceStart: page.sourceStart,
      sourceEnd: sourceOffset
    });
  }
  return pages;
}

function getTrailingNoLineStartWeight(tokens, startIndex) {
  let weight = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type === "anchor") continue;
    if (token?.type !== "inline" || !NO_LINE_START_CHARS.has(String(token.char || ""))) break;
    weight += Math.max(1, Number(token.weight) || 1);
  }
  return weight;
}

function createPage(chapterMeta, plan, firstPage, sourceStart = 0) {
  const reserve = firstPage && chapterMeta?.title ? plan.titleLineReserve : 0;
  const charSafetyReserve = Math.max(0, Math.min(3, Math.floor(Number(plan.charSafetyReserve) || 1)));
  return {
    html: "",
    anchorIds: new Set(),
    sourceStart: Math.max(0, Number(sourceStart) || 0),
    // Keep a small buffer for hanging punctuation and closing brackets.
    charsPerLine: Math.max(6, plan.chars - charSafetyReserve),
    linesPerPage: Math.max(3, plan.lines - plan.lineSafetyReserve - reserve),
    charIndex: 0,
    lineIndex: 0
  };
}

function countPageLines(html) {
  if (!String(html || "").trim()) return 1;
  return Math.max(1, String(html).split("\n").length);
}

function normalizeMobileText(text, writingMode = "vertical") {
  const normalized = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, "")
    .replace(/\n{3,}/g, "\n\n");
  if (String(writingMode || "vertical").toLowerCase() === "horizontal") return normalized;
  return normalized
    .replace(/…/g, "･･･")
    .replace(/‥/g, "･･")
    .replace(/\.{3}/g, "･･･")
    .replace(/[―—]/g, "︱");
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

function extendInlineMarks(node, marks = {}) {
  const nextMarks = { ...marks };
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return nextMarks;
  const tag = String(node.tagName || "").toLowerCase();
  const inlineStyle = String(node.getAttribute("style") || "").toLowerCase();
  const className = String(node.getAttribute("class") || "").toLowerCase();

  if (isStrikeElement(node)) nextMarks.strike = true;
  if (tag === "strong" || tag === "b" || /font-weight\s*:\s*(bold|[6-9]00)/.test(inlineStyle)) nextMarks.bold = true;
  if (tag === "em" || tag === "i" || /font-style\s*:\s*italic/.test(inlineStyle)) nextMarks.italic = true;
  if (tag === "u" || /text-decoration[^;]*underline/.test(inlineStyle)) nextMarks.underline = true;
  if (/text-emphasis[^;]*:/.test(inlineStyle)
    || /(^|[-_\s])(bouten|emphasis|sesame)([-_\s]|$)/.test(className)) {
    nextMarks.emphasis = true;
  }
  return nextMarks;
}

function decorateInlineHtml(html, marks = {}) {
  const classes = [];
  if (marks.strike) classes.push("mp-strike");
  if (marks.bold) classes.push("mp-bold");
  if (marks.italic) classes.push("mp-italic");
  if (marks.underline) classes.push("mp-underline");
  if (marks.emphasis) classes.push("mp-emphasis");
  if (!classes.length) return html;
  return `<span class="${classes.join(" ")}">${html}</span>`;
}

function measureRubyBaseText(rubyNode, writingMode = "vertical") {
  const clone = rubyNode.cloneNode(true);
  clone.querySelectorAll?.("rt,rp").forEach((node) => node.remove());
  return Math.max(1, Array.from(normalizeMobileText(clone.textContent || "", writingMode).replace(/\n/g, "")).length);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

