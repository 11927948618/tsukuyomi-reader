(function () {
  var supported = true;

  try {
    new Function("var x = { a: { b: 1 } }; return x?.a?.b ?? 0;");
  } catch (err) {
    supported = false;
  }

  if (typeof Promise === "undefined" || typeof fetch === "undefined" || typeof URL === "undefined") {
    supported = false;
  }

  var iosMajorVersion = getIosMajorVersion();
  if (iosMajorVersion !== null && iosMajorVersion < 15) {
    supported = false;
  }

  if (supported) return;

  window.__TSUKUYOMI_LEGACY_UNSUPPORTED__ = true;

  function showLegacyNotice() {
    var root = document.getElementById("appRoot");
    if (!root) return;
    document.body.className += " legacy-browser";
    root.innerHTML = [
      '<main class="legacy-notice">',
      "<h1>このブラウザでは表示できません</h1>",
      "<p>古いiPhoneや古いSafariでは、現在のReaderで使っているJavaScriptを実行できず、黒画面になることがあります。</p>",
      "<p>iPhone / iPad は iOS 15 / iPadOS 15 以降を対象にします。目安は iPhone 6s、iPhone SE 第1世代、iPad Air 2、iPad mini 4 以降です。</p>",
      "<p>iOS 14 以下、iPhone 6 Plus 以前、古いSafariは対象外です。新しめのSafari / Chrome / Edgeで開いてください。</p>",
      "</main>"
    ].join("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showLegacyNotice);
  } else {
    showLegacyNotice();
  }

  function getIosMajorVersion() {
    var ua = navigator.userAgent || "";
    var touchPoints = Number(navigator.maxTouchPoints) || 0;
    var platform = navigator.platform || "";
    var mobileMatch = ua.match(/(?:iPhone|iPad|iPod).*OS (\d+)[_\d]*/);
    if (mobileMatch) return Number(mobileMatch[1]) || null;

    var looksLikeIpadDesktopMode = platform === "MacIntel" && touchPoints > 1 && /Version\/\d+/.test(ua);
    if (!looksLikeIpadDesktopMode) return null;

    var safariVersion = ua.match(/Version\/(\d+)/);
    return safariVersion ? Number(safariVersion[1]) || null : null;
  }
})();
