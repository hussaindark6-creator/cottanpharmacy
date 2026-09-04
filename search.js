/* ==========================================================
   SaaS Multi-Tenant Engine — js/search.js
   Version: 4.0.0 (Levenshtein Typo-Tolerance & Phonetic Search)
   ========================================================== */

import { normalizeArabic } from './security.js';

// قاموس الربط الصوتي بين التعريب العربي والأسماء الإنجليزية
const PHONETIC_MAP = {
  'لاروش': 'la roche posay',
  'سيرافي': 'cerave',
  'سيرفي': 'cerave',
  'سيمبل': 'simple',
  'ريفولي': 'revuele',
  'كوزمو': 'cosmo',
  'فيتشي': 'vichy',
  'بانادول': 'panadol',
  'بندول': 'panadol',
  'نياسيناميد': 'niacinamide',
  'هيالورونيك': 'hyaluronic',
  'ريتينول': 'retinol',
  'ساليسيليك': 'salicylic',
  'ابتاميل': 'aptamil',
  'ابتميل': 'aptamil',
  'بيبيلاك': 'bebelac',
  'سيميلاك': 'similac',
  'نان': 'nan',
  'نوفالاك': 'novalac',
  'بدياشور': 'pediasure'
};

// حساب المسافة التحريرية (Levenshtein Distance)
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // استبدال
          matrix[i][j - 1] + 1,     // إضافة
          matrix[i - 1][j] + 1      // حذف
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// فحص تطابق الكلمة مع مراعاة الأخطاء الإملائية
export function isFuzzyMatch(queryWord, targetWord) {
  if (!queryWord || !targetWord) return false;
  const q = normalizeArabic(queryWord);
  const t = normalizeArabic(targetWord);

  if (t.includes(q)) return true;

  // فحص القاموس الصوتي
  for (const [ar, en] of Object.entries(PHONETIC_MAP)) {
    if (q.includes(ar) && t.includes(en)) return true;
  }

  // السماح بخطأ واحد للكلمات 4-5 أحرف، وخطأين لأكثر من 5 أحرف
  if (q.length >= 4 && q.length <= 5) {
    return levenshteinDistance(q, t) <= 1;
  } else if (q.length > 5) {
    return levenshteinDistance(q, t) <= 2;
  }

  return false;
}

// محرك البحث الرئيسي على قائمة المنتجات
export function executeFuzzyProductSearch(query, productsList) {
  if (!query || !query.trim()) return productsList;
  const cleanQ = normalizeArabic(query.trim());
  const qTokens = cleanQ.split(' ').filter(Boolean);

  return productsList.filter(p => {
    if (p.isDeleted === true) return false;

    const nameNorm = normalizeArabic(p.name || '');
    const brandNorm = normalizeArabic(p.brand || '');
    const descNorm = normalizeArabic(p.description || '');
    const ingNorm = normalizeArabic(p.ingredients || p.medicalIndications || '');
    const barcodeNorm = (p.barcode || '').trim().toLowerCase();

    // فحص الباركود المباشر
    if (barcodeNorm && barcodeNorm.includes(cleanQ)) return true;

    // فحص كل كلمة مفتاحية
    return qTokens.every(token => {
      if (nameNorm.includes(token) || brandNorm.includes(token) || descNorm.includes(token) || ingNorm.includes(token)) {
        return true;
      }

      // البحث المرن بالأخطاء الإملائية على الكلمات
      const targetTokens = `${nameNorm} ${brandNorm}`.split(' ');
      return targetTokens.some(tWord => isFuzzyMatch(token, tWord));
    });
  });
}
