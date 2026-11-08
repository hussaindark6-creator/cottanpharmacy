/* ==========================================================
   templates/classic.js — قالب Classic (التصميم الحالي للمتجر)
   كل دوال الرسم هنا ترجع null عمداً = "استخدم الرسم المدمج" (وهو تصميم classic الحالي نفسه)،
   فلا يتغير شيء ظاهر للزبائن الحاليين. القوالب الجديدة (Boutique/Clinic/Market) تعيد HTML بدل null.
   سبب إبقاء الرسم داخل script.js/storefront.js حالياً: نقل الشيفرة بلا اختبار بمتصفح قد يكسر بطاقات الإنتاج.
   تسجيل القالب: window.PharmacyTemplates[<اسم الملف>] — يتحقق منه المحرك بعقد template-contract.js.
   ========================================================== */
(function () {
  window.PharmacyTemplates = window.PharmacyTemplates || {};
  window.PharmacyTemplates.classic = {
    id: 'classic',
    name: 'Classic',
    version: '1.0.0',
    tokens: {
      colors: { primary: '#E85D8A' },
      fonts: { body: 'cairo', heading: 'cairo' },
      shapes: { radius: 'md' }
    },
    homeSections: ['hero', 'promo-cards', 'brands', 'best-sellers'],
    applyStyles: function () { /* data-template والألوان يطبّقها المحرك */ },
    renderHeader: function () { return null; },
    renderProductCard: function () { return null; },
    renderCategoryCard: function () { return null; },
    renderBundleCard: function () { return null; },
    renderProductPage: function () { return null; },
    renderFooter: function () { return null; }
  };
})();
