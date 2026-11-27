// فحوص نظام بناء منطقة التعريف (Hero Builder): التنقية، التوافق الخلفي، وتطابق الووركر مع المصدر المشترك
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const t = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('look-registry.js', 'utf8'), ctx);
const R = ctx.LookRegistry;
const IMG = 'https://api.example.com/api/images/pharmacy_x_1.webp';

t('بدون heroDesign: يرجع null (الهيرو القديم كما هو)', R.normalizeHeroDesign(undefined) === null && R.normalizeHeroDesign('x') === null && R.normalizeHeroDesign([]) === null);
t('mode غير معروف يصير classic', R.normalizeHeroDesign({ mode: 'evil' }).mode === 'classic');
t('كل التكوينات الثمانية مقبولة', R.HERO_MODES.length === 8 && R.HERO_MODES.every(m => R.normalizeHeroDesign({ mode: m }).mode === m));
const x = R.normalizeHeroDesign({ mode: 'brand', els: [{ t: 'title', x: '<img src=x onerror=alert(1)>`\\مرحبا', c: 'red' }, { t: 'logo', u: 'javascript:alert(1)' }, { t: 'image', u: 'https://evil.com/a.png' }, { t: 'logo', u: IMG }, { t: 'script' }, null, { t: 'button', go: 'http://evil.com' }] });
t('النصوص تُنقّى من < > ` \\', !/[<>`\\]/.test(x.els[0].x));
t('لون غير HEX يُمسح', x.els[0].c === '');
t('روابط الصور: javascript: وخارجية ترفض، صور الصيدلية فقط تقبل', x.els[1].u === '' && x.els[2].u === '' && x.els[3].u === IMG);
t('عنصر غير معروف ومدخل null يُحذفان', x.els.length === 5 && x.els.every(e => R.HERO_EL_TYPES.includes(e.t)));
t('وجهة الزر من قائمة مسموحة فقط', x.els[4].go === 'listing');
const big = R.normalizeHeroDesign({ mode: 'slides', els: Array(50).fill({ t: 'spacer' }), slides: Array(50).fill({ t: 'x' }), cards: Array(50).fill({ t: 'x' }), ovl: 9999, bg: 'url(x)', radius: 'big' });
t('الحدود القصوى: 12 عنصراً و6 شرائح و5 بطاقات', big.els.length === 12 && big.slides.length === 6 && big.cards.length === 5);
t('ovl خارج النطاق ولون غير صالح وقيمة غير مسموحة تأخذ الافتراضي', big.ovl === 35 && big.bg === '' && big.radius === 'round');
t('els غير موجودة = null (يُستخدم الافتراضي)', R.normalizeHeroDesign({ mode: 'overlay' }).els === null);
t('لا مفاتيح زائدة تتسرب', Object.keys(R.normalizeHeroDesign({ mode: 'minimal', __proto__x: 1, evil: 'x', constructor: 'y' })).every(k => ['mode','bg','bg2','ink','accent','img','img2','img3','fit','ratio','pos','side','size','radius','overlay','ovl','gap','shadow','card','stage','els','slides','cards'].includes(k)));
t('عناصر افتراضية لكل تكوين تمر من المنقّي', R.HERO_MODES.every(m => R.heroDefaultEls(m).every(e => e && R.HERO_EL_TYPES.includes(e.t))));
t('الإعدادات القديمة (look/homeBlocks/copy) لم تتأثر', Object.keys(R.normalizeLook({})).length >= 50 && R.normalizeHomeBlocks([]).length === 12);

// عرض المنتجات لكل قسم (الكتل)
const bl = R.normalizeHomeBlocks([{ id: 'best-sellers', style: 'bento', colsM: '3', colsD: '6', gap: 'l', ratio: 'portrait' }, { id: 'new-arrivals', style: 'masonry', colsM: '9', colsD: 'x', gap: '<b>', ratio: 'evil' }, { id: 'offers', style: 'nope' }, { id: 'bundles', style: 'slider', colsM: '2' }]);
const byId = id => bl.find(b => b.id === id);
t('تخطيطات المنتجات الجديدة مقبولة وبقيمها', byId('best-sellers').style === 'bento' && byId('best-sellers').colsM === '3' && byId('best-sellers').colsD === '6' && byId('best-sellers').gap === 'l' && byId('best-sellers').ratio === 'portrait');
t('قيم الأعمدة/المسافة/النسبة غير الصالحة ترجع للتلقائي', byId('new-arrivals').colsM === '0' && byId('new-arrivals').colsD === '0' && byId('new-arrivals').gap === 'auto' && byId('new-arrivals').ratio === 'auto');
t('تخطيط غير معروف يرجع للشبكة (توافق خلفي)', byId('offers').style === 'grid');
t('كتلة البكجات لا تتأثر بحقول المنتجات', byId('bundles').style === 'slider' && byId('bundles').colsM === undefined);
t('كتل قديمة بلا حقول جديدة تأخذ القيم الافتراضية', R.normalizeHomeBlocks([{ id: 'best-sellers', style: 'slider' }])[0].colsM === '0' && R.normalizeHomeBlocks([])[5].gap === 'auto');
const css = fs.readFileSync('section-layouts.css', 'utf8');
t('section-layouts.css يغطي كل تخطيطات المنتجات', ['list', 'compact', 'bento', 'masonry', 'showcase'].every(n => css.includes('ds-lay-' + n)));
t('index.html يربط section-layouts.css', /section-layouts\.css/.test(fs.readFileSync('index.html', 'utf8')));
t('الشاشة الأولية: المدة من إعداد مركزي واحد 3500ms', /SPLASH_MIN_MS: 3500/.test(fs.readFileSync('app-config.js', 'utf8')) && !/3500/.test(fs.readFileSync('style.css', 'utf8')) && /app-config\.js/.test(fs.readFileSync('index.html', 'utf8')));

// الووركر يطابق المصدر المشترك ويحفظ heroDesign
const worker = fs.existsSync('/home/claude/final/worker.js') ? fs.readFileSync('/home/claude/final/worker.js', 'utf8') : '';
if (worker) {
  t('الووركر يحوي normalizeHeroDesign وحفظ heroDesign', /function normalizeHeroDesign/.test(worker) && /fields\.heroDesign = heroDesign/.test(worker));
  t('الووركر ما زال يحوي حزمة التقوية 7.9.0', /Version: 7\.9\.0/.test(worker) && /routeManifest/.test(worker));
}
const rules = fs.existsSync('/home/claude/final/firestore-9.rules') ? fs.readFileSync('/home/claude/final/firestore-9.rules', 'utf8') : '';
if (rules) t('قواعد Firestore تمنع المالك من كتابة heroDesign مباشرة', /'copy', 'heroDesign'\]/.test(rules));
const html = fs.readFileSync('index.html', 'utf8');
t('index.html يحمّل hero-design.css و hero-design.js', /hero-design\.css/.test(html) && /hero-design\.js/.test(html));
console.log(`\nالنتيجة: ${pass} نجح | ${fail} فشل`); process.exit(fail ? 1 : 0);
