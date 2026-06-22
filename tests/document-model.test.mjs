import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTxtToBook } from "../js/normalize-txt.js";
import {
  buildStructuredDocumentModel,
  compareReaderLocators,
  countCodePoints,
  createReaderLocator,
  validateDocumentModel
} from "../js/document-model.js";

test("TXT normalization creates stable source ranges and chapter blocks", () => {
  const source = [
    "# 第一章",
    "本文｜漢字《かんじ》です。",
    "",
    "■終章",
    "終わり。"
  ].join("\r\n");
  const normalized = source.replace(/\r\n?/g, "\n");
  const book = normalizeTxtToBook(source, "fixture.txt", { autoDetectStructure: true });
  const model = book.documentModel;

  assert.equal(model.format, "txt");
  assert.equal(model.sourceLength, countCodePoints(normalized));
  assert.equal(model.chapters.length, 2);
  assert.deepEqual(model.chapters[0].blocks.map((block) => block.kind), ["heading", "paragraph", "blank"]);
  assert.deepEqual(model.chapters[1].blocks.map((block) => block.kind), ["heading", "paragraph"]);
  assert.deepEqual(validateDocumentModel(model), { valid: true, errors: [] });

  const sourcePoints = Array.from(normalized);
  for (const chapter of model.chapters) {
    for (const block of chapter.blocks) {
      const actual = sourcePoints.slice(block.sourceStart, block.sourceEnd).join("");
      assert.equal(actual, block.text);
    }
  }
});

test("source revision changes only when normalized source changes", () => {
  const crlf = normalizeTxtToBook("本文\r\n次行", "a.txt").documentModel;
  const lf = normalizeTxtToBook("本文\n次行", "a.txt").documentModel;
  const changed = normalizeTxtToBook("本文\n別行", "a.txt").documentModel;

  assert.equal(crlf.sourceRevision, lf.sourceRevision);
  assert.notEqual(lf.sourceRevision, changed.sourceRevision);
});

test("reader locators clamp offsets and compare in document order", () => {
  const model = normalizeTxtToBook("# 章\n一行目\n二行目", "a.txt").documentModel;
  const [heading, firstLine, secondLine] = model.chapters[0].blocks;
  const first = createReaderLocator(model, {
    chapterId: model.chapters[0].chapterId,
    blockId: firstLine.blockId,
    textOffset: 999
  });
  const second = createReaderLocator(model, {
    chapterId: model.chapters[0].chapterId,
    blockId: secondLine.blockId,
    textOffset: 0,
    affinity: "after"
  });

  assert.equal(first.textOffset, countCodePoints(firstLine.text));
  assert.equal(second.affinity, "after");
  assert.equal(compareReaderLocators(model, first, second), -1);
  assert.equal(compareReaderLocators(model, second, first), 1);
  assert.equal(compareReaderLocators(model, first, first), 0);
  assert.equal(createReaderLocator(model, { blockId: heading.blockId })?.blockId, heading.blockId);
});

test("EPUB structured model assigns stable monotonic ranges", () => {
  const model = buildStructuredDocumentModel("<section>fixture</section>", [
    {
      chapterId: "chapter-001",
      title: "第一章",
      blocks: [
        { blockId: "heading-1", kind: "heading", text: "第一章" },
        { blockId: "paragraph-1", kind: "paragraph", text: "漢字を読む。" },
        { blockId: "image-1", kind: "image", text: "挿絵" }
      ]
    },
    {
      chapterId: "chapter-002",
      title: "第二章",
      blocks: [{ blockId: "paragraph-2", kind: "paragraph", text: "続き。" }]
    }
  ], "epub");

  assert.equal(model.format, "epub");
  assert.equal(model.chapters.length, 2);
  assert.equal(model.chapters[0].blocks[1].text, "漢字を読む。");
  assert.equal(model.chapters[0].blocks[2].kind, "image");
  assert.equal(validateDocumentModel(model).valid, true);
  assert.ok(model.chapters[1].blocks[0].sourceStart > model.chapters[0].blocks[2].sourceEnd);
});
