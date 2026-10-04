/* ==========================================================
   admin-stubs.js — محمِّل كسول لكود لوحة التحكم (index.html فقط)
   ----------------------------------------------------------
   المتجر العادي لم يعد يحمّل كود الأدمن (admin-panel.js ~2800 سطر). بدله يُحمَّل هذا الملف
   الصغير أولاً (قبل script.js)، ويعرّف "بدائل" (stubs) بنفس أسماء دوال الأدمن التي يستدعيها
   كود المتجر. عند استدعاء أي منها:
     • الزائر/الزبون العادي: لا يحدث شيء (هذه الدوال أصلاً تعمل على عناصر لوحة التحكم غير
       الموجودة بصفحة المتجر، فكانت بلا أثر لهم).
     • الأدمن: يُحمَّل admin-panel.js مرة واحدة، فتحلّ الدوال الحقيقية محل البدائل تلقائياً
       (تعريفات function العامة اللاحقة تستبدل البدائل)، ثم تُنفَّذ الدالة المطلوبة بنفس
       المعطيات.
   ملاحظة: admin.html لا يستخدم هذا الملف (يحمّل admin-panel.js مباشرة).
   ========================================================== */
(function () {
  var loadingPromise = null;

  function loadAdminPanel() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'admin-panel.js';
      s.onload = function () { resolve(); };
      s.onerror = function () {
        loadingPromise = null;
        reject(new Error('تعذر تحميل admin-panel.js'));
      };
      document.head.appendChild(s);
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
        console.warn('admin-stubs: الدالة غير متوفرة بعد تحميل admin-panel.js:', name);
      }).catch(function (e) { console.warn(e); });
    };
    window[name] = stub;
  });
})();
