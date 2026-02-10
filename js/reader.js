import { qs, escapeHtml } from "./utils.js";

export function initReader({ book, settings, progress, onBack, onExport, onUpdateSettings, onUpdateProgress }) {
  const backBtn = qs("#backBtn");
  const printBtn = qs("#printBtn");
  const exportBtn = qs("#exportBtn");
  const settingsBtn = qs("#settingsBtn");
  const closeSettingsBtn = qs("#closeSettingsBtn");
  const settingsPanel = qs("#settingsPanel");
  const tocBtn = qs("#tocBtn");
  const tocPanel = qs("#tocPanel");
  const closeTocBtn = qs("#closeTocBtn");
  const uiOverlay = qs("#uiOverlay");
  const tocList = qs("#tocList");
  const readerViewport = qs("#readerViewport");
  const bookContent = qs("#bookContent");
  const bookTitle = qs("#bookTitle");
  const topbar = qs("#readerTopbar");
  const tapZone = qs("#tapZone");
  const hScroll = qs("#hScroll");
  const fontSizeRange = qs("#fontSizeRange");
  const lineHeightRange = qs("#lineHeightRange");
  const letterSpacingRange = qs("#letterSpacingRange");
  const themeSelect = qs("#themeSelect");
  const scrollContainer = readerViewport || bookContent;
  const refreshHScroll = setupHScroll(scrollContainer);

  backBtn.addEventListener("click", onBack);
  printBtn.addEventListener("click", () => window.print());
  exportBtn.addEventListener("click", onExport);

  settingsBtn.addEventListener("click", () => {
    if (!settingsPanel) return;
    const isOpen = settingsPanel.classList.contains("open");
    if (isOpen) {
      toggleSettings(false);
    } else {
      closeToc();
      toggleSettings(true);
    }
  });
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));

  tocBtn?.addEventListener("click", () => {
    const isOpen = tocPanel?.classList.contains("open");
    if (isOpen) {
      closeToc();
    } else {
      toggleSettings(false);
      openToc();
    }
  });

  closeTocBtn?.addEventListener("click", closeToc);
  uiOverlay?.addEventListener("click", closeAllPanels);

  renderBook(book);
  applySettings(settings);
  bindSettingsEvents();
  applyProgress(progress, refreshHScroll);
  bindProgressTracking();
  bindPageTap(scrollContainer);
  bindWheelScroll(readerViewport, scrollContainer);
  applyDisplayMode(document.body.classList.contains("mode-paged") ? "paged" : "scroll", {
    tapInScroll: false
  });

  function openOverlay() {
    if (!uiOverlay) return;
    uiOverlay.classList.add("open");
    uiOverlay.setAttribute("aria-hidden", "false");
  }

  function closeOverlay() {
    if (!uiOverlay) return;
    uiOverlay.classList.remove("open");
    uiOverlay.setAttribute("aria-hidden", "true");
  }

  function openToc() {
    if (!tocPanel) return;
    tocPanel.classList.add("open");
    tocPanel.setAttribute("aria-hidden", "false");
    openOverlay();
  }

  function closeToc() {
    if (!tocPanel) return;
    tocPanel.classList.remove("open");
    tocPanel.setAttribute("aria-hidden", "true");
    if (!settingsPanel?.classList.contains("open")) closeOverlay();
  }

  function closeAllPanels() {
    closeToc();
    toggleSettings(false);
    closeOverlay();
  }

  function toggleSettings(open) {
    if (!settingsPanel) return;
    if (open) {
      settingsPanel.classList.add("open");
      settingsPanel.setAttribute("aria-hidden", "false");
      openOverlay();
    } else {
      settingsPanel.classList.remove("open");
      settingsPanel.setAttribute("aria-hidden", "true");
      if (!tocPanel?.classList.contains("open")) closeOverlay();
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
        closeToc();
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
      const scrollLeft = scrollContainer.scrollLeft;
      const w = scrollContainer.clientWidth || 1;
      const pageIndex = Math.round(scrollLeft / w);
      onUpdateProgress({ chapterId, scrollLeft, pageIndex });
    }, 250);

    scrollContainer.addEventListener("scroll", handler);
  }

  function getCurrentChapterId() {
    const chapters = Array.from(bookContent.querySelectorAll("section.chapter"));
    if (chapters.length === 0) return "chapter-001";

    const containerRect = scrollContainer.getBoundingClientRect();
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
        const w = scrollContainer.clientWidth || 1;
        if (nextProgress.pageIndex != null) {
          scrollContainer.scrollLeft = Number(nextProgress.pageIndex) * w;
        } else if (nextProgress.scrollLeft != null) {
          scrollContainer.scrollLeft = Number(nextProgress.scrollLeft) || 0;
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
        toggleChrome();
      }
    });
  }

  function toggleChrome() {
    const tocOpen = tocPanel?.classList.contains("open");
    const settingsOpen = settingsPanel?.classList.contains("open");
    if (tocOpen || settingsOpen) {
      closeAllPanels();
      return;
    }
    topbar.classList.toggle("hidden");
  }

  function applyDisplayMode(mode, options = {}) {
    if (!tapZone) return;
    const disableTapZone = mode !== "paged" && !options.tapInScroll;
    tapZone.classList.toggle("disabled", disableTapZone);
  }

  function bindWheelScroll(viewport, content) {
    if (!viewport || !content) return;

    viewport.addEventListener(
      "wheel",
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        content.scrollLeft += event.deltaY;
        event.preventDefault();
      },
      { passive: false }
    );
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
