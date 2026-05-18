(function () {
  var appModuleLoaded = false;
  var iosVersion = getIosVersion();
  var isIos = iosVersion !== null;
  var hasRequiredWebApi =
    typeof Promise !== "undefined" &&
    typeof fetch !== "undefined" &&
    typeof URL !== "undefined";
  var hasModernSyntax = supportsModernSyntax();
  var isLegacyIosTrial = isIos && isAtLeastIos(iosVersion, 12, 5) && iosVersion.major < 15;

  if (!hasRequiredWebApi) {
    showUnsupportedNotice();
    return;
  }

  if (isLegacyIosTrial) {
    showLegacyTrialNotice();
    return;
  }

  if (!hasModernSyntax) {
    showUnsupportedNotice();
    return;
  }

  loadAppModule();

  function supportsModernSyntax() {
    try {
      new Function("var x = { a: { b: 1 } }; return x?.a?.b ?? 0;");
      return true;
    } catch (err) {
      return false;
    }
  }

  function loadAppModule() {
    if (appModuleLoaded) return;
    appModuleLoaded = true;

    var script = document.createElement("script");
    script.type = "module";
    script.src = "./js/app.js";
    script.addEventListener("error", showLegacyFailedNotice);
    document.body.appendChild(script);
  }

  function showLegacyTrialNotice() {
    window.__TSUKUYOMI_LEGACY_TRIAL__ = true;
    renderNotice([
      "<h1>レガシー端末での試用です</h1>",
      "<p>この端末は iOS 12.5 以降のレガシー資産として、一時的に入口を開放しています。</p>",
      "<p>公式対応は iOS 15 / iPadOS 15 以降です。この端末では本文表示、ページ送り、キャッシュ更新が正常に動作しない可能性があります。</p>",
      '<div class="legacy-actions">',
      '<button class="button" id="legacyProceedBtn" type="button">理解して試す</button>',
      "</div>"
    ].join(""));

    var proceedBtn = document.getElementById("legacyProceedBtn");
    if (proceedBtn) {
      proceedBtn.addEventListener("click", function () {
        renderNotice("<p>Readerを起動しています...</p>");
        loadAppModule();
      });
    }
  }

  function showUnsupportedNotice() {
    window.__TSUKUYOMI_LEGACY_UNSUPPORTED__ = true;
    renderNotice([
      "<h1>このブラウザでは表示できません</h1>",
      "<p>古いiPhoneや古いSafariでは、現在のReaderで使っているJavaScriptを実行できず、黒画面になることがあります。</p>",
      "<p>公式対応は iOS 15 / iPadOS 15 以降です。iOS 12.5 以降はレガシー試用枠として扱います。</p>",
      "<p>iOS 12.4 以下、iPhone 6 Plus 以前の一部環境、古いSafariでは対象外です。新しめのSafari / Chrome / Edgeで開いてください。</p>"
    ].join(""));
  }

  function showLegacyFailedNotice() {
    renderNotice([
      "<h1>この端末では起動できませんでした</h1>",
      "<p>レガシー試用として起動を試みましたが、ブラウザがReader本体を実行できませんでした。</p>",
      "<p>iPhone 6 Plus / iOS 12.5系では正常動作しない可能性があります。別の端末または新しいOSのブラウザで開いてください。</p>"
    ].join(""));
  }

  function renderNotice(html) {
    var root = document.getElementById("appRoot");
    if (!root) return;
    if (document.body.className.indexOf("legacy-browser") < 0) {
      document.body.className += " legacy-browser";
    }
    root.innerHTML = '<main class="legacy-notice">' + html + "</main>";
  }

  function getIosVersion() {
    var ua = navigator.userAgent || "";
    var touchPoints = Number(navigator.maxTouchPoints) || 0;
    var platform = navigator.platform || "";
    var mobileMatch = ua.match(/(?:iPhone|iPad|iPod).*OS (\d+)(?:_(\d+))?/);
    if (mobileMatch) {
      return {
        major: Number(mobileMatch[1]) || 0,
        minor: Number(mobileMatch[2]) || 0
      };
    }

    var looksLikeIpadDesktopMode = platform === "MacIntel" && touchPoints > 1 && /Version\/\d+/.test(ua);
    if (!looksLikeIpadDesktopMode) return null;

    var safariVersion = ua.match(/Version\/(\d+)(?:\.(\d+))?/);
    if (!safariVersion) return null;
    return {
      major: Number(safariVersion[1]) || 0,
      minor: Number(safariVersion[2]) || 0
    };
  }

  function isAtLeastIos(version, major, minor) {
    if (!version) return false;
    if (version.major > major) return true;
    if (version.major < major) return false;
    return version.minor >= minor;
  }
})();
