/* ==========================================================
   platform-host.js — توجيه الدومينات (المرحلة 0). يُحمَّل متزامناً أول <head> بصفحات المتجر/الأدمن/السوبر أدمن.
   • بلا VITE_PLATFORM_ROOT_DOMAIN (الوضع الحالي قبل شراء دومين): لا يغيّر أي سلوك.
   • مع VITE_PLATFORM_ROOT_DOMAIN: وضع صارم:
       1) دومين غير مربوط من لوحة السوبر أدمن = صفحة "هذه الصيدلية غير موجودة" (لا يفتح القطن).
       2) رابط <المشروع>.pages.dev القديم يُحوَّل لنفس الصفحة على الدومين الجديد (المسار والبحث و#hash محفوظة).
       3) السوبر أدمن حصراً على admin.<الدومين>؛ فتح الجذر هناك يحوّل لـ super-admin.html.
       4) ?pharmacy= يُهمَل بالدومينات الحقيقية، ويعمل فقط: localhost + معاينات Pages + إطار المعاينة داخل السوبر أدمن.
   ========================================================== */
(function () {
  var ROOT = String(typeof __PLATFORM_ROOT_DOMAIN__ !== 'undefined' ? __PLATFORM_ROOT_DOMAIN__ : '').toLowerCase().trim().replace(/^\.+|\.+$/g, '');
  var LEGACY_HOST = String(typeof __LEGACY_REDIRECT_HOST__ !== 'undefined' ? __LEGACY_REDIRECT_HOST__ : '').toLowerCase().trim();
  var DEFAULT_ID = 'cottanpharmacy';
  var STRICT = !!ROOT;

  var host = location.hostname.toLowerCase();
  var path = location.pathname.toLowerCase();
  var adminHost = 'admin.' + ROOT;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  var isPagesDev = host === 'pages.dev' || /\.pages\.dev$/.test(host);
  var isPagesProd = isPagesDev && host.split('.').length === 3;     // <المشروع>.pages.dev
  var isPagesPreview = isPagesDev && !isPagesProd;                  // <hash أو فرع>.<المشروع>.pages.dev
  var isSuperAdminPage = /(^|\/)super-admin(\.html)?$/.test(path);
  var inPreviewFrame = false;
  try {
    inPreviewFrame = window.self !== window.top && /[?&]__tplpreview=1(&|$)/.test(location.search) &&
      (host === adminHost || isLocal || isPagesPreview);
  } catch (e) { inPreviewFrame = false; }

  var api = {
    strict: STRICT,
    root: ROOT,
    redirecting: false,
    allowsPharmacyParam: function () { return !STRICT || isLocal || isPagesPreview || inPreviewFrame; },
    allowsDefaultFallback: function () { return !STRICT || isLocal || isPagesPreview || api.redirecting; },
    showNotFound: function (reason) {
      var down = reason === 'unreachable';
      var title = down ? 'تعذر الاتصال بالخادم' : 'هذه الصيدلية غير موجودة';
      var text = down ? 'تأكدي من اتصال الإنترنت ثم أعيدي المحاولة.' : 'الرابط غير صحيح أو أن هذا المتجر لم يعد متاحاً.';
      var html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
        '<title>' + title + '</title><style>' +
        'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f8;font-family:Cairo,Tahoma,sans-serif;color:#2b2b2b;text-align:center;padding:24px}' +
        '.b{max-width:360px}.i{font-size:56px;margin-bottom:12px}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#666;line-height:1.8;margin:0 0 18px}' +
        'button{background:#E85D8A;color:#fff;border:0;border-radius:12px;padding:10px 26px;font-weight:800;font-size:14px;cursor:pointer}' +
        '</style></head><body><div class="b"><div class="i">' + (down ? '📡' : '🏥') + '</div><h1>' + title + '</h1><p>' + text + '</p>' +
        (down ? '<button onclick="location.reload()">إعادة المحاولة</button>' : '') + '</div></body></html>';
      try { window.stop(); } catch (e) { /* غير حرج */ }
      document.open(); document.write(html); document.close();
      throw new Error('PHARMACY_NOT_FOUND'); // يوقف بقية السكربتات بنظافة
    }
  };
  window.__PLATFORM__ = api;
  if (!STRICT) return;

  function go(url) { api.redirecting = true; location.replace(url); }

  // (1) السوبر أدمن: على admin.<الدومين> فقط (أو التطوير/المعاينة)
  if (isSuperAdminPage) {
    if (!(host === adminHost || isLocal || isPagesPreview)) go('https://' + adminHost + '/super-admin.html');
    return;
  }
  // (2) جذر admin.<الدومين> يفتح السوبر أدمن (إطار المعاينة داخل السوبر أدمن يستثنى)
  if (host === adminHost) {
    if (!inPreviewFrame && (path === '/' || path === '/index.html')) go('/super-admin.html');
    return;
  }
  // (3) رابط pages.dev الإنتاجي القديم → الدومين الجديد دون كسر الروابط المنتشرة
  if (isPagesProd) {
    var q = new URLSearchParams(location.search);
    var tenant = (q.get('pharmacy') || q.get('p_id') || q.get('p') || q.get('id') || '').toLowerCase().trim();
    ['pharmacy', 'p_id', 'p', 'id'].forEach(function (k) { q.delete(k); });
    var targetHost = (tenant && tenant !== DEFAULT_ID) ? (tenant + '.' + ROOT) : (LEGACY_HOST || (DEFAULT_ID + '.' + ROOT));
    var qs = q.toString();
    go('https://' + targetHost + location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
})();
