import { escapeHtml } from "./utils.js";

const EXPLICIT_RUBY_PATTERN = /｜(.+?)《(.+?)》/g;
const IMPLICIT_RUBY_PATTERN = /([一-龠々仝〆〇ヶヵ]+)《(.+?)》/g;
const ELLIPSIS_PATTERN = /(?:…|‥|\.{3,})+/g;
const DASH_PATTERN = /[―—]+/g;
const RUBY_MARKUP_PATTERN = /[｜《》]/;
const ELLIPSIS_MARKUP_PATTERN = /[…‥]|\.\.\./;
const DASH_MARKUP_PATTERN = /[―—]/;

export function hasAozoraInlineMarkup(text, options = {}) {
  const source = String(text || "");
  if (!source) return false;

  const { includeEllipsis = true, includeDash = true } = options;
  if (RUBY_MARKUP_PATTERN.test(source)) return true;
  if (includeEllipsis && ELLIPSIS_MARKUP_PATTERN.test(source)) return true;
  if (includeDash && DASH_MARKUP_PATTERN.test(source)) return true;
  return false;
}

export function normalizeAozoraInlineHtml(text, options = {}) {
  const { wrapEllipsis = true, wrapDash = true } = options;
  const escaped = escapeHtml(String(text || ""));
  const withRuby = escaped
    .replace(EXPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>")
    .replace(IMPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>");

  let out = withRuby;
  if (wrapEllipsis) {
    out = out.replace(ELLIPSIS_PATTERN, (value) => `<span class="jp-tate-upright">${normalizeVerticalEllipsis(value)}</span>`);
  }
  if (wrapDash) {
    out = out.replace(DASH_PATTERN, (value) => `<span class="jp-tate-upright">${value}</span>`);
  }
  return out;
}

function normalizeVerticalEllipsis(value) {
  return String(value || "")
    .replace(/…/g, "･･･")
    .replace(/‥/g, "･･")
    .replace(/\.{3}/g, "･･･");
}
