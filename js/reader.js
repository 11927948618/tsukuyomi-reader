import { qs, escapeHtml } from "./utils.js";

export function initReader({ book, settings, progress, onBack, onExport, onUpdateSettings, onUpdateProgress }) {
  const backBtn = qs("#backBtn");
  const printBtn = qs("#printBtn");
  const exportBtn = qs("#exportBtn");
  const settingsBtn = qs("#settingsBtn");
  const closeSettingsBtn = qs("#closeSettingsBtn");
  const settingsPanel = qs("#settingsPanel");
  const tocList = qs("#tocList");
  const bookContent = qs("#bookContent");
  const bookTitle = qs("#bookTitle");
  const topbar = qs("#readerTopbar");
  const tapZone = qs("#tapZone");
  const hScroll = qs("#hScroll");
  const fontSizeRange = qs("#fontSizeRange");
  const lineHeightRange = qs("#lineHeightRange");
  const letterSpacingRange = qs("#letterSpacingRange");
  const themeSelect = qs("#themeSelect");
  const refreshHScroll = setupHScroll(bookContent);

  backBtn.addEventListener("click", onBack);
  printBtn.addEventListener("click", () => window.print());
  exportBtn.addEventListener("click", onExport);

  settingsBtn.addEventListener("click", () => toggleSettings(true));
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));

  renderBook(book);
  applySettings(settings);
  bindSettingsEvents();
  applyProgress(progress, refreshHScroll);
  bindProgressTracking();
  bindPageTap(bookContent);

  function toggleSettings(open) {
    if (open) {
      settingsPanel.classList.add("open");
      settingsPanel.setAttribute("aria-hidden", "false");
    } else {
      settingsPanel.classList.remove("open");
      settingsPanel.setAttribute("aria-hidden", "true");
    }
  }

  function renderBook(currentBook) {
    if (!currentBook) return;

    bookTitle.innerHTML = escapeHtml(currentBook.title || "Untitled");
    bookContent.innerHTML = currentBook.html || "";

    tocList.innerHTML = "";
    (currentBook.toc || []).forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = escapeHtml(item.title || "");
      btn.addEventListener("click", () => {
        const target = document.getElementById(item.chapterId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      li.appendChild(btn);
      tocList.appendChild(li);
    });

    // Phase 1は全文一括DOM生成。大容量対応はPhase 2で検討。
  }

  function applySettings(nextSettings) {
    if (!nextSettings) return;

    document.documentElement.style.setProperty("--font-size", Number(nextSettings.fontSize) || 100);
    document.documentElement.style.setProperty("--line-height", Number(nextSettings.lineHeight) || 1.8);
    document.documentElement.style.setProperty("--letter-spacing", `${Number(nextSettings.letterSpacing) || 0}px`);
    applyTheme(nextSettings.theme || "light");

    fontSizeRange.value = String(nextSettings.fontSize ?? 100);
    lineHeightRange.value = String(nextSettings.lineHeight ?? 1.8);
    letterSpacingRange.value = String(nextSettings.letterSpacing ?? 0);
    themeSelect.value = nextSettings.theme || "light";
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }

  function bindSettingsEvents() {
    fontSizeRange.addEventListener("input", () => updateSettings({ fontSize: Number(fontSizeRange.value) }));
    lineHeightRange.addEventListener("input", () => updateSettings({ lineHeight: Number(lineHeightRange.value) }));
    letterSpacingRange.addEventListener("input", () => updateSettings({ letterSpacing: Number(letterSpacingRange.value) }));
    themeSelect.addEventListener("change", () => updateSettings({ theme: themeSelect.value }));
  }

  function updateSettings(patch) {
    const next = {
      fontSize: Number(fontSizeRange.value) || 100,
      lineHeight: Number(lineHeightRange.value) || 1.8,
      letterSpacing: Number(letterSpacingRange.value) || 0,
      theme: themeSelect.value || "light",
      ...patch
    };
    applySettings(next);
    onUpdateSettings(next);
  }

  function bindProgressTracking() {
    const handler = throttle(() => {
      const chapterId = getCurrentChapterId();
      const scrollLeft = bookContent.scrollLeft;
      const w = bookContent.clientWidth || 1;
      const pageIndex = Math.round(scrollLeft / w);
      onUpdateProgress({ chapterId, scrollLeft, pageIndex });
    }, 250);

    bookContent.addEventListener("scroll", handler);
  }

  function getCurrentChapterId() {
    const chapters = Array.from(bookContent.querySelectorAll("section.chapter"));
    if (chapters.length === 0) return "chapter-001";

    const containerRect = bookContent.getBoundingClientRect();
    let candidate = chapters[0];

    for (const chapter of chapters) {
      const rect = chapter.getBoundingClientRect();
      const offset = rect.top - containerRect.top;
      if (offset <= 24) {
        candidate = chapter;
      } else {
        break;
      }
    }

    return candidate.getAttribute("id") || "chapter-001";
  }

  function applyProgress(nextProgress, refresh) {
    if (!nextProgress) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const w = bookContent.clientWidth || 1;
        if (nextProgress.pageIndex != null) {
          bookContent.scrollLeft = Number(nextProgress.pageIndex) * w;
        } else if (nextProgress.scrollLeft != null) {
          bookContent.scrollLeft = Number(nextProgress.scrollLeft) || 0;
        }
        if (typeof refresh === "function") refresh();
      });
    });
  }

  function setupHScroll(content) {
    const slider = hScroll;
    if (!slider || !content) return;

    const refresh = () => {
      const max = Math.max(0, content.scrollWidth - content.clientWidth);
      slider.max = String(max);
      slider.value = String(Math.min(max, content.scrollLeft));
      slider.disabled = max === 0;
    };

    slider.addEventListener("input", () => {
      content.scrollLeft = Number(slider.value);
    });

    content.addEventListener("scroll", () => {
      slider.value = String(content.scrollLeft);
    });

    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);

    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });

    return refresh;
  }

  function bindPageTap(content) {
    if (!content) return;

    content.addEventListener("click", (e) => {
      const rect = content.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width || 1;

      if (x < w * 0.33) {
        pageBy(content, -content.clientWidth);
      } else if (x > w * 0.66) {
        pageBy(content, content.clientWidth);
      } else {
        topbar.classList.toggle("hidden");
      }
    });
  }
}

function throttle(fn, wait) {
  let timer = null;
  let lastArgs = null;

  return function throttled(...args) {
    lastArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, wait);
  };
}

function pageBy(content, delta) {
  content.scrollTo({ left: content.scrollLeft + delta, behavior: "smooth" });
}
