/* ==========================================================
   template-contract.js — عقد القوالب (المرحلة 1)
   المصدر الوحيد لما يجب أن يوفّره أي قالب، ولقيم حقل design المسموحة. يستخدمه المحرك (template-engine.js) والاختبارات.
   القالب "يرسم فقط": السلة/الدفع/الطلبات/الدخول/الأمان منطق مشترك لا يُنسخ داخل القوالب.
   القالب ملف كلاسيكي بمجلد public/templates/<script>.js ويسجّل نفسه: window.PharmacyTemplates['<id>'] = { ... }

   كل دوال الرسم ترجع نص HTML، أو null/undefined = "استخدم الرسم المدمج" (وهو تصميم classic الحالي).
   ========================================================== */
(function (root) {
  var CONTRACT = {
    version: 1,

    // ما يجب أن يصدّره كل قالب (الاسم → النوع)
    required: {
      id: 'string',
      name: 'string',
      version: 'string',
      tokens: 'object',              // قيم افتراضية لمتغيرات التصميم: { colors:{primary}, fonts:{body,heading}, shapes:{radius} }
      homeSections: 'array',         // ترتيب أجزاء الرئيسية الافتراضي لهذا القالب (من homeSectionIds)
      applyStyles: 'function',       // (profile, design, helpers) — تهيئة إضافية للقالب بعد تطبيق التصميم
      renderHeader: 'function',      // (profile, helpers) → html|null (يوضع بفتحة قبل الهيدر، أو بعده إن كانت template.headerSlotPosition = 'after'؛ اختيارية)
      renderProductCard: 'function', // (product, helpers) → html|null
      renderCategoryCard: 'function',// (category, count, helpers) → html|null
      renderBundleCard: 'function',  // (bundle, helpers) → html|null
      renderProductPage: 'function', // (product, helpers) → html|null (محتوى إضافي بصفحة المنتج)
      renderFooter: 'function'       // (profile, helpers) → html|null
    },

    // أجزاء الصفحة الرئيسية القابلة للترتيب/الإخفاء (تطابق data-home-section بـ index.html)
    homeSectionIds: ['hero', 'promo-cards', 'brands', 'best-sellers'],

    // ميزات يمكن تشغيلها/إيقافها لكل صيدلية (واجهة فقط)
    featureKeys: ['bundles', 'offers', 'consult'],

    // خيارات مسموحة فقط (لا نمرّر نصاً حراً من Firestore إلى CSS أبداً)
    fonts: {
      cairo:   { label: 'Cairo (الحالي)', family: "'Cairo', sans-serif", google: '' },
      tajawal: { label: 'Tajawal', family: "'Tajawal', sans-serif", google: 'Tajawal:wght@400;500;700;800' },
      almarai: { label: 'Almarai', family: "'Almarai', sans-serif", google: 'Almarai:wght@400;700;800' },
      amiri:   { label: 'Amiri (زخرفي)', family: "'Amiri', serif", google: 'Amiri:wght@400;700' }
    },
    radius: {
      sm: { label: 'حادّ', value: '8px' },
      md: { label: 'متوسط (الحالي)', value: '' },
      lg: { label: 'مدوّر', value: '20px' },
      xl: { label: 'دائري كثيراً', value: '28px' }
    },

    // القيم الافتراضية لحقل design (تُدمج مع ما في مستند الصيدلية)
    designDefaults: {
      template: 'classic',
      colors: {},                     // primary: '#RRGGBB' (إن غاب يُستخدم primaryColor القديم)
      fonts: {},                      // body/heading: مفتاح من fonts
      shapes: {},                     // radius: مفتاح من radius
      home: { order: [], hidden: [] },
      features: { bundles: true, offers: true, consult: true }
    }
  };

  function typeOf(v) { return Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v); }

  // يفحص قالباً: يرجع { ok, errors[] }
  function validateTemplate(t) {
    var errors = [];
    if (!t || typeof t !== 'object') return { ok: false, errors: ['القالب ليس كائناً'] };
    Object.keys(CONTRACT.required).forEach(function (key) {
      var want = CONTRACT.required[key];
      var got = typeOf(t[key]);
      if (got !== want) errors.push('«' + key + '» مطلوب من نوع ' + want + ' (وُجد ' + got + ')');
    });
    if (Array.isArray(t.homeSections)) {
      t.homeSections.forEach(function (id) {
        if (CONTRACT.homeSectionIds.indexOf(id) === -1) errors.push('جزء رئيسية غير معروف: ' + id);
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  root.TemplateContract = CONTRACT;
  root.validateTemplate = validateTemplate;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CONTRACT: CONTRACT, validateTemplate: validateTemplate };
})(typeof window !== 'undefined' ? window : globalThis);
