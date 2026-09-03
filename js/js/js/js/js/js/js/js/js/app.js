/* ==========================================================
   SaaS Multi-Tenant Pharmacy Engine — script.js
   Version: 4.2.0 (Master Enterprise Unified Engine - Zero Crash)
   ========================================================== */

// ================= 1. CONFIGURATION & DOMAIN RESOLVER =================
const DEFAULT_PHARMACY_ID = "cottanpharmacy";
const SUPER_ADMIN_EMAIL = "hussaindark6@gmail.com";
const WORKER_API_BASE = "https://cottanbackend.hussaindark6.workers.dev";

function getActivePharmacyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('pharmacy') || urlParams.get('p_id') || urlParams.get('p') || urlParams.get('id');
  if (paramId && paramId.trim()) {
    const cleanId = paramId.trim().toLowerCase();
    sessionStorage.setItem('saas_active_pharmacy_id', cleanId);
    return cleanId;
  }

  // تنظيف الذاكرة من كاش الاستضافة القديم
  const cachedId = sessionStorage.getItem('saas_active_pharmacy_id');
  const isPoisonedCache = cachedId && (
    cachedId.includes('pages.dev') ||
    cachedId.includes('pharmacies-') ||
    cachedId.includes('workers.dev') ||
    cachedId.includes('web.app') ||
    cachedId.includes('firebaseapp') ||
    cachedId.includes('localhost')
  );

  if (isPoisonedCache) {
    sessionStorage.removeItem('saas_active_pharmacy_id');
  } else if (cachedId && cachedId.trim()) {
    return cachedId.trim().toLowerCase();
  }

  const hostname = window.location.hostname.toLowerCase();
  const ignoredHostingDomains = [
    'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
    'github.io', 'vercel.app', 'netlify.app', 'localhost', '127.0.0.1'
  ];

  const isPlatformHost = ignoredHostingDomains.some(d => hostname === d || hostname.endsWith('.' + d));

  if (!isPlatformHost) {
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      const sub = parts[0].toLowerCase().trim();
      sessionStorage.setItem('saas_active_pharmacy_id', sub);
      return sub;
    }
  }

  return DEFAULT_PHARMACY_ID;
}

const currentPharmacyId = getActivePharmacyId();

function getTenantUrl(pagePath) {
  const cleanPath = pagePath.split('?')[0];
  return `${cleanPath}?pharmacy=${encodeURIComponent(currentPharmacyId)}`;
}

function patchTenantLinks() {
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && (href.startsWith('index.html') || href.startsWith('admin.html') || href === './' || href === '/')) {
      const page = href.split('?')[0];
      a.setAttribute('href', getTenantUrl(page));
    }
  });
}

// ================= 2. FIREBASE CONFIGURATION =================
const firebaseConfig = {
  apiKey: "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
  authDomain: "cottanpharmacy.firebaseapp.com",
  projectId: "cottanpharmacy",
  storageBucket: "cottanpharmacy.firebasestorage.app",
  messagingSenderId: "163407198551",
  appId: "1:163407198551:web:1c397d23733101456a6612",
  measurementId: "G-QC29GK2MDW"
};

let auth = null, db = null, currentUser = null, isFirebaseConfigured = false;
let currentStaffData = null;

try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    isFirebaseConfigured = true;

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
      console.warn("Persistence fallback:", err);
    });
  }
} catch (err) {
  console.warn("Firebase init error:", err);
}

const dbPaths = {
  pharmacyDoc: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId),
  privateSettingsDoc: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('private_settings').doc('config'),
  productsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('products'),
  ordersCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('orders'),
  staffCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('staff'),
  categoriesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('categories'),
  bundlesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('bundles'),
  couponsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('coupons'),
  notificationsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('notifications'),
  analyticsDailyCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('analytics_daily'),
  userCartDoc: (uid, pId = currentPharmacyId) => db.collection('users').doc(uid).collection('pharmacies').doc(pId)
};

// ================= 3. SECURITY & SANITIZATION =================
function sanitizeText(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtml(str) { return sanitizeText(str); }

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (/^https?:\/\//i.test(clean) || clean.startsWith('/') || clean.startsWith('./') || clean.startsWith('data:image/')) {
    return encodeURI(clean).replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
  }
  return '';
}

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[\s\-_]+/g, ' ');
}

function isSuperAdmin() {
  const user = auth ? auth.currentUser : currentUser;
  return !!(user && user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim());
}

function isCurrentUserAdmin() {
  if (isSuperAdmin()) return true;
  if (currentUser && pharmacyProfile.adminEmail && currentUser.email.toLowerCase().trim() === pharmacyProfile.adminEmail.toLowerCase().trim()) {
    return true;
  }
  if (!currentUser || !currentStaffData) return false;
  return currentStaffData.role === 'owner' || currentStaffData.role === 'manager' || currentStaffData.role === 'admin';
}

function assertAdmin() {
  if (!isCurrentUserAdmin()) {
    showToast('⚠️ غير مصرح: هذه العملية مخصصة لمشرف الصيدلية فقط.');
    return false;
  }
  return true;
}

const actionLocks = new Map();
function lockAction(actionKey, cooldownMs = 1500) {
  const now = Date.now();
  const last = actionLocks.get(actionKey) || 0;
  if (now - last < cooldownMs) {
    showToast('⏳ يرجى الانتظار لحظة قبل المحاولة مجدداً...');
    return false;
  }
  actionLocks.set(actionKey, now);
  return true;
}

function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const isIAB = /Telegram|Instagram|FBAN|FBAV|TikTok|Snapchat|Line|Twitter|MicroMessenger|WhatsApp|musical_ly/i.test(ua);
  let storageBlocked = false;
  try {
    sessionStorage.setItem('__test_storage', '1');
    sessionStorage.removeItem('__test_storage');
  } catch (e) {
    storageBlocked = true;
  }
  return isIAB || storageBlocked;
}

// ================= 4. SMART FUZZY SEARCH (LEVENSHTEIN + PHONETICS) =================
const PHONETIC_MAP = {
  'لاروش': 'la roche posay', 'سيرافي': 'cerave', 'سيرفي': 'cerave', 'سيمبل': 'simple',
  'ريفولي': 'revuele', 'كوزمو': 'cosmo', 'فيتشي': 'vichy', 'بانادول': 'panadol',
  'بندول': 'panadol', 'نياسيناميد': 'niacinamide', 'هيالورونيك': 'hyaluronic',
  'ريتينول': 'retinol', 'ساليسيليك': 'salicylic', 'ابتاميل': 'aptamil', 'بيبيلاك': 'bebelac'
};

function levenshteinDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function isFuzzyMatch(qWord, tWord) {
  if (!qWord || !tWord) return false;
  const q = normalizeArabic(qWord);
  const t = normalizeArabic(tWord);
  if (t.includes(q)) return true;

  for (const [ar, en] of Object.entries(PHONETIC_MAP)) {
    if (q.includes(ar) && t.includes(en)) return true;
  }

  if (q.length >= 4 && q.length <= 5) return levenshteinDistance(q, t) <= 1;
  if (q.length > 5) return levenshteinDistance(q, t) <= 2;
  return false;
}

function executeFuzzyProductSearch(query, productsList) {
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

    if (barcodeNorm && barcodeNorm.includes(cleanQ)) return true;

    return qTokens.every(token => {
      if (nameNorm.includes(token) || brandNorm.includes(token) || descNorm.includes(token) || ingNorm.includes(token)) return true;
      const targetTokens = `${nameNorm} ${brandNorm}`.split(' ');
      return targetTokens.some(tWord => isFuzzyMatch(token, tWord));
    });
  });
}

// ================= 5. CLIENT-SIDE WebP COMPRESSION & CLOUD R2 =================
async function compressImageToWebP(file, maxDimension = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > maxDimension) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
        } else {
          if (height > maxDimension) { width = Math.round((width * maxDimension) / height); height = maxDimension; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else canvas.toBlob(fallback => resolve(fallback), 'image/jpeg', quality);
        }, 'image/webp', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadDirectImageFile(fileInput, targetHiddenUrlId, previewImgId, previewBoxId) {
  const file = fileInput.files[0];
  if (!file) return;

  showToast('جاري ضغط ومعالجة الصورة سحابياً... ⏳');

  try {
    const compressedBlob = await compressImageToWebP(file, 1200, 0.82);
    const formData = new FormData();
    formData.append('file', compressedBlob, `img_${Date.now()}.webp`);

    const res = await fetch(`${WORKER_API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 'X-Pharmacy-Id': currentPharmacyId },
      body: formData
    });

    const data = await res.json();
    if (data && data.success && data.imageUrl) {
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = data.imageUrl;
      if (previewImgId) document.getElementById(previewImgId).src = data.imageUrl;
      if (previewBoxId) document.getElementById(previewBoxId).style.display = 'flex';
      showToast('تم رفع وحفظ الصورة بنجاح! 📸');
    } else {
      throw new Error(data.message || 'فشل الرفع');
    }
  } catch (err) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = base64;
      if (previewImgId) document.getElementById(previewImgId).src = base64;
      if (previewBoxId) document.getElementById(previewBoxId).style.display = 'flex';
      showToast('تم حفظ الصورة محلياً ✓');
    };
    reader.readAsDataURL(file);
  }
}

// ================= 6. ISOLATED STATE & PROFILE =================
const getStorageKey = (key) => `saas_${currentPharmacyId}_${key}`;

let brandsData = {
  'Cerave': { name: 'Cerave', color: '#5FAE6E', logoUrl: '' },
  'Simple': { name: 'Simple', color: '#C97F79', logoUrl: '' },
  'REVUELE': { name: 'REVUELE', color: '#D9A441', logoUrl: '' },
  'COSMO': { name: 'COSMO', color: '#B7A233', logoUrl: '' }
};

let categories = [];
let products = [];
let bundles = [];
let notifications = [];

let cart = JSON.parse(localStorage.getItem(getStorageKey('cart')) || '{}');
let wishlist = new Set(JSON.parse(localStorage.getItem(getStorageKey('wishlist')) || '[]'));
let myOrders = JSON.parse(localStorage.getItem(getStorageKey('my_orders')) || '[]');

let currentView = 'home';
let listingMode = null, listingValue = null, listingCatActive = 'all';
let currentProductId = null, pdQty = 1, pdActiveTab = 'desc', deliveryMethod = 'standard';
let appliedPromo = null;
let isLowStockFilterActive = false;

let previousViewBeforeProduct = 'home';
let previousScrollBeforeProduct = 0;

let pharmacyProfile = {
  id: currentPharmacyId,
  name: 'صيدلية القطن',
  templateId: 'template_default',
  primaryColor: '#E85D8A',
  logoUrl: '',
  bannerImgUrl: 'https://imgdb.io/i/EQ4D9ag.png',
  announcementText: '✨ أهلاً بكم في متجرنا الإلكتروني 🌸',
  showAnnouncement: true,
  showPharmacistBanner: true,
  pharmacistCtaTitle: 'استشر الصيدلي مجاناً 🩺',
  pharmacistCtaDesc: 'تحدث مع الصيدلي المختص مباشرة للحصول على تشخيص دقيق لروتينك وروشتتك',
  socialWhatsapp: '9647813703288',
  socialTelegram: '',
  socialInstagram: '',
  socialPhone: '07813703288',
  deliveryFeeStandard: 4000,
  deliveryFeeExpress: 8000,
  heroMainTitle: 'متجر الصيدلية',
  heroSubTitle: 'نحن هنا لتحسين صحتكم وجمالكم',
  heroDescTitle: 'منتجات أصلية ومعتمدة 100%',
  isActive: true,
  subscriptionExpiry: '2099-12-31',
  promoCards: []
};

function fmtPrice(n) { return (Number(n) || 0).toLocaleString('en-US') + ' د.ع'; }
function findProduct(id) { return products.find(p => String(p.id) === String(id)); }
function findBundle(id) { return bundles.find(b => String(b.id) === String(id)); }
function starIcon() { return `<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/></svg>`; }

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 62%)`;
}

function getBrandColor(brandName) {
  if (brandsData[brandName] && brandsData[brandName].color) return sanitizeText(brandsData[brandName].color);
  return hashColor(brandName || 'Pharmacy');
}

function saveLocalState() {
  localStorage.setItem(getStorageKey('cart'), JSON.stringify(cart));
  localStorage.setItem(getStorageKey('wishlist'), JSON.stringify([...wishlist]));
  localStorage.setItem(getStorageKey('my_orders'), JSON.stringify(myOrders));
  localStorage.setItem(getStorageKey('store_settings'), JSON.stringify(pharmacyProfile));
  localStorage.setItem(getStorageKey('products_cache'), JSON.stringify(products));
}

const icons = {
  bottle: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9" y="11" width="6" height="8.4" rx="0.8" fill="${c}" fill-opacity=".26"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><rect x="5" y="9" width="14" height="12" rx="2.6" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="6.4" y="11" width="11.2" height="8.4" rx="1.4" fill="${c}" fill-opacity=".26"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="1.3"/></svg>`,
  tube: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><path d="M8 3h8l1 4.5c.3 1.3.5 2.6.5 4V19a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2v-7.5c0-1.4.2-2.7.5-4L8 3Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="7.6" y="13" width="8.8" height="6.4" rx="1.2" fill="${c}" fill-opacity=".26"/></svg>`,
  spray: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><rect x="8" y="10" width="9" height="11.4" rx="2" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9.2" y="12" width="6.6" height="7.6" rx="1" fill="${c}" fill-opacity=".26"/><path d="M11 10V7.4a1.6 1.6 0 0 1 1.6-1.6h1.4M11.5 3.6h4" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`
};

const catIcons = {
  hair: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M6 20c1-4-1-7-1-10a7 7 0 0 1 14 0c0 3-2 6-1 10"/><path d="M9 20v-3M15 20v-3"/></svg>`,
  baby: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="13" r="7.5"/><path d="M9.5 12h.01M14.5 12h.01"/><path d="M10 15.5c.7.7 1.3 1 2 1s1.3-.3 2-1"/></svg>`,
  intimate: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M12 3c1.5 3 4 5 7 6-1 5-4 9-7 12-3-3-6-7-7-12 3-1 5.5-3 7-6Z"/><circle cx="12" cy="13" r="2.5"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><rect x="5" y="9" width="14" height="12" rx="2.6"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4"/></svg>`,
  bottle: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z"/></svg>`,
  sunscreen: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><rect x="8" y="6" width="8" height="15" rx="2"/><path d="M10 6V4.4a2 2 0 0 1 4 0V6"/></svg>`,
  body: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="5" r="2.3"/><path d="M7 21l1.5-8L6 9.5 8 8l4 2 4-2 2 1.5-2.5 3.5L17 21"/></svg>`,
  face: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>`
};

// ================= 7. DESIGN-TOKEN THEME ENGINE =================
const THEME_PRESETS = {
  template_default: {
    id: 'template_default',
    tokens: { '--radius-lg': '20px', '--radius-md': '16px', '--radius-sm': '12px', '--shadow-soft': '0 4px 20px rgba(0,0,0,0.05)' }
  },
  template_a: {
    id: 'template_a',
    tokens: { '--radius-lg': '24px', '--radius-md': '18px', '--radius-sm': '12px', '--shadow-soft': '0 8px 25px rgba(232,93,138,0.08)' }
  },
  template_b: {
    id: 'template_b',
    tokens: { '--radius-lg': '12px', '--radius-md': '8px', '--radius-sm': '6px', '--surface': '#F0F9FF', '--line': '#BAE6FD', '--shadow-soft': '0 2px 10px rgba(2,132,199,0.08)' }
  }
};

function applyTheme(templateId, hexColor) {
  const currentThemeConfig = THEME_PRESETS[templateId] || THEME_PRESETS.template_default;
  const root = document.documentElement;
  root.setAttribute('data-template', currentThemeConfig.id);

  for (const [prop, val] of Object.entries(currentThemeConfig.tokens)) {
    root.style.setProperty(prop, val);
  }

  const targetColor = hexColor || pharmacyProfile.primaryColor || '#E85D8A';
  if (/^#[0-9A-F]{6}$/i.test(targetColor)) {
    root.style.setProperty('--accent', targetColor);
    root.style.setProperty('--rose-deep', targetColor);
    const r = parseInt(targetColor.slice(1,3), 16), g = parseInt(targetColor.slice(3,5), 16), b = parseInt(targetColor.slice(5,7), 16);
    if (!currentThemeConfig.tokens['--surface']) {
      root.style.setProperty('--surface', `rgba(${r}, ${g}, ${b}, 0.08)`);
      root.style.setProperty('--surface-hover', `rgba(${r}, ${g}, ${b}, 0.14)`);
      root.style.setProperty('--line', `rgba(${r}, ${g}, ${b}, 0.18)`);
    }
  }
}

function selectProductVariantCard(buttonEl, productId) {
  const p = findProduct(productId);
  if (!p) return;
  const card = document.getElementById(`prod-card-${productId}`);
  if (!card) return;

  card.querySelectorAll('.p-variant-chip').forEach(btn => {
    btn.style.background = '#fff';
    btn.style.color = 'var(--ink)';
    btn.classList.remove('active');
  });

  buttonEl.style.background = 'var(--surface)';
  buttonEl.style.color = 'var(--rose-deep)';
  buttonEl.classList.add('active');

  const newPrice = Number(buttonEl.getAttribute('data-price') || p.price);
  const newOldPrice = buttonEl.getAttribute('data-oldprice');

  const priceValEl = document.getElementById(`price-val-${productId}`);
  const oldPriceValEl = document.getElementById(`oldprice-val-${productId}`);

  if (priceValEl) priceValEl.textContent = fmtPrice(newPrice);
  if (oldPriceValEl) {
    if (newOldPrice) {
      oldPriceValEl.textContent = fmtPrice(Number(newOldPrice));
      oldPriceValEl.style.display = 'inline';
    } else {
      oldPriceValEl.style.display = 'none';
    }
  }
}

function renderProductCard(p) {
  const color = getBrandColor(p.brand);
  const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
  const isWished = wishlist.has(p.id);
  const inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
  const stockQty = Number(p.stockQuantity !== undefined ? p.stockQuantity : 10);
  const cleanImg = sanitizeUrl(p.imageUrl);
  const isAdmin = isCurrentUserAdmin();

  const reviewCount = Number(p.reviews || 0);
  const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
  const ratingHtml = reviewCount > 0
    ? `${starIcon()} <span class="mono" style="font-weight:800;">${avgRating}</span> <span style="font-size:10px; color:var(--text-soft);">(${reviewCount})</span>`
    : `<span style="font-size:10.5px; color:var(--text-soft); font-weight:700;">⭐ جديد</span>`;

  let variantsHtml = '';
  if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
    variantsHtml = `
      <div class="p-variants-row" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;" onclick="event.stopPropagation()">
        ${p.variants.map((v, i) => `
          <button type="button" class="p-variant-chip ${i === 0 ? 'active' : ''}" 
            data-price="${v.price}" data-oldprice="${v.oldPrice || ''}"
            onclick="selectProductVariantCard(this, '${sanitizeText(p.id)}')"
            style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:6px; border:1px solid var(--line); background:${i === 0 ? 'var(--surface)' : '#fff'}; color:${i === 0 ? 'var(--rose-deep)' : 'var(--ink)'}; cursor:pointer;">
            ${sanitizeText(v.name || v.size)}
          </button>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="product-card" id="prod-card-${sanitizeText(p.id)}" onclick="openProduct('${sanitizeText(p.id)}', true)">
      <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${sanitizeText(p.id)}')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
      </button>
      ${discountPct ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
      ${!inStock ? `<span class="badge-out-stock">نفذت الكمية</span>` : ''}
      
      <div class="product-thumb" style="background:${color}18;">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(p.name)}" loading="lazy">` : (icons[p.type] || icons.bottle)(color)}
      </div>
      <div class="p-rating" style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
        ${ratingHtml}
      </div>
      <div class="p-name">${sanitizeText(p.name)}</div>
      <div class="p-size" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${sanitizeText(p.size || '')}</span>
        ${inStock && stockQty <= 5 && stockQty > 0 ? `<span style="color:#DC2626; font-size:10px; font-weight:800;">باقي ${stockQty} فقط!</span>` : ''}
      </div>

      ${variantsHtml}

      <div class="p-price-row">
        <span class="p-price mono" id="price-val-${sanitizeText(p.id)}">${fmtPrice(p.price)}</span>
        ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${sanitizeText(p.id)}">${fmtPrice(p.oldPrice)}</span>` : ''}
      </div>
      <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${sanitizeText(p.id)}')">
        ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
      </button>
    </div>`;
}

function renderBundleCard(b) {
  const includedProds = (b.productIds || []).map(pid => findProduct(pid)).filter(Boolean);
  const cleanImg = sanitizeUrl(b.imageUrl);

  return `
    <div class="bundle-card">
      <span class="bundle-savings-badge">${sanitizeText(b.savingsBadge || 'توفير فوري 💸')}</span>
      <div class="bundle-thumb-row">
        ${cleanImg ? `<img src="${cleanImg}" style="max-height:100px; object-fit:contain;">` : 
          includedProds.map((p, idx) => `
            <div class="bundle-thumb-item">
              ${p.imageUrl ? `<img src="${sanitizeUrl(p.imageUrl)}">` : (icons[p.type || 'bottle'] || icons.bottle)(getBrandColor(p.brand))}
            </div>
            ${idx < includedProds.length - 1 ? '<span class="bundle-plus-icon">+</span>' : ''}
          `).join('')
        }
      </div>
      <h3 class="bundle-title">${sanitizeText(b.title)}</h3>
      <p class="bundle-desc">${sanitizeText(b.description)}</p>
      <div class="bundle-items-list">
        <b>مكونات البكج:</b>
        ${includedProds.map(p => `<span>• ${sanitizeText(p.name)} (${sanitizeText(p.brand)})</span>`).join('')}
      </div>
      <div class="bundle-price-box">
        <div>
          <span class="p-price mono" style="font-size:17px; color:var(--rose-deep);">${fmtPrice(b.price)}</span>
          ${b.oldPrice ? `<span class="p-oldprice mono" style="margin-inline-start:6px;">${fmtPrice(b.oldPrice)}</span>` : ''}
        </div>
      </div>
      <button class="add-cart-btn" onclick="addBundleToCart('${sanitizeText(b.id)}')">
        🎁 أضف البكج كاملاً للسلة
      </button>
    </div>
  `;
}

function renderCategoryCard(c, count) {
  const cleanImg = sanitizeUrl(c.imageUrl);
  return `
    <div class="modern-cat-card" onclick="openCategory('${sanitizeText(c.id)}')">
      <div class="modern-cat-img-wrap">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(c.label)}">` : (catIcons[c.icon] || catIcons.jar)('var(--accent, #E85D8A)')}
      </div>
      <div class="modern-cat-info">
        <h3 class="modern-cat-title">${sanitizeText(c.label)}</h3>
        <span class="modern-cat-count mono">${count} منتج</span>
      </div>
    </div>
  `;
}

// ================= 8. ORDERS & ATOMIC CONCURRENCY CHECKOUT =================
async function executeAtomicOrderCheckout() {
  if (!lockAction('confirmOrder', 2500)) return;

  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');

  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';
  
  if (!name || !phone || !address) {
    showToast('يرجى تعبئة الاسم والهاتف والعنوان بالتفصيل أولاً');
    return;
  }
  if (phone.length < 8) {
    showToast('يرجى كتابة رقم هاتف صحيح');
    return;
  }

  const ids = Object.keys(cart);
  if (ids.length === 0) {
    showToast('سلتك فارغة!');
    return;
  }

  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'جاري التحقق من المخزون وتأكيد الطلب... ⏳';
  }

  localStorage.setItem('saas_customer_saved_profile', JSON.stringify({ name, phone, address }));

  let calculatedSubtotal = 0;
  const itemsPayload = ids.map(id => {
    const isBundle = id.startsWith('bundle_');
    const item = isBundle ? findBundle(id.replace('bundle_', '')) : findProduct(id);
    const unitPrice = item ? Number(item.price || 0) : 0;
    const qty = Number(cart[id] || 1);
    const lineTotal = unitPrice * qty;
    calculatedSubtotal += lineTotal;

    return {
      id: id,
      name: item ? (item.name || item.title) : 'منتج',
      unitPrice: unitPrice,
      price: unitPrice,
      quantity: qty,
      lineTotal: lineTotal,
      isBundle: isBundle
    };
  });

  const deliveryFee = (deliveryMethod === 'express') 
    ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) 
    : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);

  const discountAmount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const grandTotal = Math.max(0, calculatedSubtotal - discountAmount) + deliveryFee;
  const orderPrefix = (pharmacyProfile.name || 'ORD').substring(0, 4).toUpperCase();
  const orderId = `${orderPrefix}-${Math.floor(100000 + Math.random() * 900000)}`;

  const newOrderObj = {
    id: orderId,
    pharmacyId: currentPharmacyId,
    date: new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    name,
    phone,
    address,
    deliveryMethod,
    items: itemsPayload,
    subtotal: calculatedSubtotal,
    deliveryFee: deliveryFee,
    discountAmount: discountAmount,
    promoCode: appliedPromo ? appliedPromo.code : null,
    total: grandTotal,
    status: 'قيد المعالجة والتجهيز 🚚'
  };

  if (db) {
    try {
      await db.runTransaction(async (transaction) => {
        const productReads = [];
        for (const it of itemsPayload) {
          if (!it.isBundle) {
            const pRef = dbPaths.productsCol().doc(String(it.id));
            productReads.push({ ref: pRef, item: it });
          }
        }

        const readSnapshots = await Promise.all(productReads.map(p => transaction.get(p.ref)));

        for (let i = 0; i < readSnapshots.length; i++) {
          const snap = readSnapshots[i];
          const it = productReads[i].item;
          if (snap.exists) {
            const pData = snap.data();
            const currentStock = pData.stockQuantity !== undefined ? Number(pData.stockQuantity) : 999;
            if (currentStock < it.quantity) {
              throw new Error(`عذراً، نفدت كمية المنتج (${pData.name})، المتوفر بالمخزن (${currentStock}) قطعة فقط.`);
            }
          }
        }

        const orderRef = dbPaths.ordersCol().doc(orderId);
        transaction.set(orderRef, {
          ...newOrderObj,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        for (let i = 0; i < readSnapshots.length; i++) {
          const snap = readSnapshots[i];
          const it = productReads[i].item;
          if (snap.exists) {
            const pData = snap.data();
            const currentStock = pData.stockQuantity !== undefined ? Number(pData.stockQuantity) : 999;
            const newStock = Math.max(0, currentStock - it.quantity);
            transaction.update(productReads[i].ref, {
              stockQuantity: newStock,
              inStock: newStock > 0,
              orderCount: firebase.firestore.FieldValue.increment(it.quantity)
            });
          }
        }
      });
    } catch (err) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'تأكيد الطلب';
      }
      showToast(`⚠️ ${err.message}`);
      return;
    }
  }

  myOrders.unshift(newOrderObj);
  saveLocalState();

  // إرسال الفاتورة لتليجرام الصيدلية
  try {
    fetch(`${WORKER_API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId },
      body: JSON.stringify({
        customerName: name, customerPhone: phone, customerAddress: address,
        deliveryMethod, items: itemsPayload, promoCode: appliedPromo ? appliedPromo.code : null,
        discountAmount
      })
    }).catch(console.warn);
  } catch (e) {}

  const lines = itemsPayload.map(item => `• ${item.isBundle ? '🎁 [بكج توفير] ' : ''}${item.name} (${fmtPrice(item.unitPrice)} × ${item.quantity} قطع) = ${fmtPrice(item.lineTotal)}`);
  const deliveryLabel = deliveryMethod === 'express' ? `سريع (${fmtPrice(deliveryFee)})` : `عادي (${fmtPrice(deliveryFee)})`;
  const promoInfo = appliedPromo ? `🎟️ *كود الخصم:* ${appliedPromo.code} (-${fmtPrice(discountAmount)})\n` : '';

  const whatsappInvoiceMsg = 
    `🌸 *طلب جديد - ${pharmacyProfile.name || 'الصيدلية'}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *رقم الفاتورة:* #${orderId}\n` +
    `📅 *التاريخ:* ${newOrderObj.date}\n\n` +
    `👤 *اسم الزبون:* ${name}\n` +
    `📞 *رقم الهاتف:* ${phone}\n` +
    `📍 *العنوان بالتفصيل:* ${address}\n` +
    `🚚 *نوع التوصيل:* ${deliveryLabel}\n\n` +
    `📦 *المنتجات المطلوبة:*\n${lines.join('\n')}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *المجموع الفرعي:* ${fmtPrice(calculatedSubtotal)}\n` +
    `${promoInfo}` +
    `🚚 *أجرة التوصيل:* ${fmtPrice(deliveryFee)}\n` +
    `💰 *المجموع الإجمالي للدفع:* *${fmtPrice(grandTotal)}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `✨ يرجى تأكيد الطلب من قبل الصيدلي 🌸`;

  for (const k in cart) delete cart[k];
  saveLocalState();

  const targetPhone = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(whatsappInvoiceMsg)}`;

  const modalMsg = document.getElementById('successModalMsg');
  if (modalMsg) {
    modalMsg.textContent = `تم تسجيل طلبكِ رقم (#${orderId}) بنجاح بقيمة ${fmtPrice(grandTotal)}. جاري التوجيه للواتساب لتأكيد الشحن فوراً.`;
  }
  const successModal = document.getElementById('orderSuccessModal');
  if (successModal) successModal.classList.add('open');

  window.location.href = whatsappUrl;

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'تأكيد الطلب';
  }
}

function openReceiptModal(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId));
  if (!ord) return;

  let itemsSubtotal = 0;
  const tbody = document.getElementById('recItemsTbody');
  if (tbody) {
    tbody.innerHTML = (ord.items || []).map(it => {
      const unitPrice = Number(it.price || it.unitPrice || 0);
      const qty = Number(it.quantity || 1);
      const itemTotal = Number(it.lineTotal) || (unitPrice * qty);
      itemsSubtotal += itemTotal;

      return `
        <tr>
          <td>${sanitizeText(it.name)} ${it.isBundle ? '🎁' : ''} (${fmtPrice(unitPrice)})</td>
          <td style="text-align:center;">${qty}</td>
          <td class="mono" style="text-align:left;">${fmtPrice(itemTotal)}</td>
        </tr>
      `;
    }).join('');
  }

  const delFee = (ord.deliveryFee !== undefined) 
    ? Number(ord.deliveryFee) 
    : ((ord.deliveryMethod === 'express') ? (pharmacyProfile.deliveryFeeExpress || 8000) : (pharmacyProfile.deliveryFeeStandard || 4000));

  const discountVal = Number(ord.discountAmount || 0);
  const exactGrandTotal = Number(ord.total) || Math.max(0, itemsSubtotal - discountVal) + delFee;

  if (document.getElementById('recOrderId')) document.getElementById('recOrderId').textContent = '#' + ord.id;
  if (document.getElementById('recOrderDate')) document.getElementById('recOrderDate').textContent = ord.date || '';
  if (document.getElementById('recCustName')) document.getElementById('recCustName').textContent = ord.name || '';
  if (document.getElementById('recCustPhone')) document.getElementById('recCustPhone').textContent = ord.phone || '';
  if (document.getElementById('recCustAddress')) document.getElementById('recCustAddress').textContent = ord.address || '';
  if (document.getElementById('recDeliveryType')) document.getElementById('recDeliveryType').textContent = (ord.deliveryMethod === 'express') ? 'توصيل سريع 🛵' : 'توصيل عادي 🚚';
  if (document.getElementById('recStorePhone')) document.getElementById('recStorePhone').textContent = pharmacyProfile.socialPhone || '07813703288';

  const recStoreTitle = document.getElementById('recStoreHeaderTitle') || document.querySelector('.receipt-header h3');
  if (recStoreTitle) recStoreTitle.textContent = `${pharmacyProfile.name || 'الصيدلية'} 🌸`;

  if (document.getElementById('recDeliveryFee')) document.getElementById('recDeliveryFee').textContent = fmtPrice(delFee);
  if (document.getElementById('recGrandTotal')) document.getElementById('recGrandTotal').textContent = fmtPrice(exactGrandTotal);

  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.add('open');
}

function closeReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.remove('open');
}

// ================= 9. CART, WISHLIST & CLOUD SYNC =================
function addToCart(id, silent = false, quantity = 1) {
  cart[id] = (cart[id] || 0) + quantity;
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  if (!silent) showToast('تمت الإضافة للسلة ✓');
}

function addBundleToCart(bundleId) {
  const cartKey = 'bundle_' + bundleId;
  cart[cartKey] = (cart[cartKey] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  showToast('تمت إضافة البكج كاملاً للسلة بتخفيض التوفير! 🎁');
}

function changeCartQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  renderCart();
}

function removeCartItem(id) {
  delete cart[id];
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  renderCart();
}

function updateCartBadge() {
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const b1 = document.getElementById('cartBadge');
  const b2 = document.getElementById('bnCartBadge');
  if (b1) { b1.style.display = count > 0 ? 'flex' : 'none'; b1.textContent = count; }
  if (b2) { b2.style.display = count > 0 ? 'flex' : 'none'; b2.textContent = count; }
}

function getCartSubtotal() {
  return Object.keys(cart).reduce((sum, id) => {
    if (id.startsWith('bundle_')) {
      const b = findBundle(id.replace('bundle_', ''));
      return sum + (b ? Number(b.price || 0) * cart[id] : 0);
    } else {
      const p = findProduct(id);
      return sum + (p ? Number(p.price || 0) * cart[id] : 0);
    }
  }, 0);
}

async function syncCartToCloud() {
  if (!auth || !auth.currentUser || !db) return;
  try {
    await dbPaths.userCartDoc(auth.currentUser.uid).set({
      cart: cart,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {}
}

async function mergeCloudCartOnLogin(user) {
  if (!user || !db) return;
  try {
    const snap = await dbPaths.userCartDoc(user.uid).get();
    if (snap.exists) {
      const cloudCart = snap.data().cart || {};
      for (const [id, qty] of Object.entries(cloudCart)) {
        cart[id] = Math.max(cart[id] || 0, qty);
      }
      updateCartBadge();
      saveLocalState();
      renderCart();
    }
  } catch (e) {}
}

// ================= 10. SPA VIEWS CONTROLLER =================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  currentView = name;
  closeMenu();
  window.scrollTo({top: 0, behavior: 'instant'});

  ['home', 'wishlist', 'categories', 'bundles', 'orders', 'cart', 'account'].forEach(k => {
    const el = document.getElementById('bn-' + k);
    if (el) el.classList.toggle('active', name === k);
  });

  if (name === 'checkout') checkAndAutofillCustomer();
  if (name === 'account') renderAccountView();
  renderCurrentActiveView();
}

function renderCurrentActiveView() {
  if (currentView === 'home') renderHome();
  else if (currentView === 'listing') renderListing();
  else if (currentView === 'categories') renderModernCategories();
  else if (currentView === 'bundles') renderAllBundles();
  else if (currentView === 'orders') renderMyOrders();
  else if (currentView === 'offers') renderOffers();
  else if (currentView === 'wishlist') renderWishlist();
  else if (currentView === 'cart') renderCart();
  else if (currentView === 'checkout') renderCheckoutSummary();
  else if (currentView === 'account') renderAccountView();
  else if (currentView === 'product' && currentProductId) {
    const p = findProduct(currentProductId);
    if (p) renderProductDetailDOM(p);
  }
}

function renderHome() {
  renderBrandStrip();
  renderHomeProductGrid();
  renderHomeBundles();
  renderPromoBanners();
}

let homeActiveBrand = 'all';
function renderHomeProductGrid() {
  const title = document.getElementById('homeGridTitle');
  if (!title) return;
  
  let list = products.filter(p => p.isDeleted !== true);
  if (homeActiveBrand === 'all') {
    title.textContent = 'الأكثر مبيعاً 🔥';
    list = list.sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0));
  } else {
    title.textContent = 'منتجات ' + homeActiveBrand;
    list = list.filter(p => p.brand === homeActiveBrand);
  }

  renderProductGrid('bestSellersGrid', list);
}

function selectHomeBrand(brand) {
  homeActiveBrand = brand;
  renderBrandStrip();
  renderHomeProductGrid();
}

function renderBrandStrip() {
  const strip = document.getElementById('brandStrip');
  if (!strip) return;
  const brandKeys = Object.keys(brandsData);

  const allChip = `
    <div class="brand-chip ${homeActiveBrand === 'all' ? 'active' : ''}" onclick="selectHomeBrand('all')">
      <div class="brand-chip-all-box">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      </div>
      <span class="brand-chip-title">الكل</span>
    </div>`;

  strip.innerHTML = allChip + brandKeys.map(k => {
    const b = brandsData[k];
    const isActive = homeActiveBrand === k;
    const cleanLogo = sanitizeUrl(b.logoUrl);

    return `
      <div class="brand-chip ${isActive ? 'active' : ''}" onclick="selectHomeBrand('${sanitizeText(k)}')">
        <div class="brand-chip-img-box">
          ${cleanLogo ? `<img class="brand-chip-img" src="${cleanLogo}" alt="${sanitizeText(b.name || k)}">` : `<div class="brand-chip-placeholder" style="background:${sanitizeText(b.color)};">${(b.name || k).charAt(0).toUpperCase()}</div>`}
        </div>
        <span class="brand-chip-title">${sanitizeText(b.name || k)}</span>
      </div>`;
  }).join('');
}

function renderProductGrid(targetId, list, emptyMsg) {
  const el = document.getElementById(targetId);
  if (!el) return;

  let displayList = (list || []).filter(p => p.isDeleted !== true);
  if (isLowStockFilterActive) {
    displayList = displayList.filter(p => p.inStock === false || (p.stockQuantity !== undefined && p.stockQuantity <= 0));
  }

  if (displayList.length === 0) {
    el.innerHTML = `<div class="no-results">${sanitizeText(emptyMsg) || 'لا توجد منتجات مطابقة حالياً.'}</div>`;
    return;
  }

  el.innerHTML = displayList.map(p => renderProductCard(p)).join('');
}

function renderModernCategories() {
  const container = document.getElementById('catRowFull');
  const totalCountEl = document.getElementById('categoriesTotalCount');
  if (totalCountEl) totalCountEl.textContent = `${categories.length} أقسام معتمدة`;
  
  if (container) {
    container.innerHTML = categories.map(c => {
      const count = products.filter(p => p.category === c.id && p.isDeleted !== true).length;
      return renderCategoryCard(c, count);
    }).join('');
  }
}

function renderHomeBundles() {
  const sec = document.getElementById('homeBundlesSection');
  const grid = document.getElementById('homeBundlesGrid');
  if (!sec || !grid) return;

  if (bundles.length === 0) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = 'block';
  grid.innerHTML = bundles.map(b => renderBundleCard(b)).join('');
}

function renderAllBundles() {
  const grid = document.getElementById('allBundlesGrid');
  const countEl = document.getElementById('allBundlesCount');
  if (countEl) countEl.textContent = bundles.length + ' بكجات توفير';
  if (!grid) return;

  if (bundles.length === 0) {
    grid.innerHTML = `<div class="no-results">لا توجد بكجات توفير متاحة حالياً 🌸</div>`;
    return;
  }

  grid.innerHTML = bundles.map(b => renderBundleCard(b)).join('');
}

function renderOffers() {
  const discounted = products.filter(p => (p.oldPrice || p.isSpecialOffer) && p.isDeleted !== true);
  const countEl = document.getElementById('offersCount');
  if (countEl) countEl.textContent = discounted.length + ' عرض';
  renderProductGrid('offersGrid', discounted);
}

function renderWishlist() {
  const list = products.filter(p => wishlist.has(p.id) && p.isDeleted !== true);
  renderProductGrid('wishlistGrid', list, 'قائمتك المفضلة فارغة حالياً 🌸');
}

function renderCart() {
  const ids = Object.keys(cart);
  const listEl = document.getElementById('cartItemsList');
  const summaryEl = document.getElementById('cartSummaryBlock');
  const promoBadge = document.getElementById('appliedPromoBadge');
  if (!listEl || !summaryEl) return;

  if (ids.length === 0) {
    listEl.innerHTML = `<div class="no-results">سلتك فارغة — تصفّحي المنتجات وأضيفي ما يعجبك.</div>`;
    summaryEl.innerHTML = '';
    if (promoBadge) promoBadge.style.display = 'none';
    return;
  }

  listEl.innerHTML = ids.map(id => {
    const isBundle = id.startsWith('bundle_');
    const item = isBundle ? findBundle(id.replace('bundle_', '')) : findProduct(id);
    if (!item) return '';
    const qty = cart[id];
    const cleanImg = sanitizeUrl(item.imageUrl);
    const color = isBundle ? '#10B981' : getBrandColor(item.brand);

    return `
      <div class="cart-item">
        <div class="thumb" style="background:${color}18;">
          ${cleanImg ? `<img src="${cleanImg}">` : (icons[item.type || 'bottle'] || icons.bottle)(color)}
        </div>
        <div class="info">
          <div class="name">${isBundle ? '🎁 [بكج] ' : ''}${sanitizeText(item.name || item.title)}</div>
          <div class="brand">${sanitizeText(item.brand || item.savingsBadge || '')}</div>
          <div class="cart-qty-row">
            <button class="cart-qty-btn" onclick="changeCartQty('${sanitizeText(id)}', -1)">−</button>
            <span class="cart-qty-val mono">${qty}</span>
            <button class="cart-qty-btn" onclick="changeCartQty('${sanitizeText(id)}', 1)">+</button>
            <span class="cart-remove" onclick="removeCartItem('${sanitizeText(id)}')">حذف</span>
          </div>
        </div>
        <span class="p-price mono">${fmtPrice(item.price * qty)}</span>
      </div>`;
  }).join('');

  const subtotal = getCartSubtotal();
  const discount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const fee = (deliveryMethod === 'express') ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  if (appliedPromo && promoBadge) {
    promoBadge.style.display = 'flex';
    promoBadge.className = 'applied-promo-tag';
    promoBadge.innerHTML = `<span>🎟️ تم تفعيل كود الخصم: <b>${appliedPromo.code}</b> (-${fmtPrice(discount)})</span><button type="button" onclick="removePromoCode()" style="color:#DC2626; font-weight:900; background:none; cursor:pointer;">✕</button>`;
  } else if (promoBadge) {
    promoBadge.style.display = 'none';
  }

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row discount-row"><span>خصم الكوبون (${appliedPromo.code})</span><span class="mono">-${fmtPrice(discount)}</span></div>` : ''}
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>
    <button class="checkout-btn" onclick="showView('checkout')">متابعة الطلب</button>`;
}

function renderCheckoutSummary() {
  const summaryEl = document.getElementById('checkoutSummaryBlock');
  if (!summaryEl) return;
  const subtotal = getCartSubtotal();
  const discount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const fee = (deliveryMethod === 'express') ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row discount-row"><span>خصم الكوبون (${appliedPromo.code})</span><span class="mono">-${fmtPrice(discount)}</span></div>` : ''}
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>`;
}

function renderPromoBanners() {
  const el = document.getElementById('promoBanners');
  if (!el) return;
  const cards = pharmacyProfile.promoCards || [];

  if (cards.length === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="section-head"><span></span><h2>عروض مميزة 🎁</h2></div>
    ${cards.map(c => {
      const cleanImg = sanitizeUrl(c.img);
      return `
        <div class="promo-banner">
          <div class="promo-thumb">${cleanImg ? `<img src="${cleanImg}">` : icons.bottle('var(--accent, #E85D8A)')}</div>
          <div class="promo-body">
            <h3>${sanitizeText(c.title)}</h3>
            <p>${sanitizeText(c.desc)}</p>
            <div class="promo-discount">${sanitizeText(c.discount)}</div>
            <button class="promo-cta" onclick="showView('offers')">تسوقي الآن</button>
          </div>
        </div>`;
    }).join('')}`;
}

function renderMyOrders() {
  const container = document.getElementById('myOrdersContainer');
  const countEl = document.getElementById('myOrdersCount');
  if (countEl) countEl.textContent = myOrders.length + ' طلب';
  if (!container) return;

  if (myOrders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:40px 16px;">لا توجد لديكِ طلبات مسجلة حتى الآن 🌸<br><button onclick="showView('home')" style="margin-top:14px; background:var(--accent); color:#fff; font-weight:800; font-size:12.5px; padding:8px 20px; border-radius:999px;">تصفح المنتجات</button></div>`;
    return;
  }

  container.innerHTML = myOrders.map(ord => {
    const items = ord.items || [];
    let itemsCalcSubtotal = 0;
    
    const itemsHtml = items.map(it => {
      const unitPrice = Number(it.price || it.unitPrice || 0);
      const qty = Number(it.quantity || 1);
      const lineTotal = Number(it.lineTotal) || (unitPrice * qty);
      itemsCalcSubtotal += lineTotal;
      return `
        <div class="order-item-row">
          <span>• ${it.isBundle ? '🎁 [بكج] ' : ''}${sanitizeText(it.name)} (${fmtPrice(unitPrice)} × ${qty} قطع)</span>
          <span class="mono" style="font-weight:800;">${fmtPrice(lineTotal)}</span>
        </div>
      `;
    }).join('');

    const delFee = (ord.deliveryFee !== undefined) ? Number(ord.deliveryFee) : (ord.deliveryMethod === 'express' ? 8000 : 4000);
    const discountVal = Number(ord.discountAmount || 0);
    const subtotalVal = Number(ord.subtotal) || itemsCalcSubtotal;
    const finalTotal = Number(ord.total) || Math.max(0, subtotalVal - discountVal) + delFee;

    const isProcessing = ord.status === 'قيد المعالجة والتجهيز 🚚';
    const isCancelled = ord.status && ord.status.includes('ملغي');

    return `
      <div class="order-card">
        <div class="order-card-header">
          <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
          <span class="order-card-status ${isCancelled ? 'cancelled' : ''}">${sanitizeText(ord.status || 'قيد المعالجة والتجهيز 🚚')}</span>
        </div>
        <div class="order-tracker-timeline">
          <div class="order-step done"><div class="order-step-dot">1</div><span>تم الطلب</span></div>
          <div class="order-step ${ord.status && (ord.status.includes('الشحن') || ord.status.includes('التسليم')) ? 'done active' : ''}"><div class="order-step-dot">2</div><span>خرج للتوصيل</span></div>
          <div class="order-step ${ord.status && ord.status.includes('التسليم') ? 'done' : ''}"><div class="order-step-dot">3</div><span>تم التسليم</span></div>
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-bottom:8px;">
          التاريخ: <span class="mono">${sanitizeText(ord.date)}</span> · العنوان: ${sanitizeText(ord.address)}
        </div>
        <div style="background:var(--surface); border-radius:10px; padding:10px; margin-bottom:8px;">
          ${itemsHtml}
        </div>
        <div class="order-pricing-box">
          <div class="order-pricing-row"><span>المجموع الفرعي:</span><span class="mono">${fmtPrice(subtotalVal)}</span></div>
          ${discountVal > 0 ? `<div class="order-pricing-row discount-row"><span>🎟️ خصم الكوبون:</span><span class="mono">-${fmtPrice(discountVal)}</span></div>` : ''}
          <div class="order-pricing-row"><span>أجرة التوصيل:</span><span class="mono">+${fmtPrice(delFee)}</span></div>
        </div>
        <div class="order-card-footer">
          <div>
            ${isProcessing ? `<button type="button" class="btn-cancel-order" onclick="cancelMyOrder('${sanitizeText(ord.id)}')">❌ إلغاء الطلب</button>` : ''}
          </div>
          <div>
            <span style="font-size:12px; color:var(--text-soft);">المجموع الكلي: </span>
            <span class="mono" style="color:var(--rose-deep); font-size:16px;">${fmtPrice(finalTotal)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderProductDetailDOM(p) {
  const color = getBrandColor(p.brand);
  const pdImgEl = document.getElementById('pdImage');
  if (!pdImgEl) return;
  pdImgEl.style.background = color + '18';
  const cleanImg = sanitizeUrl(p.imageUrl);
  pdImgEl.innerHTML = cleanImg ? `<img src="${cleanImg}">` : (icons[p.type] || icons.bottle)(color);

  document.getElementById('pdBrand').textContent = p.brand || '';
  document.getElementById('pdName').textContent = p.name + (p.size ? ' — ' + p.size : '');

  const reviewCount = Number(p.reviews || 0);
  const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : 'جديد';
  document.getElementById('pdRating').innerHTML = `${starIcon()} ${avgRating} (${reviewCount} تقييم)`;

  const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
  document.getElementById('pdPriceRow').innerHTML = `
    <span class="pd-price mono">${fmtPrice(p.price)}</span>
    ${p.oldPrice ? `<span class="pd-oldprice mono">${fmtPrice(p.oldPrice)}</span>` : ''}`;

  const stockEl = document.getElementById('pdStock');
  const inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
  stockEl.className = inStock ? 'pd-stock' : 'pd-stock out';
  stockEl.innerHTML = inStock ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7"/></svg><span>متوفر بالمخزون (${p.stockQuantity !== undefined ? p.stockQuantity : 'متوفر'} قطعة)</span>` : `<span>نفذت الكمية حالياً</span>`;

  document.getElementById('pdTabDesc').textContent = p.description || 'منتج أصلي معتمد من الصيدلية.';
  document.getElementById('pdTabIng').textContent = p.ingredients || p.medicalIndications || 'تركيبة غنية ومفحوصة جلدياً وطبياً.';
  document.getElementById('pdTabUse').textContent = p.usage || 'يُوضع على بشرة نظيفة وفق الإرشادات الصيدلانية.';

  const rated = localStorage.getItem(getStorageKey('rated_' + p.id));
  document.querySelectorAll('.star-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', rated && idx < Number(rated));
  });
  const msgEl = document.getElementById('instantRatingMsg');
  if (msgEl) msgEl.textContent = rated ? `تقييمكِ المسجل: ${rated} نجوم ⭐` : '';

  renderCrossSelling(p);
  switchPdTab('desc');
  document.getElementById('pdQtyVal').textContent = pdQty;

  document.getElementById('pdAddBtn').onclick = () => {
    if (inStock) addToCart(p.id, false, pdQty);
    else showToast('عذراً، المنتج غير متوفر حالياً');
  };
}

function rateProductInstant(stars) {
  if (!currentProductId) return;
  const p = findProduct(currentProductId);
  if (!p) return;

  const ratedKey = getStorageKey('rated_' + currentProductId);
  if (localStorage.getItem(ratedKey)) {
    showToast('لقد قمتِ بتقييم هذا المنتج مسبقاً ⭐');
    return;
  }
  localStorage.setItem(ratedKey, String(stars));

  const currentReviews = Number(p.reviews || 0);
  const currentRating = Number(p.rating || 5.0);

  const newReviews = currentReviews + 1;
  const newRating = Number((((currentRating * currentReviews) + stars) / newReviews).toFixed(1));

  p.rating = newRating;
  p.reviews = newReviews;

  if (db) {
    dbPaths.productsCol().doc(String(currentProductId)).set({ rating: newRating, reviews: newReviews }, { merge: true }).catch(console.warn);
  }

  document.querySelectorAll('.star-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx < stars);
  });
  const msgEl = document.getElementById('instantRatingMsg');
  if (msgEl) msgEl.textContent = `تم تسجيل تقييمك (${stars} نجوم) بنجاح! شكراً لكِ 🌸`;
  showToast(`تم تقييم المنتج بـ ${stars} نجوم ⭐`);
  saveLocalState();
  renderProductDetailDOM(p);
}

function openProduct(id, isUserClick = false) {
  if (isUserClick) {
    previousViewBeforeProduct = (currentView !== 'product') ? currentView : 'home';
    previousScrollBeforeProduct = window.scrollY || 0;
  }

  currentProductId = id;
  pdQty = 1;
  const p = findProduct(id);
  if (!p) return;

  if (isUserClick && db) {
    dbPaths.productsCol().doc(String(id)).set({
      views: firebase.firestore.FieldValue.increment(1)
    }, { merge: true }).catch(e => console.warn(e));
  }

  renderProductDetailDOM(p);

  document.documentElement.style.scrollBehavior = 'auto';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const pView = document.getElementById('view-product');
  if (pView) {
    pView.classList.add('active');
    currentView = 'product';
    window.scrollTo(0, 0);
  }
}

function goBackFromProduct() {
  const targetView = previousViewBeforeProduct || 'home';
  const targetScroll = previousScrollBeforeProduct || 0;
  showView(targetView);
  window.scrollTo(0, targetScroll);
}

function switchPdTab(tab) {
  document.querySelectorAll('.pd-tab').forEach((el,i) => el.classList.toggle('active', ['desc','ing','use','reviews'][i] === tab));
  const dTab = document.getElementById('pdTabDesc');
  const iTab = document.getElementById('pdTabIng');
  const uTab = document.getElementById('pdTabUse');
  const rTab = document.getElementById('pdTabReviews');
  if (dTab) dTab.classList.toggle('active', tab === 'desc');
  if (iTab) iTab.classList.toggle('active', tab === 'ing');
  if (uTab) uTab.classList.toggle('active', tab === 'use');
  if (rTab) rTab.classList.toggle('active', tab === 'reviews');
}

function changePdQty(delta) {
  pdQty = Math.max(1, pdQty + delta);
  const qtyEl = document.getElementById('pdQtyVal');
  if (qtyEl) qtyEl.textContent = pdQty;
}

function renderCrossSelling(currentP) {
  const grid = document.getElementById('pdSuggestedGrid');
  if (!grid || !currentP) return;

  const suggestions = products
    .filter(p => p.id !== currentP.id && p.isDeleted !== true && (p.brand === currentP.brand || p.category !== currentP.category))
    .slice(0, 4);

  renderProductGrid('pdSuggestedGrid', suggestions);
}

function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  listingMode = 'search';
  listingValue = term;
  listingCatActive = 'all';
  renderListing();
  showListingView();
}

function openCategory(catId) {
  listingMode = 'category';
  listingValue = catId;
  listingCatActive = catId;
  renderListing();
  showListingView();
}

function openBestSellers() {
  listingMode = 'bestsellers';
  listingValue = null;
  listingCatActive = 'all';
  renderListing();
  showListingView();
}

function showListingView() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const lView = document.getElementById('view-listing');
  if (lView) lView.classList.add('active');
  currentView = 'listing';
  window.scrollTo({top: 0, behavior: 'instant'});
}

function renderListing() {
  const titleEl = document.getElementById('listingTitle');
  if (!titleEl) return;
  const titles = {
    category: (categories.find(c => c.id === listingValue) || {}).label,
    search: `نتائج البحث عن: "${listingValue}"`,
    bestsellers: 'الأكثر مبيعاً 🔥'
  };
  titleEl.textContent = titles[listingMode] || 'المنتجات';

  let list = products.filter(p => p.isDeleted !== true);
  if (listingMode === 'category') {
    list = list.filter(p => p.category === listingValue);
  } else if (listingMode === 'search') {
    list = executeFuzzyProductSearch(listingValue, products);
  } else if (listingMode === 'bestsellers') {
    list = list.sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0));
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
}

function selectDelivery(method) {
  deliveryMethod = method;
  const std = document.getElementById('delStandard');
  const exp = document.getElementById('delExpress');
  if (std) std.classList.toggle('selected', method === 'standard');
  if (exp) exp.classList.toggle('selected', method === 'express');
  renderCheckoutSummary();
}

async function applyPromoCode(code) {
  if (!code || !code.trim()) {
    showToast('يرجى كتابة كود الخصم أولاً');
    return;
  }
  const subtotal = getCartSubtotal();
  if (subtotal <= 0) {
    showToast('السلة فارغة!');
    return;
  }

  showToast('جاري التحقق من كود الخصم...');
  try {
    const cleanCode = code.trim().toUpperCase();
    const snap = await dbPaths.couponsCol().doc(cleanCode).get();

    if (snap.exists) {
      const c = snap.data();
      if (!c.active) {
        showToast('كود الخصم غير مفعل حالياً ❌');
        return;
      }
      const todayStr = new Date().toISOString().split('T')[0];
      if (c.expiry && c.expiry < todayStr) {
        showToast('كود الخصم منتهي الصلاحية ❌');
        return;
      }
      if (c.minSpend && subtotal < Number(c.minSpend)) {
        showToast(`الحد الأدنى لتفعيل الكود هو ${fmtPrice(c.minSpend)}`);
        return;
      }

      let discountAmount = (c.type === 'percentage') 
        ? Math.round(subtotal * (Number(c.value) / 100))
        : Number(c.value);

      appliedPromo = { code: cleanCode, discountAmount };
      showToast('تم تطبيق الخصم بنجاح! 🎉');
      renderCart();
      renderCheckoutSummary();
      return;
    }
  } catch (err) {
    console.warn(err);
  }

  appliedPromo = null;
  showToast('كود الخصم غير صالح أو منتهي الصلاحية ❌');
  renderCart();
  renderCheckoutSummary();
}

function removePromoCode() {
  appliedPromo = null;
  showToast('تم إلغاء كود الخصم');
  renderCart();
  renderCheckoutSummary();
}

function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderCurrentActiveView();
}

function openMenu() {
  document.getElementById('menuDrawer')?.classList.add('open');
  document.getElementById('menuOverlay')?.classList.add('open');
}

function closeMenu() {
  document.getElementById('menuDrawer')?.classList.remove('open');
  document.getElementById('menuOverlay')?.classList.remove('open');
}

function openWhatsapp() {
  const targetNumber = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  window.open(`https://wa.me/${targetNumber}`, '_blank');
}

function checkAndAutofillCustomer() {
  const saved = JSON.parse(localStorage.getItem('saas_customer_saved_profile') || 'null');
  const noticeBox = document.getElementById('autofillNoticeBox');
  if (saved) {
    const nameEl = document.getElementById('custName');
    const phoneEl = document.getElementById('custPhone');
    const addrEl = document.getElementById('custAddress');
    if (nameEl && !nameEl.value) nameEl.value = saved.name || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = saved.phone || '';
    if (addrEl && !addrEl.value) addrEl.value = saved.address || '';
    if (noticeBox) noticeBox.style.display = 'flex';
  }
}

function clearSavedCustomerData() {
  localStorage.removeItem('saas_customer_saved_profile');
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addrEl = document.getElementById('custAddress');
  if (nameEl) nameEl.value = '';
  if (phoneEl) phoneEl.value = '';
  if (addrEl) addrEl.value = '';
  document.getElementById('autofillNoticeBox')?.style.setProperty('display', 'none');
  showToast('تم مسح البيانات المحفوظة');
}

async function cancelMyOrder(orderId) {
  if (!confirm('هل أنتِ متأكدة من رغبتكِ في إلغاء هذا الطلب؟')) return;
  const ord = myOrders.find(o => String(o.id) === String(orderId));
  if (!ord) return;

  ord.status = 'طلب ملغي من قبل الزبون ❌';
  saveLocalState();
  renderMyOrders();

  if (db) {
    try {
      await dbPaths.ordersCol().doc(String(orderId)).set({
        status: 'طلب ملغي من قبل الزبون ❌',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      showToast('تم إلغاء طلبكِ بنجاح ❌');
    } catch (err) {
      console.warn(err);
    }
  }
}

// ================= 11. AUTH & USER PROFILE =================
function updateUserHeaderProfile() {
  const chipAvatar = document.getElementById('userChipAvatar');
  const chipName = document.getElementById('userChipName');
  const bnAccountLbl = document.getElementById('bnAccountLbl');

  if (currentUser) {
    const rawName = currentUser.displayName || currentUser.email || 'حسابي';
    const firstName = sanitizeText(rawName.split(' ')[0].split('@')[0]);
    if (chipName) chipName.textContent = firstName;
    if (bnAccountLbl) bnAccountLbl.textContent = firstName;
    const cleanPhoto = sanitizeUrl(currentUser.photoURL);
    if (chipAvatar) {
      chipAvatar.innerHTML = cleanPhoto 
        ? `<img src="${cleanPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : `<span style="font-size:12px; font-weight:900; color:var(--accent, #E85D8A);">${firstName.charAt(0).toUpperCase()}</span>`;
    }
  } else {
    if (chipName) chipName.textContent = 'دخول';
    if (bnAccountLbl) bnAccountLbl.textContent = 'حسابي';
    if (chipAvatar) {
      chipAvatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;display:block;"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>`;
    }
  }
}

function renderAccountView() {
  const container = document.getElementById('accountAuthContainer');
  if (!container) return;

  if (currentUser) {
    const isAdmin = isCurrentUserAdmin();
    const cleanPhoto = sanitizeUrl(currentUser.photoURL);
    container.innerHTML = `
      <div class="account-card">
        <div class="user-profile-header">
          <div class="user-avatar"><img src="${cleanPhoto || 'https://imgdb.io/i/EQ4D9ag.png'}"></div>
          <div class="user-info">
            <h3>${sanitizeText(currentUser.displayName || currentUser.email)} ${isAdmin ? '⭐ (مشرف الصيدلية)' : ''}</h3>
            <p>${sanitizeText(currentUser.email || '')}</p>
            <div class="sync-indicator"><span class="sync-dot"></span><span>البيانات متزامنة مع ${sanitizeText(pharmacyProfile.name || 'الصيدلية')}</span></div>
          </div>
        </div>
        ${isAdmin ? `<a class="auth-btn-google" style="margin-bottom:10px; background:#FEF3C7; color:#92400E; font-weight:800; display:flex;" href="${getTenantUrl('admin.html')}">⚙️ لوحة تحكم وإدارة الصيدلية</a>` : ''}
        <button class="auth-btn-google" style="margin-bottom:10px;" onclick="showView('orders')">📦 عرض طلباتي وتتبع الشحن</button>
        <button class="auth-btn-logout" onclick="handleSignOut()">تسجيل الخروج</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="account-card">
        <div style="font-size:38px; margin-bottom:8px;">🌸</div>
        <h3 style="font-size:17px; font-weight:900; margin:0 0 6px;">مرحباً بك في ${sanitizeText(pharmacyProfile.name || 'الصيدلية')}</h3>
        <p style="font-size:12.5px; color:var(--text-soft); margin:0 0 20px;">سجلي الدخول بنقرة واحدة لحفظ منتجاتك المفضلة ومتابعة طلباتكِ:</p>
        <button class="auth-btn-google" onclick="signInWithGoogle()">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          تسجيل الدخول المباشر عبر Google
        </button>
      </div>`;
  }
}

function signInWithGoogle() {
  if (!auth) {
    showToast('خدمة تسجيل الدخول غير مهيأة');
    return;
  }
  if (isInAppBrowser()) {
    document.getElementById('iabModal')?.classList.add('open');
    return;
  }
  showToast('جاري التحويل إلى Google...');
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithRedirect(provider);
}

async function handleSignOut() {
  if (auth) await auth.signOut();
  currentUser = null;
  currentStaffData = null;
  updateUserHeaderProfile();
  renderAccountView();
  showToast('تم تسجيل الخروج بنجاح');
}

function applyStoreSettings() {
  applyTheme(pharmacyProfile.templateId || 'template_default', pharmacyProfile.primaryColor);

  document.title = `${pharmacyProfile.name || 'الصيدلية'} | المتجر الإلكتروني`;

  const headerLogoText = document.getElementById('headerLogoText');
  const drawerLogoTitle = document.getElementById('drawerLogoTitle');
  if (headerLogoText) headerLogoText.textContent = pharmacyProfile.name || 'الصيدلية';
  if (drawerLogoTitle) drawerLogoTitle.textContent = pharmacyProfile.name || 'الصيدلية';

  const headerLogoMark = document.getElementById('headerLogoMark');
  if (headerLogoMark) {
    if (pharmacyProfile.logoUrl) {
      headerLogoMark.innerHTML = `<img src="${sanitizeUrl(pharmacyProfile.logoUrl)}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      headerLogoMark.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #E85D8A)" stroke-width="2"><circle cx="12" cy="8" r="3"/><circle cx="8" cy="10" r="3"/><circle cx="16" cy="10" r="3"/><path d="M12 13v7"/></svg>`;
    }
  }

  const annEl = document.getElementById('announcementBar');
  const annTextEl = document.getElementById('announcementText');
  const heroImgEl = document.getElementById('primaryHeroBannerImg');
  const pharmWrap = document.getElementById('homePharmacistCtaWrap');
  const drawerPharmBtn = document.getElementById('drawerConsultBtn');

  if (annEl) {
    const isVisible = (pharmacyProfile.showAnnouncement !== false);
    annEl.style.display = isVisible ? 'flex' : 'none';
  }
  if (annTextEl && pharmacyProfile.announcementText) {
    annTextEl.textContent = pharmacyProfile.announcementText;
  }
  if (heroImgEl && pharmacyProfile.bannerImgUrl) heroImgEl.src = sanitizeUrl(pharmacyProfile.bannerImgUrl);

  if (pharmWrap) {
    const isPharmVisible = (pharmacyProfile.showPharmacistBanner !== false);
    pharmWrap.style.display = isPharmVisible ? 'block' : 'none';
  }
  if (drawerPharmBtn) {
    const isPharmVisible = (pharmacyProfile.showPharmacistBanner !== false);
    drawerPharmBtn.style.display = isPharmVisible ? 'flex' : 'none';
  }

  const wLink = document.getElementById('drawerSocialWhatsapp');
  const tLink = document.getElementById('drawerSocialTelegram');
  const iLink = document.getElementById('drawerSocialInstagram');
  const pLink = document.getElementById('drawerSocialPhone');

  const cleanWa = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  if (wLink) wLink.href = `https://wa.me/${cleanWa}`;
  if (tLink) tLink.href = pharmacyProfile.socialTelegram || '#';
  if (iLink) iLink.href = pharmacyProfile.socialInstagram || '#';
  if (pLink) pLink.href = `tel:${pharmacyProfile.socialPhone || ''}`;
}

// ================= 12. REALTIME FIRESTORE SYNC =================
function initFirestoreRealtimeSync() {
  if (!isFirebaseConfigured || !db) return;

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) {
      pharmacyProfile = { ...pharmacyProfile, ...doc.data() };
      applyStoreSettings();
      renderHome();
      checkStorefrontSubscriptionLock();
    }
  }, err => console.warn(err));

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      categories = loaded;
      renderModernCategories();
    }
  }, err => console.warn(err));

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      bundles = loaded;
      renderHomeBundles();
      renderAllBundles();
    }
  }, err => console.warn(err));

  dbPaths.productsCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(doc => loaded.push({ id: doc.id, ...doc.data() }));
      products = loaded;
      saveLocalState();
      renderCurrentActiveView();
    }
  }, err => console.warn(err));
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ================= 13. GLOBAL WINDOW EXPOSURE =================
window.App = {
  showView, addToCart, addBundleToCart, changeCartQty, removeCartItem,
  selectDelivery, applyPromoCode, removePromoCode, toggleWishlist,
  openProduct, goBackFromProduct, switchPdTab, changePdQty, rateProductInstant,
  openCategory, openBestSellers, selectHomeBrand, onSearch, openMenu, closeMenu,
  openWhatsapp, executeAtomicOrderCheckout, openReceiptModal, closeReceiptModal,
  cancelMyOrder, clearSavedCustomerData, selectProductVariantCard,
  signInWithGoogle, handleSignOut
};

// دوال مباشرة للنطاق العام
window.showView = showView;
window.addToCart = addToCart;
window.addBundleToCart = addBundleToCart;
window.changeCartQty = changeCartQty;
window.removeCartItem = removeCartItem;
window.selectDelivery = selectDelivery;
window.applyPromoCode = applyPromoCode;
window.removePromoCode = removePromoCode;
window.toggleWishlist = toggleWishlist;
window.openProduct = openProduct;
window.goBackFromProduct = goBackFromProduct;
window.switchPdTab = switchPdTab;
window.changePdQty = changePdQty;
window.rateProductInstant = rateProductInstant;
window.openCategory = openCategory;
window.openBestSellers = openBestSellers;
window.selectHomeBrand = selectHomeBrand;
window.onSearch = onSearch;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openWhatsapp = openWhatsapp;
window.executeAtomicOrderCheckout = executeAtomicOrderCheckout;
window.cancelMyOrder = cancelMyOrder;
window.clearSavedCustomerData = clearSavedCustomerData;
window.signInWithGoogle = signInWithGoogle;
window.handleSignOut = handleSignOut;

// ================= 14. SAFE BOOTSTRAP =================
function bootstrapApp() {
  patchTenantLinks();
  applyStoreSettings();
  renderHome();
  renderModernCategories();
  updateCartBadge();
  updateUserHeaderProfile();
  initFirestoreRealtimeSync();

  if (auth) {
    auth.onAuthStateChanged(user => {
      currentUser = user;
      updateUserHeaderProfile();
      renderAccountView();
      if (user) mergeCloudCartOnLogin(user);
    });
  }
}

// تشغيل فوري بدون انتظار إذا كانت الصفحة محملة مسبقاً
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
