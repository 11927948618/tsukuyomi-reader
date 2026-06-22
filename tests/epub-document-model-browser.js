import { validateDocumentModel } from "../js/document-model.js";
import { normalizeEpubToBook } from "../js/normalize-epub.js";

const result = document.querySelector("#result");

run().catch((error) => {
  result.textContent = `FAIL\n${error?.stack || error}`;
  console.error(error);
});

async function run() {
  const sourceUrl = "../book/%E5%AE%AE%E6%B2%A2%E8%B3%A2%E6%B2%BB%20-%20%E9%8A%80%E6%B2%B3%E9%89%84%E9%81%93%E3%81%AE%E5%A4%9C.epub";
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`EPUB fetch failed: ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], "銀河鉄道の夜.epub", { type: "application/epub+zip" });
  const book = await normalizeEpubToBook(file);
  const validation = validateDocumentModel(book.documentModel);
  const template = document.createElement("template");
  template.innerHTML = book.html;
  const modelBlockCount = book.documentModel.chapters.reduce((sum, chapter) => sum + chapter.blocks.length, 0);
  const htmlBlockCount = template.content.querySelectorAll("[data-document-block-id]").length;
  const rubyCount = template.content.querySelectorAll("ruby").length;
  const chapterCount = book.documentModel.chapters.length;
  const checks = {
    validModel: validation.valid,
    chapterCount: chapterCount > 1,
    blockCount: modelBlockCount > 10,
    blockIdsAttached: htmlBlockCount === modelBlockCount,
    rubyPreserved: rubyCount > 0,
    sourceRevision: Boolean(book.documentModel.sourceRevision)
  };
  const passed = Object.values(checks).every(Boolean);
  result.textContent = `${passed ? "PASS" : "FAIL"}\n${JSON.stringify({
    checks,
    title: book.title,
    chapterCount,
    modelBlockCount,
    htmlBlockCount,
    rubyCount,
    errors: validation.errors
  }, null, 2)}`;
  if (!passed) throw new Error("EPUB DocumentModel checks failed");
}
