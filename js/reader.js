import { qs, escapeHtml } from "./utils.js";

export function initReader({ book, settings, progress, onBack, onExport, onUpdateSettings, onSaveSettings, onUpdateProgress }) {
  const backBtn = qs("#backBtn");
  const printBtn = qs("#printBtn");
  const exportBtn = qs("#exportBtn");
  const settingsBtn = qs("#settingsBtn");
  const closeSettingsBtn = qs("#closeSettingsBtn");
  const saveSettingsBtn = qs("#saveSettingsBtn");
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
  const wrapWidthRange = qs("#wrapWidthRange");
  const themeSelect = qs("#themeSelect");
  const writingModeSelect = qs("#writingModeSelect");
  const wheelPagingCheck = qs("#wheelPagingCheck");
  const reloadBtn = qs("#reloadBtn");
  const hardReloadBtn = qs("#hardReloadBtn");
  const displayModeRadios = Array.from(document.querySelectorAll('input[name="displayMode"]'));
  const scrollContainer = readerViewport || bookContent;
  let displayMode = normalizeDisplayMode(settings?.displayMode);
  let tapInScroll = Boolean(settings?.tapInScroll);
  let wheelPaging = Boolean(settings?.wheelPaging);
  let wrapWidthPercent = normalizeWrapWidthPercent(settings?.wrapWidthPercent);
  let writingModePreference = normalizeWritingModePreference(settings?.writingModePreference);
  let pageDirection = writingModePreference === "vertical" ? "rtl" : "ltr";
  let skipNextTap = false;
  const refreshHScroll = setupHScroll(scrollContainer);
  const applyPageWidth = () => {
    const width = readerViewport?.clientWidth || scrollContainer?.clientWidth || window.innerWidth;
    const wrapped = Math.round(width * (wrapWidthPercent / 100));
    document.documentElement.style.setProperty("--page-width", `${Math.max(240, wrapped)}px`);
  };
  const applyViewportMetrics = () => {
    const visualHeight = Number(window.visualViewport?.height) || Number(window.innerHeight) || 0;
    if (!visualHeight) return;
    document.documentElement.style.setProperty("--reader-viewport-height", `${Math.round(visualHeight)}px`);
  };
  const applyTopbarLayoutMode = () => {
    const controls = topbar?.querySelector(".topbar-controls");
    if (!topbar || !controls) return;

    const isWindows = /windows/i.test(navigator.userAgent || "");
    if (!isWindows) {
      document.body.classList.remove("topbar-auto-wrap");
      return;
    }

    const taskbarRowPx = 48;
    const reservePx = taskbarRowPx * 2;
    const viewportH = Number(window.innerHeight) || 0;
    const availH = Number(window.screen?.availHeight) || viewportH;
    const usableH = Math.max(0, Math.min(viewportH, availH) - reservePx);

    const overflow = controls.scrollWidth > controls.clientWidth + 2;
    const shouldWrap = overflow || usableH < 620 || window.innerWidth < 980;
    document.body.classList.toggle("topbar-auto-wrap", shouldWrap);
  };
  const applyTopbarOffset = () => {
    const height = topbar?.classList.contains("hidden") ? 0 : (topbar?.offsetHeight || 64);
    document.documentElement.style.setProperty("--reader-topbar-height", `${height}px`);
  };
  const reflowTopbar = () => {
    applyTopbarLayoutMode();
    applyTopbarOffset();
  };

  backBtn.addEventListener("click", onBack);
  printBtn.addEventListener("click", () => window.print());
  exportBtn.addEventListener("click", onExport);
  reloadBtn?.addEventListener("click", () => location.reload());
  hardReloadBtn?.addEventListener("click", async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        const targets = keys.filter((key) => /tsukuyomi|tsukuyomireader/i.test(key));
        await Promise.all(targets.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } finally {
      location.reload();
    }
  });

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
  applyPageWidth();
  applySettings(settings);
  bindSettingsEvents();
  applyProgress(progress, refreshHScroll);
  bindProgressTracking();
  bindTopEdgeRevealTap(tapZone);
  bindPageTap(tapZone, scrollContainer);
  bindWheelScroll(readerViewport, scrollContainer);
  applyDisplayMode(displayMode, { tapInScroll });
  applyViewportMetrics();
  reflowTopbar();
  window.addEventListener("resize", applyPageWidth);
  window.addEventListener("orientationchange", applyPageWidth);
  window.addEventListener("resize", applyViewportMetrics);
  window.addEventListener("orientationchange", applyViewportMetrics);
  window.visualViewport?.addEventListener("resize", applyViewportMetrics);
  window.addEventListener("resize", reflowTopbar);
  window.addEventListener("orientationchange", reflowTopbar);
  window.visualViewport?.addEventListener("resize", reflowTopbar);

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
    document.body.classList.add("toc-open");
    openOverlay();
  }

  function closeToc() {
    if (!tocPanel) return;
    tocPanel.classList.remove("open");
    tocPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("toc-open");
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

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyWritingModePreference(writingModePreference);
        updatePageDirection();
        scrollContainer.scrollLeft = toPhysicalLeft(scrollContainer, 0, pageDirection);
        refreshHScroll?.();
      });
    });

    // Phase 1は全文一括DOM生成。大容量対応はPhase 2で検討。
  }

  function applySettings(nextSettings) {
    if (!nextSettings) return;

    document.documentElement.style.setProperty("--font-size", Number(nextSettings.fontSize) || 100);
    document.documentElement.style.setProperty("--line-height", Number(nextSettings.lineHeight) || 1.8);
    document.documentElement.style.setProperty("--letter-spacing", `${Number(nextSettings.letterSpacing) || 0}px`);
    applyTheme(nextSettings.theme || "light");
    displayMode = normalizeDisplayMode(nextSettings.displayMode);
    tapInScroll = Boolean(nextSettings.tapInScroll);
    wheelPaging = Boolean(nextSettings.wheelPaging);
    wrapWidthPercent = normalizeWrapWidthPercent(nextSettings.wrapWidthPercent);
    writingModePreference = normalizeWritingModePreference(nextSettings.writingModePreference);
    applyWritingModePreference(writingModePreference);
    updatePageDirection({ preservePosition: true });
    applyPageWidth();
    applyDisplayMode(displayMode, { tapInScroll });

    fontSizeRange.value = String(nextSettings.fontSize ?? 100);
    lineHeightRange.value = String(nextSettings.lineHeight ?? 1.8);
    letterSpacingRange.value = String(nextSettings.letterSpacing ?? 0);
    if (wrapWidthRange) wrapWidthRange.value = String(wrapWidthPercent);
    themeSelect.value = nextSettings.theme || "light";
    if (writingModeSelect) writingModeSelect.value = writingModePreference;
    if (wheelPagingCheck) wheelPagingCheck.checked = wheelPaging;
    displayModeRadios.forEach((radio) => {
      radio.checked = radio.value === displayMode;
    });
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }

  function bindSettingsEvents() {
    fontSizeRange.addEventListener("input", () => updateSettings({ fontSize: Number(fontSizeRange.value) }));
    lineHeightRange.addEventListener("input", () => updateSettings({ lineHeight: Number(lineHeightRange.value) }));
    letterSpacingRange.addEventListener("input", () => updateSettings({ letterSpacing: Number(letterSpacingRange.value) }));
    wrapWidthRange?.addEventListener("input", () => {
      updateSettings({ wrapWidthPercent: normalizeWrapWidthPercent(wrapWidthRange.value) });
    });
    themeSelect.addEventListener("change", () => updateSettings({ theme: themeSelect.value }));
    writingModeSelect?.addEventListener("change", () => {
      updateSettings({ writingModePreference: normalizeWritingModePreference(writingModeSelect.value) });
    });
    wheelPagingCheck?.addEventListener("change", () => {
      updateSettings({ wheelPaging: Boolean(wheelPagingCheck.checked) });
    });
    saveSettingsBtn?.addEventListener("click", () => {
      const next = getCurrentSettings();
      onSaveSettings?.(next);
      saveSettingsBtn.textContent = "保存しました";
      window.setTimeout(() => {
        if (saveSettingsBtn) saveSettingsBtn.textContent = "設定を保存";
      }, 1200);
    });
    displayModeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        updateSettings({ displayMode: normalizeDisplayMode(radio.value) });
      });
    });
  }

  function getCurrentSettings(patch = {}) {
    return {
      fontSize: Number(fontSizeRange.value) || 100,
      lineHeight: Number(lineHeightRange.value) || 1.8,
      letterSpacing: Number(letterSpacingRange.value) || 0,
      wrapWidthPercent: normalizeWrapWidthPercent(wrapWidthRange?.value),
      theme: themeSelect.value || "light",
      displayMode: normalizeDisplayMode(displayModeRadios.find((radio) => radio.checked)?.value || displayMode),
      wheelPaging: Boolean(wheelPagingCheck?.checked),
      writingModePreference: normalizeWritingModePreference(writingModeSelect?.value || writingModePreference),
      ...patch
    };
  }

  function updateSettings(patch) {
    const next = getCurrentSettings(patch);
    applySettings(next);
    onUpdateSettings(next);
  }

  function bindProgressTracking() {
    const handler = throttle(() => {
      const chapterId = getCurrentChapterId();

      if (displayMode === "scrolly") {
        const offset = scrollContainer.scrollTop;
        const size = scrollContainer.clientHeight || 1;
        const pageIndex = Math.round(offset / size);
        onUpdateProgress({ chapterId, scrollTop: offset, pageIndex });
        return;
      }

      const physical = scrollContainer.scrollLeft;
      const logical = toLogicalLeft(scrollContainer, physical, pageDirection);
      const size = scrollContainer.clientWidth || 1;
      const pageIndex = Math.round(logical / size);
      onUpdateProgress({ chapterId, scrollLeft: logical, pageIndex });
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (displayMode === "scrolly") {
          const topRaw = Number(nextProgress?.scrollTop);
          const top = Number.isFinite(topRaw)
            ? topRaw
            : (Number(nextProgress?.pageIndex) || 0) * (scrollContainer.clientHeight || 1);
          scrollContainer.scrollTop = top;
          if (typeof refresh === "function") refresh();
          return;
        }

        const logical =
          nextProgress?.pageIndex != null
            ? Number(nextProgress.pageIndex) * (scrollContainer.clientWidth || 1)
            : Number(nextProgress?.scrollLeft);
        const logicalSafe = Number.isFinite(logical) ? logical : 0;
        scrollContainer.scrollLeft = toPhysicalLeft(scrollContainer, logicalSafe, pageDirection);
        if (typeof refresh === "function") refresh();
      });
    });
  }

  function setupHScroll(content) {
    const slider = hScroll;
    if (!slider || !content) return;

    const toSliderValue = (logical, max) => {
      if (pageDirection === "rtl") return max - logical;
      return logical;
    };

    const fromSliderValue = (raw, max) => {
      if (pageDirection === "rtl") return max - raw;
      return raw;
    };

    const refresh = () => {
      const max = getMaxLeft(content);
      const logical = toLogicalLeft(content, content.scrollLeft, pageDirection);
      slider.max = String(max);
      slider.value = String(toSliderValue(logical, max));
      slider.disabled = max === 0;
    };

    slider.addEventListener("input", () => {
      const max = Number(slider.max) || 0;
      const raw = Number(slider.value) || 0;
      const logical = fromSliderValue(raw, max);
      content.scrollLeft = toPhysicalLeft(content, logical, pageDirection);
    });

    content.addEventListener("scroll", () => {
      const max = Number(slider.max) || getMaxLeft(content);
      const logical = toLogicalLeft(content, content.scrollLeft, pageDirection);
      slider.value = String(toSliderValue(logical, max));
    });

    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);

    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });

    return refresh;
  }

  function bindPageTap(tapEl, scrollEl) {
    if (!tapEl || !scrollEl) return;
    const threshold = 10;
    let down = null;

    const shouldHandlePagingTap = () => {
      if (displayMode === "paged") return true;
      return tapInScroll === true;
    };

    const onTap = (event) => {
      const target = event.target;
      if (target && typeof target.closest === "function") {
        if (target.closest("button, input, select, textarea, a")) return;
      }
      const rect = tapEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const w = rect.width || 1;
      const page = scrollEl.clientWidth || 1;

      if (x >= w * 0.33 && x <= w * 0.66) {
        toggleChrome();
        return;
      }

      if (!shouldHandlePagingTap()) return;

      if (x > w * 0.66) {
        pageBy(scrollEl, page, displayMode);
        return;
      }

      if (x < w * 0.33) {
        pageBy(scrollEl, -page, displayMode);
      }
    };

    if (window.PointerEvent) {
      tapEl.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        down = { x: event.clientX, y: event.clientY };
      });
      tapEl.addEventListener("pointerup", (event) => {
        if (skipNextTap) {
          skipNextTap = false;
          down = null;
          return;
        }
        if (!down) return;
        const dx = Math.abs(event.clientX - down.x);
        const dy = Math.abs(event.clientY - down.y);
        down = null;
        if (dx > threshold || dy > threshold) return;
        onTap(event);
      });
      return;
    }

    tapEl.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        down = { x: touch.clientX, y: touch.clientY };
      },
      { passive: true }
    );

    tapEl.addEventListener(
      "touchend",
      (event) => {
        if (skipNextTap) {
          skipNextTap = false;
          down = null;
          return;
        }
        const touch = event.changedTouches[0];
        if (!touch || !down) return;
        const dx = Math.abs(touch.clientX - down.x);
        const dy = Math.abs(touch.clientY - down.y);
        down = null;
        if (dx > threshold || dy > threshold) return;
        onTap(touch);
      },
      { passive: true }
    );
  }

  function bindTopEdgeRevealTap(tapEl) {
    if (!tapEl || !topbar) return;

    const shouldIgnore = (target) => {
      if (!target || typeof target.closest !== "function") return false;
      return Boolean(target.closest("button, input, select, textarea, a"));
    };

    const toggleTopbarAtTopEdge = (y) => {
      if (y >= 72) return;
      if (topbar.classList.contains("hidden")) {
        topbar.classList.remove("hidden");
        document.body.classList.remove("chrome-hidden");
        skipNextTap = true;
        reflowTopbar();
        return;
      }
      topbar.classList.add("hidden");
      document.body.classList.add("chrome-hidden");
      reflowTopbar();
    };

    if (window.PointerEvent) {
      tapEl.addEventListener("pointerup", (event) => {
        if (shouldIgnore(event.target)) return;
        toggleTopbarAtTopEdge(event.clientY);
      });
      return;
    }

    tapEl.addEventListener(
      "touchend",
      (event) => {
        if (shouldIgnore(event.target)) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        toggleTopbarAtTopEdge(touch.clientY);
      },
      { passive: true }
    );
  }

  function toggleChrome() {
    const tocOpen = tocPanel?.classList.contains("open");
    const settingsOpen = settingsPanel?.classList.contains("open");
    if (tocOpen || settingsOpen) {
      closeAllPanels();
      return;
    }
    topbar.classList.toggle("hidden");
    document.body.classList.toggle("chrome-hidden", topbar.classList.contains("hidden"));
    reflowTopbar();
  }

  function applyDisplayMode(mode, options = {}) {
    if (!tapZone) return;
    const normalized = normalizeDisplayMode(mode);
    displayMode = normalized;
    tapZone.classList.remove("disabled");
    document.body.classList.remove("mode-paged", "mode-scrollx", "mode-scrolly");
    if (normalized === "paged") {
      document.body.classList.add("mode-paged");
    } else if (normalized === "scrollx") {
      document.body.classList.add("mode-scrollx");
    } else {
      document.body.classList.add("mode-scrolly");
    }
  }

  function bindWheelScroll(viewport, scrollEl) {
    if (!viewport || !scrollEl) return;
    const isWindows = /windows/i.test(navigator.userAgent || "");
    let wheelLock = false;

    viewport.addEventListener(
      "wheel",
      (event) => {
        if (displayMode === "scrolly") return;
        if (isWindows && wheelPaging) {
          const axisDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
          if (Math.abs(axisDelta) < 1) return;
          if (wheelLock) {
            event.preventDefault();
            return;
          }
          wheelLock = true;
          window.setTimeout(() => {
            wheelLock = false;
          }, 160);

          const step = scrollEl.clientWidth || 1;
          const signed = axisDelta > 0 ? step : -step;
          const physicalDelta = pageDirection === "rtl" ? -signed : signed;
          pageBy(scrollEl, physicalDelta, displayMode);
          event.preventDefault();
          return;
        }
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        scrollEl.scrollLeft += pageDirection === "rtl" ? -delta : delta;
        event.preventDefault();
      },
      { passive: false }
    );
  }

  function applyWritingModePreference(mode) {
    if (!bookContent) return;
    bookContent.classList.remove("force-vertical", "force-horizontal");
    if (mode === "vertical") {
      bookContent.classList.add("force-vertical");
    } else if (mode === "horizontal") {
      bookContent.classList.add("force-horizontal");
    }
  }

  function detectPageDirection() {
    if (writingModePreference === "vertical") return "rtl";
    if (writingModePreference === "horizontal") return "ltr";
    const probe = bookContent.querySelector("section.chapter, p, div, span") || bookContent;
    const writingMode = String(window.getComputedStyle(probe).writingMode || "").toLowerCase();
    return writingMode.includes("vertical") ? "rtl" : "ltr";
  }

  function updatePageDirection(options = {}) {
    const prevDirection = pageDirection;
    pageDirection = detectPageDirection();
    if (options.preservePosition && prevDirection !== pageDirection) {
      const logical = toLogicalLeft(scrollContainer, scrollContainer.scrollLeft, prevDirection);
      scrollContainer.scrollLeft = toPhysicalLeft(scrollContainer, logical, pageDirection);
    }
    refreshHScroll?.();
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

function pageBy(content, delta, mode = "paged") {
  const behavior = mode === "paged" ? "auto" : "smooth";
  if (mode === "scrolly") {
    content.scrollTo({ top: content.scrollTop + delta, behavior });
    return;
  }
  content.scrollTo({ left: content.scrollLeft + delta, behavior });
}

function getMaxLeft(el) {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

function toLogicalLeft(el, physicalLeft, direction = "rtl") {
  const max = getMaxLeft(el);
  const physical = Number(physicalLeft) || 0;
  const logical = direction === "rtl" ? max - physical : physical;
  return Math.max(0, Math.min(max, logical));
}

function toPhysicalLeft(el, logicalLeft, direction = "rtl") {
  const max = getMaxLeft(el);
  const logical = Number(logicalLeft) || 0;
  const physical = direction === "rtl" ? max - logical : logical;
  return Math.max(0, Math.min(max, physical));
}

function normalizeWritingModePreference(mode) {
  const raw = String(mode || "auto").toLowerCase();
  if (raw === "vertical") return "vertical";
  if (raw === "horizontal") return "horizontal";
  return "auto";
}

function normalizeWrapWidthPercent(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(75, Math.min(100, Math.round(raw)));
}

function normalizeDisplayMode(mode) {
  if (!mode) return "paged";
  const raw = String(mode).toLowerCase();
  if (raw === "scrollx" || raw === "scroll-x") return "scrollx";
  if (raw === "scrolly" || raw === "scroll-y" || raw === "scroll" || raw === "vertical") return "scrolly";
  return "paged";
}
