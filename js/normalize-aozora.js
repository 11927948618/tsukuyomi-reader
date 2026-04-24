import { escapeHtml } from "./utils.js";

const EXPLICIT_RUBY_PATTERN = /｜(.+?)《(.+?)》/g;
const IMPLICIT_RUBY_PATTERN = /([一-龠々仝〆〇ヶヵ]+)《(.+?)》/g;
const TATE_UPRIGHT_PATTERN = /[…‥―—]+/g;

export function hasAozoraInlineMarkup(text) {
  return /[｜《》…‥―—]/.test(String(text || ""));
}

export function normalizeAozoraInlineHtml(text) {
  const escaped = escapeHtml(String(text || ""));
  return escaped
    .replace(EXPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>")
    .replace(IMPLICIT_RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>")
    .replace(TATE_UPRIGHT_PATTERN, (value) => `<span class="jp-tate-upright">${value}</span>`);
}
