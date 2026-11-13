/* ==========================================================
   look-registry.js — سجل خيارات التصميم (مصدر الحقيقة الوحيد)
   ----------------------------------------------------------
   كل خيار = مفتاح + قيم مسموحة فقط. منه تُولَّد: واجهة استوديو التصميم بالأدمن، والتحقق بالووركر،
   ورسم المتجر. لا يُقبل أي نص حر: القيمة خارج القائمة تُهمَل وتُستبدل بالافتراضي.
   لإضافة خيار جديد: أضيفي سطراً هنا + CSS يستجيب لـ html[data-lk-<key>="<value>"] (والووركر يُولَّد من هذا الملف).
   ========================================================== */
(function (root) {
  var G = [
    { id: 'hero', title: 'الترويسة والبنر', icon: '🖼️', options: [
      { key: 'header', label: 'شكل الترويسة', def: 'classic', values: [
        { v: 'classic', l: 'كلاسيكي', d: 'شعار بالمنتصف، خلفية البطاقة' },
        { v: 'bar', l: 'شريط ملوّن', d: 'شريط باللون الأساسي ونص فاتح' },
        { v: 'pill', l: 'كبسولة عائمة', d: 'ترويسة مستديرة تطفو فوق الصفحة' },
        { v: 'minimal', l: 'بسيط', d: 'بلا خلفية ولا حدود' } ] },
      { key: 'announce', label: 'شريط الترحيب', def: 'soft', values: [
        { v: 'soft', l: 'ناعم', d: 'لون السطح الهادئ' },
        { v: 'solid', l: 'بلون أساسي', d: 'شريط بارز' },
        { v: 'dark', l: 'داكن', d: 'شريط غامق أنيق' },
        { v: 'hidden', l: 'مخفي', d: 'بدون شريط' } ] },
      { key: 'hero_size', label: 'حجم البنر الرئيسي', def: 'standard', values: [
        { v: 'compact', l: 'مصغّر' }, { v: 'standard', l: 'عادي' }, { v: 'tall', l: 'كبير' }, { v: 'immersive', l: 'ضخم' } ] },
      { key: 'hero_image', label: 'طريقة عرض صورة البنر', def: 'fade', values: [
        { v: 'fade', l: 'تلاشي جانبي', d: 'الصورة تتلاشى نحو النص' },
        { v: 'full', l: 'ملء البنر', d: 'الصورة خلف النص كاملة' },
        { v: 'circle', l: 'إطار دائري', d: 'الصورة داخل دائرة' } ] },
      { key: 'hero_frame', label: 'إطار البنر', def: 'card', values: [
        { v: 'card', l: 'بطاقة مستديرة' }, { v: 'edge', l: 'عرض كامل للحافة' } ] }
    ] },
    { id: 'catalog', title: 'الأقسام والمنتجات', icon: '🛍️', options: [
      { key: 'cats_home', label: 'أقسام الصفحة الرئيسية', def: 'circle', values: [
        { v: 'circle', l: 'دوائر', d: 'صورة دائرية واسم تحتها' },
        { v: 'tile', l: 'بلاطات', d: 'مربعات ناعمة' },
        { v: 'photo', l: 'صور كاملة', d: 'صورة والاسم فوقها' },
        { v: 'pastel', l: 'بطاقات ملوّنة', d: 'خلفيات بألوان ناعمة' },
        { v: 'hidden', l: 'مخفية', d: 'بلا شريط أقسام' } ] },
      { key: 'card', label: 'شكل بطاقة المنتج', def: 'shop', values: [
        { v: 'shop', l: 'تسوّق', d: 'السعر وزر العربة أسفل البطاقة' },
        { v: 'soft', l: 'ناعمة', d: 'الاسم والسعر بسطر وزر عريض' },
        { v: 'outline', l: 'مؤطّرة', d: 'إطار نحيف ونص بالمنتصف' },
        { v: 'row', l: 'قائمة', d: 'الصورة بجانب التفاصيل' } ] },
      { key: 'add_btn', label: 'زر الإضافة للسلة', def: 'cart', values: [
        { v: 'cart', l: 'عربة' }, { v: 'bag', l: 'كيس تسوق' }, { v: 'plus', l: 'زائد (+)' }, { v: 'text', l: 'نص «أضف»' } ] },
      { key: 'thumb_ratio', label: 'نسبة إطار الصورة', def: 'square', values: [
        { v: 'square', l: 'مربع' }, { v: 'portrait', l: 'طولي' }, { v: 'wide', l: 'عريض' } ] },
      { key: 'thumb_fit', label: 'ملاءمة الصورة', def: 'contain', values: [
        { v: 'contain', l: 'كاملة داخل الإطار' }, { v: 'cover', l: 'تملأ الإطار' } ] },
      { key: 'thumb_tone', label: 'خلفية الصورة', def: 'tint', values: [
        { v: 'tint', l: 'مظلّلة بلون الهوية' }, { v: 'white', l: 'بيضاء نقية' }, { v: 'clear', l: 'شفافة' } ] },
      { key: 'badge', label: 'شارة الخصم', def: 'pill', values: [
        { v: 'pill', l: 'كبسولة' }, { v: 'tag', l: 'علامة بزاوية' }, { v: 'round', l: 'دائرة' } ] }
    ] },
    { id: 'shape', title: 'الأشكال والأزرار', icon: '🔘', options: [
      { key: 'radius', label: 'استدارة الزوايا', def: 'round', values: [
        { v: 'sharp', l: 'حادة' }, { v: 'soft', l: 'خفيفة' }, { v: 'round', l: 'مستديرة' }, { v: 'pill', l: 'كبسولية' } ] },
      { key: 'btn_shape', label: 'شكل الأزرار', def: 'pill', values: [
        { v: 'pill', l: 'كبسولة' }, { v: 'rounded', l: 'مستديرة' }, { v: 'square', l: 'مربعة' } ] },
      { key: 'btn_fill', label: 'تعبئة الأزرار', def: 'gradient', values: [
        { v: 'gradient', l: 'متدرجة' }, { v: 'solid', l: 'لون ثابت' }, { v: 'outline', l: 'إطار فقط' } ] }
    ] },
    { id: 'nav', title: 'التنقل والعناوين', icon: '🧭', options: [
      { key: 'nav', label: 'الشريط السفلي', def: 'bubble', values: [
        { v: 'bubble', l: 'فقاعة نافرة', d: 'أيقونة النشط تبرز في دائرة' },
        { v: 'dock', l: 'رصيف عائم', d: 'شريط مستدير بتمييز ناعم' },
        { v: 'flat', l: 'مسطّح', d: 'شريط بسيط بنقطة تحت النشط' },
        { v: 'glass', l: 'زجاجي', d: 'شفاف مموّه' } ] },
      { key: 'title', label: 'عناوين الأقسام', def: 'line', values: [
        { v: 'line', l: 'خط جانبي' }, { v: 'center', l: 'بالمنتصف بزخرفة' }, { v: 'bold', l: 'ضخمة وثقيلة' } ] },
      { key: 'trust', label: 'شريط المميزات', def: 'cards', values: [
        { v: 'cards', l: 'بطاقات' }, { v: 'flat', l: 'مسطّح بفواصل' }, { v: 'hidden', l: 'مخفي' } ] }
    ] },
    { id: 'type', title: 'الخطوط', icon: '🔤', options: [
      { key: 'font_body', label: 'خط النصوص', def: 'cairo', values: [
        { v: 'cairo', l: 'Cairo' }, { v: 'tajawal', l: 'Tajawal' }, { v: 'almarai', l: 'Almarai' },
        { v: 'plex', l: 'IBM Plex Arabic' }, { v: 'readex', l: 'Readex Pro' }, { v: 'kufi', l: 'Noto Kufi' } ] },
      { key: 'font_head', label: 'خط العناوين', def: 'same', values: [
        { v: 'same', l: 'نفس خط النصوص' }, { v: 'amiri', l: 'Amiri (نسخ)' }, { v: 'markazi', l: 'Markazi (نسخ)' },
        { v: 'reem', l: 'Reem Kufi' }, { v: 'kufi', l: 'Noto Kufi' } ] },
      { key: 'font_size', label: 'حجم الخط العام', def: 'm', values: [
        { v: 's', l: 'صغير' }, { v: 'm', l: 'متوسط' }, { v: 'l', l: 'كبير' } ] }
    ] },
    { id: 'motion', title: 'الحركة', icon: '✨', options: [
      { key: 'motion', label: 'مستوى الحركة', def: 'full', values: [
        { v: 'full', l: 'كاملة', d: 'ظهور تدريجي وطيران للسلة' }, { v: 'subtle', l: 'هادئة' }, { v: 'off', l: 'بلا حركة' } ] }
    ] }
  ];

  // خطوط جوجل المسموحة (روابط ثابتة من هنا فقط — لا تُبنى أبداً من نص مخزَّن)
  var FONTS = {
    cairo:   { fam: "'Cairo', sans-serif",              q: 'Cairo:wght@400;600;700;800;900' },
    tajawal: { fam: "'Tajawal', sans-serif",            q: 'Tajawal:wght@400;500;700;800' },
    almarai: { fam: "'Almarai', sans-serif",            q: 'Almarai:wght@400;700;800' },
    plex:    { fam: "'IBM Plex Sans Arabic', sans-serif", q: 'IBM+Plex+Sans+Arabic:wght@400;500;600;700' },
    readex:  { fam: "'Readex Pro', sans-serif",         q: 'Readex+Pro:wght@400;500;600;700' },
    kufi:    { fam: "'Noto Kufi Arabic', sans-serif",   q: 'Noto+Kufi+Arabic:wght@400;600;700;800' },
    amiri:   { fam: "'Amiri', serif",                   q: 'Amiri:wght@400;700' },
    markazi: { fam: "'Markazi Text', serif",            q: 'Markazi+Text:wght@500;600;700' },
    reem:    { fam: "'Reem Kufi', sans-serif",          q: 'Reem+Kufi:wght@500;600;700' }
  };

  var DEFAULTS = {}, ALLOWED = {};
  G.forEach(function (g) { g.options.forEach(function (o) {
    DEFAULTS[o.key] = o.def;
    ALLOWED[o.key] = o.values.map(function (x) { return x.v; });
  }); });

  // يُرجع كائناً نظيفاً: مفاتيح معروفة فقط + قيم مسموحة فقط + الافتراضي لما عداها
  function normalizeLook(raw) {
    var out = {};
    raw = (raw && typeof raw === 'object') ? raw : {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = raw[k];
      out[k] = (typeof v === 'string' && ALLOWED[k].indexOf(v) !== -1) ? v : DEFAULTS[k];
    });
    return out;
  }
  function fontsUrl(look) {
    var keys = {};
    keys[look.font_body] = 1;
    if (look.font_head && look.font_head !== 'same') keys[look.font_head] = 1;
    var fams = Object.keys(keys).filter(function (k) { return FONTS[k]; }).map(function (k) { return 'family=' + FONTS[k].q; });
    return fams.length ? 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap' : '';
  }

  var api = { GROUPS: G, FONTS: FONTS, DEFAULTS: DEFAULTS, ALLOWED: ALLOWED, normalizeLook: normalizeLook, fontsUrl: fontsUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LookRegistry = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
