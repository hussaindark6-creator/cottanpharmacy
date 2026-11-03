// اختبار وظيفي لـ super-admin-onboarding.js بقاعدة بيانات Firestore وهمية (بلا شبكة)
const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync('super-admin-onboarding.js', 'utf8');
const presets = fs.readFileSync('public/presets/category-presets.json', 'utf8');
const checklist = fs.readFileSync('public/presets/onboarding-checklist.json', 'utf8');

function makeDb(store) {
  // store: { 'pharmacies/x': {...}, 'pharmacies/x/categories/face': {...} } — مفاتيح مسارات كاملة
  const writes = [];
  const docRef = (path) => ({
    get: async () => ({ exists: path in store, data: () => store[path], id: path.split('/').pop() }),
    set: async (d, o) => { writes.push({ path, d, o }); store[path] = Object.assign((o && o.merge && store[path]) || {}, d); },
    collection: (n) => colRef(path + '/' + n)
  });
  const colRef = (path, filt) => ({
    doc: (id) => docRef(path + '/' + id),
    get: async () => { const docs = Object.keys(store).filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).filter(k => !filt || filt(store[k])).map(k => ({ id: k.split('/').pop(), data: () => store[k] })); return { docs, empty: docs.length === 0 }; },
    limit() { return this; },
    where(f, op, v) { return colRef(path, d => d[f] === v); }
  });
  return {
    writes,
    collection: (n) => colRef(n),
    batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref, d]), commit: async () => { for (const [ref, d] of ops) await ref.set(d); } }; }
  };
}
const fetchStub = async (u) => ({ ok: true, json: async () => JSON.parse(u.includes('category-presets') ? presets : checklist) });
// db.collection('system').doc('custom_domains').collection('domains') يحتاج doc→collection
function load(store) {
  const db = makeDb(store);
  const ctx = { db, fetch: fetchStub, escSA: String, showToast() {}, document: { getElementById: () => null, addEventListener() {}, readyState: 'complete' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } }, console, Date };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__api = { applyCategoryPreset, onbDetect, onbEnsureData };', ctx);
  return { api: ctx.__api, db };
}
(async () => {
  let bad = 0; const ck = (n, ok) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n); };

  // 1) صيدلية جديدة فارغة: كل أقسام القالب تُضاف بترتيب تصاعدي
  let s1 = { 'pharmacies/p1': { name: 'P1' } };
  let { api, db } = load(s1);
  const added = await api.applyCategoryPreset('p1', 'kids');
  ck('يضيف 5 أقسام لقالب الأطفال', added === 5);
  ck('مستند القسم بنفس الحقول التي يقرؤها المتجر', JSON.stringify(Object.keys(s1['pharmacies/p1/categories/baby_care']).sort()) === JSON.stringify(['icon', 'id', 'imageUrl', 'label', 'order']));

  // 2) إعادة النسخ لا تكرر ولا تعدّل الموجود
  s1['pharmacies/p1/categories/baby_care'].imageUrl = 'https://x/y.png';
  ck('إعادة النسخ تضيف 0', (await api.applyCategoryPreset('p1', 'kids')) === 0);
  ck('صورة القسم الموجود لم تُمسّ', s1['pharmacies/p1/categories/baby_care'].imageUrl === 'https://x/y.png');

  // 3) قالب آخر على صيدلية فيها أقسام: يكمل الترتيب بعد أكبر order
  s1['pharmacies/p1/categories/baby_care'].order = 500;
  ({ api, db } = load(s1));
  await api.applyCategoryPreset('p1', 'supplements');
  ck('الأقسام الجديدة تأتي بعد أكبر ترتيب موجود', s1['pharmacies/p1/categories/vitamins'].order > 500);

  // 4) قالب غير معروف يرمي خطأ
  let threw = false; try { await api.applyCategoryPreset('p1', 'nope'); } catch (e) { threw = true; }
  ck('قالب غير معروف → خطأ', threw);

  // 5) كشف قائمة التفعيل
  const s2 = {
    'pharmacies/p2': { name: 'P2', logoUrl: 'u', adminEmail: 'Owner@Mail.com', socialWhatsapp: '9647', design: { template: 'clinic' } },
    'pharmacies/p2/staff/owner_mail_com': { role: 'owner' },
    'pharmacies/p2/categories/face': { id: 'face' },
    'pharmacies/p2/private_settings/config': { telegramConfig: { enabled: true, botToken: 'secret' } },
    'pharmacies/p2/private_settings/onboarding': { done: { test_order: true } },
    'system/custom_domains/domains/rose.example.com': { tenantId: 'p2' }
  };
  ({ api, db } = load(s2));
  await api.onbEnsureData();
  const st = await api.onbDetect('p2');
  ck('تلقائي: المالك/الهوية/واتساب/تصميم/أقسام/تيليجرام/دومين', st.auto.owner_staff && st.auto.identity && st.auto.whatsapp && st.auto.design && st.auto.categories && st.auto.telegram && st.auto.domain);
  ck('تلقائي: المنتجات ناقصة (لا منتجات)', st.auto.products === false);
  ck('اليدوي يُقرأ من private_settings/onboarding', st.manual.test_order === true);
  ck('الكشف لا يسرّب توكن البوت بالنتيجة', !JSON.stringify(st).includes('secret'));

  const s3 = { 'pharmacies/p3': { name: 'P3' } };
  ({ api } = load(s3));
  const st3 = await api.onbDetect('p3');
  ck('صيدلية فارغة: كل التلقائي false', Object.values(st3.auto).every(v => v === false));
  process.exit(bad ? 1 : 0);
})();
