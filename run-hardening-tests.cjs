// فحوص حزمة التقوية (v7.9.0): تمنع التراجع عن إصلاحات الأمان والأداء
const fs = require('fs');
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name); };
const headers = fs.readFileSync('public/_headers', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');
const enforced = headers.split('\n').filter(l => /^\s*Content-Security-Policy:/.test(l));
t('CSP مُفرَضة موجودة للمتجر والأدمن', enforced.length >= 4);
t('CSP المُفرَضة بلا unsafe-eval ولا Tailwind', enforced.every(l => !/unsafe-eval|tailwindcss/.test(l)));
t('CSP تمنع object-src وتقيّد base-uri/frame-ancestors', enforced.every(l => /object-src 'none'/.test(l) && /base-uri 'self'/.test(l) && /frame-ancestors 'self'/.test(l)));
t('سكربتات assets/c مبصومة وغير قابلة للتغيير', /\/assets\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/.test(headers));
t('المتجر لا يحمّل firebase-firestore-compat', !/<script[^>]+firebase-firestore-compat\.js/.test(index));
t('script.js يتحمّل غياب مكتبة Firestore (db قد يكون null)', /typeof firebase\.firestore === 'function'/.test(script) && /ensureFirestoreLib/.test(script));
t('initFirestoreSync (محمّل المتجر) لا يشترط db', /function initFirestoreSync\(\) \{[\s\S]{0,400}?if \(!isFirebaseConfigured\) return Promise\.resolve\(\);/.test(script) && !/function initFirestoreSync\(\) \{[\s\S]{0,400}?!db\) return/.test(script));
t('Service Worker لا يعترض غير صور الصيدليات', /startsWith\('\/api\/images\/'\)/.test(fs.readFileSync('public/sw.js', 'utf8')));
t('صور البطاقات تحمل loading=lazy', (fs.readFileSync('storefront.js', 'utf8').match(/loading="lazy"/g) || []).length >= 6);
console.log(`\nالنتيجة: ${pass} نجح | ${fail} فشل`);
process.exit(fail ? 1 : 0);
