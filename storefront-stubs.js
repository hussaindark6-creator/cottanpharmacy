/* ==========================================================
   storefront-stubs.js — بدائل فارغة لدوال واجهة الزبون (admin.html فقط)
   ----------------------------------------------------------
   لوحة الأدمن لم تعد تحمّل storefront.js (كود عرض المتجر: السلة، الطلبات، شبكة المنتجات...).
   لكن script.js ولوحة الأدمن يستدعيان بعض هذه الدوال لتحديث واجهة المتجر بعد أي تغيير
   (مثل renderBrandStrip بعد حفظ ماركة). عناصر المتجر غير موجودة أصلاً بصفحة الأدمن، فهذه
   الدوال كانت بلا أي أثر هناك؛ لذا تُستبدل ببدائل لا تفعل شيئاً، منعاً لخطأ "is not defined".
   يجب أن يسبق script.js (الذي يشير window.App لبعضها وقت التحميل).
   ========================================================== */
(function () {
  var NOOP_FUNCTION_NAMES = [
    "checkAndAutofillCustomer",
    "checkAndShowWelcomeModal",
    "checkStorefrontSubscriptionLock",
    "closeMenu",
    "openBundleDetail",
    "openProduct",
    "renderAccountView",
    "renderAllBundles",
    "renderBrandStrip",
    "renderCart",
    "renderCheckoutSummary",
    "renderHeroCarousel",
    "renderHomeProductGrid",
    "renderListing",
    "renderModernCategories",
    "renderMyOrders",
    "renderOffers",
    "renderProductDetailDOM",
    "selectProductVariantCard",
    "showListingView",
    "updateCartBadge",
    "updateUserHeaderProfile"
];
  NOOP_FUNCTION_NAMES.forEach(function (name) {
    window[name] = function () {};
  });
})();
