import { qs, readFileAsText, safeText } from "./utils.js";
import { normalizeTxtToBook } from "./normalize-txt.js";
import { importZipToBook } from "./storage.js";

export function initLibrary({ onOpenBook, onExport, getCurrentBook }) {
  const txtInput = qs("#txtInput");
  const txtEncoding = qs("#txtEncoding");
  const htmlInput = qs("#htmlInput");
  const zipInput = qs("#zipInput");
  const exportBtn = qs("#exportBtn");
  const statusMessage = qs("#statusMessage");
  const debugDecode = qs("#debugDecode");

  const setStatus = (message, type = "") => {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`.trim();
  };

  exportBtn.disabled = !getCurrentBook();

  exportBtn.addEventListener("click", () => {
    const book = getCurrentBook();
    if (!book) {
      setStatus("保存する本がありません", "error");
      return;
    }
    onExport();
  });

  txtInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("TXT読み込み中...");
    try {
      const mode = txtEncoding ? txtEncoding.value : "auto";
      const { text, encoding, debug } = await decodeTxtAuto(file, mode);
      if (debugDecode) debugDecode.textContent = debug;
      console.log("[TXT decode] pick:", encoding);
      const book = normalizeTxtToBook(text, file.name);
      setStatus("TXT読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  htmlInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("HTML読み込み中...");
    try {
      const htmlText = await readFileAsText(file);
      const book = normalizeHtmlToBook(htmlText, file.name);
      setStatus("HTML読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  zipInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("ZIP読み込み中...");
    try {
      const book = await importZipToBook(file);
      setStatus("ZIP読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });
}

function countReplacement(text) {
  let n = 0;
  for (const ch of text) {
    if (ch === "\uFFFD") n += 1;
  }
  return n;
}

async function decodeTxtAuto(file, mode = "auto") {
  const buffer = await file.arrayBuffer();

  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const utf8 = utf8Text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const utf8Score = countReplacement(utf8);

  let shiftJis = null;
  let sjScore = Number.POSITIVE_INFINITY;

  try {
    const sjText = new TextDecoder("shift_jis", { fatal: false }).decode(buffer);
    shiftJis = sjText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    sjScore = countReplacement(shiftJis);
  } catch (err) {
    shiftJis = null;
    sjScore = Number.POSITIVE_INFINITY;
  }

  if (mode === "utf-8") {
    return { text: utf8, encoding: "utf-8", debug: formatDebug("utf-8", utf8Score, sjScore, utf8) };
  }
  if (mode === "shift_jis" && shiftJis) {
    return { text: shiftJis, encoding: "shift_jis", debug: formatDebug("shift_jis", utf8Score, sjScore, shiftJis) };
  }

  const picked = shiftJis && sjScore < utf8Score ? "shift_jis" : "utf-8";
  const chosen = picked === "shift_jis" ? shiftJis : utf8;
  const head = (chosen || "").slice(0, 200);

  const debug = [
    `picked: ${picked}`,
    `score utf: ${utf8Score} / sjis: ${sjScore === Number.POSITIVE_INFINITY ? "N/A" : sjScore}`,
    `head: ${head}`
  ].join("\n");

  return { text: chosen, encoding: picked, debug };
}

function formatDebug(picked, utf8Score, sjScore, text) {
  const head = (text || "").slice(0, 200);
  return [
    `picked: ${picked}`,
    `score utf: ${utf8Score} / sjis: ${sjScore === Number.POSITIVE_INFINITY ? "N/A" : sjScore}`,
    `head: ${head}`
  ].join("\n");
}

function normalizeHtmlToBook(htmlText, filename = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  doc.querySelectorAll("script").forEach((el) => el.remove());

  let chapters = Array.from(doc.querySelectorAll("section.chapter"));

  if (chapters.length === 0) {
    const section = doc.createElement("section");
    section.className = "chapter";
    const h1 = doc.createElement("h1");
    h1.textContent = safeText(filename.replace(/\.[^.]+$/, ""), "本文");
    section.appendChild(h1);

    const wrapper = doc.createElement("div");
    wrapper.innerHTML = doc.body.innerHTML;
    Array.from(wrapper.childNodes).forEach((node) => section.appendChild(node));

    doc.body.innerHTML = "";
    doc.body.appendChild(section);
    chapters = [section];
  }

  const toc = chapters.map((chapter, index) => {
    const chapterId = chapter.getAttribute("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    chapter.setAttribute("id", chapterId);
    chapter.setAttribute("data-chapter", chapterId);

    let title = "";
    const h1 = chapter.querySelector("h1");
    if (h1) {
      title = h1.textContent || "";
    } else {
      title = `章${index + 1}`;
      const newH1 = doc.createElement("h1");
      newH1.textContent = title;
      chapter.prepend(newH1);
    }

    return { chapterId, title: safeText(title, `章${index + 1}`) };
  });

  const html = chapters.map((chapter) => chapter.outerHTML).join("\n");

  return {
    title: safeText(filename.replace(/\.[^.]+$/, ""), "Untitled"),
    html,
    toc,
    meta: null
  };
}
