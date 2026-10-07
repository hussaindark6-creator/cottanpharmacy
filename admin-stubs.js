/* ==========================================================
   admin-stubs.js — محمِّل كسول لكود لوحة التحكم (index.html فقط)
   ----------------------------------------------------------
   المتجر العادي لم يعد يحمّل كود الأدمن (ملفات admin-*.js ~3000 سطر). بدله يُحمَّل هذا الملف
   الصغير أولاً (قبل script.js)، ويعرّف "بدائل" (stubs) بنفس أسماء دوال الأدمن التي يستدعيها
   كود المتجر. عند استدعاء أي منها:
     • الزائر/الزبون العادي: لا يحدث شيء (هذه الدوال أصلاً تعمل على عناصر لوحة التحكم غير
       الموجودة بصفحة المتجر، فكانت بلا أثر لهم).
     • الأدمن: تُحمَّل ملفات admin-*.js مرة واحدة، فتحلّ الدوال الحقيقية محل البدائل تلقائياً
       (تعريفات function العامة اللاحقة تستبدل البدائل)، ثم تُنفَّذ الدالة المطلوبة بنفس
       المعطيات.
   ملاحظة: admin.html لا يستخدم هذا الملف (يحمّل ملفات admin-*.js مباشرة).
   ========================================================== */
(function () {
  var loadingPromise = null;

  // ملفات لوحة الأدمن (كانت ملفاً واحداً admin-panel.js). كلها دوال بلا تنفيذ عند التحميل، فيمكن تحميلها
  // بالتوازي بأي ترتيب؛ ونعتبر اللوحة جاهزة عندما تكتمل كلها.
  var ADMIN_PANEL_FILES = ["admin-core.js", "admin-products.js", "admin-catalog-tools.js", "admin-orders.js", "admin-reports.js", "admin-marketing.js", "admin-settings.js"];

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('تعذر تحميل ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadAdminPanel() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = Promise.all(ADMIN_PANEL_FILES.map(loadScriptOnce)).catch(function (e) {
      loadingPromise = null;   // يسمح بإعادة المحاولة عند الاستدعاء التالي
      throw e;
    });
    return loadingPromise;
  }
  window.loadAdminPanel = loadAdminPanel;

  function isAdminNow() {
    try { return typeof isCurrentUserAdmin === 'function' && !!isCurrentUserAdmin(); }
    catch (e) { return false; }
  }

  var ADMIN_FUNCTION_NAMES = [
    "announceCacheStatusToAdminIfNeeded",
    "archiveProductConfirm",
    "checkAdminSubscriptionLock",
    "checkLowStockAlerts",
    "cleanupArchiveSelected",
    "cleanupPermanentDeleteSelected",
    "exportOrdersToCSV",
    "fetchRealAnalytics",
    "handleBundleBrandFilterChange",
    "handleBundleCategoryFilterChange",
    "handleOfferBrandFilterChange",
    "handleOfferCategoryFilterChange",
    "initAdminAudioAlertPreference",
    "manualRebuildR2Catalog",
    "openAdminQuickEditModal",
    "populateBundleFilterDropdowns",
    "populateOfferFilterDropdowns",
    "quickEditPrice",
    "quickToggleStock",
    "removeBundleProductChip",
    "removeOfferProductChip",
    "renderAdminBundlesList",
    "renderAdminProductManagementGrid",
    "renderPromoCardsListAdmin",
    "scanForUncategorizedOrTestProducts",
    "switchAdminSection",
    "toggleBundleProductCheckbox",
    "toggleCleanupSelection",
    "toggleOfferProductCheckbox",
    "updateDiscountTargetOptions"
];

  ADMIN_FUNCTION_NAMES.forEach(function (name) {
    var stub = function () {
      var self = this, args = arguments;
      if (!isAdminNow()) return;
      return loadAdminPanel().then(function () {
        var real = window[name];
        if (typeof real === 'function' && real !== stub) return real.apply(self, args);
        console.warn('admin-stubs: الدالة غير متوفرة بعد تحميل ملفات الأدمن:', name);
      }).catch(function (e) { console.warn(e); });
    };
    window[name] = stub;
  });
})();
