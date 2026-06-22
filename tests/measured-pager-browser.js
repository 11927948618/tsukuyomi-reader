import { buildMeasuredTextPagerPages } from "../js/measured-pager.js";

const resultEl = document.getElementById("result");
const probe = document.getElementById("probe");
const writingMode = new URLSearchParams(window.location.search).get("mode") === "horizontal"
  ? "horizontal"
  : "vertical";
document.body.classList.toggle("writing-vertical", writingMode === "vertical");
document.body.classList.toggle("writing-horizontal", writingMode === "horizontal");
probe.classList.toggle("force-vertical", writingMode === "vertical");
probe.classList.toggle("force-horizontal", writingMode === "horizontal");
const repeated = Array.from({ length: 18 }, (_, index) => (
  `<div class="txt-line">${index + 1}行目。ではみなさんは、そういうふうに川だと云われたり、` +
  `乳の流れたあとだと云われたりしていたこのぼんやりと白いものがほんとうは何かご承知ですか。</div>`
)).join("\n");
const sourceHtml = `
  <section class="chapter" id="chapter-001">
    <h1>一、午后の授業</h1>
    <div class="txt-line">銀河鉄道の夜　宮沢賢治</div>
    <div class="txt-line">黒板に吊した大きな黒い星座の図を指しながら、みんなに問をかけました。</div>
    <div class="txt-line"><ruby>銀河<rt>ぎんが</rt></ruby>の向こうへ行きます。</div>
    ${repeated}
  </section>`;
const plan = { chars: 24, lines: 9, capacity: 180, writingMode };

try {
  if (document.fonts?.ready) await document.fonts.ready;
  const built = await buildMeasuredTextPagerPages(sourceHtml, {
    plan,
    measurePage: measureCandidate
  });
  const expected = extractBaseText(sourceHtml, true);
  const actual = built.pages.map((page) => extractBaseText(page.html, false)).join("");
  const allFit = built.pages.every((page, index) => measureCandidate({
    html: page.html,
    title: page.title,
    pageIndex: index
  }));
  const checks = {
    engine: built.engine === "measured-v2",
    multiplePages: built.pages.length > 1,
    contentComplete: expected === actual,
    allPagesFit: allFit,
    rangesContiguous: built.pages.every((page, index) => (
      index === 0 || page.sourceStart === built.pages[index - 1].sourceEnd
    ))
  };
  const passed = Object.values(checks).every(Boolean);
  document.body.dataset.testResult = passed ? "pass" : "fail";
  resultEl.textContent = `${passed ? "PASS" : "FAIL"}\nmode=${writingMode}\npages=${built.pages.length}\n${JSON.stringify(checks, null, 2)}`;
} catch (error) {
  document.body.dataset.testResult = "fail";
  resultEl.textContent = `FAIL\n${error?.stack || error}`;
}

function measureCandidate(candidate) {
  probe.innerHTML = `
    <section class="mobile-text-page ${writingMode}${candidate.title ? " has-title" : ""}">
      ${candidate.title ? `<h1>${escapeHtml(candidate.title)}</h1>` : ""}
      <div class="mobile-text-page-body">${candidate.html}</div>
    </section>`;
  const page = probe.querySelector(".mobile-text-page");
  const body = probe.querySelector(".mobile-text-page-body");
  const endMarker = document.createElement("span");
  endMarker.className = "measured-page-end";
  endMarker.setAttribute("aria-hidden", "true");
  body.appendChild(endMarker);
  const epsilon = 1;
  const bodyRect = body.getBoundingClientRect();
  const markerRect = endMarker.getBoundingClientRect();
  return markerRect.left >= bodyRect.left - epsilon
    && markerRect.right <= bodyRect.right + epsilon
    && markerRect.top >= bodyRect.top - epsilon
    && markerRect.bottom <= bodyRect.bottom + epsilon;
}

function extractBaseText(html, removeHeading) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  template.content.querySelectorAll("rt,rp,script,style").forEach((node) => node.remove());
  if (removeHeading) template.content.querySelectorAll("h1,h2,h3").forEach((node) => node.remove());
  return String(template.content.textContent || "").replace(/[\s　]+/gu, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
