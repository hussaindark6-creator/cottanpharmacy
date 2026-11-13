import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

// 🌟 الخطوة 1+2: تغليف بـVite (3 نقاط دخول: المتجر، لوحة الصيدلية، لوحة السوبر أدمن) +
// متغيرات بيئة حقيقية (.env) محقونة عبر "define" وقت البناء — وليس عبر سكربت module منفصل
// بالمتصفح. السبب: script.js وsuper-admin.html سكربتات كلاسيكية عادية (غير module) حتى لا
// تنكسر مئات أزرار onclick="..." المعتمدة على النطاق العام (Global Scope) — ولو استخدمنا
// سكربت module منفصل لضبط window.__ENV__، فهو يُؤجَّل (Deferred) تلقائياً وقد يُنفَّذ بعد
// script.js الكلاسيكي العادي (الذي ينفَّذ فوراً عند قراءته)، فتصل القيم فارغة أحياناً —
// مشكلة توقيت حقيقية. الحل الصحيح: "define" يستبدل القيم وقت البناء نفسه (Compile Time)
// داخل كل ملف JS تتم معالجته عبر Vite (كلاسيكي أو module على حد سواء)، فلا يوجد أي اعتماد
// على ترتيب تنفيذ وقت التشغيل إطلاقاً.

// 🆕 المرحلة 3: ملفات السكربتات الكلاسيكية (بلا type="module") لا يضمّنها Vite ولا ينسخها إلى dist
// تلقائياً عند البناء. هذه الإضافة تنسخها بعد البناء مع تطبيق نفس قيم "define" (استبدال نصي وقت
// البناء)، حتى يعمل الموقع المنشور من dist بنفس سلوك التشغيل المحلي تماماً. لا تؤثر على npm run dev.
const CLASSIC_SCRIPTS = ['script.js', 'storefront.js', 'storefront-stubs.js', 'admin-stubs.js',
  'admin-core.js', 'admin-products.js', 'admin-catalog-tools.js', 'admin-orders.js', 'admin-reports.js', 'admin-marketing.js', 'admin-settings.js',
  'admin-page.js',
  'delivery-zones.js', 'smart-search.js', 'stock-alerts.js', 'reorder.js',
  'platform-host.js', 'template-contract.js', 'template-engine.js', 'super-admin-templates.js', 'super-admin-onboarding.js',
  'admin-order-tools.js', 'image-compress.js', 'admin-inventory-badges.js', 'admin-calm.js', 'look-registry.js', 'admin-studio.js',
  'super-admin-core.js', 'super-admin-pharmacies.js', 'super-admin-catalog.js', 'super-admin-billing.js', 'super-admin-reports.js', 'super-admin-platform.js'];
function copyClassicScripts(defineMap) {
  return {
    name: 'copy-classic-scripts',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      for (const file of CLASSIC_SCRIPTS) {
        const src = resolve(process.cwd(), file);
        if (!existsSync(src)) { console.warn(`[copy-classic-scripts] الملف غير موجود: ${file}`); continue; }
        let code = readFileSync(src, 'utf8');
        for (const [token, value] of Object.entries(defineMap)) code = code.split(token).join(value);
        writeFileSync(resolve(outDir, file), code);
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const defineMap = {
      __FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY || ''),
      __FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || ''),
      __FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || ''),
      __FIREBASE_STORAGE_BUCKET__: JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET || ''),
      __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
      __FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID || ''),
      __FIREBASE_MEASUREMENT_ID__: JSON.stringify(env.VITE_FIREBASE_MEASUREMENT_ID || ''),
      __WORKER_API_BASE__: JSON.stringify(env.VITE_WORKER_API_BASE || ''),
      __SUPER_ADMIN_EMAIL__: JSON.stringify(env.VITE_SUPER_ADMIN_EMAIL || ''),
      __TURNSTILE_SITE_KEY__: JSON.stringify(env.VITE_TURNSTILE_SITE_KEY || ''),
      __CF_ANALYTICS_TOKEN__: JSON.stringify(env.VITE_CF_ANALYTICS_TOKEN || ''),
      // 🌐 دومين المنصة: فارغ = السلوك القديم (لا وضع صارم). عند ضبطه تُفعَّل قواعد الدومينات (platform-host.js)
      __PLATFORM_ROOT_DOMAIN__: JSON.stringify(env.VITE_PLATFORM_ROOT_DOMAIN || ''),
      // (اختياري) المضيف الكامل لصيدلية القطن لتحويل رابط pages.dev القديم إليه، مثل cottan.example.com
      __LEGACY_REDIRECT_HOST__: JSON.stringify(env.VITE_LEGACY_REDIRECT_HOST || ''),
  };

  // ⚠️ بدون مفتاح Turnstile ببيئة البناء تبقى حماية البوتات مطفأة بصمت (الووركر وحده لا يكفي)
  if (mode === 'production' && !env.VITE_TURNSTILE_SITE_KEY) {
    console.warn('\n⚠️  VITE_TURNSTILE_SITE_KEY غير مضبوط: حماية Turnstile من البوتات غير مفعّلة بالموقع المنشور.\n');
  }

  return {
    define: defineMap,
    plugins: [copyClassicScripts(defineMap)],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
          superAdmin: resolve(__dirname, 'super-admin.html'),
        }
      }
    }
  };
});
