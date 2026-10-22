// 🔎 البحث الذكي: فهرس لكل منتج + تسامح بخطأ إملائي + ترتيب بالأقرب
// (ملف مستقل: يُحمَّل في index.html بعد script.js)

// ================= 🔎 فهرس البحث الذكي (يُحسب مرة لكل منتج) =================
const _searchIndexCache = new WeakMap();
function getSearchIndex(p) {
  let ix = _searchIndexCache.get(p);
  if (!ix) {
    const name = normalizeArabic(p.name || '');
    const brand = normalizeArabic(p.brand || '');
    const cat = normalizeArabic(((categories || []).find(c => c.id === p.category) || {}).label || '');
    const rest = normalizeArabic([p.description, p.ingredients, p.size].filter(Boolean).join(' '));
    const barcode = String(p.barcode || '').trim();
    ix = { name, brand, cat, rest, barcode, words: (name + ' ' + brand).split(' ').filter(w => w.length >= 3) };
    _searchIndexCache.set(p, ix);
  }
  return ix;
}

// هل المسافة بين الكلمتين (إضافة/حذف/استبدال حرف) ≤ 1؟ للتسامح مع الأخطاء الإملائية
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; } else if (la > lb) i++; else j++;
  }
  return edits + (la - i) + (lb - j) <= 1;
}

function scoreProductForQuery(p, qNorm, tokens) {
  const ix = getSearchIndex(p);
  if (!tokens.length) return 0;
  if (ix.barcode && ix.barcode === qNorm.replace(/\s/g, '')) return 100;
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    if (ix.name.includes(t)) s = 10;
    else if (ix.brand.includes(t)) s = 8;
    else if (ix.cat.includes(t)) s = 5;
    else if (ix.rest.includes(t) || (ix.barcode && ix.barcode.includes(t))) s = 3;
    else if (t.length >= 4 && ix.words.some(w => withinOneEdit(t, w))) s = 2;
    if (!s) return 0; // كل كلمة بالبحث يجب أن تجد مطابقة
    total += s;
  }
  return total + (ix.name.startsWith(qNorm) ? 5 : 0);
}
