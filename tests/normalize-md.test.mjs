import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMdToBook } from "../js/normalize-md.js";

const SOURCE = [
  "# 第一部　夜明け",
  "",
  "　彼は｜窓《まど》の外を見た。**遠くの灯**がひとつ消えた。",
  "",
  "## 一章　旅立ち",
  "",
  "> 引用の一行目",
  "> 二行目",
  "",
  "　列車が動きはじめた。",
  "",
  "---",
  "",
  "　新しい場面。`コード` も混ざる。",
  "",
  "### 断章",
  "",
  "　短い断章。"
].join("\n");

test("md: 見出しレベルごとに章とTOCを作る", () => {
  const book = normalizeMdToBook(SOURCE, "手記.md");
  assert.equal(book.meta.format, "txt");
  assert.equal(book.meta.sourceFormat, "md");
  assert.equal(book.meta.textStructureAutoDetected, false);

  assert.deepEqual(book.toc.map((t) => [t.level, t.title]), [
    [1, "第一部　夜明け"],
    [2, "一章　旅立ち"],
    [3, "断章"]
  ]);

  const sections = book.html.match(/<section class="chapter"/g) || [];
  assert.equal(sections.length, 3);
  assert.match(book.html, /<h1>第一部　夜明け<\/h1>/);
  assert.match(book.html, /<h2>一章　旅立ち<\/h2>/);
  assert.match(book.html, /<h3>断章<\/h3>/);
});

test("md: ルビ・強調・引用・区切り線・コードを変換する", () => {
  const book = normalizeMdToBook(SOURCE, "手記.md");
  assert.match(book.html, /<ruby>窓<rt>まど<\/rt><\/ruby>/);
  assert.match(book.html, /<strong>遠くの灯<\/strong>/);
  assert.match(book.html, /<code>コード<\/code>/);

  const quotes = book.html.match(/txt-line md-quote/g) || [];
  assert.equal(quotes.length, 2);
  assert.match(book.html, /class="txt-line md-quote">引用の一行目</);

  assert.match(book.html, /txt-line md-rule/);
});

test("md: 見出しが無ければ本文チャプターにまとめる", () => {
  const book = normalizeMdToBook("　ただの段落。\n\n　もう一段落。", "plain.md");
  assert.equal(book.toc.length, 1);
  assert.equal(book.toc[0].title, "本文");
  assert.match(book.html, /<h1>本文<\/h1>/);
});

test("md: document model の原文範囲が連続する", () => {
  const book = normalizeMdToBook(SOURCE, "手記.md");
  const blocks = book.documentModel?.chapters?.flatMap((c) => c.blocks) || [];
  assert.ok(blocks.length > 0);
  for (let i = 1; i < blocks.length; i += 1) {
    assert.ok(blocks[i].sourceStart >= blocks[i - 1].sourceStart);
  }
});
