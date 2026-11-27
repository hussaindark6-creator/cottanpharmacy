/* app-config.js — الإعدادات المركزية للمتجر. يُحمَّل أول سكربت بالـ<head> قبل أي شيء (حتى يبدأ العدّ مع فتح المتجر).
   SPLASH_MIN_MS : الحد الأدنى الكلي لظهور شاشة التحميل، يُحسب من لحظة بدء فتح الصفحة (لا تأخير إضافي بعد انتهاء التحميل).
   SPLASH_MAX_MS : صمام أمان: إن تعطّل تحميل المتجر كلياً لا تبقى الشاشة للأبد.
   لتغيير المدة عدّلي SPLASH_MIN_MS هنا فقط؛ كل الملفات الأخرى تقرؤها من هذا الملف. */
(function () {
  'use strict';
  var cfg = window.APP_CONFIG = Object.freeze({ SPLASH_MIN_MS: 3500, SPLASH_MAX_MS: 12000 });
  var root = document.documentElement, shown = false;
  // تُمرَّر المدة للـCSS (شريط التقدم يمتلئ خلال الحد الأدنى + صمام الأمان بالـCSS إن فشل الـJS)
  root.style.setProperty('--ds-splash-min', cfg.SPLASH_MIN_MS + 'ms');
  root.style.setProperty('--ds-splash-max', cfg.SPLASH_MAX_MS + 'ms');
  function reveal() { if (shown) return; shown = true; root.classList.add('ds-ready'); }
  // ready(): يُستدعى عندما يصبح المحتوى الأساسي مرسوماً. performance.now() = الزمن منذ بدء التنقل (فتح الصفحة/إعادة التحميل)،
  // فننتظر المدة المتبقية فقط، ثم إطارَي رسم متتاليين كي لا يظهر وميض/شاشة بيضاء عند الكشف.
  window.AppSplash = {
    ready: function () {
      if (shown) return;
      var wait = Math.max(0, cfg.SPLASH_MIN_MS - performance.now());
      setTimeout(function () { requestAnimationFrame(function () { requestAnimationFrame(reveal); }); }, wait);
    }
  };
  setTimeout(reveal, cfg.SPLASH_MAX_MS);
})();
