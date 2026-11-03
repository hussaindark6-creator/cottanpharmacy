#!/usr/bin/env node
/* ==========================================================
   فحص آلي شامل لمشروع الصيدلية — يشتغل قبل كل رفع للموقع
   الاستخدام (من مجلد المشروع):   npm test      أو      node run-tests.cjs

   نسخة محدّثة لبنية المشروع الحالية (Vite + سكربتات كلاسيكية مقسّمة):
     index.html  : admin-stubs.js → storefront.js → script.js   (+ ملفات admin-*.js كسولاً للأدمن)
     admin.html  : storefront-stubs.js → admin-*.js (7 ملفات) → admin-page.js → script.js
   (الامتداد .cjs ضروري لأن package.json فيه "type": "module".)
   ========================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = __dirname;
let passCount = 0, failCount = 0, warnCount = 0;
const failures = [];
const pass = (m) => { passCount++; console.log(`  ✅ ${m}`); };
const fail = (m) => { failCount++; failures.push(m); console.log(`  ❌ ${m}`); };
const warn = (m) => { warnCount++; console.log(`  ⚠️  ${m}`); };
const section = (t) => console.log(`\n=== ${t} ===`);
const read = (n) => { const p = path.join(ROOT, n); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };

const ADMIN_FILES = ['admin-core.js', 'admin-products.js', 'admin-catalog-tools.js', 'admin-orders.js', 'admin-reports.js', 'admin-marketing.js', 'admin-settings.js'];
const SUPER_FILES = ['super-admin-core.js', 'super-admin-pharmacies.js', 'super-admin-catalog.js', 'super-admin-billing.js', 'super-admin-reports.js', 'super-admin-platform.js', 'super-admin-templates.js', 'super-admin-onboarding.js'];
// ملفات الميزات الجديدة المستقلة (كل واحد بوظيفة واحدة): واجهة الزبون / لوحة الأدمن
const STORE_EXTRA = ['delivery-zones.js', 'smart-search.js', 'stock-alerts.js', 'reorder.js'];
const ADMIN_EXTRA = ['admin-order-tools.js', 'image-compress.js', 'admin-inventory-badges.js'];
const CLASSIC = ['script.js', 'storefront.js', 'storefront-stubs.js', 'admin-stubs.js', ...ADMIN_FILES, 'admin-page.js', ...SUPER_FILES, ...STORE_EXTRA, ...ADMIN_EXTRA];
const adminText = () => ADMIN_FILES.map(f => read(f) || '').join('\n');
const PAGES = {
  'index.html': { loads: ['admin-stubs.js', 'storefront.js', 'script.js', ...STORE_EXTRA], lazy: ADMIN_FILES },
  'admin.html': { loads: ['storefront-stubs.js', ...ADMIN_FILES, 'admin-page.js', ...ADMIN_EXTRA, 'script.js'], lazy: [] },
  'super-admin.html': { loads: SUPER_FILES, lazy: [], standalone: true },
};

// ---------- أدوات مساعدة ----------
// الملفات المستخرجة من سكربتات داخلية (admin-page.js و super-admin-*.js) بقيت بمسافات بادئة أصلية كي لا يتغير
// محتوى أي نص متعدد الأسطر؛ لذلك نقبل المسافة البادئة لها فقط (بقية الملفات: دوال المستوى الأعلى على العمود 0).
const INDENTED_FILES = new Set(['admin-page.js', ...SUPER_FILES]);
let currentDeclFile = null;
const declsOf = (js, file) => {
  const re = (file && INDENTED_FILES.has(file)) || (currentDeclFile && INDENTED_FILES.has(currentDeclFile))
    ? /^[ \t]*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm
    : /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm;
  return [...js.matchAll(re)].map(m => m[1]);
};
const declsOfInline = (js) => [...js.matchAll(/^[ \t]*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const stubNamesOf = (js) => {            // أسماء داخل مصفوفات ADMIN_FUNCTION_NAMES / NOOP_FUNCTION_NAMES
  const m = js.match(/(?:ADMIN|NOOP)_FUNCTION_NAMES\s*=\s*\[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
};
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const stripComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// ===================================================================
section('1. فحص صحة أكواد الجافاسكربت (Syntax)');
// ===================================================================
for (const f of CLASSIC) {
  const c = read(f);
  if (c === null) { fail(`${f}: الملف غير موجود!`); continue; }
  try { new vm.Script(c, { filename: f }); pass(`${f}: صيغة صحيحة (سكربت كلاسيكي)`); }
  catch (e) { fail(`${f}: خطأ صيغة — ${e.message}`); }
}
for (const f of ['index.html', 'admin.html', 'super-admin.html']) {
  const c = read(f);
  if (c === null) { warn(`${f}: غير موجود (تجاهلته)`); continue; }
  const scripts = inlineScripts(c).filter(s => s.trim());
  scripts.forEach((s, i) => {
    try { new vm.Script(s, { filename: `${f}#inline${i + 1}` }); pass(`${f}: السكربت الداخلي #${i + 1} (${s.split('\n').length} سطر) صيغته صحيحة`); }
    catch (e) { fail(`${f}: خطأ صيغة بالسكربت الداخلي #${i + 1} — ${e.message}`); }
  });
}
const workerCandidates = ['worker.js', 'Worker.js', '../worker.js', '../Worker.js', '../backend/worker.js'];
const workerFile = workerCandidates.find(c => read(c) !== null);
if (!workerFile) warn('worker.js: غير موجود بجانب المشروع (الباكند منفصل) — تجاهلته. ضعيه بالمجلد لفحصه.');
else {
  try { execSync('node --input-type=module --check', { input: read(workerFile), stdio: ['pipe', 'pipe', 'pipe'] }); pass(`${workerFile}: صيغة صحيحة (ES Module)`); }
  catch (e) { fail(`${workerFile}: خطأ صيغة — ${(e.stderr || e.stdout).toString().split('\n')[0]}`); }
}

// ===================================================================
section('2. فحص وسوم <script src> وترتيب التحميل');
// ===================================================================
for (const [page, cfg] of Object.entries(PAGES)) {
  const html = read(page);
  if (html === null) { fail(`${page}: غير موجود`); continue; }
  const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
  for (const s of srcs) (read(s) === null) ? fail(`${page}: يحمّل "${s}" وهو غير موجود!`) : pass(`${page} → ${s}: موجود`);
  const mine = srcs.filter(s => CLASSIC.includes(s));
  if (JSON.stringify(mine) === JSON.stringify(cfg.loads)) pass(`${page}: ترتيب التحميل صحيح (${mine.join(' → ')})`);
  else fail(`${page}: ترتيب/مجموعة السكربتات خاطئة. المتوقع: ${cfg.loads.join(' → ')} | الفعلي: ${mine.join(' → ') || '(لا شيء)'} — script.js يجب أن يأتي أخيراً لأن window.App يشير لدوال الملفات السابقة`);
}

// ===================================================================
section('3. فحص تكرار تعريف الدوال بين الملفات المحمَّلة بنفس الصفحة');
// ===================================================================
for (const [page, cfg] of Object.entries(PAGES)) {
  const seen = new Map(); let dup = 0;
  for (const f of cfg.loads) {
    const js = read(f); if (js === null) continue;
    for (const n of declsOf(js, f)) {
      if (seen.has(n)) { fail(`${page}: الدالة "${n}" معرّفة بالملفين ${seen.get(n)} و ${f}`); dup++; } else seen.set(n, f);
    }
  }
  if (!dup) pass(`${page}: لا توجد دوال معرّفة مرتين بين ملفاته الخارجية`);
}
{
  const adm = read('admin.html'), ap = adminText();
  if (adm && ap) {
    const inl = inlineScripts(adm).join('\n');
    const both = declsOf(ap).filter(n => new RegExp(`function\\s+${n}\\s*\\(`).test(inl));
    both.forEach(n => warn(`admin.html: "${n}" معرّفة بالسكربت الداخلي وبملفات admin-*.js — النسخة الأحدث تحميلاً هي التي تعمل. وحّديهما.`));
  }
}

// ===================================================================
section('4. فحص أزرار onclick مقابل الدوال المعرّفة فعلياً (لكل صفحة)');
// ===================================================================
const JS_BUILTINS = new Set(['event','this','window','document','console','getElementById','querySelector','querySelectorAll','preventDefault','stopPropagation','print','alert','confirm','prompt','reset','submit','focus','blur','click','close','open','setTimeout','setInterval','parseInt','parseFloat','toString','JSON','Object','Array','Number','String','Boolean','Math','if','for','while','return','function','encodeURIComponent','decodeURIComponent','remove','toggle','add','closest','select','scrollIntoView','replace','trim','toLowerCase','stop','history','location','sanitizeText','fetch','Date','Set','Map','Promise']);
const handlerNames = (text) => {
  const out = new Set();
  for (const m of text.matchAll(/\bon(?:click|submit|change|input|keyup|keydown|blur|focus)\s*=\s*\\?"([^"]*)\\?"/g))
    for (const f of m[1].matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) out.add(f[1]);
  return out;
};
for (const [page, cfg] of Object.entries(PAGES)) {
  const html = read(page); if (html === null) continue;
  const defined = new Set(); let appKeys = new Set();
  const jsTexts = [];
  for (const f of cfg.loads) {
    const js = read(f); if (js === null) continue;
    declsOf(js, f).forEach(n => defined.add(n));
    stubNamesOf(js).forEach(n => defined.add(n));
    for (const m of js.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
    jsTexts.push([f, js]);
    const app = js.match(/window\.App\s*=\s*\{([\s\S]*?)\n\};/);
    if (app) app[1].split(',').map(s => s.trim()).filter(Boolean).forEach(e => {
      const name = e.split(':')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(name)) { appKeys.add(name); if (!e.includes(':') && !defined.has(name)) fail(`${page}: window.App يشير لـ "${name}" وهي غير معرّفة بأي ملف محمَّل قبله!`); }
    });
  }
  inlineScripts(html).forEach(s => { declsOfInline(s).forEach(n => defined.add(n)); for (const m of s.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g)) defined.add(m[1]); });
  let bad = 0;
  const check = (name, where) => { if (JS_BUILTINS.has(name) || defined.has(name)) return; fail(`${page}: ${where} يستدعي "${name}()" وهي غير معرّفة بالصفحة (لا بملف محمَّل ولا ببديل stub)`); bad++; };
  handlerNames(html).forEach(n => check(n, 'زر بالـHTML'));
  for (const [f, js] of jsTexts) handlerNames(js).forEach(n => check(n, `زر مولَّد داخل ${f}`));
  for (const m of html.matchAll(/window\.App\.([A-Za-z_$][\w$]*)/g)) if (!appKeys.has(m[1])) { fail(`${page}: يستدعي window.App.${m[1]} غير مُصدَّرة`); bad++; }
  if (!bad) pass(`${page}: كل أزرار onclick (الثابتة والمولَّدة) لها دوال معرّفة`);
}

// ===================================================================
section('5. استدعاءات دوال المشروع غير المعرّفة بالصفحة (Dangling Calls)');
// ===================================================================
{
  const known = new Set(); const allTexts = {};
  for (const f of CLASSIC) { const js = read(f); if (js) { declsOf(js, f).forEach(n => known.add(n)); allTexts[f] = js; } }
  for (const [page, cfg] of Object.entries(PAGES)) {
    const html = read(page); if (html === null) continue;
    const defined = new Set();
    for (const f of cfg.loads) { const js = allTexts[f]; if (!js) continue; declsOf(js, f).forEach(n => defined.add(n)); stubNamesOf(js).forEach(n => defined.add(n)); }
    inlineScripts(html).forEach(s => declsOfInline(s).forEach(n => defined.add(n)));
    let bad = 0;
    for (const f of cfg.loads) {
      const code = stripComments(allTexts[f] || '');
      for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const n = m[1];
        if (known.has(n) && !defined.has(n)) { fail(`${page}: الملف ${f} يستدعي "${n}()" وهي معرّفة فقط بملف غير محمَّل بهذه الصفحة وبلا بديل stub`); defined.add(n); bad++; }
      }
    }
    if (!bad) pass(`${page}: لا توجد استدعاءات معلّقة لدوال غير محمَّلة`);
  }
}

// ===================================================================
section('6. حواجز ضد رجوع الميزات الملغاة (توفير عمليات Firestore)');
// ===================================================================
{
  const guards = [
    [/analyticsDailyCol\(\)\s*\.doc\([^)]*\)\s*\.set/, 'كتابة عدّاد الزيارات (analytics_daily)'],
    [/FieldValue\.increment\(1\)[\s\S]{0,60}views|views\s*:\s*firebase\.firestore\.FieldValue\.increment/, 'زيادة عدّاد مشاهدات المنتج (views)'],
    [/function\s+rateProductInstant\b/, 'تصويت الزبون بالنجوم (rateProductInstant)'],
  ];
  let bad = 0;
  for (const f of CLASSIC) {
    const js = read(f); if (!js) continue;
    for (const [re, label] of guards) if (re.test(stripComments(js))) { fail(`${f}: عاد استخدام ميزة ملغاة: ${label}`); bad++; }
  }
  const idx = read('index.html');
  if (idx && /star-rating-box|instantRatingMsg|id="pdRating"|pdTabReviews/.test(idx)) { fail('index.html: ما زال فيه عنصر تقييم/نجوم'); bad++; }
  const adm = read('admin.html');
  if (adm && /adminProdRating|adminProdReviews|quickEditProdRating|quickEditProdReviews/.test(adm)) { fail('admin.html: ما زالت حقول إدخال التقييم موجودة'); bad++; }
  for (const f of CLASSIC) { const js = read(f); if (js && /getElementById\(['"](?:pdRating|pdTabReviews|adminProdRating|adminProdReviews|quickEditProdRating|quickEditProdReviews)['"]\)|class="p-rating"/.test(stripComments(js))) { fail(`${f}: ما زال يتعامل مع عناصر التقييم`); bad++; } }
  if (!bad) pass('لا أثر لعدّاد الزيارات ولا المشاهدات ولا تصويت النجوم بالواجهة');
}

// ===================================================================
section('6ب. حواجز قراءات Firestore (منع رجوع مصادر الاستنزاف)');
// ===================================================================
{
  let bad = 0;
  const g = (cond, msg) => { if (cond) { fail(msg); bad++; } };
  for (const f of CLASSIC) {
    const js = read(f); if (!js) continue;
    const code = stripComments(js);
    g(/ordersCol\(\)\s*\.get\(\)/.test(code), `${f}: قراءة كل الطلبات بلا حد (ordersCol().get())`);
    g(/ordersCol\(\)\s*\.onSnapshot/.test(code), `${f}: مستمع لحظي على كل الطلبات بلا limit`);
    g(/ordersCol\(\)\s*\.orderBy\([^)]*\)\s*\.get\(\)/.test(code), `${f}: قراءة كل الطلبات مرتبة بلا limit`);
    g(/productsCol\(\)\s*\.onSnapshot/.test(code), `${f}: مستمع لحظي على كل المنتجات (يقرأ كل المنتجات بكل فتح)`);
  }
  const sc = read('script.js') || '';
  g(!/\/api\/storefront/.test(sc), 'script.js: الزوار لا يستخدمون /api/storefront');
  g(!/ADMIN_ORDERS_LIMIT/.test(adminText()), 'admin-orders.js: حد قراءة الطلبات ADMIN_ORDERS_LIMIT غير موجود');
  const idxh = read('index.html') || '';
  g(/firebase-messaging-compat/.test(idxh), 'index.html: ما زال يحمّل firebase-messaging غير المستخدم');
  if (!bad) pass('لا قراءات غير محدودة للطلبات/المنتجات، والزوار يستخدمون لقطة المتجر المخزَّنة');
}

// ===================================================================
section('6ج. ميزات الواجهة المطلوبة (طلباتي، العروض، إدارة البنك، التقرير)');
// ===================================================================
{
  let bad = 0;
  const g = (cond, msg) => { if (cond) { fail(msg); bad++; } };
  const idx = read('index.html') || '', adm = read('admin.html') || '', sf = read('storefront.js') || '', ap = adminText();
  g(!/id="bn-orders"[^>]*showView\('orders'\)/.test(idx), "index.html: خانة 'طلباتي' غير موجودة بالشريط السفلي");
  g(!/function getDiscountedProducts/.test(sf), 'storefront.js: تبويب العروض لا يعتمد الخصم التلقائي');
  const adminPageJs = read('admin-page.js') || '';
  g(!/id="masterManageBar"/.test(adm) || !/bulk-upsert/.test(adminPageJs) || !/bulk-delete/.test(adminPageJs), 'admin.html/admin-page.js: أدوات إدارة بنك المنتجات (حذف/رفع JSON) غير مكتملة');
  g(!/function buildOrdersReportHTML/.test(ap) || !/function computeReportRows/.test(ap), 'admin-reports.js: التقرير المالي الجديد غير موجود');
  g(/REPORT_GROUP_LABELS\[group\]/.test(ap), 'admin-reports.js: عاد التقرير القديم المقسّم لأقسام');
  const w = workerFile ? read(workerFile) : null;
  if (w) {
    g(!/isPlatformAdminRoute/.test(w), 'worker.js: مسارات المنصة ما زالت تتطلب صيدلية معرَّفة (سبب عدم تحديث بنك المنتجات)');
    g(!/master-catalog\/bulk-upsert/.test(w) || !/master-catalog\/bulk-delete/.test(w), 'worker.js: مسارات الرفع/الحذف الجماعي لبنك المنتجات مفقودة');
  }
  // أدوار الموظفين الثلاثة + تقرير Excel المنظّم
  const rulesTxt = read('firestore.rules') || '', wTxt = workerFile ? read(workerFile) : null;
  const settingsJs = read('admin-settings.js') || '', reportsJs = read('admin-reports.js') || '', scriptJs = read('script.js') || '';
  g(!/value="shift"/.test(adm) || !/value="cosmetics"/.test(adm) || !/value="owner"/.test(adm), 'admin.html: قائمة أدوار الموظفين يجب أن تحتوي shift و cosmetics و owner');
  g(/value="pharmacist"|value="manager"|value="staff"/.test(adm.split('staffRoleSelect')[1] ? adm.split('staffRoleSelect')[1].slice(0, 900) : ''), 'admin.html: عادت أدوار قديمة في قائمة الموظفين');
  g(!/const ROLE_PERMS/.test(scriptJs) || !/function can\(/.test(scriptJs) || !/function assertCan/.test(scriptJs), 'script.js: نموذج صلاحيات الأدوار غير موجود');
  g(!/ADMIN_SECTION_PERMS/.test(ap) && !/ADMIN_SECTION_PERMS/.test(scriptJs), 'أقسام لوحة الأدمن غير محمية بالصلاحيات');
  g(!/assertCan\('products\.archive'\)/.test(ap), 'أرشفة/حذف المنتجات يجب أن تتطلب صلاحية products.archive');
  g(!/assertCan\('orders\.manage'\)/.test(ap), 'تغيير حالة الطلب يجب أن يتطلب orders.manage');
  g(!/assertCan\('reports'\)/.test(ap), 'التقارير يجب أن تتطلب صلاحية reports');
  g(!/function buildXlsxFile/.test(ap) || !/function xlsxZip/.test(ap), 'admin-reports.js: منشئ ملف Excel (xlsx) غير موجود');
  g(/isSuperAdmin\(\)\)\s*\{\s*showToast\('⚠️ التقارير المالية/.test(ap), 'admin-reports.js: التقارير ما زالت مقصورة على المشرف العام فقط');
  if (wTxt) g(!/COSMETICS_ALLOWED_ADMIN_ROUTES/.test(wTxt) || !/readStaffRole/.test(wTxt), 'worker.js: صلاحيات موظف الكوزمتك غير مطبّقة بالووركر');
  g(!/isCosmeticsStaff/.test(rulesTxt) || !/canViewOrders/.test(rulesTxt) || !/canEditProducts/.test(rulesTxt), 'firestore.rules: دوال أدوار الموظفين غير موجودة');
  g(/isTenantStaff\(/.test(rulesTxt.replace(/\/\/[^\n]*/g, '')), 'firestore.rules: عادت الدالة العامة isTenantStaff (تعطي أي موظف كل الصلاحيات)');
  // رفع/حذف بنك المنتجات من السوبر أدمن يجب أن يمر عبر الووركر (يحفظ كل الحقول ويحدّث الكاش قبل إعادة تحميل القائمة)
  const superCat = read('super-admin-catalog.js') || '';
  g(!/master-catalog\/bulk-upsert/.test(superCat) || !/master-catalog\/bulk-delete/.test(superCat), 'super-admin-catalog.js: الرفع/الحذف الجماعي لا يمر عبر الووركر');
  g(/batch\.set\(/.test(superCat.slice(superCat.indexOf('handleMasterBulkUpload'), superCat.indexOf('function parseCSVToMasterArray'))), 'super-admin-catalog.js: عاد الرفع المباشر لـ Firestore (يضيّع حقول الصنف ولا يحدّث الكاش)');
  g(!/function classifyByCategoryField/.test(read('admin-page.js') || ''), 'admin-page.js: تصنيف البنك لا يفهم أقسام الأصناف العربية');
  // كاش يومي عند منتصف الليل + ترتيب الأقسام + زر حذف المنتج
  if (wTxt) {
    g(!/lastIraqMidnightMs/.test(wTxt) || !/fullBuiltAt/.test(wTxt), 'worker.js: التجديد اليومي لكاش الكتالوج عند منتصف الليل غير موجود');
    g(/STOREFRONT_TTL_MS/.test(wTxt), 'worker.js: عاد تقادم لقطة المتجر كل 10 دقائق (يستهلك قراءات)');
    g(!/nextPageToken/.test(wTxt.slice(wTxt.indexOf('async function buildAndStoreTenantCatalog'), wTxt.indexOf('async function buildAndStoreMasterCatalog'))), 'worker.js: بناء الكتالوج بلا ترقيم صفحات (يقتطع أكثر من 1000 منتج)');
    g(!/async scheduled\(/.test(wTxt), 'worker.js: معالج Cron الليلي الاختياري غير موجود');
  }
  g(!/function moveAdminCategory/.test(scriptJs) || !/function sortCategoriesByOrder/.test(scriptJs) || !/function sortProductsByCategoryOrder/.test(scriptJs), 'script.js: ترتيب الأقسام بيد الأدمن غير موجود');
  g(!/sortProductsByCategoryOrder/.test(read('storefront.js') || ''), 'storefront.js: واجهة الزبائن لا تلتزم بترتيب الأقسام');
  g(!/deleteProductFromQuickEdit/.test(ap) || !/🗑️ حذف/.test(ap), 'admin-products.js: زر حذف المنتج غير موجود');
  if (!bad) pass('طلباتي بالشريط، العروض تلقائية، إدارة البنك، والتقرير الجديد — كلها موجودة');
}

// ===================================================================
section('6د. بوابة الإطلاق (أمان + قراءات + حصص مجانية)');
// ===================================================================
{
  let bad = 0;
  const g = (cond, msg) => { if (cond) { fail(msg); bad++; } };
  const w = workerFile ? read(workerFile) : null;
  const rules = read('firestore.rules') || '';
  const sc = read('script.js') || '', sf = read('storefront.js') || '', ap = adminText(), idx = read('index.html') || '';

  // قواعد: لا قراءة عامة
  const publicReads = (rules.replace(/\/\/[^\n]*/g, '').match(/allow\s+(?:read|get|list)[^;]*:\s*if\s+true/g) || []);
  g(publicReads.length > 0, `firestore.rules: ما زالت هناك ${publicReads.length} قاعدة قراءة عامة (if true) — تتيح استنزاف حصة القراءات`);
  g(!/price <= 50000000/.test(rules), 'firestore.rules: سقف السعر 50 مليون غير مطبّق على المنتجات');

  // الواجهة: لا قراءات Firestore مباشرة للزوار
  g(/couponsCol\(\)/.test(sf), 'storefront.js: الزبون ما زال يقرأ الكوبونات مباشرة من Firestore');
  g(/productsCol\(\)\s*\.get\(\)/.test(sc), 'script.js: عاد مسار قراءة كل المنتجات من Firestore (تضخيم القراءات وقت الأعطال)');
  g(!/attachAdminLiveListenersOnce/.test(sc) || !/IS_ADMIN_PAGE\) attachAdminLiveListenersOnce/.test(sc), 'script.js: مستمعات الأدمن اللحظية يجب أن تُربط بعد التحقق من الصلاحية فقط');
  g(/dbPaths\.ordersCol\(\)\.doc\([^)]*\)\.set\(\s*\{\s*status/.test(sc + sf + ap), 'تغيير حالة الطلب مباشرة بـ Firestore (يجب عبر الووركر ليُرجع المخزون)');
  g(!/\/api\/orders\/cancel/.test(sc), 'script.js: إلغاء الزبون لا يمر عبر الووركر');
  g(!/id="hpWebsite"/.test(idx) || !/getTurnstileToken/.test(sf), 'حماية البوتات (honeypot/Turnstile) غير مكتملة بالواجهة');

  // الووركر
  if (w) {
    g(!/GLOBAL_ENV/.test(w) || /&key=\$\{FIREBASE_API_KEY\}`/.test(w), 'worker.js: قراءات الووركر ما زالت تعتمد مفتاح الويب العام بدل حساب الخدمة');
    g(/checkRateLimitKV\(env,\s*`ip:/.test(w), 'worker.js: محدّد IP العام يكتب بـ KV (يستنزف حصة 1000 كتابة/يوم)');
    g(!/memRateLimit/.test(w), 'worker.js: محدّد المعدل بالذاكرة غير موجود');
    g(!/api\/orders\/cancel/.test(w) || !/cancelOrderAndRestoreStock/.test(w), 'worker.js: مسار إلغاء الطلب مع إرجاع المخزون غير موجود');
    g(!/r2UpdateJson/.test(w) || !/etagMatches/.test(w), 'worker.js: تحديثات R2 بلا حماية تعارض (ETag)');
    g(!/TURNSTILE_SECRET/.test(w) || !/PIN_PEPPER/.test(w), 'worker.js: دعم Turnstile/PIN_PEPPER غير موجود');
    g(!/ABSOLUTE_MAX_UNIT_PRICE/.test(w), 'worker.js: سقف السعر المطلق غير مطبّق');
    g(!/maxUses/.test(w) || !/usedCount/.test(w), 'worker.js: عدّاد استخدام الكوبون غير مطبّق');
    g(/recordAuditLog\(env, ctx, "طلب شراء جديد/.test(w), 'worker.js: عاد سجل تدقيق KV لكل طلب (استنزاف الحصة)');
    g(!/emailVerified/.test(w), 'worker.js: لا يشترط إيميلاً موثَّقاً');
    g(!/adminEmailHash/.test(w), 'worker.js: لقطة المتجر تكشف إيميل المالك للزوار');
  }
  if (!bad) pass('بوابة الإطلاق: القواعد مقفلة، الزوار بلا قراءات Firestore، الووركر محصَّن ومعزول عن KV');
}

// ===================================================================
section('7. فحص قواعد Firestore');
// ===================================================================
{
  const rules = read('firestore.rules');
  if (rules === null) warn('firestore.rules: غير موجود بهذا المجلد (تجاهلته)');
  else {
    const code = rules.replace(/\/\/[^\n]*/g, '');
    const o = (code.match(/\{/g) || []).length, c = (code.match(/\}/g) || []).length;
    (o === c) ? pass(`الأقواس المعقوفة متوازنة (${o}/${c})`) : fail(`الأقواس المعقوفة غير متوازنة (${o} فتح / ${c} إغلاق)`);
    const po = (code.match(/\(/g) || []).length, pc = (code.match(/\)/g) || []).length;
    (po === pc) ? pass(`الأقواس الدائرية متوازنة (${po}/${pc})`) : fail(`الأقواس الدائرية غير متوازنة (${po}/${pc})`);
    const risky = [...code.matchAll(/get\([^)]*\)\.data\.([A-Za-z_]\w*)\s*(?:!=|==)/g)];
    risky.length ? warn(`فيه ${risky.length} استخدام لـ .data.field مباشرة بدل .get(key, default)`) : pass('لا استخدام مباشر خطير لحقول قد تكون غير موجودة');
    /match \/orders\/\{orderId\}[\s\S]*?allow create:\s*if false/.test(code) ? pass('إنشاء الطلبات من العميل مغلق (الووركر فقط)') : fail('orders: لازم يبقى allow create: if false');
    /match \/analytics_daily\/\{dayId\}[\s\S]*?allow write:\s*if false/.test(code) ? pass('analytics_daily: لا كتابة من العميل') : fail('analytics_daily: يجب إغلاق الكتابة من العميل');
    /affectedKeys\(\)\.hasOnly\(\[\s*'views'\s*\]\)|hasOnly\(\[\s*'rating'/.test(code) ? fail('products: ما زالت هناك صلاحية عامة لتعديل views/rating') : pass('products: لا صلاحيات تعديل عامة (views/rating)');
    /subscriptionExpiry/.test(code) ? pass('pharmacies: حقول الاشتراك محمية من تعديل المالك') : fail('pharmacies: يجب حماية subscriptionExpiry/isActive من تعديل مالك الصيدلية');
    /email_verified/.test(code) ? pass('القواعد تشترط إيميلاً موثَّقاً للمشرفين') : fail('القواعد لا تشترط email_verified');
    /allow\s+(?:create|update|write|delete)[^;]*:\s*if\s+true/.test(code) ? fail('يوجد allow كتابة بشرط true (مفتوحة للجميع)!') : pass('لا توجد كتابة مفتوحة للجميع');
    (() => { const m = code.match(/match \/orders\/\{orderId\}[\s\S]*?allow update:[^;]*;/); return m && !/request\.auth\.uid/.test(m[0].slice(m[0].lastIndexOf('allow update'))); })() ? pass('orders: تعديل الطلب للطاقم فقط (إلغاء الزبون عبر الووركر)') : fail('orders: تعديل الطلب يجب أن يكون للطاقم فقط');
  }
}

// ---------- 7) محرك القوالب + الدومينات (المرحلتان 0 و1) ----------
section('القوالب والدومينات');
{
  const vm = require('vm');
  const contractSrc = read('template-contract.js');
  const registryRaw = read('public/templates/registry.json');
  if (!contractSrc || !registryRaw) {
    fail('template-contract.js أو public/templates/registry.json غير موجود');
  } else {
    let registry = null;
    try { registry = JSON.parse(registryRaw); } catch (e) { fail('registry.json ليس JSON صالحاً: ' + e.message); }
    if (registry) {
      const sandbox = { window: {}, console };
      vm.createContext(sandbox);
      vm.runInContext(contractSrc, sandbox);
      const W = sandbox.window;
      (W.TemplateContract && typeof W.validateTemplate === 'function') ? pass('عقد القوالب يُحمَّل (TemplateContract + validateTemplate)') : fail('template-contract.js لا يعرّف TemplateContract/validateTemplate');

      const ids = new Set(), aliases = new Set();
      (registry.templates || []).forEach(e => {
        if (!e.id || !e.script || !e.dataTemplate) { fail(`registry: القالب «${e.id}» ينقصه id/script/dataTemplate`); return; }
        if (ids.has(e.id)) fail(`registry: id مكرر «${e.id}»`); ids.add(e.id);
        (e.aliases || []).forEach(a => { if (aliases.has(a) || ids.has(a)) fail(`registry: اسم بديل مكرر «${a}»`); aliases.add(a); });
      });
      (ids.has(registry.default)) ? pass('registry: القالب الافتراضي موجود') : fail('registry: default غير موجود بالقائمة');

      (registry.templates || []).forEach(e => {
        if (e.css) {
          const css = read(`public/templates/${e.css}`);
          if (!css) { fail(`registry: ملف CSS «${e.css}» غير موجود`); return; }
          // كل قاعدة بملف قالب يجب أن تُقيَّد بـ data-template الخاص به كي لا تتسرب لقوالب أخرى
          const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(b => b.split('{')[0].trim()).filter(sel => sel && !sel.startsWith('@') && !sel.includes(`[data-template="${e.dataTemplate}"]`));
          bare.length === 0 ? pass(`CSS «${e.css}»: كل القواعد مقيّدة بـ data-template="${e.dataTemplate}"`) : fail(`CSS «${e.css}»: قواعد غير مقيّدة: ${bare.slice(0, 3).join(' | ')}`);
        }
      });

      const scripts = [...new Set((registry.templates || []).map(e => e.script))];
      scripts.forEach(name => {
        const src = read(`public/templates/${name}.js`);
        if (!src) { fail(`templates/${name}.js غير موجود`); return; }
        try { vm.runInContext(src, sandbox); } catch (e) { fail(`templates/${name}.js يرمي خطأ عند التحميل: ${e.message}`); return; }
        const tpl = W.PharmacyTemplates && W.PharmacyTemplates[name];
        if (!tpl) { fail(`templates/${name}.js لا يسجّل window.PharmacyTemplates.${name}`); return; }
        const res = W.validateTemplate(tpl);
        res.ok ? pass(`قالب «${name}» يطابق العقد (كل الدوال المطلوبة)`) : fail(`قالب «${name}» لا يطابق العقد: ${res.errors.join(' | ')}`);
        if (res.ok) {
          const H = {
            sanitizeText: v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
            sanitizeUrl: v => (/^https?:\/\//i.test(String(v || '')) ? String(v).replace(/"/g, '%22') : ''),
            fmtPrice: n => String(n), getBrandColor: () => '#E85D8A', icons: { bottle: () => '<svg></svg>' }, catIcons: { jar: () => '<svg></svg>' }, wishlist: new Set()
          };
          const outs = [tpl.renderHeader({}, H), tpl.renderProductCard({ id: 'p1', name: 'x', price: 1 }, H), tpl.renderCategoryCard({ id: 'c1', label: 'x' }, 0, H), tpl.renderBundleCard({ id: 'b1', title: 'x', price: 1 }, H), tpl.renderProductPage({ id: 'p1' }, H), tpl.renderFooter({}, H)];
          // اختبار الهروب: بيانات خبيثة يجب ألا تظهر كوسوم خام بأي مخرج (مع helpers تحاكي sanitizeText/sanitizeUrl)
          const evil = '<img src=x onerror=alert(1)>';
          const real = [
            tpl.renderProductCard({ id: evil, name: evil, brand: evil, size: evil, price: 10, oldPrice: 20, imageUrl: 'javascript:alert(1)', stockQuantity: 3 }, H),
            tpl.renderCategoryCard({ id: evil, label: evil, imageUrl: 'javascript:1' }, 2, H),
            tpl.renderBundleCard({ id: evil, title: evil, savingsBadge: evil, price: 5, imageUrl: '' }, H),
            tpl.renderFooter({ name: evil, socialWhatsapp: '<b>', socialInstagram: 'a"b onclick=x', socialPhone: 'x' }, H)
          ].filter(x => typeof x === 'string');
          real.every(x => !/<img src=x|<b>|onclick=x/i.test(x)) ? pass(`قالب «${name}»: لا يمرّر HTML خبيثاً من بيانات المنتج/القسم/البكج/الفوتر`) : fail(`قالب «${name}»: مخرج غير مهرَّب (XSS)`);
          const storeSrc = ['script.js', 'storefront.js', 'delivery-zones.js', 'smart-search.js', 'stock-alerts.js', 'reorder.js'].map(f => read(f) || '').join('\n');
          const definedFns = new Set([...storeSrc.matchAll(/^(?:async\s+)?function\s+([A-Za-z_]\w*)/gm)].map(m => m[1]));
          const usedFns = new Set([...src.matchAll(/\b((?:open|add|toggle|show|close|select)[A-Z]\w*)\(/g)].map(m => m[1]));
          const missingFns = [...usedFns].filter(n => !definedFns.has(n));
          missingFns.length === 0 ? pass(`قالب «${name}»: كل دوال المتجر التي يستدعيها معرّفة (${[...usedFns].length})`) : fail(`قالب «${name}» يستدعي دوالاً غير معرّفة بالمتجر: ${missingFns.join(', ')}`);
          outs.every(o => o === null || o === undefined || typeof o === 'string') ? pass(`قالب «${name}»: دوال الرسم ترجع نصاً أو null فقط`) : fail(`قالب «${name}»: إحدى دوال الرسم ترجع نوعاً غير نص/null`);
        }
      });

      const idx = read('index.html') || '';
      (W.TemplateContract ? W.TemplateContract.homeSectionIds : []).forEach(id => {
        idx.includes(`data-home-section="${id}"`) ? pass(`index.html: جزء الرئيسية «${id}» موسوم`) : fail(`index.html: ينقصه data-home-section="${id}"`);
      });
    }
  }
  ['platform-host.js', 'template-engine.js', 'template-contract.js'].forEach(f => read(f) ? pass(`${f} موجود`) : fail(`${f} غير موجود`));
  ['index.html', 'admin.html', 'super-admin.html'].forEach(p => (read(p) || '').includes('src="platform-host.js"') ? pass(`${p} يحمّل platform-host.js`) : fail(`${p} لا يحمّل platform-host.js`));
  const noPwa = ['index.html', 'vite.config.js', 'run-tests.cjs'].filter(f => /growth-pwa|barcode-scanner|manifest\.webmanifest|installAppLink/.test((read(f) || '').replace(/\/growth-pwa\|[^\n]*/, '')));
  noPwa.length ? fail(`بقايا PWA/باركود بـ: ${noPwa.join(', ')} (قرار: لا ملفات PWA)`) : pass('لا بقايا لملفات PWA');
}

// ---------- 8) قوالب الأقسام وقائمة التفعيل (المرحلة 5) ----------
section('قوالب الأقسام وقائمة التفعيل');
{
  const pr = read('public/presets/category-presets.json');
  const ck = read('public/presets/onboarding-checklist.json');
  const onbSrc = read('super-admin-onboarding.js') || '';
  const storeSrc = read('script.js') || '';
  const iconBlock = storeSrc.slice(storeSrc.indexOf('const catIcons'), storeSrc.indexOf('const catIcons') + 6000);
  const iconKeys = new Set([...iconBlock.matchAll(/^\s{2}([a-z]+):/gm)].map(m => m[1]));
  let presets = null, items = null;
  try { presets = JSON.parse(pr).presets; } catch (e) { fail('category-presets.json غير صالح: ' + e.message); }
  try { items = JSON.parse(ck).items; } catch (e) { fail('onboarding-checklist.json غير صالح: ' + e.message); }
  if (presets) {
    const pids = new Set();
    presets.forEach(p => {
      if (!p.id || !p.name || !Array.isArray(p.categories) || !p.categories.length) { fail(`قالب أقسام «${p.id}» ناقص`); return; }
      if (pids.has(p.id)) fail(`قالب أقسام مكرر «${p.id}»`); pids.add(p.id);
      const cids = new Set(); const problems = [];
      p.categories.forEach(c => {
        if (!/^[a-z0-9_-]{2,40}$/.test(c.id || '')) problems.push(`معرّف غير صالح «${c.id}»`);
        if (cids.has(c.id)) problems.push(`معرّف مكرر «${c.id}»`); cids.add(c.id);
        if (!c.label || !String(c.label).trim()) problems.push(`اسم فارغ لـ«${c.id}»`);
        if (!iconKeys.has(c.icon)) problems.push(`أيقونة غير موجودة «${c.icon}» لـ«${c.id}»`);
        if (!Number.isFinite(c.order)) problems.push(`ترتيب غير رقمي لـ«${c.id}»`);
      });
      problems.length === 0 ? pass(`قالب الأقسام «${p.id}»: ${p.categories.length} أقسام صالحة`) : fail(`قالب الأقسام «${p.id}»: ${problems.join(' | ')}`);
    });
    iconKeys.size >= 6 ? pass(`أيقونات الأقسام المعروفة (${iconKeys.size})`) : fail('تعذر قراءة أيقونات الأقسام من script.js');
  }
  if (items) {
    const keys = new Set(); const problems = [];
    items.forEach(i => {
      if (!i.key || !i.title) problems.push('بند ناقص');
      if (keys.has(i.key)) problems.push(`مفتاح مكرر «${i.key}»`); keys.add(i.key);
      if (i.auto && !onbSrc.includes(`${i.key}:`)) problems.push(`البند التلقائي «${i.key}» بلا فحص بـ onbDetect`);
    });
    problems.length === 0 ? pass(`قائمة التفعيل: ${items.length} بنداً، كل التلقائي له فحص`) : fail('قائمة التفعيل: ' + problems.join(' | '));
  }
  (read('super-admin.html') || '').includes('id="newPharmacyPreset"') ? pass('نموذج الإنشاء فيه نوع النشاط') : fail('نموذج الإنشاء ينقصه newPharmacyPreset');
  (read('super-admin-pharmacies.js') || '').includes('applyCategoryPreset(slug, presetId)') ? pass('الإنشاء ينسخ قالب الأقسام') : fail('handleCreatePharmacy لا ينسخ قالب الأقسام');
}

// ===================================================================
console.log('\n' + '='.repeat(50));
console.log(`النتيجة: ${passCount} نجح ✅  |  ${warnCount} تحذير ⚠️  |  ${failCount} فشل ❌`);
console.log('='.repeat(50));
if (failCount > 0) { console.log('\n🔴 لا تنشري هذا التحديث قبل حل المشاكل التالية:\n'); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
else { console.log('\n🟢 كل الفحوصات نجحت — آمن تنشري التحديث.'); process.exit(0); }
