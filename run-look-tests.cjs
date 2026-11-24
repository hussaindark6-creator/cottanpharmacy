/* run-look-tests.cjs — اختبارات نظام الخيارات (Look): السجل ↔ CSS ↔ الووركر ↔ الأدمن ↔ البناء */
const fs = require('fs'), vm = require('vm'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const ctx = {}; vm.createContext(ctx); vm.runInContext(read('look-registry.js'), ctx);
const R = ctx.LookRegistry;
ok(R && Object.keys(R.DEFAULTS).length >= 20, 'السجل يحمّل ويضم 20 خياراً على الأقل');

// التنقية
const dirty = R.normalizeLook({ nav: 'dock', card: '"><script>', header: 123, __proto__: { x: 1 }, evil: 'x' });
ok(dirty.nav === 'dock', 'قيمة صالحة تُقبل');
ok(dirty.card === R.DEFAULTS.card && dirty.header === R.DEFAULTS.header, 'قيمة خبيثة/غير نصية تُستبدل بالافتراضي');
ok(!('evil' in dirty), 'مفاتيح غير معروفة تُهمَل');
ok(R.normalizeLook(null).nav === R.DEFAULTS.nav, 'null ينتج افتراضيات كاملة');
const fonts = R.fontsUrl(R.normalizeLook({ font_body: 'tajawal', font_head: 'amiri' }));
ok(/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(fonts) && !/[<>"' ]/.test(fonts), 'رابط الخطوط ثابت من السجل ونظيف');

// كل قيمة غير افتراضية لها CSS
const css = read('style.css');
const exempt = new Set(['font_body', 'font_head']);
// خيارات يطبّقها JS لا CSS: نتحقق أن الملف المسؤول يقرأ خاصية data-lk الخاصة بها
const JS_DRIVEN = { pd_info: 'design-system.js', digits: 'design-system.js', welcome: 'storefront.js' };
for (const [k, f] of Object.entries(JS_DRIVEN)) { exempt.add(k); ok(read(f).includes('data-lk-' + k.replace(/_/g, '-')), `الخيار ${k} يقرؤه ${f}`); }
const missing = [];
for (const g of R.GROUPS) for (const o of g.options) {
  if (exempt.has(o.key)) continue;
  for (const v of o.values) {
    if (v.v === o.def) continue;
    const sel = `data-lk-${o.key.replace(/_/g, '-')}="${v.v}"`;
    if (!css.includes(sel)) missing.push(sel);
  }
}
ok(missing.length === 0, 'كل خيار غير افتراضي في السجل له قاعدة CSS' + (missing.length ? ' — ناقص: ' + missing.join(' | ') : ''));

// الووركر (إن وُجد بجانب المشروع) يطابق السجل
const wp = ['worker.js', '../worker.js'].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));
if (wp) {
  const w = fs.readFileSync(wp, 'utf8');
  const m = w.match(/const DESIGN_LOOK_ALLOWED = (\{[\s\S]*?\n\});/);
  let table = null; try { table = JSON.parse(m[1]); } catch (e) { /* */ }
  ok(!!table && JSON.stringify(table) === JSON.stringify(R.ALLOWED), 'جدول القيم المسموحة بالووركر مطابق للسجل');
  ok(/\/api\/admin\/look\/save/.test(w), 'مسار حفظ التصميم مسجَّل بالووركر');
} else { console.log('SKIP worker.js غير موجود بجانب المشروع'); }

// الأدمن والبناء
const admin = read('admin.html'), vite = read('vite.config.js'), core = read('admin-core.js');
ok(/id="adminSecStudio"/.test(admin) && /id="btnTabVStudio"/.test(admin), 'تبويب وقسم استوديو التصميم موجودان');
ok(/admin-studio\.js/.test(admin) && /look-registry\.js/.test(admin), 'الأدمن يحمّل السجل وسكربت الاستوديو');
ok(/'Studio'/.test(core), 'قسم Studio مسجَّل بمبدّل الأقسام');
for (const f of ['look-registry.js', 'admin-studio.js', 'admin-calm.js']) ok(vite.includes(f), `${f} مسجَّل بقائمة الملفات الكلاسيكية لـ vite (وإلا لن يُنسخ للنشر)`);
ok(/look-registry\.js/.test(read('index.html')), 'المتجر يحمّل السجل');


// ================= نظام التصميم v2: كتل/نصوص/مواسم/ووركر =================
const bad = R.normalizeHomeBlocks([
  { id: 'story', on: true, text: '<img src=x onerror=alert(1)>مرحبا', image: 'https://evil.com/a.png', title: 'x'.repeat(500) },
  { id: 'footer', links: ['cart', 'javascript:1', 'cart'], social: { instagram: 'https://instagram.com/p', facebook: 'https://evil.com/fb', tiktok: 'javascript:alert(1)', youtube: 'http://youtube.com/x' } },
  { id: 'offers', endAt: '2026-13-40T99:99' }, { id: '__proto__' }, { id: 'hero', on: 'false' }, null, 5
]);
const byId = Object.fromEntries(bad.map(b => [b.id, b]));
ok(!/[<>]/.test(byId.story.text) && byId.story.title.length === R.LIMITS.title, 'نص القصة ينقّى من الوسوم ويُقصّ بالحد');
ok(byId.story.image === '', 'صورة القصة من دومين غريب مرفوضة');
ok(byId.footer.links.length === 1 && byId.footer.links[0] === 'cart', 'روابط التذييل من قائمة مسموحة وبلا تكرار');
ok(JSON.stringify(Object.keys(byId.footer.social)) === '["instagram"]', 'روابط اجتماعية: https وبدومين مسموح فقط');
ok(byId.offers.endAt === '', 'تاريخ غير صالح يُرفض');
ok(byId.hero.on === false, 'قيمة on النصية false تُقرأ كإيقاف');
ok(bad.length === R.LIMITS.blocks && new Set(bad.map(b => b.id)).size === bad.length, 'القائمة كاملة (12 كتلة) بلا تكرار ولا معرّفات غريبة');
ok(R.normalizeHomeBlocks(null).every(b => b.id in R.BLOCK_DEFS), 'null ينتج الكتل الافتراضية');
const dflt = R.defaultHomeBlocks().filter(b => b.on).map(b => b.id).join();
ok(dflt === 'hero,trust,categories,promo-cards,brands,best-sellers', 'الافتراضي = ترتيب الرئيسية الحالي (الكتل الجديدة مطفأة)');
const cp = R.normalizeCopy({ brands_title: '<b>ماركاتنا</b>', evil_key: 'x', voice: 'zzz', see_all: 'y'.repeat(200) });
ok(!/[<>]/.test(cp.brands_title) && cp.brands_title.includes('ماركاتنا'), 'النصوص تُنقّى من الوسوم');
ok(!('evil_key' in cp) && cp.voice === 'f' && cp.see_all.length === R.LIMITS.copy, 'مفاتيح غريبة تُهمل والصيغة الافتراضية مؤنث والطول محدود');
ok(R.copyText({ voice: 'm' }, 'contact_btn') === 'تواصل معنا' && R.copyText({}, 'contact_btn') === 'تواصلي معنا', 'صيغة المخاطبة تغيّر الافتراضي فقط');
ok(R.copyText({ brands_title: 'ماركاتنا' }, 'brands_title') === 'ماركاتنا', 'نص المالك يغلب الافتراضي');
ok(R.effectiveDesign({ primaryColor: '#112233', look: { nav: 'dock' } }).colors.primaryColor === '#112233', 'التصميم الفعّال يحفظ ألوان المالكة');

// مقطع الووركر المولَّد
const gen = require('./gen-worker-design.cjs');
const region = gen.buildRegion();
const fixture = 'export default {};\nconst x = 1;\n// ================= 🎛️ نظام الخيارات (Look): حفظ تصميم الصيدلية =================\nOLD REGION\n// POST /api/admin/orders/status (مشرف)\nasync function routeAdminOrdersStatus(){}\n';
const patched = gen.applyTo(fixture);
ok(patched.includes('DESIGN_LOOK_ALLOWED') && !patched.includes('OLD REGION') && patched.includes('routeAdminOrdersStatus'), 'التطبيق يستبدل المقطع القديم ويُبقي ما بعده');
ok(gen.applyTo(patched) === patched, 'التطبيق متكرر بلا أي تغيير (idempotent)');
const wtable = JSON.parse(region.match(/const DESIGN_LOOK_ALLOWED = (\{[\s\S]*?\n\});/)[1]);
ok(JSON.stringify(wtable) === JSON.stringify(R.ALLOWED), 'جدول الووركر المولَّد مطابق للسجل');


// ================= استوديو الأدمن (منطق بلا DOM) =================
{
  const sctx = { setTimeout: () => 0, clearTimeout: () => {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, window: { LookRegistry: R }, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {}, body: { classList: { toggle: () => {}, remove: () => {} } } }, console, pharmacyProfile: { primaryColor: '#FFE4EC' }, location: { origin: 'x' } };
  sctx.window.window = sctx.window; vm.createContext(sctx); vm.runInContext(read('admin-studio.js'), sctx); vm.runInContext(read('admin-studio-hero.js'), sctx);
  const ev = (c) => vm.runInContext(c, sctx);
  const h1 = ev('stuComputeHealth()');
  ok(h1.items.some(i => i.level === 'bad' && /تباين/.test(i.text)) && h1.score < 100, 'درجة الصحة: لون أساسي فاتح جداً يُحذَّر منه');
  ev("pharmacyProfile = { primaryColor: '#B3365C' }");
  const h2 = ev('stuComputeHealth()');
  ok(!h2.items.some(i => i.level === 'bad') && h2.score >= 90, 'درجة الصحة: لون داكن كافٍ يعطي درجة عالية');
  ev("stuLook.motion = 'full'; stuLook.bg_deco = 'dots'; stuLook.hero_size = 'immersive'; stuLook.density = 'compact'; stuLook.font_size = 's'");
  const h3 = ev('stuComputeHealth()');
  ok(h3.items.filter(i => i.level === 'warn').length >= 2 && h3.score < h2.score, 'درجة الصحة: تحذيرات الحركة الثقيلة والكثافة مع الخط الصغير');
  ok(/data-act="bon"/.test(ev('stuBlocksHtml()')) && (ev('stuBlocksHtml()').match(/<div class="st-blk( off)?">/g) || []).length === 12, 'واجهة الكتل تُولَّد من السجل (12 كتلة)');
  ok(ev('stuCopyHtml()').split('data-act="ctext"').length - 1 === Object.keys(R.COPY_DEFS).length, 'واجهة النصوص تُولَّد من السجل');
  ev("stuBlocksTouched = false; stuExtrasInput({ target: { closest: () => ({ getAttribute: (k) => ({ 'data-act': 'bon', 'data-i': '4', 'data-k': null })[k], type: 'checkbox', checked: false, value: '' }) } })");
  ok(ev('stuBlocks[4].on') === false && ev('stuBlocksTouched') === true, 'إطفاء كتلة يسجّل التعديل ويفعّل إرسال homeBlocks');
  ev("stuExtrasClick({ target: { closest: () => ({ getAttribute: (k) => ({ 'data-act': 'bdown', 'data-i': '0' })[k], tagName: 'BUTTON' }) } })");
  ok(ev('stuBlocks[0].id') === 'trust' && ev('stuBlocks[1].id') === 'hero', 'السهم لأسفل يبدّل ترتيب الكتل');
}

// قواعد Firestore (إن وُجدت بجانب المشروع) تحمي حقول التصميم من كتابة المالك
const rp = ['firestore.rules', 'firestore-5.rules', '../firestore.rules'].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));
if (rp) { const rr = fs.readFileSync(rp, 'utf8'); ok(['look', 'homeBlocks', 'copy'].every(k => rr.includes("'" + k + "'")), 'القواعد تحمي look/homeBlocks/copy/seasons'); } else console.log('SKIP قواعد Firestore غير موجودة');

// ترحيل القوالب
for (const tid of Object.keys(R.TEMPLATE_MIGRATION)) {
  const m = R.migrateFromTemplate({ templateId: tid });
  const ord = m.homeBlocks.filter(b => b.on).map(b => b.id);
  ok(ord[0] === 'hero' && ord[1] === 'trust' && ord[2] === 'categories' && ['promo-cards', 'brands', 'best-sellers'].every(x => ord.includes(x)), `ترحيل «${tid}»: كتل صالحة وكاملة`);
  ok(JSON.stringify(R.normalizeLook(m.look)) === JSON.stringify(m.look), `ترحيل «${tid}»: خيارات look كلها من القوائم المسموحة`);
}
const mh = R.migrateFromTemplate({ templateId: 'boutique', design: { home: { hidden: ['brands'] } } });
ok(mh.homeBlocks.find(b => b.id === 'brands').on === false, 'الترحيل يحترم الأجزاء المخفية بتخصيص القالب');

const wctx = { writes: [], audit: [] };
Object.assign(wctx, {
  memRateLimit: () => true, jsonResponse: (d, st) => ({ d, st: st || 200 }),
  firestorePatchFields: async (env, path, fields, mask) => { wctx.writes.push({ path, fields, mask }); },
  buildAndStoreStorefront: async () => ({}), buildAndStoreTenantTheme: async () => ({}),
  caches: { default: { delete: async () => {} } }, pharmacyCache: new Map(), recordAuditLog: (...a) => wctx.audit.push(a),
  URL, Request: class { constructor(u) { this.url = u; } }
});
vm.createContext(wctx); vm.runInContext(region + '\nthis.routeAdminLookSave = routeAdminLookSave;', wctx);
const mk = (body) => ({ request: { url: 'https://w.dev/x', text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }, env: {}, ctx: {}, clientIP: '1.1.1.1', tenantId: 'rose', admin: { verifiedUser: { email: 'o@x.com' } } });
(async () => {
  const r1 = await wctx.routeAdminLookSave(mk({ look: { nav: 'dock', card: '"><script>' }, colors: { primaryColor: '#abcdef', textColor: 'red' }, homeBlocks: [{ id: 'story', on: true, text: '<b>x</b>' }], copy: { brands_title: '<i>ماركات</i>' } }));
  const w = wctx.writes[0];
  ok(r1.st === 200 && w.path === 'pharmacies/rose' && w.mask.join() === 'primaryColor,look,homeBlocks,copy', 'الحفظ يكتب الحقول المسموحة فقط بمسار الصيدلية');
  ok(w.fields.look.nav === 'dock' && !('card' in w.fields.look) && w.fields.primaryColor === '#ABCDEF' && !('textColor' in w.fields), 'look وألوان منقّاة بالووركر');
  ok(w.fields.homeBlocks.length === 12 && !/[<>]/.test(JSON.stringify(w.fields.homeBlocks)) && !/[<>]/.test(JSON.stringify(w.fields.copy)), 'كتل/نصوص تُنقّى بالووركر بنفس قواعد الواجهة');
  const r2 = await wctx.routeAdminLookSave(mk({ look: { nav: 'nope' } }));
  ok(r2.st === 400, 'طلب بلا أي قيمة صالحة يُرفض');
  const r3 = await wctx.routeAdminLookSave(mk('x'.repeat(61000)));
  ok(r3.st === 413, 'حمولة ضخمة تُرفض (413)');
  const r4 = await wctx.routeAdminLookSave(mk('{not json'));
  ok(r4.st === 400, 'JSON تالف يُرفض (400)');
  wctx.writes.length = 0;
  await wctx.routeAdminLookSave(mk({ copy: { voice: 'm' } }));
  ok(wctx.writes[0].mask.join() === 'copy', 'حفظ جزئي: النصوص فقط لا يمسّ بقية الحقول');

  console.log(`\nالنتيجة: ${pass} نجح | ${fail} فشل`);
  process.exit(fail ? 1 : 0);
})();
