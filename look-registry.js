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
      { key: 'hero_layout', label: 'تركيب البنر (الصورة والنص)', def: 'split', values: [
        { v: 'split', l: 'صورة بجانب النص', d: 'الحالي: نص على جهة وصورة على الجهة الأخرى' },
        { v: 'overlay', l: 'نص فوق الصورة', d: 'الصورة تغطي كل البنر والنص فوقها' },
        { v: 'stack', l: 'صورة فوق ونص تحتها', d: 'مناسب للجوال والصور الطويلة' },
        { v: 'textonly', l: 'نص فقط', d: 'بدون صورة، خلفية ملوّنة نظيفة' } ] },
      { key: 'hero_bg', label: 'خلفية البنر', def: 'soft', values: [
        { v: 'soft', l: 'ناعمة بتدرّج' }, { v: 'brand', l: 'بلون المتجر ونص أبيض' }, { v: 'paper', l: 'بيضاء نظيفة' } ] },
      { key: 'hero_align', label: 'محاذاة نص البنر', def: 'start', values: [ { v: 'start', l: 'للبداية' }, { v: 'center', l: 'بالمنتصف' } ] },
      { key: 'hero_text', label: 'لون نص البنر', def: 'auto', values: [ { v: 'auto', l: 'تلقائي' }, { v: 'light', l: 'فاتح (فوق صورة داكنة)' }, { v: 'dark', l: 'داكن' } ] },
      { key: 'hero_overlay', label: 'تعتيم فوق الصورة', def: 'none', values: [ { v: 'none', l: 'بلا' }, { v: 'soft', l: 'خفيف' }, { v: 'dark', l: 'داكن لإبراز النص' }, { v: 'brand', l: 'بلون المتجر' } ] },
      { key: 'hero_title_size', label: 'حجم عنوان البنر', def: 'm', values: [ { v: 's', l: 'صغير' }, { v: 'm', l: 'متوسط' }, { v: 'l', l: 'كبير' }, { v: 'xl', l: 'ضخم' } ] },
      { key: 'hero_cta', label: 'زر البنر', def: 'fill', values: [ { v: 'fill', l: 'معبّأ' }, { v: 'outline', l: 'إطار فقط' }, { v: 'text', l: 'نص بسهم' }, { v: 'hidden', l: 'بدون زر' } ] },
      { key: 'hero_dots', label: 'مؤشرات الشرائح', def: 'dots', values: [ { v: 'dots', l: 'نقاط' }, { v: 'line', l: 'خطوط طويلة' }, { v: 'hidden', l: 'مخفية' } ] },
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
        { v: 'row', l: 'قائمة', d: 'الصورة بجانب التفاصيل' },
        { v: 'tint', l: 'ملوّنة', d: 'خلفية صورة بلون المتجر الناعم وسطر الماركة وزر عريض' },
        { v: 'plain', l: 'مسطّحة', d: 'بلا ظل، إطار رفيع وزاوية صغيرة (أسلوب المتاجر العالمية)' },
        { v: 'catalog', l: 'كتالوج', d: 'إطار حاد رفيع ونص صغير بالمنتصف' },
        { v: 'float', l: 'عائمة', d: 'بلا إطار على خلفية رمادية دافئة وزر صغير' } ] },
      { key: 'add_btn', label: 'زر الإضافة للسلة', def: 'cart', values: [
        { v: 'cart', l: 'عربة' }, { v: 'bag', l: 'كيس تسوق' }, { v: 'plus', l: 'زائد (+)' }, { v: 'text', l: 'نص «أضف»' }, { v: 'wide', l: 'زر عريض كامل' } ] },
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
        { v: 'glass', l: 'زجاجي', d: 'شفاف مموّه' },
        { v: 'solid', l: 'ملوّن كامل', d: 'شريط بلون المتجر وأيقونات بيضاء' },
        { v: 'fab', l: 'زر السلة المركزي البارز', d: 'شريط ملوّن وزر سلة دائري كبير بالمنتصف (يخفي زر البكجات منه)' } ] },
      { key: 'title', label: 'عناوين الأقسام', def: 'line', values: [
        { v: 'line', l: 'خط جانبي' }, { v: 'center', l: 'بالمنتصف بزخرفة' }, { v: 'bold', l: 'ضخمة وثقيلة' } ] },
      { key: 'trust', label: 'شريط المميزات', def: 'cards', values: [
        { v: 'cards', l: 'بطاقات' }, { v: 'flat', l: 'مسطّح بفواصل' }, { v: 'hidden', l: 'مخفي' } ] }
    ] },
    { id: 'type', title: 'الخطوط', icon: '🔤', options: [
      { key: 'font_body', label: 'خط النصوص', def: 'cairo', values: [
        { v: 'cairo', l: 'Cairo — هندسي معاصر' }, { v: 'tajawal', l: 'Tajawal — نظيف وخفيف' }, { v: 'naskh', l: 'Naskh — نسخ تقليدي مقروء' },
        { v: 'changa', l: 'Changa — مدوّر وضيّق' }, { v: 'baloo', l: 'Baloo — مرح ومدوّر' }, { v: 'elmessiri', l: 'El Messiri — أنيق بلمسة زخرفية' },
        { v: 'lemonada', l: 'Lemonada — ودّي وناعم' },
        { v: 'almarai', l: 'Almarai', h: true }, { v: 'plex', l: 'IBM Plex Arabic', h: true }, { v: 'readex', l: 'Readex Pro', h: true }, { v: 'kufi', l: 'Noto Kufi', h: true } ] },
      { key: 'font_head', label: 'خط العناوين', def: 'same', values: [
        { v: 'same', l: 'نفس خط النصوص' }, { v: 'amiri', l: 'Amiri — خط كلاسيكي فاخر' }, { v: 'markazi', l: 'Markazi — عناوين مكثّفة' },
        { v: 'reem', l: 'Reem Kufi — كوفي هندسي' }, { v: 'lalezar', l: 'Lalezar — عريض لافت' }, { v: 'elmessiri', l: 'El Messiri — أنيق' },
        { v: 'arefruqaa', l: 'Aref Ruqaa — رقعة بخط اليد' }, { v: 'rakkas', l: 'Rakkas — بارز وجريء' }, { v: 'changa', l: 'Changa — مدوّر' }, { v: 'baloo', l: 'Baloo — مرح',},
        { v: 'kufi', l: 'Noto Kufi', h: true } ] },
      { key: 'font_size', label: 'حجم الخط العام', def: 'm', values: [
        { v: 's', l: 'صغير' }, { v: 'm', l: 'متوسط' }, { v: 'l', l: 'كبير' } ] }
    ] },
    { id: 'header2', title: 'الترويسة والبحث', icon: '🔝', options: [
      { key: 'header_brand', label: 'عرض اسم الصيدلية', def: 'text', values: [
        { v: 'text', l: 'نص فقط', d: 'الاسم بالمنتصف' },
        { v: 'tile', l: 'شعار بمستطيل + الاسم + الشعار اللفظي', d: 'مثل «صيدلية الرند»: مستطيل مدوّر بالشعار وبجانبه الاسم والعبارة' },
        { v: 'tile-lg', l: 'مستطيل كبير مع الاسم', d: 'شعار كبير بمستطيل وأسفله الاسم' },
        { v: 'logo', l: 'شعار فقط', d: 'صورة الشعار بدل الاسم' } ] },
      { key: 'header_tabs', label: 'شريط التنقل بالترويسة', def: 'off', values: [ { v: 'off', l: 'مخفي' }, { v: 'on', l: 'تبويبات أفقية (الرئيسية، الأقسام...)' } ] },
      { key: 'header_logo', label: 'حجم اسم/شعار المتجر', def: 'm', values: [ { v: 's', l: 'صغير' }, { v: 'm', l: 'متوسط' }, { v: 'l', l: 'كبير' } ] },
      { key: 'header_sticky', label: 'تثبيت الترويسة عند التمرير', def: 'off', values: [ { v: 'off', l: 'غير مثبتة' }, { v: 'on', l: 'مثبتة بالأعلى' } ] },
      { key: 'search_style', label: 'شكل حقل البحث', def: 'bar', values: [ { v: 'bar', l: 'شريط بظل' }, { v: 'flat', l: 'مسطّح بإطار' }, { v: 'compact', l: 'مدمج صغير' } ] }
    ] },
    { id: 'card2', title: 'تفاصيل بطاقة المنتج', icon: '🏷️', options: [
      { key: 'card_meta', label: 'سطر «الماركة · القسم»', def: 'hidden', values: [ { v: 'hidden', l: 'مخفي' }, { v: 'shown', l: 'ظاهر فوق الاسم' } ] },
      { key: 'card_align', label: 'محاذاة نص البطاقة', def: 'start', values: [ { v: 'start', l: 'للبداية' }, { v: 'center', l: 'بالمنتصف' } ] },
      { key: 'card_shadow', label: 'ظل البطاقة', def: 'auto', values: [ { v: 'auto', l: 'حسب الشكل' }, { v: 'none', l: 'بلا ظل' }, { v: 'lift', l: 'يرتفع عند اللمس' }, { v: 'glow', l: 'توهّج بلون المتجر' } ] },
      { key: 'price_style', label: 'شكل السعر', def: 'bold', values: [ { v: 'bold', l: 'غامق' }, { v: 'accent', l: 'بلون المتجر' }, { v: 'pill', l: 'داخل كبسولة' } ] },
      { key: 'grid_mobile', label: 'ترتيب المنتجات بالجوال', def: 'two', values: [ { v: 'two', l: 'عمودان' }, { v: 'three', l: 'ثلاثة أعمدة مضغوطة' }, { v: 'one', l: 'عمود واحد كبير' } ] },
      { key: 'grid_wide', label: 'عدد الأعمدة بالآيباد واللابتوب', def: 'auto', values: [ { v: 'auto', l: 'تلقائي' }, { v: 'four', l: '4 أعمدة' }, { v: 'five', l: '5 أعمدة' } ] },
      { key: 'card_desc', label: 'سطر الوصف تحت الاسم', def: 'shown', values: [ { v: 'shown', l: 'ظاهر' }, { v: 'hidden', l: 'مخفي' } ] },
      { key: 'card_oldprice', label: 'السعر القديم', def: 'shown', values: [ { v: 'shown', l: 'ظاهر' }, { v: 'hidden', l: 'مخفي' } ] },
      { key: 'card_stock', label: 'شارات المخزون (نفذت/بقي القليل)', def: 'shown', values: [ { v: 'shown', l: 'ظاهرة' }, { v: 'hidden', l: 'مخفية' } ] },
      { key: 'card_wish', label: 'زر المفضلة على البطاقة', def: 'shown', values: [ { v: 'shown', l: 'ظاهر' }, { v: 'hidden', l: 'مخفي' } ] }
    ] },
    { id: 'product', title: 'صفحة المنتج', icon: '📄', options: [
      { key: 'pd_layout', label: 'تخطيط صفحة المنتج', def: 'stack', values: [
        { v: 'stack', l: 'كتلة علوية', d: 'الصورة فوق والتفاصيل تحتها' },
        { v: 'split', l: 'عمودان', d: 'الصورة بجانب التفاصيل بالشاشات الكبيرة' },
        { v: 'immersive', l: 'غامر', d: 'صورة كبيرة ممتدة للحافة' },
        { v: 'compact', l: 'مدمج', d: 'صورة أصغر ومسافات أقل' } ] },
      { key: 'pd_info', label: 'عرض معلومات المنتج (المكوّنات/الاستخدام/التحذيرات)', def: 'stack', values: [
        { v: 'stack', l: 'متتابعة' }, { v: 'tabs', l: 'تبويبات' }, { v: 'accordion', l: 'أكورديون قابل للطي' } ] },
      { key: 'pd_sticky_buy', label: 'شريط الشراء الثابت', def: 'off', values: [ { v: 'off', l: 'معطّل' }, { v: 'on', l: 'ثابت أسفل الشاشة' } ] },
      { key: 'pd_trust', label: 'صف الثقة (أصلي/توصيل/استشارة)', def: 'on', values: [ { v: 'on', l: 'ظاهر' }, { v: 'off', l: 'مخفي' } ] },
      { key: 'pd_share', label: 'زر المشاركة', def: 'on', values: [ { v: 'on', l: 'ظاهر' }, { v: 'off', l: 'مخفي' } ] },
      { key: 'similar_style', label: 'المنتجات ذات الصلة', def: 'grid', values: [ { v: 'grid', l: 'شبكة' }, { v: 'slider', l: 'شريط أفقي' }, { v: 'hidden', l: 'مخفية' } ] }
    ] },
    { id: 'cart', title: 'السلة والنوافذ', icon: '🛒', options: [
      { key: 'cart_free_bar', label: 'شريط «تبقّى لك X للتوصيل المجاني»', def: 'on', values: [ { v: 'on', l: 'ظاهر' }, { v: 'off', l: 'مخفي' } ] },
      { key: 'welcome', label: 'نافذة الترحيب بالزائر الجديد', def: 'on', values: [ { v: 'on', l: 'تظهر' }, { v: 'off', l: 'لا تظهر' } ] }
    ] },
    { id: 'decor', title: 'الزخرفة والأيقونات والأرقام', icon: '🌿', options: [
      { key: 'bg_deco', label: 'زخرفة الخلفية', def: 'none', values: [
        { v: 'none', l: 'بلا' }, { v: 'waves', l: 'موجات' }, { v: 'dots', l: 'نقاط' }, { v: 'leaves', l: 'أوراق' } ] },
      { key: 'icons', label: 'نمط الأيقونات', def: 'line', values: [ { v: 'line', l: 'خطية' }, { v: 'bold', l: 'خطية سميكة' }, { v: 'duo', l: 'ثنائية اللون' } ] },
      { key: 'digits', label: 'الأرقام', def: 'latin', values: [ { v: 'latin', l: 'لاتينية (123)' }, { v: 'arabic', l: 'عربية (١٢٣)' } ] }
    ] },
    { id: 'typo2', title: 'الطباعة والكثافة', icon: '🔠', options: [
      { key: 'font_weight', label: 'وزن النصوص', def: 'regular', values: [ { v: 'regular', l: 'عادي' }, { v: 'medium', l: 'متوسط' }, { v: 'semibold', l: 'ثقيل' } ] },
      { key: 'leading', label: 'تباعد الأسطر', def: 'normal', values: [ { v: 'normal', l: 'عادي' }, { v: 'relaxed', l: 'مريح' } ] },
      { key: 'density', label: 'الكثافة', def: 'normal', values: [ { v: 'normal', l: 'متوسط' }, { v: 'comfy', l: 'مريح' }, { v: 'compact', l: 'مضغوط' } ] },
      { key: 'container', label: 'عرض الحاوية بالشاشات الكبيرة', def: 'normal', values: [ { v: 'normal', l: 'عادي' }, { v: 'narrow', l: 'ضيق' }, { v: 'wide', l: 'عريض' } ] }
    ] },
    { id: 'loader', title: 'شاشة التحميل (ثانيتان)', icon: '⏳', options: [
      { key: 'loader', label: 'شكل شاشة التحميل', def: 'pulse', values: [
        { v: 'pulse', l: 'نبض الشعار', d: 'الشعار يكبر ويصغر بهدوء' },
        { v: 'ring', l: 'حلقة تدور', d: 'حلقة رفيعة تدور حول الشعار' },
        { v: 'bar', l: 'شريط تقدّم', d: 'شريط رفيع يمتلئ تحت الاسم' },
        { v: 'dots', l: 'نقاط قافزة', d: 'ثلاث نقاط تقفز بالتتابع' },
        { v: 'reveal', l: 'ظهور الاسم', d: 'الاسم يظهر حرفاً حرفاً' },
        { v: 'curtain', l: 'ستارة تنفتح', d: 'لوحان ينفتحان عن المتجر' },
        { v: 'none', l: 'بدون شاشة تحميل' } ] }
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
    reem:    { fam: "'Reem Kufi', sans-serif",          q: 'Reem+Kufi:wght@500;600;700' },
    naskh:   { fam: "'Noto Naskh Arabic', serif",       q: 'Noto+Naskh+Arabic:wght@400;500;600;700' },
    changa:  { fam: "'Changa', sans-serif",             q: 'Changa:wght@400;500;600;700;800' },
    baloo:   { fam: "'Baloo Bhaijaan 2', sans-serif",   q: 'Baloo+Bhaijaan+2:wght@400;500;600;700;800' },
    lemonada:{ fam: "'Lemonada', cursive",              q: 'Lemonada:wght@400;500;600;700' },
    elmessiri:{ fam: "'El Messiri', sans-serif",        q: 'El+Messiri:wght@400;500;600;700' },
    lalezar: { fam: "'Lalezar', cursive",               q: 'Lalezar' },
    arefruqaa:{ fam: "'Aref Ruqaa', serif",             q: 'Aref+Ruqaa:wght@400;700' },
    rakkas:  { fam: "'Rakkas', cursive",                q: 'Rakkas' }
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


  // ================= مخطط التصميم الموسّع (كتل الرئيسية + النصوص + المواسم) =================
  // كل الحدود هنا تُولَّد منها نسخة الووركر (gen-worker-design.cjs) فلا يختلف التحقق بين الواجهة والسيرفر.
  // @@SHARED-BEGIN (تُنسخ حرفياً إلى الووركر عبر gen-worker-design.cjs — لا تضيفي هنا اعتماداً على window/document)
  var SOCIAL_HOSTS = { instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com'], tiktok: ['tiktok.com'], youtube: ['youtube.com', 'youtu.be'], snapchat: ['snapchat.com'], whatsapp: ['wa.me'], telegram: ['t.me'] };
  var FOOTER_LINKS = ['categories', 'bundles', 'offers', 'orders', 'account', 'cart'];
  var BLOCK_DEFS = {
    'hero':         { label: 'البنر الرئيسي', styles: [], fields: [] },
    'trust':        { label: 'شريط المميزات', styles: [], fields: ['items'] },
    'categories':   { label: 'شريط الأقسام', styles: [], fields: ['title'] },
    'promo-cards':  { label: 'بطاقتا العروض والبكجات', styles: [], fields: [] },
    'brands':       { label: 'الماركات', styles: [], fields: ['title', 'subtitle'] },
    'best-sellers': { label: 'المنتجات المتوفرة / الأكثر مبيعاً', styles: ['grid', 'slider'], fields: ['title', 'subtitle'] },
    'new-arrivals': { label: 'وصل حديثاً', styles: ['grid', 'slider'], fields: ['title', 'subtitle'] },
    'offers':       { label: 'العروض مع عدّاد تنازلي', styles: ['grid', 'slider'], fields: ['title', 'subtitle', 'endAt'] },
    'bundles':      { label: 'البكجات', styles: ['grid', 'slider'], fields: ['title', 'subtitle'] },
    'story':        { label: 'قصة الصيدلية', styles: ['side', 'center'], fields: ['title', 'text', 'image'] },
    'contact':      { label: 'دعوة للتواصل', styles: ['card', 'bar'], fields: ['title', 'subtitle'] },
    'footer':       { label: 'التذييل', styles: ['simple', 'columns'], fields: ['text', 'links', 'social'] }
  };
  var DEFAULT_BLOCKS = [
    { id: 'hero', on: true }, { id: 'trust', on: true }, { id: 'categories', on: true }, { id: 'promo-cards', on: true },
    { id: 'brands', on: true }, { id: 'best-sellers', on: true },
    { id: 'new-arrivals', on: false }, { id: 'offers', on: false }, { id: 'bundles', on: false },
    { id: 'story', on: false }, { id: 'contact', on: false }, { id: 'footer', on: false }
  ];
  var TRUST_DEFAULT = [ { t: 'منتجات أصلية', s: 'مضمونة 100%' }, { t: 'توصيل سريع', s: 'لباب بيتك' }, { t: 'استشارة مجانية', s: 'مع الصيدلي' }, { t: 'عناية بتفاصيلك', s: 'اختيار موثوق' } ];
  var LIMITS = { blocks: 12, title: 40, subtitle: 80, text: 400, itemT: 24, itemS: 30, items: 4, links: 6, copy: 60, copyKeys: 40, imageUrl: 300 };

  // نصوص قابلة للتحرير. d = الافتراضي (مؤنث). n/m = صيغة المخاطبة المحايدة/المذكرة عند اختلافها.
  var COPY_DEFS = {
    brands_title:   { label: 'عنوان الماركات', d: 'أشهر الماركات' },
    products_title: { label: 'عنوان المنتجات', d: 'المنتجات المتوفرة' },
    newarr_title:   { label: 'عنوان «وصل حديثاً»', d: 'وصل حديثاً' },
    offers_title:   { label: 'عنوان العروض', d: 'عروض لفترة محدودة' },
    bundles_title:  { label: 'عنوان البكجات', d: 'بكجات التوفير' },
    see_all:        { label: 'رابط «عرض الكل»', d: 'عرض الكل ›' },
    promo_b_title:  { label: 'بطاقة البكجات: العنوان', d: 'بكجات مميزة' },
    promo_b_sub:    { label: 'بطاقة البكجات: الوصف', d: 'توفير أكثر.. عناية أكمل' },
    promo_b_btn:    { label: 'بطاقة البكجات: الزر', d: 'اكتشف البكجات ←', n: 'اكتشف البكجات ←', m: 'اكتشف البكجات ←' },
    promo_o_title:  { label: 'بطاقة العروض: العنوان', d: 'عروض خاصة' },
    promo_o_sub:    { label: 'بطاقة العروض: الوصف', d: 'على أفضل المنتجات' },
    promo_o_btn:    { label: 'بطاقة العروض: الزر', d: 'تسوق الآن ←' },
    add_to_cart:    { label: 'زر الإضافة بصفحة المنتج', d: 'أضف إلى السلة' },
    contact_btn:    { label: 'زر التواصل', d: 'تواصلي معنا', n: 'تواصل معنا', m: 'تواصل معنا' },
    search_ph:      { label: 'نص حقل البحث', d: 'إبحث عن منتج، ماركة أو قسم...' },
    cart_title:     { label: 'عنوان السلة', d: 'سلة المشتريات' },
    tagline:        { label: 'العبارة تحت اسم المتجر (للشكل ذي المستطيل)', d: '' }
  };
  var VOICES = ['f', 'n', 'm'];

  // ---------- أدوات تنقية (نقية بلا اعتماد خارجي: تُنسخ كما هي إلى الووركر) ----------
  function dsText(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f<>`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function dsHttpsHost(url, hosts) {
    if (typeof url !== 'string' || url.length > 300) return '';
    var m = /^https:\/\/([a-z0-9.-]+)(\/[A-Za-z0-9._~:\/?#@!$&()*+,;=%-]*)?$/i.exec(url.trim());
    if (!m) return '';
    var h = m[1].toLowerCase().replace(/^www\./, '');
    for (var i = 0; i < hosts.length; i++) { if (h === hosts[i] || h.slice(-(hosts[i].length + 1)) === '.' + hosts[i]) return url.trim(); }
    return '';
  }
  function dsImageUrl(url) {
    if (typeof url !== 'string' || url.length > 300) return '';
    return /^https:\/\/[a-z0-9.-]+\/api\/images\/pharmacy_[A-Za-z0-9_.%-]+\.(jpg|png|webp)$/i.test(url.trim()) ? url.trim() : '';
  }
  function dsIso(v) {
    if (typeof v !== 'string') return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v.trim());
    if (!m) return '';
    var mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var hh = m[4] === undefined ? 23 : +m[4], mm = m[5] === undefined ? 59 : +m[5];
    if (hh > 23 || mm > 59) return '';
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function dsDate(v) { var x = dsIso(v); return x ? x.slice(0, 10) : ''; }

  function normalizeOneBlock(b) {
    var defs = BLOCK_DEFS, L = LIMITS;
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !defs.hasOwnProperty(b.id)) return null;
    var def = defs[b.id], f = def.fields, o = { id: b.id, on: !(b.on === false || b.on === 'false') };
    if (def.styles.length) o.style = def.styles.indexOf(b.style) !== -1 ? b.style : def.styles[0];
    if (f.indexOf('title') !== -1) o.title = dsText(b.title, L.title);
    if (f.indexOf('subtitle') !== -1) o.subtitle = dsText(b.subtitle, L.subtitle);
    if (f.indexOf('text') !== -1) o.text = dsText(b.text, L.text);
    if (f.indexOf('image') !== -1) o.image = dsImageUrl(b.image);
    if (f.indexOf('endAt') !== -1) o.endAt = dsIso(b.endAt);
    if (f.indexOf('items') !== -1) {
      var items = [];
      (Array.isArray(b.items) ? b.items.slice(0, L.items) : []).forEach(function (it) {
        if (it && typeof it === 'object') items.push({ t: dsText(it.t, L.itemT), s: dsText(it.s, L.itemS) });
      });
      while (items.length < L.items) items.push({ t: '', s: '' });
      o.items = items.map(function (it, i) { return it.t ? it : { t: TRUST_DEFAULT[i].t, s: TRUST_DEFAULT[i].s }; });
    }
    if (f.indexOf('links') !== -1) {
      var links = [], ls = {};
      (Array.isArray(b.links) ? b.links : []).forEach(function (k) { if (FOOTER_LINKS.indexOf(k) !== -1 && !ls[k] && links.length < L.links) { ls[k] = 1; links.push(k); } });
      o.links = links;
    }
    if (f.indexOf('social') !== -1) {
      var soc = {}, src = (b.social && typeof b.social === 'object') ? b.social : {};
      Object.keys(SOCIAL_HOSTS).forEach(function (k) { var u = dsHttpsHost(src[k], SOCIAL_HOSTS[k]); if (u) soc[k] = u; });
      o.social = soc;
    }
    return o;
  }
  function normalizeHomeBlocks(raw) {
    var out = [], seen = {};
    (Array.isArray(raw) ? raw.slice(0, LIMITS.blocks) : []).forEach(function (b) {
      var o = normalizeOneBlock(b);
      if (o && !seen[o.id]) { seen[o.id] = 1; out.push(o); }
    });
    // أي كتلة معروفة غير مذكورة تُضاف بقيمتها الافتراضية بنهاية القائمة (تبقى القائمة كاملة دوماً)
    DEFAULT_BLOCKS.forEach(function (d) {
      if (!seen[d.id]) { seen[d.id] = 1; out.push(normalizeOneBlock({ id: d.id, on: d.on })); }
    });
    return out.slice(0, LIMITS.blocks);
  }
  function defaultHomeBlocks() { return normalizeHomeBlocks(DEFAULT_BLOCKS.map(function (d) { return { id: d.id, on: d.on }; })); }

  function normalizeCopy(raw) {
    var out = {}, src = (raw && typeof raw === 'object') ? raw : {}, n = 0;
    Object.keys(COPY_DEFS).forEach(function (k) {
      if (n >= LIMITS.copyKeys) return;
      var v = dsText(src[k], LIMITS.copy);
      if (v) { out[k] = v; n++; }
    });
    var voice = VOICES.indexOf(src.voice) !== -1 ? src.voice : 'f';
    out.voice = voice;
    return out;
  }
  function copyText(copy, key) {
    var def = COPY_DEFS[key]; if (!def) return '';
    var c = copy || {};
    if (c[key]) return c[key];
    var v = c.voice === 'n' ? (def.n || def.d) : (c.voice === 'm' ? (def.m || def.d) : def.d);
    return v;
  }


  // ================= نظام بناء منطقة التعريف (Hero Builder): تكوينات مستقلة + عناصر قابلة للإضافة والترتيب =================
  // كل القيم من قوائم مسموحة أو ألوان HEX أو نصوص قصيرة منقّاة أو صور رفعتها الصيدلية نفسها. لا HTML ولا CSS ولا روابط عشوائية.
  var HERO_MODES = ['classic', 'overlay', 'split', 'brand', 'editorial', 'cards', 'slides', 'minimal'];
  var HERO_ENUM = {
    fit: ['cover', 'contain'], ratio: ['wide', 'square', 'portrait', 'tall'], pos: ['start', 'center', 'end'], side: ['start', 'end'],
    size: ['compact', 'standard', 'tall', 'immersive'], radius: ['sharp', 'soft', 'round', 'pill'], overlay: ['none', 'soft', 'dark', 'brand'],
    gap: ['s', 'm', 'l'], shadow: ['none', 'soft', 'lift'], card: ['on', 'off'], elsize: ['s', 'm', 'l', 'xl'], stage: ['s', 'm', 'l']
  };
  var HERO_EL_TYPES = ['logo', 'title', 'subtitle', 'text', 'button', 'badge', 'icon', 'divider', 'spacer', 'image'];
  var HERO_GO = ['listing', 'offers', 'bundles', 'categories', 'new', 'none'];
  var HERO_ICONS = ['✦', '❀', '✿', '❋', '♡', '★', '☘', '☾', '✚', '✔', '❖', '✧'];
  var HERO_EL_MAX = { title: 80, subtitle: 100, text: 280, button: 24, badge: 30 };
  var HERO_LIMITS = { els: 12, slides: 6, cards: 5 };

  function heroEnum(v, key, def) { var a = HERO_ENUM[key]; return (typeof v === 'string' && a.indexOf(v) !== -1) ? v : def; }
  function heroHex(v) { return (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) ? v.toUpperCase() : ''; }
  function heroGo(v) { return HERO_GO.indexOf(v) !== -1 ? v : 'listing'; }

  function normalizeHeroEl(e) {
    if (!e || typeof e !== 'object' || HERO_EL_TYPES.indexOf(e.t) === -1) return null;
    var o = { t: e.t };
    if (HERO_EL_MAX[e.t]) o.x = dsText(e.x, HERO_EL_MAX[e.t]);
    if (e.t === 'icon') o.x = HERO_ICONS.indexOf(e.x) !== -1 ? e.x : HERO_ICONS[0];
    if (e.t === 'logo' || e.t === 'image') o.u = dsImageUrl(e.u);
    o.s = heroEnum(e.s, 'elsize', 'm');
    o.a = (e.a === 'start' || e.a === 'center' || e.a === 'end') ? e.a : '';
    o.c = heroHex(e.c);
    o.v = (e.v === 'm' || e.v === 'd') ? e.v : 'b';
    o.sp = heroEnum(e.sp, 'gap', 'm');
    if (e.t === 'button') { o.go = heroGo(e.go); o.st = ['fill', 'outline', 'text'].indexOf(e.st) !== -1 ? e.st : 'fill'; }
    if (e.t === 'badge') o.st = ['soft', 'solid', 'outline'].indexOf(e.st) !== -1 ? e.st : 'soft';
    if (e.t === 'divider') o.st = ['line', 'dots', 'leaf', 'vline'].indexOf(e.st) !== -1 ? e.st : 'line';
    return o;
  }
  function normalizeHeroSlide(c) {
    if (!c || typeof c !== 'object') return null;
    return { img: dsImageUrl(c.img), t: dsText(c.t, 60), x: dsText(c.x, 160), b: dsText(c.b, 24), go: heroGo(c.go), bg: heroHex(c.bg), ink: heroHex(c.ink), logo: c.logo === true };
  }
  function normalizeHeroCard(c) {
    if (!c || typeof c !== 'object') return null;
    return { img: dsImageUrl(c.img), t: dsText(c.t, 40), x: dsText(c.x, 100), b: dsText(c.b, 24), go: heroGo(c.go), bg: heroHex(c.bg), big: c.big === true };
  }
  function heroList(raw, fn, max) {
    if (!Array.isArray(raw)) return null;
    var out = [];
    raw.slice(0, max).forEach(function (x) { var o = fn(x); if (o) out.push(o); });
    return out;
  }
  // يرجع null إن لم يُرسَل تصميم؛ وإلا كائناً كاملاً دائماً (القيم الناقصة تأخذ الافتراضي). els/slides/cards = null تعني «استخدمي الافتراضي».
  function normalizeHeroDesign(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var o = { mode: HERO_MODES.indexOf(raw.mode) !== -1 ? raw.mode : 'classic' };
    o.bg = heroHex(raw.bg); o.bg2 = heroHex(raw.bg2); o.ink = heroHex(raw.ink); o.accent = heroHex(raw.accent);
    o.img = dsImageUrl(raw.img); o.img2 = dsImageUrl(raw.img2); o.img3 = dsImageUrl(raw.img3);
    o.fit = heroEnum(raw.fit, 'fit', 'cover'); o.ratio = heroEnum(raw.ratio, 'ratio', 'wide');
    o.pos = heroEnum(raw.pos, 'pos', 'start'); o.side = heroEnum(raw.side, 'side', 'start');
    o.size = heroEnum(raw.size, 'size', 'standard'); o.radius = heroEnum(raw.radius, 'radius', 'round');
    o.overlay = heroEnum(raw.overlay, 'overlay', 'soft');
    var ovl = parseInt(raw.ovl, 10); o.ovl = (isFinite(ovl) && ovl >= 0 && ovl <= 80) ? ovl : 35;
    o.gap = heroEnum(raw.gap, 'gap', 'm'); o.shadow = heroEnum(raw.shadow, 'shadow', 'soft'); o.card = heroEnum(raw.card, 'card', 'on');
    o.stage = heroEnum(raw.stage, 'stage', 'm');
    o.els = heroList(raw.els, normalizeHeroEl, HERO_LIMITS.els);
    o.slides = heroList(raw.slides, normalizeHeroSlide, HERO_LIMITS.slides);
    o.cards = heroList(raw.cards, normalizeHeroCard, HERO_LIMITS.cards);
    return o;
  }
  // العناصر الافتراضية لكل تكوين (نقطة بداية فقط: الأدمن يضيف ويحذف ويعيد الترتيب كما يشاء). x فارغ = يُؤخذ نص المتجر الحالي.
  function heroDefaultEls(mode) {
    var E = function (t, extra) { return normalizeHeroEl(Object.assign({ t: t }, extra || {})); };
    switch (mode) {
      case 'overlay': return [E('title', { s: 'xl' }), E('subtitle'), E('button')];
      case 'split': return [E('badge', { x: 'عناية تستحقينها' }), E('title', { s: 'l' }), E('text'), E('button')];
      case 'brand': return [E('logo', { s: 'xl', a: 'center' }), E('badge', { x: 'عناية تستحقينها', a: 'start' }), E('title', { s: 'xl', x: 'عنايتكِ تبدأ من *اسم المتجر*' }), E('text'), E('button')];
      case 'editorial': return [E('badge', { x: 'مختارات الموسم' }), E('title', { s: 'xl' }), E('divider', { st: 'vline' }), E('text'), E('button', { st: 'outline' })];
      case 'minimal': return [E('logo', { s: 's', a: 'center' }), E('title', { s: 'l', a: 'center' }), E('text', { a: 'center' }), E('button', { a: 'center' })];
      case 'cards': case 'slides': return [];
      default: return [E('title'), E('subtitle'), E('button')];
    }
  }

  // @@SHARED-END

  // ================= ترحيل القوالب القديمة إلى خيارات التصميم =================
  // القوالب القديمة (boutique/clinic/market) ترسم HTML مخصصاً للبطاقات والترويسة لا يمكن نسخه حرفياً بخيارات؛
  // لذلك الترحيل تقريبي للروح العامة (ترتيب الرئيسية + استدارة + خطوط + بطاقة/تنقل قريبان) ويبقى المالك يضبطه ثم ينشره.
  // لا يُنفَّذ تلقائياً: يُعرض بالاستوديو كنقطة بداية (بالذاكرة فقط) ولا يُحفظ شيء إلا بزر «نشر».
  var TEMPLATE_MIGRATION = {
    'template_default': { order: ['hero', 'promo-cards', 'brands', 'best-sellers'], look: {} },
    'template-one':     { order: ['hero', 'promo-cards', 'brands', 'best-sellers'], look: {} },
    'template-two':     { order: ['hero', 'promo-cards', 'brands', 'best-sellers'], look: {} },
    'boutique': { order: ['hero', 'brands', 'best-sellers', 'promo-cards'], primary: '#B76E79', look: { radius: 'soft', font_head: 'amiri', title: 'center', card: 'soft', btn_fill: 'solid', nav: 'dock' } },
    'clinic':   { order: ['hero', 'promo-cards', 'best-sellers', 'brands'], primary: '#0284C7', look: { radius: 'soft', trust: 'flat', btn_fill: 'solid', btn_shape: 'rounded', nav: 'flat' } },
    'market':   { order: ['hero', 'promo-cards', 'best-sellers', 'brands'], primary: '#E11D48', look: { radius: 'soft', card: 'outline', cats_home: 'tile', btn_shape: 'rounded', nav: 'flat', header: 'bar' } }
  };
  var RADIUS_MAP = { sm: 'soft', md: 'round', lg: 'round' };
  function migrateFromTemplate(profile) {
    var p = profile || {}, m = TEMPLATE_MIGRATION[p.templateId] || TEMPLATE_MIGRATION['template_default'];
    var d = (p.design && typeof p.design === 'object') ? p.design : {};
    var order = (d.home && Array.isArray(d.home.order) && d.home.order.length ? d.home.order : m.order).filter(function (id) { return ['hero', 'promo-cards', 'brands', 'best-sellers'].indexOf(id) !== -1; });
    ['hero', 'promo-cards', 'brands', 'best-sellers'].forEach(function (id) { if (order.indexOf(id) === -1) order.push(id); });
    var hidden = (d.home && Array.isArray(d.home.hidden)) ? d.home.hidden : [];
    var seq = [];
    order.forEach(function (id) { seq.push(id); if (id === 'hero') { seq.push('trust'); seq.push('categories'); } });
    var look = Object.assign({}, m.look);
    if (d.shapes && RADIUS_MAP[d.shapes.radius]) look.radius = RADIUS_MAP[d.shapes.radius];
    if (d.fonts && d.fonts.body && ALLOWED.font_body.indexOf(d.fonts.body) !== -1) look.font_body = d.fonts.body;
    if (d.fonts && d.fonts.heading && ALLOWED.font_head.indexOf(d.fonts.heading) !== -1) look.font_head = d.fonts.heading;
    var colors = {};
    if (!/^#[0-9A-Fa-f]{6}$/.test(p.primaryColor || '')) { var pc = (d.colors && d.colors.primary) || m.primary; if (/^#[0-9A-Fa-f]{6}$/.test(pc || '')) colors.primaryColor = pc; }
    return { homeBlocks: normalizeHomeBlocks(seq.map(function (id) { return { id: id, on: hidden.indexOf(id) === -1 }; })), look: normalizeLook(look), colors: colors };
  }


  // التصميم الفعّال: ما حفظته المالكة (look + ألوان + نصوص + كتل)
  function effectiveDesign(profile) {
    var p = profile || {};
    var look = normalizeLook(p.look), colors = {};
    ['primaryColor', 'pageBgColor', 'cardColor', 'secondaryColor', 'textColor'].forEach(function (k) { if (/^#[0-9A-Fa-f]{6}$/.test(p[k] || '')) colors[k] = p[k]; });
    return { look: look, colors: colors, copy: normalizeCopy(p.copy), blocks: normalizeHomeBlocks(p.homeBlocks), hero: normalizeHeroDesign(p.heroDesign) };
  }

  var api = { GROUPS: G, FONTS: FONTS, DEFAULTS: DEFAULTS, ALLOWED: ALLOWED, normalizeLook: normalizeLook, fontsUrl: fontsUrl,
    BLOCK_DEFS: BLOCK_DEFS, DEFAULT_BLOCKS: DEFAULT_BLOCKS, TRUST_DEFAULT: TRUST_DEFAULT, LIMITS: LIMITS, COPY_DEFS: COPY_DEFS, VOICES: VOICES,
    SOCIAL_HOSTS: SOCIAL_HOSTS, FOOTER_LINKS: FOOTER_LINKS,
    normalizeHomeBlocks: normalizeHomeBlocks, defaultHomeBlocks: defaultHomeBlocks, normalizeCopy: normalizeCopy, copyText: copyText,
    migrateFromTemplate: migrateFromTemplate, TEMPLATE_MIGRATION: TEMPLATE_MIGRATION, safeHttpsHost: dsHttpsHost, safeImageUrl: dsImageUrl, effectiveDesign: effectiveDesign, sanitizeText: dsText,
    HERO_MODES: HERO_MODES, HERO_ENUM: HERO_ENUM, HERO_EL_TYPES: HERO_EL_TYPES, HERO_GO: HERO_GO, HERO_ICONS: HERO_ICONS, HERO_LIMITS: HERO_LIMITS, HERO_EL_MAX: HERO_EL_MAX,
    normalizeHeroDesign: normalizeHeroDesign, normalizeHeroEl: normalizeHeroEl, heroDefaultEls: heroDefaultEls };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LookRegistry = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
