import { tokenizeMobilePagerSource } from "./mobile-pager.js";

const NO_PAGE_START_CHARS = new Set(Array.from(
  "、。，．・･…‥：；？！‼⁇⁈⁉ヽヾ々ー︱ァィゥェォッャュョヮぁぃぅぇぉっゃゅょゎ」』）〕］｝〉》】〙〗〟’”»)]}"
));
const NO_PAGE_END_CHARS = new Set(Array.from("「『（〔［｛〈《【〘〖〝‘“«([{"));

export class MeasuredPagerCancelledError extends Error {
  constructor() {
    super("Measured pager build was cancelled");
    this.name = "MeasuredPagerCancelledError";
  }
}

export async function buildMeasuredTextPagerPages(sourceHtml, options = {}) {
  const plan = normalizeMeasuredPlan(options.plan);
  const measurePage = options.measurePage;
  if (typeof measurePage !== "function") throw new TypeError("measurePage callback is required");

  const sourceChapters = tokenizeMobilePagerSource(sourceHtml, plan.writingMode);
  const pages = [];
  const chapterPageMap = new Map();
  let nextLineNumber = 1;

  for (const chapter of sourceChapters) {
    assertNotCancelled(options.shouldCancel);
    const chapterPages = await splitMeasuredPagerTokens(chapter.tokens, plan, {
      chapterId: chapter.chapterId,
      title: chapter.title,
      measurePage,
      shouldCancel: options.shouldCancel
    });
    const startPage = pages.length;
    chapterPageMap.set(chapter.chapterId, startPage);

    chapterPages.forEach((page, pageOffset) => {
      const pageIndex = pages.length;
      page.anchorIds.forEach((id) => {
        if (id && !chapterPageMap.has(id)) chapterPageMap.set(id, pageIndex);
      });
      pages.push({
        chapterId: chapter.chapterId,
        title: pageOffset === 0 ? chapter.title : "",
        html: page.html,
        anchorIds: page.anchorIds,
        sourceStart: page.sourceStart,
        sourceEnd: page.sourceEnd,
        lineStart: nextLineNumber,
        lineCount: page.lineCount,
        engine: "measured-v2"
      });
      nextLineNumber += page.lineCount;
    });
  }

  if (!pages.length) {
    pages.push({
      chapterId: "chapter-001",
      title: "",
      html: "",
      anchorIds: [],
      sourceStart: 0,
      sourceEnd: 0,
      lineStart: 1,
      lineCount: 1,
      engine: "measured-v2"
    });
  }

  return { pages, chapterPageMap, plan, engine: "measured-v2" };
}

export async function splitMeasuredPagerTokens(tokens, planInput, options = {}) {
  const plan = normalizeMeasuredPlan(planInput);
  const sourceTokens = Array.isArray(tokens) ? tokens : [];
  const measurePage = options.measurePage;
  if (typeof measurePage !== "function") throw new TypeError("measurePage callback is required");
  if (!sourceTokens.length) {
    return [{ html: "", anchorIds: [], sourceStart: 0, sourceEnd: 0, lineCount: 1 }];
  }

  const sourceOffsets = buildSourceOffsets(sourceTokens);
  const pages = [];
  let start = 0;

  while (start < sourceTokens.length) {
    assertNotCancelled(options.shouldCancel);
    const firstPage = pages.length === 0;
    const title = firstPage ? String(options.title || "") : "";
    const minimumEnd = findMinimumContentEnd(sourceTokens, start);
    const estimate = Math.max(1, plan.capacity);
    const fitCache = new Map();
    const fits = async (end) => {
      const safeEnd = Math.max(minimumEnd, Math.min(sourceTokens.length, end));
      if (fitCache.has(safeEnd)) return fitCache.get(safeEnd);
      assertNotCancelled(options.shouldCancel);
      const candidate = createPageCandidate(sourceTokens, start, safeEnd, title, pages.length);
      const result = Boolean(await measurePage(candidate));
      fitCache.set(safeEnd, result);
      return result;
    };

    let low = minimumEnd;
    let high = Math.min(sourceTokens.length, Math.max(minimumEnd, start + estimate));
    let best = start;

    if (await fits(high)) {
      best = high;
      while (high < sourceTokens.length) {
        const nextHigh = Math.min(sourceTokens.length, high + estimate);
        if (!(await fits(nextHigh))) {
          low = high + 1;
          high = nextHigh;
          break;
        }
        best = nextHigh;
        high = nextHigh;
      }
    }

    if (best < sourceTokens.length && low <= high) {
      let searchLow = Math.max(minimumEnd, best + (best >= minimumEnd ? 1 : 0));
      let searchHigh = high;
      while (searchLow <= searchHigh) {
        const mid = Math.floor((searchLow + searchHigh) / 2);
        if (await fits(mid)) {
          best = mid;
          searchLow = mid + 1;
        } else {
          searchHigh = mid - 1;
        }
      }
    }

    if (best <= start) best = minimumEnd;
    best = await snapMeasuredBreak(sourceTokens, start, best, fits);
    const page = createPageCandidate(sourceTokens, start, best, title, pages.length);
    pages.push({
      html: page.html,
      anchorIds: page.anchorIds,
      sourceStart: sourceOffsets[start],
      sourceEnd: sourceOffsets[best],
      lineCount: countLogicalLines(sourceTokens, start, best)
    });
    start = best;
  }

  return pages;
}

function normalizeMeasuredPlan(plan = {}) {
  const chars = Math.max(8, Math.floor(Number(plan.chars) || 20));
  const lines = Math.max(4, Math.floor(Number(plan.lines) || 10));
  return {
    ...plan,
    chars,
    lines,
    capacity: Math.max(8, Math.floor(Number(plan.capacity) || chars * lines)),
    writingMode: String(plan.writingMode || "vertical").toLowerCase() === "horizontal" ? "horizontal" : "vertical"
  };
}

function createPageCandidate(tokens, start, end, title, pageIndex) {
  const anchorIds = [];
  let html = "";
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token?.type === "anchor") {
      if (token.id) anchorIds.push(token.id);
    } else if (token?.type === "newline") {
      html += "\n";
    } else if (token?.type === "inline") {
      html += token.html || "";
    }
  }
  return { html, anchorIds, title, pageIndex, start, end };
}

function buildSourceOffsets(tokens) {
  const offsets = [0];
  let offset = 0;
  for (const token of tokens) {
    if (token?.type === "newline") offset += 1;
    if (token?.type === "inline") offset += Math.max(1, Number(token.weight) || 1);
    offsets.push(offset);
  }
  return offsets;
}

function findMinimumContentEnd(tokens, start) {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index]?.type !== "anchor") return index + 1;
  }
  return tokens.length;
}

async function snapMeasuredBreak(tokens, start, proposedEnd, fits) {
  let end = Math.max(start + 1, proposedEnd);
  while (end > start + 1 && NO_PAGE_END_CHARS.has(lastInlineChar(tokens, start, end))) {
    end -= 1;
  }

  const nextChar = firstInlineChar(tokens, end);
  if (NO_PAGE_START_CHARS.has(nextChar)) {
    if (end < tokens.length && await fits(end + 1)) {
      end += 1;
    } else if (end > start + 1) {
      end -= 1;
    }
  }
  return Math.max(start + 1, end);
}

function firstInlineChar(tokens, start) {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type === "inline") return String(token.char || "");
    if (token?.type === "newline") return "";
  }
  return "";
}

function lastInlineChar(tokens, start, end) {
  for (let index = end - 1; index >= start; index -= 1) {
    const token = tokens[index];
    if (token?.type === "inline") return String(token.char || "");
    if (token?.type === "newline") return "";
  }
  return "";
}

function countLogicalLines(tokens, start, end) {
  let lines = 1;
  for (let index = start; index < end; index += 1) {
    if (tokens[index]?.type === "newline") lines += 1;
  }
  return Math.max(1, lines);
}

function assertNotCancelled(shouldCancel) {
  if (typeof shouldCancel === "function" && shouldCancel()) {
    throw new MeasuredPagerCancelledError();
  }
}
