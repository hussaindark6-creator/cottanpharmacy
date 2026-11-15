#!/usr/bin/env node
/* gen-worker-design.cjs — يولّد مقطع «نظام التصميم» الخاص بالووركر من look-registry.js (المصدر الوحيد للحقيقة)
   ثم يطبّقه على worker.js بين علامتين ثابتتين.
   الاستخدام:
     node gen-worker-design.cjs --print                      # يطبع المقطع
     node gen-worker-design.cjs path/to/worker.js [--out out.js]   # يستبدل المقطع داخل worker.js (أو يكتب نسخة جديدة)
   لا يمس أي جزء آخر من الووركر. آمن للتكرار (idempotent). */
const fs = require('fs'), vm = require('vm'), path = require('path');
const here = __dirname;
const regSrc = fs.readFileSync(path.join(here, 'look-registry.js'), 'utf8');
const ctx = {}; vm.createContext(ctx); vm.runInContext(regSrc, ctx);
const R = ctx.LookRegistry;

const shared = regSrc.split('// @@SHARED-BEGIN')[1].split('// @@SHARED-END')[0].replace(/^[^\n]*\n/, '');
const dedent = shared.split('\n').map(l => l.replace(/^  /, '')).join('\n');

function buildRegion() {
  return `// ================= 🎛️ نظام التصميم (Design): حفظ تصميم الصيدلية =================
// ⚠️ هذا المقطع مولَّد آلياً من look-registry.js بالأمر: node gen-worker-design.cjs worker.js — لا يُعدَّل يدوياً.
// المصدر الوحيد للقيم هو look-registry.js. الحفظ هنا فقط (قواعد Firestore تمنع المالك من كتابة look/homeBlocks/copy/seasons مباشرة):
// قيم من قوائم مسموحة وألوان HEX ونصوص قصيرة منقّاة وروابط https بدومينات مسموحة فقط. لا CSS ولا HTML ولا روابط عشوائية.
const DESIGN_LOOK_ALLOWED = ${JSON.stringify(R.ALLOWED, null, 2)};
const DESIGN_COLOR_KEYS = ["primaryColor", "pageBgColor", "cardColor", "secondaryColor", "textColor"];
const DESIGN_COLOR_REQUIRED = new Set(["primaryColor"]); // لا يُمسح الأساسي؛ البقية اختيارية (تلقائي = فارغ)
const DESIGN_MAX_BODY_CHARS = 60000;

${dedent}
function sanitizeLookInput(rawLook) {
  const out = {};
  const src = (rawLook && typeof rawLook === "object") ? rawLook : {};
  for (const key of Object.keys(DESIGN_LOOK_ALLOWED)) {
    const v = src[key];
    if (typeof v === "string" && DESIGN_LOOK_ALLOWED[key].includes(v)) out[key] = v;
  }
  return out;
}

function sanitizeDesignColors(rawColors) {
  const out = {};
  const src = (rawColors && typeof rawColors === "object") ? rawColors : {};
  for (const key of DESIGN_COLOR_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v)) out[key] = v.toUpperCase();
    else if (v === "" && !DESIGN_COLOR_REQUIRED.has(key)) out[key] = "";
  }
  return out;
}

// POST /api/admin/look/save (مالك الصيدلية / المدير / المشرف العام)
async function routeAdminLookSave(c) {
  const { request, env, ctx, clientIP, tenantId } = c;
  const { verifiedUser } = c.admin;
  if (!memRateLimit(\`look:\${clientIP}\`, 20, 60)) return jsonResponse({ success: false, message: "محاولات كثيرة، انتظري قليلاً" }, 429, request);
  try {
    const rawText = await request.text();
    if (rawText.length > DESIGN_MAX_BODY_CHARS) return jsonResponse({ success: false, message: "حجم التصميم أكبر من المسموح" }, 413, request);
    let body = {};
    try { body = JSON.parse(rawText || "{}"); } catch (e) { return jsonResponse({ success: false, message: "بيانات غير صالحة" }, 400, request); }
    if (!body || typeof body !== "object") body = {};

    const look = sanitizeLookInput(body.look);
    const colors = sanitizeDesignColors(body.colors);
    const hasBlocks = Array.isArray(body.homeBlocks);
    const hasCopy = !!body.copy && typeof body.copy === "object" && !Array.isArray(body.copy);
    const hasSeasons = Array.isArray(body.seasons);
    const homeBlocks = hasBlocks ? normalizeHomeBlocks(body.homeBlocks) : null;
    const copy = hasCopy ? normalizeCopy(body.copy) : null;
    const seasons = hasSeasons ? normalizeSeasons(body.seasons) : null;

    if (!Object.keys(look).length && !Object.keys(colors).length && !hasBlocks && !hasCopy && !hasSeasons) {
      return jsonResponse({ success: false, message: "لا توجد قيم تصميم صالحة" }, 400, request);
    }
    const fields = { ...colors };
    const mask = Object.keys(colors);
    if (Object.keys(look).length) { fields.look = look; mask.push("look"); }
    if (hasBlocks) { fields.homeBlocks = homeBlocks; mask.push("homeBlocks"); }
    if (hasCopy) { fields.copy = copy; mask.push("copy"); }
    if (hasSeasons) { fields.seasons = seasons; mask.push("seasons"); }
    await firestorePatchFields(env, \`pharmacies/\${tenantId}\`, fields, mask);

    // لقطة المتجر والثيم تُحدَّث فوراً (بلا قراءات إضافية للزوار)
    const snap = await buildAndStoreStorefront(tenantId, env).catch(() => null);
    await buildAndStoreTenantTheme(tenantId, env).catch(() => null);
    try {
      const cache = caches.default;
      const themeUrl = new URL("/api/theme", request.url);
      themeUrl.searchParams.set("pharmacy", tenantId);
      await cache.delete(new Request(themeUrl.toString()));
    } catch (e) { /* غير حرج */ }
    pharmacyCache.delete(tenantId);

    recordAuditLog(env, ctx, "حفظ تصميم المتجر", \`\${Object.keys(look).length} خيار + \${Object.keys(colors).length} لون\${hasBlocks ? " + كتل" : ""}\${hasCopy ? " + نصوص" : ""}\${hasSeasons ? " + مواسم" : ""}\`, verifiedUser.email, clientIP, tenantId);
    return jsonResponse({ success: true, look, colors, homeBlocks, copy, seasons, snapshotRebuilt: !!snap, message: "تم نشر التصميم ✓" }, 200, request);
  } catch (err) {
    return jsonResponse({ success: false, message: "تعذر حفظ التصميم: " + err.message }, 500, request);
  }
}

`;
}
const START = '// ================= 🎛️ نظام';
const END = '// POST /api/admin/orders/status (مشرف)';
function applyTo(workerSrc) {
  const a = workerSrc.indexOf(START), b = workerSrc.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error('لم أجد علامتي المقطع في worker.js (نظام ... / POST /api/admin/orders/status)');
  return workerSrc.slice(0, a) + buildRegion() + workerSrc.slice(b);
}
module.exports = { buildRegion, applyTo };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--print') || !args.length) { process.stdout.write(buildRegion()); process.exit(0); }
  const file = args[0], outIdx = args.indexOf('--out'), out = outIdx !== -1 ? args[outIdx + 1] : file;
  const next = applyTo(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(out, next);
  console.log('✅ تم تحديث مقطع التصميم في', out);
}
