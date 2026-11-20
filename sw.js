/* Service Worker محافظ: يخزّن صور الصيدليات فقط (/api/images/ غير قابلة للتغيير). لا يعترض HTML ولا JS ولا الـAPI، فلا خطر من نسخة قديمة عالقة. */
const IMG_CACHE = 'img-v1';
const MAX_IMAGES = 150;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== IMG_CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await cache.delete(keys[i]);
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (x) { return; }
  if (!url.pathname.startsWith('/api/images/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(IMG_CACHE);
    const hit = await cache.match(url.href);
    if (hit) return hit;
    try {
      // طلب CORS (الووركر يرسل Access-Control-Allow-Origin: *) كي لا تُخزَّن استجابة opaque مضخَّمة الحجم
      const res = await fetch(url.href, { mode: 'cors' });
      if (res.ok) { await cache.put(url.href, res.clone()); e.waitUntil(trim(cache)); }
      return res;
    } catch (err) { return fetch(req); }
  })());
});
