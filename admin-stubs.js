/* ==========================================================
   admin-stubs.js — بدائل خفيفة لدوال لوحة الأدمن بصفحة المتجر (index.html)
   ----------------------------------------------------------
   الزبون لا يحمّل كود لوحة الأدمن (admin-*.js) إطلاقاً. script.js وstorefront.js يشيران لهذه الدوال وقت التحميل
   (مثل window.populateBundleFilterDropdowns = ... و window.App)، فبدونها يتوقف script.js بخطأ ReferenceError
   ويبقى المتجر فارغاً. لذلك تُعرَّف هنا دوال بديلة بنفس الأسماء:
     • الدوال التي يستدعيها المتجر تلقائياً لكل زائر: لا تفعل شيئاً للزبون، وللطاقم فقط تُحمَّل ملفات الأدمن كسلاً ثم تُنفَّذ الدالة الحقيقية.
     • الدوال التي تُستدعى بنقرة أدمن (أزرار بطاقة المنتج...): تُحمَّل ملفات الأدمن ثم تُنفَّذ.
   عند تحميل ملفات الأدمن تحل دوالها الحقيقية مكان هذه البدائل تلقائياً (تصريح function بالنطاق العام).
   يجب أن يسبق script.js و storefront.js.
   ========================================================== */
(function () {
  var ADMIN_FUNCTION_NAMES = [
    "announceCacheStatusToAdminIfNeeded",
    "archiveProductConfirm",
    "checkAdminSubscriptionLock",
    "checkLowStockAlerts",
    "cleanupArchiveSelected",
    "cleanupPermanentDeleteSelected",
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

  // تُستدعى تلقائياً من كود المتجر لكل زائر: لا تُحمَّل ملفات الأدمن إلا إذا كان المستخدم من الطاقم.
  var STAFF_ONLY_AUTO_CALLS = {
    announceCacheStatusToAdminIfNeeded: 1, checkAdminSubscriptionLock: 1, checkLowStockAlerts: 1,
    fetchRealAnalytics: 1, initAdminAudioAlertPreference: 1, renderAdminBundlesList: 1,
    renderAdminProductManagementGrid: 1, renderPromoCardsListAdmin: 1, switchAdminSection: 1,
    updateDiscountTargetOptions: 1, populateBundleFilterDropdowns: 1, populateOfferFilterDropdowns: 1
  };

  var ADMIN_FILES = ['admin-core.js', 'admin-products.js', 'admin-catalog-tools.js', 'admin-orders.js', 'admin-reports.js', 'admin-marketing.js', 'admin-settings.js'];

  var loadPromise = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('تعذر تحميل ' + src)); };
      document.head.appendChild(s);
    });
  }
  // تحميل متسلسل بنفس ترتيب admin.html (admin-core أولاً)
  function loadAdminCode() {
    if (!loadPromise) {
      loadPromise = ADMIN_FILES.reduce(function (p, f) { return p.then(function () { return loadScript(f); }); }, Promise.resolve())
        .catch(function (e) { loadPromise = null; console.error('[admin-stubs]', e); throw e; });
    }
    return loadPromise;
  }
  window.loadAdminCode = loadAdminCode;

  function isStaffNow() {
    try { return typeof isStaffMember === 'function' && !!isStaffMember(); } catch (e) { return false; }
  }

  ADMIN_FUNCTION_NAMES.forEach(function (name) {
    var stub = function () {
      var self = this, args = arguments;
      if (STAFF_ONLY_AUTO_CALLS[name] && !isStaffNow()) return undefined;
      return loadAdminCode().then(function () {
        var real = window[name];
        if (typeof real === 'function' && real !== stub) return real.apply(self, args);
      }).catch(function () { /* خطأ التحميل سُجّل أعلاه */ });
    };
    window[name] = stub;
  });
})();
