import test from "node:test";
import assert from "node:assert/strict";

import { splitMobilePagerTokens } from "../js/mobile-pager.js";
import { MeasuredPagerCancelledError, splitMeasuredPagerTokens } from "../js/measured-pager.js";

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
    ...Array.from("あいうえお").map((char, index) => ({
      type: "inline",
      html: `<span data-token="${index}">${char}</span>`,
      weight: 1,
      char
    })),
    { type: "inline", html: '<span data-token="5">、</span>', weight: 1, char: "、" },
    { type: "inline", html: '<span data-token="6">次</span>', weight: 1, char: "次" }
  ];
  const [page] = splitMobilePagerTokens(tokens, PLAN, { chapterId: "chapter-001", title: "" });
  const lines = page.html.split("\n").map(stripTags).filter(Boolean);

  assert.equal(lines[0], "あいうえお、");
  assert.equal(lines[1], "次");
});

test("measured pager uses measured capacity without losing tokens", async () => {
  const tokens = plainTokens(23, 0);
  const pages = await splitMeasuredPagerTokens(tokens, { ...PLAN, capacity: 4 }, {
    title: "見出し",
    measurePage: ({ html, title }) => countTokenIds(html) <= (title ? 3 : 6)
  });
  const ids = pages.flatMap((page) => [...page.html.matchAll(/data-token="(\d+)"/g)].map((match) => Number(match[1])));

  assert.deepEqual(ids, Array.from({ length: 23 }, (_, index) => index));
  assert.deepEqual(pages.map((page) => countTokenIds(page.html)), [3, 6, 6, 6, 2]);
  assertContiguousRanges(pages, 23);
});

test("measured pager keeps ruby atomic and cancels stale builds", async () => {
  const tokens = [
    ...plainTokens(4, 0),
    { type: "inline", html: '<ruby data-token="ruby">漢字<rt>かんじ</rt></ruby>', weight: 2 },
    ...plainTokens(4, 4)
  ];
  const pages = await splitMeasuredPagerTokens(tokens, { ...PLAN, capacity: 3 }, {
    measurePage: ({ html }) => countTokenIds(html) <= 4
  });
  const joined = pages.map((page) => page.html).join("");

  assert.equal((joined.match(/data-token="ruby"/g) || []).length, 1);
  assertContiguousRanges(pages, 10);

  await assert.rejects(
    () => splitMeasuredPagerTokens(tokens, PLAN, {
      measurePage: () => true,
      shouldCancel: () => true
    }),
    MeasuredPagerCancelledError
  );
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

function countTokenIds(html) {
  return (String(html || "").match(/data-token=/g) || []).length;
}
