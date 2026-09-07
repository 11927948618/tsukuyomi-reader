import test from "node:test";
import assert from "node:assert/strict";

import { splitMobilePagerTokens } from "../js/mobile-pager.js";

const PLAN = {
  chars: 8,
  lines: 4,
  lineSafetyReserve: 0,
  titleLineReserve: 2
};

test("legacy pager does not lose or duplicate inline tokens", () => {
  const tokens = Array.from({ length: 40 }, (_, index) => ({
    type: "inline",
    html: `<span data-token="${index}">字</span>`,
    weight: 1,
    char: "字"
  }));
  const pages = splitMobilePagerTokens(tokens, PLAN, { chapterId: "chapter-001", title: "" });
  const ids = pages.flatMap((page) => [...page.html.matchAll(/data-token="(\d+)"/g)].map((match) => Number(match[1])));

  assert.deepEqual(ids, Array.from({ length: 40 }, (_, index) => index));
  assertContiguousRanges(pages, 40);
});

test("legacy pager keeps ruby tokens atomic", () => {
  const tokens = [
    ...plainTokens(7, 0),
    {
      type: "inline",
      html: '<ruby data-token="ruby">漢字<rt>かんじ</rt></ruby>',
      weight: 2
    },
    ...plainTokens(12, 7)
  ];
  const pages = splitMobilePagerTokens(tokens, PLAN, { chapterId: "chapter-001", title: "" });
  const joined = pages.map((page) => page.html).join("");

  assert.equal((joined.match(/data-token="ruby"/g) || []).length, 1);
  assert.equal((joined.match(/<ruby/g) || []).length, 1);
  assert.equal((joined.match(/<\/ruby>/g) || []).length, 1);
  assertContiguousRanges(pages, 21);
});

test("legacy pager counts explicit newlines without breaking source ranges", () => {
  const tokens = [
    ...plainTokens(6, 0),
    { type: "newline" },
    ...plainTokens(8, 6),
    { type: "newline" },
    ...plainTokens(5, 14)
  ];
  const pages = splitMobilePagerTokens(tokens, PLAN, { chapterId: "chapter-001", title: "" });

  assertContiguousRanges(pages, 21);
});

test("legacy pager hangs closing punctuation instead of starting the next line with it", () => {
  const tokens = [
    ...Array.from("あいうえおかき").map((char, index) => ({
      type: "inline",
      html: `<span data-token="${index}">${char}</span>`,
      weight: 1,
      char
    })),
    { type: "inline", html: '<span data-token="7">、</span>', weight: 1, char: "、" },
    { type: "inline", html: '<span data-token="8">次</span>', weight: 1, char: "次" }
  ];
  const [page] = splitMobilePagerTokens(tokens, PLAN, { chapterId: "chapter-001", title: "" });
  const lines = page.html.split("\n").map(stripTags).filter(Boolean);

  assert.equal(lines[0], "あいうえおかき、");
  assert.equal(lines[1], "次");
});

function plainTokens(count, startIndex) {
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return {
      type: "inline",
      html: `<span data-token="${index}">字</span>`,
      weight: 1,
      char: "字"
    };
  });
}

function assertContiguousRanges(pages, expectedEnd) {
  assert.ok(pages.length > 0);
  assert.equal(pages[0].sourceStart, 0);
  for (let index = 1; index < pages.length; index += 1) {
    assert.equal(pages[index].sourceStart, pages[index - 1].sourceEnd);
  }
  assert.equal(pages.at(-1).sourceEnd, expectedEnd);
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}
