import { escapeHtml } from "./utils.js";

const EXPLICIT_RUBY_PATTERN = /｜(.+?)《(.+?)》/g;
const IMPLICIT_RUBY_PATTERN = /([一-龠々仝〆〇ヶヵ]+)《(.+?)》/g;
const TATE_UPRIGHT_PATTERN = /[…‥―—]+/g;
const RUBY_MARKUP_PATTERN = /[｜《》]/;
const TATE_UPRIGHT_MARKUP_PATTERN = /[…‥―—]/;

export function hasAozoraInlineMarkup(text, options = {}) {
  const source = String(text || "");
  if (!source) return false;

  const { includeTateUpright = true } = options;
  if (RUBY_MARKUP_PATTERN.test(source)) return true;
  return includeTateUpright ? TATE_UPRIGHT_MARKUP_PATTERN.test(source) : false;
}

export function normalizeAozoraInlineHtml(text, options = {}) {
  const { wrapTateUpright = true } = options;
  const escaped = escapeHtml(String(text || ""));
  const withRuby = escaped
    .replace(EXPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>")
    .replace(IMPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>");

  if (!wrapTateUpright) return withRuby;
  return withRuby.replace(TATE_UPRIGHT_PATTERN, (value) => `<span class="jp-tate-upright">${value}</span>`);
}
