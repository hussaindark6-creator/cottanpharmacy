import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

// 🌟 الخطوة 1+2: تغليف بـVite (3 نقاط دخول: المتجر، لوحة الصيدلية، لوحة السوبر أدمن) +
// متغيرات بيئة حقيقية (.env) محقونة عبر "define" وقت البناء — وليس عبر سكربت module منفصل
// بالمتصفح. السبب: script.js وsuper-admin.html سكربتات كلاسيكية عادية (غير module) حتى لا
// تنكسر مئات أزرار onclick="..." المعتمدة على النطاق العام (Global Scope) — ولو استخدمنا
// سكربت module منفصل لضبط window.__ENV__، فهو يُؤجَّل (Deferred) تلقائياً وقد يُنفَّذ بعد
// script.js الكلاسيكي العادي (الذي ينفَّذ فوراً عند قراءته)، فتصل القيم فارغة أحياناً —
// مشكلة توقيت حقيقية. الحل الصحيح: "define" يستبدل القيم وقت البناء نفسه (Compile Time)
// داخل كل ملف JS تتم معالجته عبر Vite (كلاسيكي أو module على حد سواء)، فلا يوجد أي اعتماد
// على ترتيب تنفيذ وقت التشغيل إطلاقاً.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY || ''),
      __FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || ''),
      __FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || ''),
      __FIREBASE_STORAGE_BUCKET__: JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET || ''),
      __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
      __FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID || ''),
      __FIREBASE_MEASUREMENT_ID__: JSON.stringify(env.VITE_FIREBASE_MEASUREMENT_ID || ''),
      __WORKER_API_BASE__: JSON.stringify(env.VITE_WORKER_API_BASE || ''),
      __SUPER_ADMIN_EMAIL__: JSON.stringify(env.VITE_SUPER_ADMIN_EMAIL || ''),
    },
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
