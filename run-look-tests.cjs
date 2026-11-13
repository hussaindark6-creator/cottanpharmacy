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

console.log(`\nالنتيجة: ${pass} نجح | ${fail} فشل`);
process.exit(fail ? 1 : 0);
