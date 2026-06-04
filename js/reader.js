import { qs, escapeHtml } from "./utils.js";

export function initReader({
  book,
  settings,
  progress,
  siteConfig = null,
  openSettingsOnStart = false,
  onBack,
  onExport,
  onUpdateSettings,
  onSaveSettings,
  onUpdateProgress
}) {
  const backBtn = qs("#backBtn");
  const printBtn = qs("#printBtn");
  const exportBtn = qs("#exportBtn");
  const exportControls = Array.from(document.querySelectorAll("[data-export-control]"));
  const settingsBtn = qs("#settingsBtn");
  const closeSettingsBtn = qs("#closeSettingsBtn");
  const saveSettingsBtn = qs("#saveSettingsBtn");
  const settingsPanel = qs("#settingsPanel");
  const settingsBody = settingsPanel?.querySelector(".settings-body") || null;
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
  const hScrollPageInfo = qs("#hScrollPageInfo");
  const fontSizeRange = qs("#fontSizeRange");
  const fontFamilySelect = qs("#fontFamilySelect");
  const lineHeightRange = qs("#lineHeightRange");
  const letterSpacingRange = qs("#letterSpacingRange");
  const wrapWidthRange = qs("#wrapWidthRange");
  const fontSizeValue = qs("#fontSizeValue");
  const lineHeightValue = qs("#lineHeightValue");
  const letterSpacingValue = qs("#letterSpacingValue");
  const wrapWidthValue = qs("#wrapWidthValue");
  const genkoMatchBadge = qs("#genkoMatchBadge");
  const themeSelect = qs("#themeSelect");
  const writingModeSelect = qs("#writingModeSelect");
  const wheelPagingCheck = qs("#wheelPagingCheck");
  const structureAutoDetectCheck = qs("#structureAutoDetectCheck");
  const pageTurnEffectSelect = qs("#pageTurnEffectSelect");
  const pageColumnsCheck = qs("#pageColumnsCheck");
  const applyGenkoPresetBtn = qs("#applyGenkoPresetBtn");
  const reloadBtn = qs("#reloadBtn");
  const hardReloadBtn = qs("#hardReloadBtn");
  const displayModeRadios = Array.from(document.querySelectorAll('input[name="displayMode"]'));
  const scrollContainer = readerViewport || bookContent;
  const bookFormat = getBookFormat(book);
  const supportsStructureAutoDetect = bookFormat === "txt";
  const hasInitialProgress = isReaderProgress(progress);
  let displayMode = normalizeDisplayMode(settings?.displayMode);
  let tapInScroll = Boolean(settings?.tapInScroll);
  let wheelPaging = Boolean(settings?.wheelPaging);
  let structureAutoDetect = settings?.structureAutoDetect !== false;
  let pageTurnEffect = normalizePageTurnEffect(settings?.pageTurnEffect);
  let pageColumns = settings?.pageColumns === true;
  let wrapWidthPercent = normalizeWrapWidthPercent(settings?.wrapWidthPercent);
  let writingModePreference = normalizeWritingModePreference(settings?.writingModePreference);
  let pageDirection = writingModePreference === "vertical" ? "rtl" : "ltr";
  let isInitialLayout = true;
  let skipNextTap = false;
  const refreshHScroll = setupHScroll(scrollContainer);
  const getViewportInnerSize = (axis = "x") => {
    const fallback = axis === "x" ? window.innerWidth : window.innerHeight;
    const el = readerViewport || scrollContainer;
    if (!el) return Math.max(1, fallback || 1);

    const styles = window.getComputedStyle(el);
    const size = axis === "x" ? el.clientWidth : el.clientHeight;
    const paddingStart = parseFloat(axis === "x" ? styles.paddingLeft : styles.paddingTop) || 0;
    const paddingEnd = parseFloat(axis === "x" ? styles.paddingRight : styles.paddingBottom) || 0;
    const inner = Math.round(size - paddingStart - paddingEnd);
    return Math.max(1, inner || size || fallback || 1);
  };
  const getHorizontalPageSize = () => getViewportInnerSize("x");
  const getVerticalPageSize = () => getViewportInnerSize("y");
  const scrollToLogicalLeft = (logicalLeft, behavior = "auto") => {
    const physicalLeft = toPhysicalLeft(scrollContainer, logicalLeft, pageDirection);
    scrollContainer.scrollTo({ left: physicalLeft, behavior });
  };
  const stepHorizontalPage = (stepCount, behavior = "auto") => {
    const pageSize = getHorizontalPageSize();
    const maxLeft = getMaxLeft(scrollContainer);
    const logical = toLogicalLeft(scrollContainer, scrollContainer.scrollLeft, pageDirection);
    const totalPages = Math.max(1, Math.floor(maxLeft / pageSize) + 1);
    const currentPage = clamp(Math.round(logical / pageSize), 0, totalPages - 1);
    const targetPage = clamp(currentPage + stepCount, 0, totalPages - 1);
    if (targetPage === currentPage && !(stepCount > 0 && logical < maxLeft) && !(stepCount < 0 && logical > 0)) return;
    let targetLogical = clamp(targetPage * pageSize, 0, maxLeft);

    // Ensure the last partial page is still reachable by tap paging.
    if (stepCount > 0 && targetLogical <= logical + 1 && logical < maxLeft) {
      targetLogical = maxLeft;
    }
    if (stepCount < 0 && targetLogical >= logical - 1 && logical > 0) {
      targetLogical = 0;
    }

    scrollToLogicalLeft(targetLogical, behavior);
    playPageTurnEffect(stepCount > 0 ? "forward" : "back");
  };
  const applyPageWidth = () => {
    const width = getHorizontalPageSize();
    const height = getVerticalPageSize();
    const wrapped = Math.round(width * (wrapWidthPercent / 100));
    const metrics = getReaderTextMetrics();

    if (displayMode === "paged") {
      const mode = normalizeWritingModePreference(writingModePreference);
      const charAdvance = Math.max(6, metrics.fontPx * 0.95 + metrics.letterSpacingPx);
      const lineAdvance = Math.max(10, metrics.lineHeightPx);
      const inlineBase = mode === "horizontal" ? wrapped : height;
      const blockBase = mode === "horizontal" ? height : (pageColumns ? wrapped : width);
      const inlineSize = snapDownToStep(inlineBase, charAdvance, Math.max(120, charAdvance * 8));
      const blockSize = snapDownToStep(blockBase, lineAdvance, Math.max(120, lineAdvance * 4));
      const columnGap = pageColumns ? Math.max(lineAdvance * 1.6, metrics.fontPx * 2.4) : 0;

      document.documentElement.style.setProperty("--page-width", `${Math.max(1, mode === "horizontal" ? inlineSize : blockSize)}px`);
      document.documentElement.style.setProperty("--paged-inline-size", `${Math.max(1, inlineSize)}px`);
      document.documentElement.style.setProperty("--paged-block-size", `${Math.max(1, blockSize)}px`);
      document.documentElement.style.setProperty("--page-column-gap", `${Math.round(columnGap)}px`);
      return;
    }

    document.documentElement.style.setProperty("--page-width", `${Math.max(240, wrapped)}px`);
    document.documentElement.style.removeProperty("--paged-inline-size");
    document.documentElement.style.removeProperty("--paged-block-size");
    document.documentElement.style.removeProperty("--page-column-gap");
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
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
    const narrowViewport = window.innerWidth < 980;

    if (!isWindows) {
      // Touch / small-screen devices should prefer wrapped controls over horizontal clipping.
      const mobileWrap = isCoarsePointer || narrowViewport;
      document.body.classList.toggle("topbar-mobile-wrap", mobileWrap);
      document.body.classList.remove("topbar-auto-wrap");
      return;
    }

    document.body.classList.remove("topbar-mobile-wrap");

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
    const height = topbar?.offsetHeight || 64;
    document.documentElement.style.setProperty("--reader-topbar-height", `${height}px`);
  };

  const captureReaderPosition = () => {
    if (!scrollContainer) return null;
    return {
      logicalLeft: toLogicalLeft(scrollContainer, scrollContainer.scrollLeft, pageDirection),
      scrollTop: scrollContainer.scrollTop
    };
  };

  const restoreReaderPosition = (position) => {
    if (!position || !scrollContainer) return;
    if (displayMode === "scrolly") {
      scrollContainer.scrollTop = Math.max(0, Number(position.scrollTop) || 0);
      return;
    }
    scrollToLogicalLeft(Math.max(0, Number(position.logicalLeft) || 0));
  };

  const scrollToBookStart = () => {
    if (!scrollContainer) return;
    if (displayMode === "scrolly") {
      scrollContainer.scrollTop = 0;
      return;
    }
    scrollToLogicalLeft(0);
  };

  const playPageTurnEffect = (direction = "forward") => {
    if (pageTurnEffect === "none" || displayMode !== "paged") return;
    document.body.classList.remove(
      "page-turn-flash",
      "page-turn-slide",
      "page-turn-shadow",
      "page-turn-forward",
      "page-turn-back"
    );
    void document.body.offsetWidth;
    document.body.classList.add(`page-turn-${pageTurnEffect}`, direction === "back" ? "page-turn-back" : "page-turn-forward");
    window.setTimeout(() => {
      document.body.classList.remove(
        "page-turn-flash",
        "page-turn-slide",
        "page-turn-shadow",
        "page-turn-forward",
        "page-turn-back"
      );
    }, pageTurnEffect === "slide" ? 170 : 140);
  };

  const reflowReaderLayout = (options = {}) => {
    const position = options.preservePosition ? captureReaderPosition() : null;
    applyViewportMetrics();
    applyTopbarLayoutMode();
    applyTopbarOffset();
    applyPageWidth();
    updatePageDirection({ preservePosition: true });

    const settle = () => {
      applyViewportMetrics();
      applyTopbarOffset();
      applyPageWidth();
      updatePageDirection({ preservePosition: true });
      if (position) restoreReaderPosition(position);
      else scrollToBookStart();
      if (typeof refreshHScroll === "function") refreshHScroll();
    };

    requestAnimationFrame(() => {
      settle();
      requestAnimationFrame(settle);
    });
  };

  const reflowTopbar = (options = {}) => {
    reflowReaderLayout(options);
  };

  const allowExport = siteConfig?.allowExport !== false;
  exportControls.forEach((el) => {
    el.hidden = !allowExport;
  });

  backBtn.addEventListener("click", onBack);
  printBtn.addEventListener("click", () => window.print());
  exportBtn?.addEventListener("click", () => {
    if (!allowExport) return;
    onExport?.();
  });
  reloadBtn?.addEventListener("click", () => location.reload());
  hardReloadBtn?.addEventListener("click", async () => {
    const ok = window.confirm("キャッシュを破棄して再読み込みします。\n作品更新が反映されない時だけ実行してください。");
    if (!ok) return;
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
      localStorage.removeItem("tsukiyomi:lastOpened");
      localStorage.removeItem("tsukiyomi:lastBookCache");
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
  bindSettingsGroupToggles();
  bindPanelWheelScroll(settingsPanel, settingsBody);
  bindPanelWheelScroll(tocPanel, tocPanel);
  applyProgress(progress, refreshHScroll);
  bindProgressTracking();
  bindTopEdgeRevealTap(tapZone);
  bindPageTap(tapZone, scrollContainer);
  bindWheelScroll(readerViewport, scrollContainer, tapZone);
  applyDisplayMode(displayMode, { tapInScroll, preservePosition: hasInitialProgress });
  reflowReaderLayout({ preservePosition: hasInitialProgress });
  const handleViewportResize = () => reflowReaderLayout({ preservePosition: true });
  window.addEventListener("resize", handleViewportResize);
  window.addEventListener("orientationchange", handleViewportResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", handleViewportResize);
  window.addEventListener("resize", updateSettingValueLabels);
  window.addEventListener("orientationchange", updateSettingValueLabels);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", updateSettingValueLabels);
  if (openSettingsOnStart) {
    requestAnimationFrame(() => toggleSettings(true));
  }
  requestAnimationFrame(() => {
    isInitialLayout = false;
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
      document.body.classList.add("settings-open");
      openOverlay();
    } else {
      settingsPanel.classList.remove("open");
      settingsPanel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("settings-open");
      if (!tocPanel?.classList.contains("open")) closeOverlay();
    }
  }

  function renderBook(currentBook) {
    if (!currentBook) return;

    bookTitle.innerHTML = escapeHtml(currentBook.title || "Untitled");
    const pdfUrl = getPdfUrl(currentBook);
    const isPdf = Boolean(pdfUrl);
    document.body.classList.toggle("pdf-reader-mode", isPdf);
    bookContent.classList.toggle("pdf-content", isPdf);
    bookContent.classList.remove("force-vertical", "force-horizontal");
    bookContent.innerHTML = "";

    if (isPdf) {
      renderPdfBook(currentBook, pdfUrl);
      return;
    }

    bookContent.innerHTML = currentBook.html || "";

    renderToc(currentBook);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyWritingModePreference(writingModePreference);
        updatePageDirection();
        scrollToBookStart();
        refreshHScroll?.();
      });
    });

    // 現状は全文一括DOM生成。大容量書籍向けの分割描画は別対応とする。
  }

  function renderToc(currentBook) {
    if (!tocList) return;
    tocList.innerHTML = "";
    const sourceToc = Array.isArray(currentBook?.toc) ? currentBook.toc : [];
    const autoDetected = currentBook?.meta?.textStructureAutoDetected === true;
    const tocItems = autoDetected && !structureAutoDetect
      ? [{ chapterId: sourceToc[0]?.chapterId || "chapter-001", title: "本文" }]
      : sourceToc;

    tocPanel?.classList.toggle("toc-structure-disabled", autoDetected && !structureAutoDetect);
    if (!tocItems.length) {
      const li = document.createElement("li");
      li.className = "toc-empty";
      li.textContent = "章が見つかりません";
      tocList.appendChild(li);
      return;
    }

    tocItems.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = escapeHtml(item.title || "");
      btn.addEventListener("click", () => {
        const target = document.getElementById(item.chapterId);
        if (target) {
          jumpToReaderTarget(target);
        }
        closeToc();
      });
      li.appendChild(btn);
      tocList.appendChild(li);
    });
  }

  function renderPdfBook(currentBook, pdfUrl) {
    const shell = document.createElement("section");
    shell.id = "pdf-viewer-root";
    shell.className = "pdf-viewer-shell";

    const frame = document.createElement("iframe");
    frame.className = "pdf-viewer-frame";
    frame.title = `${currentBook.title || "PDF作品"} PDF`;
    frame.src = withPdfViewerParams(pdfUrl);
    frame.loading = "eager";

    const fallback = document.createElement("p");
    fallback.className = "pdf-viewer-fallback";
    fallback.textContent = "PDFを表示できません。ブラウザのPDF表示対応を確認してください。";

    shell.appendChild(frame);
    shell.appendChild(fallback);
    bookContent.appendChild(shell);

    tocList.innerHTML = "";
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "PDF";
    btn.addEventListener("click", () => {
      shell.scrollIntoView({ behavior: "smooth", block: "start" });
      closeToc();
    });
    li.appendChild(btn);
    tocList.appendChild(li);

    requestAnimationFrame(() => {
      updatePageDirection();
      refreshHScroll?.();
    });
  }

  function jumpToReaderTarget(target) {
    if (!target || !scrollContainer) return;
    if (displayMode === "scrolly") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    target.scrollIntoView({ behavior: "auto", block: "start", inline: "start" });
    requestAnimationFrame(() => {
      const pageSize = getHorizontalPageSize();
      const logical = toLogicalLeft(scrollContainer, scrollContainer.scrollLeft, pageDirection);
      const snapped = Math.max(0, Math.round(logical / pageSize) * pageSize);
      scrollToLogicalLeft(snapped, "auto");
      refreshHScroll?.();
    });
  }

  function applySettings(nextSettings) {
    if (!nextSettings) return;

    document.documentElement.style.setProperty("--font-size", Number(nextSettings.fontSize) || 100);
    document.documentElement.style.setProperty(
      "--reader-font-family",
      resolveReaderFontFamily(normalizeFontFamilyPreference(nextSettings.fontFamilyPreference))
    );
    document.documentElement.style.setProperty("--line-height", Number(nextSettings.lineHeight) || 1.8);
    document.documentElement.style.setProperty("--letter-spacing", `${Number(nextSettings.letterSpacing) || 0}px`);
    applyTheme(nextSettings.theme || "light");
    displayMode = normalizeDisplayMode(nextSettings.displayMode);
    tapInScroll = Boolean(nextSettings.tapInScroll);
    wheelPaging = Boolean(nextSettings.wheelPaging);
    structureAutoDetect = nextSettings.structureAutoDetect !== false;
    pageTurnEffect = normalizePageTurnEffect(nextSettings.pageTurnEffect);
    pageColumns = nextSettings.pageColumns === true;
    document.body.classList.toggle("page-columns-enabled", pageColumns);
    wrapWidthPercent = normalizeWrapWidthPercent(nextSettings.wrapWidthPercent);
    writingModePreference = normalizeWritingModePreference(nextSettings.writingModePreference);
    applyWritingModePreference(writingModePreference);
    updatePageDirection({ preservePosition: true });
    applyPageWidth();
    applyDisplayMode(displayMode, { tapInScroll, preservePosition: !isInitialLayout || hasInitialProgress });

    fontSizeRange.value = String(nextSettings.fontSize ?? 100);
    if (fontFamilySelect) {
      fontFamilySelect.value = normalizeFontFamilyPreference(nextSettings.fontFamilyPreference);
    }
    lineHeightRange.value = String(nextSettings.lineHeight ?? 1.8);
    letterSpacingRange.value = String(nextSettings.letterSpacing ?? 0);
    if (wrapWidthRange) wrapWidthRange.value = String(wrapWidthPercent);
    themeSelect.value = nextSettings.theme || "light";
    if (writingModeSelect) writingModeSelect.value = writingModePreference;
    if (wheelPagingCheck) wheelPagingCheck.checked = wheelPaging;
    if (structureAutoDetectCheck) structureAutoDetectCheck.checked = structureAutoDetect;
    syncStructureAutoDetectControl();
    if (pageTurnEffectSelect) pageTurnEffectSelect.value = pageTurnEffect;
    if (pageColumnsCheck) pageColumnsCheck.checked = pageColumns;
    displayModeRadios.forEach((radio) => {
      radio.checked = radio.value === displayMode;
    });
    renderToc(book);
    updateSettingValueLabels();
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }

  function bindSettingsEvents() {
    fontSizeRange.addEventListener("input", () => updateSettings({ fontSize: Number(fontSizeRange.value) }));
    fontFamilySelect?.addEventListener("change", () => {
      updateSettings({ fontFamilyPreference: normalizeFontFamilyPreference(fontFamilySelect.value) });
    });
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
    structureAutoDetectCheck?.addEventListener("change", () => {
      updateSettings({ structureAutoDetect: Boolean(structureAutoDetectCheck.checked) });
    });
    pageTurnEffectSelect?.addEventListener("change", () => {
      updateSettings({ pageTurnEffect: normalizePageTurnEffect(pageTurnEffectSelect.value) });
    });
    pageColumnsCheck?.addEventListener("change", () => {
      updateSettings({ pageColumns: Boolean(pageColumnsCheck.checked) });
    });
    applyGenkoPresetBtn?.addEventListener("click", () => {
      updateSettings(buildGenkoPresetFromCurrent());
      flashGenkoMatchBadge();
      applyGenkoPresetBtn.textContent = "適用しました";
      window.setTimeout(() => {
        if (applyGenkoPresetBtn) applyGenkoPresetBtn.textContent = "400字目安を適用";
      }, 1200);
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

  function bindSettingsGroupToggles() {
    const groups = Array.from(settingsPanel?.querySelectorAll("[data-settings-group]") || []);
    groups.forEach((group) => {
      const toggle = group.querySelector("[data-settings-group-toggle]");
      const body = group.querySelector(".settings-group-body");
      if (!toggle || !body || toggle.dataset.bound === "true") return;

      const syncGroupState = () => {
        const isOpen = group.classList.contains("open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        body.hidden = !isOpen;
      };

      syncGroupState();
      toggle.addEventListener("click", () => {
        group.classList.toggle("open");
        syncGroupState();
      });
      toggle.dataset.bound = "true";
    });
  }

  function bindPanelWheelScroll(panelEl, scrollEl) {
    if (!panelEl || !scrollEl) return;
    panelEl.addEventListener(
      "wheel",
      (event) => {
        if (!panelEl.classList.contains("open")) return;
        const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
        if (maxTop <= 0) return;

        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (Math.abs(delta) < 1) return;

        const nextTop = clamp(scrollEl.scrollTop + delta, 0, maxTop);
        if (nextTop === scrollEl.scrollTop) return;

        scrollEl.scrollTop = nextTop;
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false }
    );
  }

  function updateSettingValueLabels() {
    const metrics = getReaderTextMetrics();
    const baseFontPx = metrics.baseFontPx;
    const fontPercent = Number(fontSizeRange?.value) || 100;
    const fontPx = metrics.fontPx;
    const fontPt = fontPx * 0.75;
    const lineHeight = Number(lineHeightRange?.value) || 1.8;
    const lineHeightPx = metrics.lineHeightPx;
    const letterSpacingPx = metrics.letterSpacingPx;
    const wrapPercent = normalizeWrapWidthPercent(wrapWidthRange?.value);
    const viewportWidth = getHorizontalPageSize();
    const viewportHeight = getVerticalPageSize();
    const wrapPx = Math.round(viewportWidth * (wrapPercent / 100));
    const mode = normalizeWritingModePreference(writingModeSelect?.value || writingModePreference);
    const inlineAdvance = Math.max(6, fontPx * 0.95 + letterSpacingPx);
    const approxCharsPerLine =
      mode === "horizontal"
        ? Math.max(1, Math.round(wrapPx / inlineAdvance))
        : Math.max(1, Math.round(viewportHeight / inlineAdvance));
    const approxLinesPerPage =
      mode === "horizontal"
        ? Math.max(1, Math.round(viewportHeight / lineHeightPx))
        : Math.max(1, Math.round(wrapPx / lineHeightPx));

    if (fontSizeValue) {
      fontSizeValue.textContent = `${fontPercent}% / ${fontPx.toFixed(1)}px / ${fontPt.toFixed(1)}pt`;
    }
    if (lineHeightValue) {
      lineHeightValue.textContent = `${lineHeight.toFixed(1)} / 約${lineHeightPx.toFixed(1)}px`;
    }
    if (letterSpacingValue) {
      const sign = letterSpacingPx > 0 ? "+" : "";
      letterSpacingValue.textContent = `${sign}${letterSpacingPx.toFixed(1)}px`;
    }
    if (wrapWidthValue) {
      wrapWidthValue.textContent =
        mode === "horizontal"
          ? `${wrapPercent}% / 約${wrapPx}px / 約${approxCharsPerLine}字×${approxLinesPerPage}行`
          : `${wrapPercent}% / 約${wrapPx}px / 約${approxCharsPerLine}字×${approxLinesPerPage}列`;
    }
    updateGenkoMatchBadge(approxCharsPerLine, approxLinesPerPage);
  }

  function syncStructureAutoDetectControl() {
    if (!structureAutoDetectCheck) return;
    structureAutoDetectCheck.disabled = !supportsStructureAutoDetect;
    const label = structureAutoDetectCheck.closest("label");
    if (!label) return;
    label.classList.toggle("disabled-field", !supportsStructureAutoDetect);
    label.title = supportsStructureAutoDetect
      ? "TXT本文の見出しらしい行から章一覧を作ります。"
      : "EPUBはファイル内の目次を使います。目次がないEPUBは本文1章として扱います。";
  }

  function updateGenkoMatchBadge(charsPerLine, linesPerPage) {
    if (!genkoMatchBadge) return;

    const charsDelta = Math.abs(charsPerLine - 20);
    const linesDelta = Math.abs(linesPerPage - 20);
    const totalCells = charsPerLine * linesPerPage;

    let text = "";
    let tone = "off";
    if (charsDelta <= 1 && linesDelta <= 1) {
      text = "400字目安";
      tone = "exact";
    } else if (charsDelta <= 3 && linesDelta <= 3) {
      text = "ほぼ400字";
      tone = "near";
    } else if (totalCells > 400) {
      text = "やや広め";
    } else {
      text = "やや狭め";
    }

    genkoMatchBadge.hidden = false;
    genkoMatchBadge.className = `field-badge ${tone}`;
    genkoMatchBadge.textContent = text;
  }

  function flashGenkoMatchBadge() {
    if (!genkoMatchBadge) return;
    genkoMatchBadge.classList.remove("flash");
    void genkoMatchBadge.offsetWidth;
    genkoMatchBadge.classList.add("flash");
    window.setTimeout(() => {
      genkoMatchBadge?.classList.remove("flash");
    }, 750);
  }

  function getCurrentSettings(patch = {}) {
    return {
      fontSize: Number(fontSizeRange.value) || 100,
      fontFamilyPreference: normalizeFontFamilyPreference(fontFamilySelect?.value),
      lineHeight: Number(lineHeightRange.value) || 1.8,
      letterSpacing: Number(letterSpacingRange.value) || 0,
      wrapWidthPercent: normalizeWrapWidthPercent(wrapWidthRange?.value),
      theme: themeSelect.value || "light",
      displayMode: normalizeDisplayMode(displayModeRadios.find((radio) => radio.checked)?.value || displayMode),
      wheelPaging: Boolean(wheelPagingCheck?.checked),
      structureAutoDetect: structureAutoDetectCheck ? Boolean(structureAutoDetectCheck.checked) : structureAutoDetect,
      pageTurnEffect: normalizePageTurnEffect(pageTurnEffectSelect?.value || pageTurnEffect),
      pageColumns: Boolean(pageColumnsCheck?.checked),
      writingModePreference: normalizeWritingModePreference(writingModeSelect?.value || writingModePreference),
      ...patch
    };
  }

  function updateSettings(patch) {
    const next = getCurrentSettings(patch);
    applySettings(next);
    onUpdateSettings(next);
  }

  function buildGenkoPresetFromCurrent() {
    const viewportWidthSafe = getHorizontalPageSize();
    const viewportHeight = getVerticalPageSize();
    const fontSize = Number(fontSizeRange.value) || 100;
    const lineHeightNow = Number(lineHeightRange.value) || 1.8;
    const letterSpacing = Number(letterSpacingRange.value) || 0;
    const mode = normalizeWritingModePreference(writingModeSelect?.value || writingModePreference);

    const fontPx = (fontSize / 100) * 16;
    const targetLineHeightRaw =
      mode === "horizontal"
        ? viewportHeight / (20 * Math.max(10, fontPx))
        : viewportWidthSafe / (20 * Math.max(10, fontPx));
    const targetLineHeight = clamp(targetLineHeightRaw, 1.4, 2.2);
    const naturalLineHeight = clamp(
      targetLineHeight,
      Math.max(1.4, lineHeightNow - 0.35),
      Math.min(2.4, lineHeightNow + 0.35)
    );

    const charAdvance =
      mode === "horizontal"
        ? Math.max(6, fontPx * 0.95 + letterSpacing)
        : Math.max(6, fontPx * naturalLineHeight);
    const targetWrapPx = charAdvance * 20;
    const wrapBase = viewportWidthSafe;
    const wrapWidthPercent = normalizeWrapWidthPercent((targetWrapPx / wrapBase) * 100);

    return {
      fontSize,
      lineHeight: Number(naturalLineHeight.toFixed(1)),
      letterSpacing,
      wrapWidthPercent
    };
  }

  function getReaderTextMetrics() {
    const baseFontPx = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const fontPercent = Number(fontSizeRange?.value) || Number(settings?.fontSize) || 100;
    const fontPx = (fontPercent / 100) * baseFontPx;
    const lineHeight = Number(lineHeightRange?.value) || Number(settings?.lineHeight) || 1.8;
    const letterSpacingPx = Number(letterSpacingRange?.value) || Number(settings?.letterSpacing) || 0;
    return {
      baseFontPx,
      fontPx,
      lineHeightPx: fontPx * lineHeight,
      letterSpacingPx
    };
  }

  function bindProgressTracking() {
    const handler = throttle(() => {
      const chapterId = getCurrentChapterId();

      if (displayMode === "scrolly") {
        const offset = scrollContainer.scrollTop;
        const size = getVerticalPageSize();
        const pageIndex = Math.round(offset / size);
        const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const progressPercent = maxTop > 0 ? Math.round((offset / maxTop) * 100) : 100;
        onUpdateProgress({ chapterId, scrollTop: offset, pageIndex, progressPercent });
        return;
      }

      const physical = scrollContainer.scrollLeft;
      const logical = toLogicalLeft(scrollContainer, physical, pageDirection);
      const size = getHorizontalPageSize();
      const pageIndex = Math.round(logical / size);
      const maxLeft = getMaxLeft(scrollContainer);
      const progressPercent = maxLeft > 0 ? Math.round((logical / maxLeft) * 100) : 100;
      onUpdateProgress({ chapterId, scrollLeft: logical, pageIndex, progressPercent });
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
            : (Number(nextProgress?.pageIndex) || 0) * getVerticalPageSize();
          scrollContainer.scrollTop = top;
          if (typeof refresh === "function") refresh();
          return;
        }

        const logical =
          nextProgress?.pageIndex != null
            ? Number(nextProgress.pageIndex) * getHorizontalPageSize()
            : Number(nextProgress?.scrollLeft);
        const logicalSafe = Number.isFinite(logical) ? logical : 0;
        const applyHorizontalProgress = () => {
          scrollToLogicalLeft(logicalSafe);
          if (typeof refresh === "function") refresh();
        };

        applyHorizontalProgress();
        requestAnimationFrame(applyHorizontalProgress);
      });
    });
  }

  function setupHScroll(content) {
    const slider = hScroll;
    const pageInfo = hScrollPageInfo;
    if (!slider || !content) return;

    const toSliderValue = (logical, max) => {
      if (pageDirection === "rtl") return max - logical;
      return logical;
    };

    const fromSliderValue = (raw, max) => {
      if (pageDirection === "rtl") return max - raw;
      return raw;
    };

    const updatePageInfo = (logical, max) => {
      if (!pageInfo) return;
      const pageSize = getHorizontalPageSize();
      const totalPages = Math.max(1, Math.floor(max / pageSize) + 1);
      const currentPage = Math.min(totalPages, Math.max(1, Math.round(logical / pageSize) + 1));
      pageInfo.textContent = `${currentPage} / ${totalPages}`;
    };

    const refresh = () => {
      const max = getMaxLeft(content);
      const logical = toLogicalLeft(content, content.scrollLeft, pageDirection);
      slider.max = String(max);
      slider.value = String(toSliderValue(logical, max));
      slider.disabled = max === 0;
      updatePageInfo(logical, max);
    };

    slider.addEventListener("input", () => {
      const max = Number(slider.max) || 0;
      const raw = Number(slider.value) || 0;
      const logical = fromSliderValue(raw, max);
      scrollToLogicalLeft(logical);
      updatePageInfo(logical, max);
    });

    content.addEventListener("scroll", () => {
      const max = Number(slider.max) || getMaxLeft(content);
      const logical = toLogicalLeft(content, content.scrollLeft, pageDirection);
      slider.value = String(toSliderValue(logical, max));
      updatePageInfo(logical, max);
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
    const swipeThreshold = 42;
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

      if (x >= w * 0.33 && x <= w * 0.66) {
        toggleChrome();
        return;
      }

      if (!shouldHandlePagingTap()) return;

      const advance = () => {
        if (displayMode === "scrolly") {
          pageBy(scrollEl, getVerticalPageSize(), displayMode);
        } else {
          stepHorizontalPage(1, displayMode === "paged" ? "auto" : "smooth");
        }
      };

      const goBack = () => {
        if (displayMode === "scrolly") {
          pageBy(scrollEl, -getVerticalPageSize(), displayMode);
        } else {
          stepHorizontalPage(-1, displayMode === "paged" ? "auto" : "smooth");
        }
      };

      const advanceOnRight = pageDirection !== "rtl";

      if (x > w * 0.66) {
        if (advanceOnRight) advance();
        else goBack();
        return;
      }

      if (x < w * 0.33) {
        if (advanceOnRight) goBack();
        else advance();
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
        const deltaX = event.clientX - down.x;
        down = null;
        if (dx >= swipeThreshold && dx > dy * 1.25) {
          handleSwipe(deltaX);
          return;
        }
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
        const deltaX = touch.clientX - down.x;
        down = null;
        if (dx >= swipeThreshold && dx > dy * 1.25) {
          handleSwipe(deltaX);
          return;
        }
        if (dx > threshold || dy > threshold) return;
        onTap(touch);
      },
      { passive: true }
    );

    function handleSwipe(deltaX) {
      if (!shouldHandlePagingTap()) return;
      const swipeLeft = deltaX < 0;
      const advanceOnSwipeLeft = pageDirection !== "rtl";
      const step = swipeLeft === advanceOnSwipeLeft ? 1 : -1;
      if (displayMode === "scrolly") {
        pageBy(scrollEl, step * getVerticalPageSize(), displayMode);
      } else {
        stepHorizontalPage(step, displayMode === "paged" ? "auto" : "smooth");
      }
    }
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
        return;
      }
      topbar.classList.add("hidden");
      document.body.classList.add("chrome-hidden");
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
    requestAnimationFrame(() => reflowReaderLayout({ preservePosition: options.preservePosition !== false }));
  }

  function bindWheelScroll(viewport, scrollEl, captureEl) {
    if (!viewport || !scrollEl) return;
    const isWindows = /windows/i.test(navigator.userAgent || "");
    let wheelLock = false;
    const wheelTarget = captureEl || viewport;

    wheelTarget.addEventListener(
      "wheel",
      (event) => {
        const target = event.target;
        if (target && typeof target.closest === "function") {
          if (target.closest("#settingsPanel, #tocPanel")) return;
        }
        if (displayMode === "scrolly") return;
        const axisDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (Math.abs(axisDelta) < 1) return;
        if (displayMode === "paged") {
          if (wheelLock) {
            event.preventDefault();
            return;
          }
          wheelLock = true;
          window.setTimeout(() => {
            wheelLock = false;
          }, 160);
          stepHorizontalPage(axisDelta > 0 ? 1 : -1, "auto");
          event.preventDefault();
          return;
        }
        if (isWindows && wheelPaging) {
          if (wheelLock) {
            event.preventDefault();
            return;
          }
          wheelLock = true;
          window.setTimeout(() => {
            wheelLock = false;
          }, 160);

          stepHorizontalPage(axisDelta > 0 ? 1 : -1, displayMode === "paged" ? "auto" : "smooth");
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
    if (getPdfUrl(book)) return;
    if (mode === "vertical") {
      bookContent.classList.add("force-vertical");
    } else if (mode === "horizontal") {
      bookContent.classList.add("force-horizontal");
    }
  }

  function detectPageDirection() {
    if (getPdfUrl(book)) return "ltr";
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

function getPdfUrl(book) {
  const meta = book?.meta && typeof book.meta === "object" ? book.meta : {};
  const sourceData = meta.sourceData && typeof meta.sourceData === "object" ? meta.sourceData : {};
  const isPdf =
    String(meta.format || "").toLowerCase() === "pdf" ||
    String(sourceData.kind || "").toLowerCase() === "pdf";
  return isPdf ? String(meta.pdfUrl || "").trim() : "";
}

function getBookFormat(book) {
  const meta = book?.meta && typeof book.meta === "object" ? book.meta : {};
  const sourceData = meta.sourceData && typeof meta.sourceData === "object" ? meta.sourceData : {};
  const raw = String(meta.format || sourceData.kind || "").toLowerCase();
  if (raw === "epub" || raw === "txt" || raw === "html" || raw === "pdf") return raw;
  return "";
}

function isReaderProgress(progress) {
  if (!progress || typeof progress !== "object") return false;
  const scrollTop = Number(progress.scrollTop) || 0;
  const scrollLeft = Number(progress.scrollLeft) || 0;
  const pageIndex = Number(progress.pageIndex) || 0;
  const progressPercent = Number(progress.progressPercent);
  return scrollTop > 0 || scrollLeft > 0 || pageIndex > 0 || (Number.isFinite(progressPercent) && progressPercent > 0 && progressPercent < 100);
}

function withPdfViewerParams(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const [base, hash = ""] = raw.split("#", 2);
  const params = "toolbar=0&navpanes=0&scrollbar=1";
  return `${base}#${hash ? `${hash}&${params}` : params}`;
}

function normalizeFontFamilyPreference(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "mincho" || normalized === "gothic") return normalized;
  return "system";
}

function resolveReaderFontFamily(preference) {
  if (preference === "mincho") {
    return [
      '"BIZ UDPMincho"',
      '"Hiragino Mincho ProN"',
      '"Yu Mincho"',
      '"Noto Serif JP"',
      '"Noto Serif CJK JP"',
      "serif"
    ].join(", ");
  }

  if (preference === "gothic") {
    return [
      '"BIZ UDPGothic"',
      '"Hiragino Sans"',
      '"Yu Gothic"',
      '"Noto Sans JP"',
      '"Noto Sans CJK JP"',
      "sans-serif"
    ].join(", ");
  }

  return ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'].join(", ");
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

function normalizePageTurnEffect(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "flash" || raw === "slide" || raw === "shadow") return raw;
  return "none";
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
  const raw = String(mode || "vertical").toLowerCase();
  if (raw === "vertical") return "vertical";
  if (raw === "horizontal") return "horizontal";
  return "auto";
}

function normalizeWrapWidthPercent(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(60, Math.min(130, Math.round(raw)));
}

function normalizeDisplayMode(mode) {
  if (!mode) return "paged";
  const raw = String(mode).toLowerCase();
  if (raw === "scrollx" || raw === "scroll-x") return "scrollx";
  if (raw === "scrolly" || raw === "scroll-y" || raw === "scroll" || raw === "vertical") return "scrolly";
  return "paged";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snapDownToStep(value, step, min) {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeStep = Math.max(1, Number(step) || 1);
  const safeMin = Math.max(0, Number(min) || 0);
  const snapped = Math.floor(safeValue / safeStep) * safeStep;
  if (safeValue <= safeMin) return safeValue;
  return Math.max(safeMin, snapped || safeValue);
}
