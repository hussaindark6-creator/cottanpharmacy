/* ==========================================================
   SaaS Multi-Tenant Pharmacy Engine — script.js
   Version: 6.0.0 (Master Enterprise Edition - Zero Omission)
   ========================================================== */

// ================= 1. SUBDOMAIN & SLUG RESOLVER =================
const DEFAULT_PHARMACY_ID = "cottanpharmacy";

function getActivePharmacyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('pharmacy') || urlParams.get('p_id') || urlParams.get('p') || urlParams.get('id');

  if (paramId && paramId.trim()) {
    const cleanId = paramId.trim().toLowerCase();
    sessionStorage.setItem('saas_active_pharmacy_id', cleanId);
    return cleanId;
  }

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
    // 🌐 دومين/نطاق فرعي مربوط من لوحة السوبر أدمن (system/custom_domains): نسأل الووركر مرة واحدة ونحفظ النتيجة
    // محلياً 24 ساعة (والنتيجة السلبية ساعة) — وإلا يُتجاهل أي دومين مخصص ويُفتح متجر الصيدلية الافتراضية.
    const mapped = resolveCustomDomainTenant(hostname);
    if (mapped) {
      sessionStorage.setItem('saas_active_pharmacy_id', mapped);
      return mapped;
    }
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      const sub = parts[0].toLowerCase().trim();
      sessionStorage.setItem('saas_active_pharmacy_id', sub);
      return sub;
    }
  }

  return DEFAULT_PHARMACY_ID;
}

// يعمل متزامناً (XHR) لأن معرّف الصيدلية مطلوب قبل أي تهيئة أخرى، لكن فقط عند أول زيارة للدومين أو بعد انتهاء
// الكاش المحلي. (WORKER_API_BASE معرَّف لاحقاً بالملف فنعيد حساب عنوان الووركر هنا لتفادي TDZ.)
function resolveCustomDomainTenant(hostname) {
  const cacheKey = 'saas_domain_map_' + hostname;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() < cached.expires) return cached.tenantId || null;
  } catch (e) {}
  try {
    const base = typeof __WORKER_API_BASE__ !== 'undefined' && __WORKER_API_BASE__ ? __WORKER_API_BASE__ : "https://cottanbackend.hussaindark6.workers.dev";
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${base}/api/tenant/lookup-by-domain?hostname=${encodeURIComponent(hostname)}`, false);
    xhr.timeout = 0;
    xhr.send(null);
    let tenantId = null;
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      if (data && data.success && data.tenantId) tenantId = String(data.tenantId).toLowerCase().trim();
    }
    if (xhr.status === 200 || xhr.status === 404) {
      localStorage.setItem(cacheKey, JSON.stringify({ tenantId, expires: Date.now() + (tenantId ? 24 : 1) * 3600 * 1000 }));
    }
    return tenantId;
  } catch (e) {
    return null;
  }
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
// 🌟 (الخطوة 2 — متغيرات بيئة حقيقية) القيم بين __مزدوج__ تُستبدَل فعلياً وقت البناء بقيم
// ملف .env عبر إعداد "define" بـvite.config.js. التعبير "typeof X !== 'undefined' ? X : fallback"
// آمن تماماً: لو شُغِّل هذا الملف خارج Vite بلا أي استبدال (نادراً، كفحص يدوي مثلاً)، فحص
// typeof على معرّف غير معرَّف أصلاً لا يرمي خطأ إطلاقاً، ويرجع 'undefined' بأمان، فتُستخدم
// القيمة الاحتياطية المطابقة للقيمة الأصلية تماماً — صفر خطر بأي سيناريو.
const WORKER_API_BASE = typeof __WORKER_API_BASE__ !== 'undefined' && __WORKER_API_BASE__ ? __WORKER_API_BASE__ : "https://cottanbackend.hussaindark6.workers.dev";
// Cloudflare Turnstile (اختياري): ضعي VITE_TURNSTILE_SITE_KEY بملف .env لتفعيل حماية الطلبات من البوتات
const TURNSTILE_SITE_KEY = typeof __TURNSTILE_SITE_KEY__ !== 'undefined' && __TURNSTILE_SITE_KEY__ ? __TURNSTILE_SITE_KEY__ : '';
const ABSOLUTE_MAX_UNIT_PRICE = 50000000;
const SUPER_ADMIN_EMAIL = typeof __SUPER_ADMIN_EMAIL__ !== 'undefined' && __SUPER_ADMIN_EMAIL__ ? __SUPER_ADMIN_EMAIL__ : "hussaindark6@gmail.com";

const firebaseConfig = {
  apiKey: typeof __FIREBASE_API_KEY__ !== 'undefined' && __FIREBASE_API_KEY__ ? __FIREBASE_API_KEY__ : "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
  authDomain: typeof __FIREBASE_AUTH_DOMAIN__ !== 'undefined' && __FIREBASE_AUTH_DOMAIN__ ? __FIREBASE_AUTH_DOMAIN__ : "cottanpharmacy.firebaseapp.com",
  projectId: typeof __FIREBASE_PROJECT_ID__ !== 'undefined' && __FIREBASE_PROJECT_ID__ ? __FIREBASE_PROJECT_ID__ : "cottanpharmacy",
  storageBucket: typeof __FIREBASE_STORAGE_BUCKET__ !== 'undefined' && __FIREBASE_STORAGE_BUCKET__ ? __FIREBASE_STORAGE_BUCKET__ : "cottanpharmacy.firebasestorage.app",
  messagingSenderId: typeof __FIREBASE_MESSAGING_SENDER_ID__ !== 'undefined' && __FIREBASE_MESSAGING_SENDER_ID__ ? __FIREBASE_MESSAGING_SENDER_ID__ : "163407198551",
  appId: typeof __FIREBASE_APP_ID__ !== 'undefined' && __FIREBASE_APP_ID__ ? __FIREBASE_APP_ID__ : "1:163407198551:web:1c397d23733101456a6612",
  measurementId: typeof __FIREBASE_MEASUREMENT_ID__ !== 'undefined' && __FIREBASE_MEASUREMENT_ID__ ? __FIREBASE_MEASUREMENT_ID__ : "G-QC29GK2MDW"
};

let auth = null, db = null, currentUser = null, isFirebaseConfigured = false;
let currentStaffData = null;

try {
  if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
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

// ================= 3. HIERARCHICAL FIRESTORE PATHS =================
const dbPaths = {
  pharmacyDoc: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId),
  productsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('products'),
  ordersCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('orders'),
  staffCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('staff'),
  categoriesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('categories'),
  bundlesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('bundles'),
  couponsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('coupons'),
  notificationsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('notifications'),
  analyticsDailyCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('analytics_daily'),
  systemDoc: (docId = 'payment_info') => db.collection('system').doc(docId),
  masterCatalogCol: () => db.collection('system').doc('master_catalog').collection('products'),
  masterCatalogSubmissionsCol: () => db.collection('system').doc('master_catalog_submissions').collection('submissions')
};

// ================= 4. SANITIZATION, FUZZY SEARCH & SECURITY =================
function sanitizeText(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

// 🔐 لم يعد إيميل المالك يُرسل للزوار نصاً (الووركر يرسل SHA-256 فقط)؛ نحسب تجزئة إيميل المستخدم الحالي مرة
// واحدة عند تسجيل الدخول ونقارنها. المقارنة بالإيميل الصريح تبقى تعمل لمن يقرأ مستند الصيدلية مباشرة (الطاقم).
let currentUserEmailHash = '';
async function computeEmailHash(email) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').toLowerCase().trim()));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return ''; }
}

function isCurrentUserAdmin() {
  if (isSuperAdmin()) return true;
  if (currentUser && currentUser.email && pharmacyProfile.adminEmail && currentUser.email.toLowerCase().trim() === pharmacyProfile.adminEmail.toLowerCase().trim()) {
    return true;
  }
  if (currentUser && currentUserEmailHash && pharmacyProfile.adminEmailHash && currentUserEmailHash === pharmacyProfile.adminEmailHash) {
    return true;
  }
  if (!currentUser || !currentStaffData) return false;
  return currentStaffData.role === 'owner' || currentStaffData.role === 'manager' || currentStaffData.role === 'admin';
}

function assertAdmin(showToastFn = showToast) {
  if (!isCurrentUserAdmin()) {
    if (typeof showToastFn === 'function') showToastFn('⚠️ غير مصرح: هذه العملية مخصصة لمشرف الصيدلية فقط.');
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
window.manualRebuildR2Catalog = manualRebuildR2Catalog;

// ================= 5. ICONS & GRAPHICS =================
const icons = {
  bottle: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;max-width:100%;max-height:100%;" fill="none"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9" y="11" width="6" height="8.4" rx="0.8" fill="${c}" fill-opacity=".26"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;max-width:100%;max-height:100%;" fill="none"><rect x="5" y="9" width="14" height="12" rx="2.6" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="6.4" y="11" width="11.2" height="8.4" rx="1.4" fill="${c}" fill-opacity=".26"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="1.3"/></svg>`,
  tube: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;max-width:100%;max-height:100%;" fill="none"><path d="M8 3h8l1 4.5c.3 1.3.5 2.6.5 4V19a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2v-7.5c0-1.4.2-2.7.5-4L8 3Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="7.6" y="13" width="8.8" height="6.4" rx="1.2" fill="${c}" fill-opacity=".26"/></svg>`,
  spray: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;max-width:100%;max-height:100%;" fill="none"><rect x="8" y="10" width="9" height="11.4" rx="2" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9.2" y="12" width="6.6" height="7.6" rx="1" fill="${c}" fill-opacity=".26"/><path d="M11 10V7.4a1.6 1.6 0 0 1 1.6-1.6h1.4M11.5 3.6h4" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`
};

const catIcons = {
  hair: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><path d="M6 20c1-4-1-7-1-10a7 7 0 0 1 14 0c0 3-2 6-1 10"/><path d="M9 20v-3M15 20v-3"/></svg>`,
  baby: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="13" r="7.5"/><path d="M9.5 12h.01M14.5 12h.01"/><path d="M10 15.5c.7.7 1.3 1 2 1s1.3-.3 2-1"/></svg>`,
  intimate: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><path d="M12 3c1.5 3 4 5 7 6-1 5-4 9-7 12-3-3-6-7-7-12 3-1 5.5-3 7-6Z"/><circle cx="12" cy="13" r="2.5"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><rect x="5" y="9" width="14" height="12" rx="2.6"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4"/></svg>`,
  bottle: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z"/></svg>`,
  sunscreen: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><rect x="8" y="6" width="8" height="15" rx="2"/><path d="M10 6V4.4a2 2 0 0 1 4 0V6"/></svg>`,
  body: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="5" r="2.3"/><path d="M7 21l1.5-8L6 9.5 8 8l4 2 4-2 2 1.5-2.5 3.5L17 21"/></svg>`,
  face: c => `<svg viewBox="0 0 24 24" width="36" height="36" style="width:36px;height:36px;" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>`,
};

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 62%)`;
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
let archivedProducts = [];
let bundles = [];
let notifications = [];
let staffMembers = [];

let cart = JSON.parse(localStorage.getItem(getStorageKey('cart')) || '{}');
let wishlist = new Set(JSON.parse(localStorage.getItem(getStorageKey('wishlist')) || '[]'));
let readNotifs = new Set(JSON.parse(localStorage.getItem(getStorageKey('read_notifs')) || '[]'));
let myOrders = JSON.parse(localStorage.getItem(getStorageKey('my_orders')) || '[]');

let currentView = 'home';
let listingMode = null, listingValue = null, listingCatActive = 'all';
let currentProductId = null, pdQty = 1, pdActiveTab = 'desc', deliveryMethod = 'standard';
let appliedPromo = null;
let isLowStockFilterActive = false;

let previousViewBeforeProduct = 'home';
let previousScrollBeforeProduct = 0;

let totalOrdersCount = 0;
let todayVisitsCount = 0;
let todayRevenue = 0;
let monthlyRevenue = 0;
// 📊 (البند 10) متغيرات لوحة التحكم الجديدة — صافي الربح وعدد الطلبات اليومي/الشهري
let todayProfit = 0;
let monthlyProfit = 0;
let todayOrdersCount = 0;
let monthlyOrdersCount = 0;
// 📊 (إعادة بناء الداشبورد) متغيرات المقارنة والتقرير الاحترافي الجديدة
let yesterdayRevenue = 0;
let lastMonthRevenue = 0;
let avgOrderValueToday = 0;
let avgOrderValueMonth = 0;
let topCategoriesThisMonth = [];
let weeklyVisitsData = [];

let pharmacyProfile = {
  id: currentPharmacyId,
  name: 'الصيدلية',
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
  loaderImgUrl: '',
  loaderCircleSize: 150,
  loaderTitle: 'جاري تحميل الموقع',
  loaderSubText: 'انتظر لحظة من فضلك ..',
  loaderBgColor: 'linear-gradient(160deg, #FDF2F6 0%, #FFF9FB 45%, #FBEAF1 100%)',
  isActive: true,
  subscriptionExpiry: '2099-12-31',
  subscriptionPrice: 50000,
  maxPriceCap: 150000,
  telegramConfig: { botToken: '', chatId: '', enabled: false },
  promoCards: []
};

let superAdminPaymentInfo = {
  cardHolder: 'Hussain Super Admin',
  qiCardNumber: '---- ---- ---- ----',
  zainCashNumber: '07813703288',
  fibAccount: 'FIB-12345678',
  notes: 'يرجى إرسال صورة وصل التحويل عبر الواتساب لتجديد الاشتراك فورياً'
};

function fmtPrice(n) { return (Number(n) || 0).toLocaleString('en-US') + ' د.ع'; }
function findProduct(id) { return products.find(p => String(p.id) === String(id)); }
function findBundle(id) { return bundles.find(b => String(b.id) === String(id)); }
function starIcon() { return `<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/></svg>`; }

function saveLocalState() {
  localStorage.setItem(getStorageKey('cart'), JSON.stringify(cart));
  localStorage.setItem(getStorageKey('wishlist'), JSON.stringify([...wishlist]));
  localStorage.setItem(getStorageKey('my_orders'), JSON.stringify(myOrders));
  localStorage.setItem(getStorageKey('store_settings'), JSON.stringify(pharmacyProfile));
  localStorage.setItem(getStorageKey('products_cache'), JSON.stringify(products));
}

function getBrandColor(brandName) {
  if (brandsData[brandName] && brandsData[brandName].color) return sanitizeText(brandsData[brandName].color);
  return hashColor(brandName || 'Pharmacy');
}

// ================= 7. DYNAMIC THEME LOADER =================
const TEMPLATE_MODULE_MAP = {
  'template-one': 'templates/template_a.js',
  'template_a': 'templates/template_a.js',
  'template-two': 'templates/template_b.js',
  'template_b': 'templates/template_b.js',
  'default': 'templates/template_default.js',
  'template_default': 'templates/template_default.js'
};

let activeThemeModule = null;

function getTemplateHelpers() {
  return {
    sanitizeText,
    sanitizeUrl,
    fmtPrice,
    getBrandColor,
    starIcon,
    icons,
    catIcons,
    wishlist,
    findProduct,
    findBundle,
    isCurrentUserAdmin
  };
}

async function loadDynamicTheme(templateId) {
  const targetKey = templateId || pharmacyProfile.templateId || 'template_default';
  const targetFile = TEMPLATE_MODULE_MAP[targetKey] || 'templates/template_default.js';

  try {
    const module = await import(`./${targetFile}?t=${Date.now()}`);
    activeThemeModule = module.default || module.TemplateA || module.TemplateB || module.TemplateDefault || window.TemplateDefault;
    if (!activeThemeModule) throw new Error("Template module export is empty");
  } catch (err) {
    console.warn(`[Theme Engine] خطأ في تحميل القالب (${targetKey}):`, err);
    try {
      const fallbackModule = await import(`./templates/template_default.js?t=${Date.now()}`);
      activeThemeModule = fallbackModule.default || fallbackModule.TemplateDefault || window.TemplateDefault;
    } catch (fallbackErr) {
      activeThemeModule = null;
    }
  }

  if (activeThemeModule && typeof activeThemeModule.applyStyles === 'function') {
    try {
      activeThemeModule.applyStyles(pharmacyProfile);
    } catch (e) {
      console.warn("[Theme Engine] خطأ في تطبيق أنماط القالب:", e);
    }
  } else {
    applyPharmacyTemplate(targetKey);
  }
}

function applyDynamicThemeColor(hexColor) {
  if (!hexColor || !/^#[0-9A-F]{6}$/i.test(hexColor)) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', hexColor);
  root.style.setProperty('--rose-deep', hexColor);
  
  const r = parseInt(hexColor.slice(1,3), 16);
  const g = parseInt(hexColor.slice(3,5), 16);
  const b = parseInt(hexColor.slice(5,7), 16);
  
  root.style.setProperty('--surface', `rgba(${r}, ${g}, ${b}, 0.08)`);
  root.style.setProperty('--surface-hover', `rgba(${r}, ${g}, ${b}, 0.14)`);
  root.style.setProperty('--line', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.style.setProperty('--rose', `rgba(${r}, ${g}, ${b}, 0.4)`);
  root.style.setProperty('--accent-dark', `rgb(${Math.max(0, r-30)}, ${Math.max(0, g-30)}, ${Math.max(0, b-30)})`);
}

function applyPharmacyTemplate(templateId = 'template-one') {
  const htmlRoot = document.getElementById('htmlRoot') || document.documentElement;
  htmlRoot.setAttribute('data-template', templateId);
}

function removePromoCode() {
  appliedPromo = null;
  showToast('تم إلغاء كود الخصم');
  renderCart();
  renderCheckoutSummary();
}

// ================= 13. BUNDLES SYSTEM (CATEGORIZED TABBED SELECTOR — FIX #2) =================
let currentBundleSelectedProductIds = [];

// ================= 17. HERO SLIDER OFFERS & PROMO CARDS CRUD (CATEGORIZED SELECTOR — FIX #2) =================
let currentOfferSelectedProductIds = [];

// ================= 18. REAL ANALYTICS =================
// 🛡️ (توفير قراءات/كتابات Firestore) تم إيقاف عدّاد الزيارات اليومية نهائياً: كان كل زائر يكتب
// مستنداً بـ analytics_daily، وكان يستدعي fetchRealAnalytics التي تقرأ كامل مجموعة الطلبات
// بكل فتح للمتجر (حتى للزبائن). الآن لا كتابة إطلاقاً، وإحصائيات المبيعات تُحسب للإدارة فقط.
async function recordRealVisit() {
  try {
    if (isCurrentUserAdmin()) fetchRealAnalytics();
  } catch (e) { console.warn(e); }
}

// ================= 19. REALTIME ORDERS SNAPSHOT =================
let adminOrdersUnsubscribe = null;

// ================= 19b. AUDIO ALERT FOR NEW ORDERS =================
let knownOrderIdsForAlert = null; // null = أول تحميل، لا نُنبّه على الطلبات الموجودة أصلاً
let adminAlertMuted = false;
let audioAlertRepeatTimer = null;

const REPORT_GROUP_LABELS = {
  cosmetics: 'Cosmetics & Personal Care (قسم الكوزمتك)',
  baby_milk: 'Baby Milk & Formula (قسم حليب الأطفال)',
  oral_care: 'Oral & Dental Care (قسم عناية الأسنان)'
};

// 🗂️ (جديد) شبكة إدارة المنتجات المباشرة — المكان الوحيد المعتمد لتعديل السعر/التوفر/
// التفاصيل، بدل الأزرار المدمجة سابقاً بواجهة الزبون. تُبنى بالكامل من products[] المحمّلة
// أصلاً بالذاكرة (نفس بيانات المتجر) — صفر قراءات إضافية من Firestore عند فتح هذا التبويب.
let adminProductGridActiveCat = 'all';

// ================= 21b. CLEANUP TOOL: UNCATEGORIZED / TEST PRODUCTS (FIX #5) =================
const SUSPICIOUS_TEST_KEYWORDS = ['test', 'تجربة', 'demo', 'sample', 'placeholder', 'example', 'novalac', 'lactonic', 'تست', 'xxx', 'dummy'];
let cleanupSelectedIds = new Set();
let cleanupLastFlaggedList = [];

// ================= 23. CART & CHECKOUT =================
function addToCart(id, silent = false, quantity = 1) {
  cart[id] = (cart[id] || 0) + quantity;
  updateCartBadge();
  saveLocalState();
  if (!silent) showToast('تمت الإضافة للسلة ✓');
}

function changeCartQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  updateCartBadge();
  saveLocalState();
  renderCart();
}

function removeCartItem(id) {
  delete cart[id];
  updateCartBadge();
  saveLocalState();
  renderCart();
}

function getCartSubtotal() {
  return Object.keys(cart).reduce((sum, id) => {
    if (id.startsWith('bundle_')) {
      const bId = id.replace('bundle_', '');
      const b = findBundle(bId);
      return sum + (b ? Number(b.price || 0) * cart[id] : 0);
    } else {
      const p = findProduct(id);
      return sum + (p ? Number(p.price || 0) * cart[id] : 0);
    }
  }, 0);
}

// ================= 24. VIEWS & NAVIGATION =================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  currentView = name;
  closeMenu();
  window.scrollTo({top: 0, behavior: 'instant'});

  ['home', 'wishlist', 'categories', 'bundles', 'orders', 'cart', 'account', 'admin'].forEach(k => {
    const el = document.getElementById('bn-' + k);
    if (el) el.classList.toggle('active', name === k);
  });

  // 🎯 شريط التبويبات الأفقي العلوي (الرئيسية | أقسام | بكجات | العروض)
  ['home', 'categories', 'bundles', 'offers'].forEach(k => {
    const el = document.getElementById('tab-' + k);
    if (el) el.classList.toggle('active', name === k);
  });

  if (name === 'checkout') checkAndAutofillCustomer();
  renderCurrentActiveView();
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

function renderCurrentActiveView() {
  if (typeof updateOffersTabCount === 'function') updateOffersTabCount();
  if (currentView === 'home') renderHome();
  else if (currentView === 'listing') renderListing();
  else if (currentView === 'categories') renderModernCategories();
  else if (currentView === 'bundles') renderAllBundles();
  else if (currentView === 'orders') renderMyOrders();
  else if (currentView === 'offers') renderOffers();
  else if (currentView === 'wishlist') renderWishlist();
  else if (currentView === 'cart') renderCart();
  else if (currentView === 'checkout') renderCheckoutSummary();
  else if (currentView === 'product' && currentProductId) {
    const p = findProduct(currentProductId);
    if (p) renderProductDetailDOM(p);
  }
}

function renderHome() {
  renderHeroCarousel();
  renderHomeCategoryCircles();
  renderHomeBundlesPreview();
  renderBrandStrip();
  renderHomeProductGrid();
}

// ================= 7b. HERO CAROUSEL (بنر متحرك بنقاط تصفح) =================
let currentHeroSlideIndex = 0;

function updateHeroCarouselDots(activeIndex) {
  currentHeroSlideIndex = activeIndex;
  document.querySelectorAll('.hero-slider-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === activeIndex);
  });
}

// عند نقر الزبون على شريحة عرض مخصصة: عرض منتجات هذا العرض حصراً (أو كل العروض إن لم تُحدد منتجات)
function openPromoSlideOffer(cardId) {
  const card = (pharmacyProfile.promoCards || []).find(c => String(c.id) === String(cardId));
  if (!card) { showView('offers'); return; }
  if (card.productIds && card.productIds.length > 0) {
    listingMode = 'promo_offer';
    listingValue = card.productIds;
    window.__currentPromoTitle = card.title || 'منتجات العرض';
    renderListing();
    showListingView();
  } else {
    showView('offers');
  }
}

// ================= 5b. HOME CIRCULAR CATEGORIES (ممر الأقسام الدائري بالرئيسية) =================
function renderHomeCategoryCircles() {
  const wrap = document.getElementById('homeCategoryCircles');
  if (!wrap) return;

  const visibleCats = categories.slice(0, 6);
  const circlesHtml = visibleCats.map(c => {
    const cleanImg = sanitizeUrl(c.imageUrl);
    return `
      <div class="home-cat-circle" onclick="openCategory('${sanitizeText(c.id)}')">
        <div class="home-cat-circle-img">
          ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(c.label)}" loading="lazy">` : (catIcons[c.icon] || catIcons.jar)('var(--accent, #E85D8A)')}
        </div>
        <span class="home-cat-circle-lbl">${sanitizeText(c.label)}</span>
      </div>`;
  }).join('');

  const moreHtml = `
    <div class="home-cat-circle" onclick="showView('categories')">
      <div class="home-cat-circle-img home-cat-circle-more">⋯</div>
      <span class="home-cat-circle-lbl">المزيد</span>
    </div>`;

  wrap.innerHTML = circlesHtml + moreHtml;
}

let homeActiveBrand = 'all';

function selectHomeBrand(brand) {
  homeActiveBrand = brand;
  renderBrandStrip();
  renderHomeProductGrid();
}

// ================= 24b. STOREFRONT BUNDLES VIEW (كانت مفقودة بالكامل من واجهة الزبائن) =================
function addBundleToCart(bundleId) {
  const cartKey = 'bundle_' + bundleId;
  cart[cartKey] = (cart[cartKey] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  showToast('تمت إضافة البكج كاملاً للسلة! 🎁');
}

function renderBundleCardHtml(b) {
  const cleanImg = sanitizeUrl(b.imageUrl);
  const linkedProducts = (b.productIds || []).map(id => findProduct(id)).filter(Boolean);
  const thumbsHtml = linkedProducts.slice(0, 3).map((p, idx) => {
    const pImg = sanitizeUrl(p.imageUrl);
    return `
      ${idx > 0 ? '<span class="bundle-plus-icon">+</span>' : ''}
      <div class="bundle-thumb-item">
        ${pImg ? `<img src="${pImg}" alt="${sanitizeText(p.name)}">` : (icons[p.type] || icons.bottle)(getBrandColor(p.brand))}
      </div>`;
  }).join('');

  return `
    <div class="bundle-card" onclick="openBundleDetail('${sanitizeText(b.id)}')" style="cursor:pointer;">
      ${b.savingsBadge ? `<span class="bundle-savings-badge">${sanitizeText(b.savingsBadge)}</span>` : ''}
      <div class="bundle-thumb-row">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(b.title)}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">` : (thumbsHtml || icons.bottle('var(--accent)'))}
      </div>
      <h3 class="bundle-title">🎁 ${sanitizeText(b.title)}</h3>
      <p class="bundle-desc">${sanitizeText(b.description)}</p>
      ${linkedProducts.length > 0 ? `
        <div class="bundle-items-list">
          ${linkedProducts.map(p => `<span>• ${sanitizeText(p.name)}</span>`).join('')}
        </div>` : ''}
      <div class="bundle-price-box">
        <span class="pd-price mono" style="font-size:19px;">${fmtPrice(b.price)}</span>
        ${b.oldPrice ? `<span class="p-oldprice mono">${fmtPrice(b.oldPrice)}</span>` : ''}
      </div>
      <button class="add-cart-btn" onclick="event.stopPropagation(); addBundleToCart('${sanitizeText(b.id)}')">أضف البكج كاملاً للسلة 🎁</button>
    </div>`;
}

// عرض بكجات مصغّرة على الصفحة الرئيسية (إن وُجد قسم مخصص لها في index.html)
function renderHomeBundlesPreview() {
  const sec = document.getElementById('homeBundlesSection');
  const grid = document.getElementById('homeBundlesGrid');
  if (!sec || !grid) return;
  if (bundles.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  grid.innerHTML = bundles.slice(0, 4).map(b => renderBundleCardHtml(b)).join('');
}

function renderWishlist() {
  const list = products.filter(p => wishlist.has(p.id) && p.isDeleted !== true);
  renderProductGrid('wishlistGrid', list, 'قائمتك المفضلة فارغة حالياً 🌸');
}

// 🔐 الإلغاء يمر عبر الووركر (قواعد Firestore لم تعد تسمح للزبون بتعديل طلبه مباشرة): يتحقق أن الطلب
// طلبكِ، ويُرجع المنتجات للمخزون بمعاملة ذرية. الطلب الذي أُرسل كضيف (بلا تسجيل دخول) لا يمكن إلغاؤه
// آلياً — يُطلب من الزبون التواصل مع الصيدلية.
async function cancelMyOrder(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId));
  if (!ord) return;

  const user = auth ? auth.currentUser : currentUser;
  if (!user) {
    showToast('لإلغاء الطلب سجّلي الدخول بحسابكِ أولاً، أو تواصلي مع الصيدلية عبر الواتساب 📞');
    return;
  }
  if (!confirm('هل أنتِ متأكدة من رغبتكِ في إلغاء هذا الطلب؟')) return;

  try {
    const token = await user.getIdToken();
    const res = await fetch(`${WORKER_API_BASE}/api/orders/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ orderId: String(orderId) })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success) { showToast('⚠️ ' + (data.message || 'تعذر إلغاء الطلب')); return; }
    ord.status = 'طلب ملغي من قبل الزبون ❌';
    saveLocalState();
    renderMyOrders();
    showToast('تم إلغاء طلبكِ بنجاح ❌');
  } catch (err) {
    console.warn('Cancel order failed:', err);
    showToast('⚠️ تعذر الاتصال بالسيرفر لإلغاء الطلب. حاولي مجدداً.');
  }
}

// 🛡️ تحقق من السعر قبل الحفظ (خطأ إدخال مثل 8 مليار أفسد التقارير): سقف مطلق + سقف باقة الصيدلية للمشرف العادي
function validateProductPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return 'يرجى إدخال سعر صحيح أكبر من صفر';
  if (price > ABSOLUTE_MAX_UNIT_PRICE) return `السعر مرتفع جداً (الحد الأقصى ${ABSOLUTE_MAX_UNIT_PRICE.toLocaleString()} د.ع) — تأكدي من عدد الأصفار`;
  const cap = Number(pharmacyProfile.maxPriceCap) || 150000;
  if (!isSuperAdmin() && price > cap) return `السعر يتجاوز الحد الأقصى المسموح بباقتكِ (${cap.toLocaleString()} د.ع)`;
  return '';
}

// ================= 26. PRODUCT GRID & DETAIL =================
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
  
  el.innerHTML = displayList.map(p => {
    if (activeThemeModule && typeof activeThemeModule.renderProductCard === 'function') {
      try {
        return activeThemeModule.renderProductCard(p, getTemplateHelpers());
      } catch (e) {
        console.warn("[Theme Engine] خطأ في عرض بطاقة المنتج:", e);
      }
    }

    const color = getBrandColor(p.brand);
    const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
    const isWished = wishlist.has(p.id);
    const inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
    const cleanImg = sanitizeUrl(p.imageUrl);

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
        <div class="p-name">${sanitizeText(p.name)}</div>
        <div class="p-size">${sanitizeText(p.size || '')}</div>
        <div class="p-price-row">
          <span class="p-price mono" id="price-val-${sanitizeText(p.id)}">${fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${sanitizeText(p.id)}">${fmtPrice(p.oldPrice)}</span>` : ''}
        </div>
        <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${sanitizeText(p.id)}')">
          ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
        </button>
      </div>`;
  }).join('');
}

function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderCurrentActiveView();
}

function populateCategoryDropdowns() {
  const prodCatSelect = document.getElementById('adminProdCat');
  const quickCatSelect = document.getElementById('quickEditProdCat');
  const optionsHtml = categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');

  if (prodCatSelect) prodCatSelect.innerHTML = optionsHtml;
  if (quickCatSelect) quickCatSelect.innerHTML = optionsHtml;
}

function renderAdminCategoriesList() {
  const container = document.getElementById('adminCategoriesListGrid');
  if (!container) return;
  container.innerHTML = categories.map(c => {
    const count = products.filter(p => p.category === c.id && p.isDeleted !== true).length;
    const cleanImg = sanitizeUrl(c.imageUrl);
    return `
      <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:42px; height:42px; border-radius:8px; background:var(--surface); display:flex; align-items:center; justify-content:center; overflow:hidden;">
            ${cleanImg ? `<img src="${cleanImg}" style="width:100%; height:100%; object-fit:cover;">` : (catIcons[c.icon] || catIcons.jar)('var(--accent, #E85D8A)')}
          </div>
          <div>
            <div style="font-weight:800; font-size:13.5px;">${sanitizeText(c.label)} (${sanitizeText(c.id)})</div>
            <div style="font-size:11.5px; color:var(--text-soft);">${count} منتج مرتبط</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button onclick="editAdminCategory('${sanitizeText(c.id)}')" style="background:#E0E7FF; color:#3730A3; padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
          <button onclick="deleteAdminCategory('${sanitizeText(c.id)}', '${sanitizeText(c.label)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function previewAdminCatImg(url) {
  const box = document.getElementById('adminCatImgPreviewBox');
  const img = document.getElementById('adminCatImgPreviewEl');
  const cleanUrl = sanitizeUrl(url);
  if (cleanUrl && box && img) { img.src = cleanUrl; box.style.display = 'flex'; }
  else if (box) { box.style.display = 'none'; }
}

function editAdminCategory(catId) {
  const c = categories.find(item => item.id === catId);
  if (!c) return;
  document.getElementById('adminCatKeyId').value = c.id;
  document.getElementById('adminCatLabel').value = c.label;
  document.getElementById('adminCatIdInput').value = c.id;
  document.getElementById('adminCatIdInput').disabled = true;
  document.getElementById('adminCatImgUrl').value = c.imageUrl || '';
  document.getElementById('adminCatIconSelect').value = c.icon || 'jar';
  if (c.imageUrl) previewAdminCatImg(c.imageUrl);
  document.getElementById('adminCatFormTitle').textContent = 'تعديل القسم: ' + c.label;
  document.getElementById('adminSaveCatBtn').textContent = '💾 حفظ تعديلات القسم';
}

async function deleteAdminCategory(catId, catLabel) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف القسم "${catLabel}"؟`)) {
    try {
      if (db) await dbPaths.categoriesCol().doc(String(catId)).delete();
      refreshStorefrontCache();
      showToast('تم حذف القسم بنجاح ✓');
      populateCategoryDropdowns();
    } catch (e) { console.error(e); }
  }
}

// 🌸 (إصلاح #1: وميض شاشة التحميل) إخفاء متدرّج لشاشة التحميل الأولية بعد اكتمال أول رسم فعلي للواجهة.
// ملاحظة: القيم (الصورة، اللون، الحجم) نفسها تُحقن فوراً من سكربت متزامن (Inline) في أعلى <head>
// الخاص بـ index.html قبل أي Paint، لذا لا يحدث أي وميض بصورة افتراضية ثم صورة الصيدلية الحقيقية.
function hideAppLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (!overlay || overlay.dataset.hidden) return;
  overlay.dataset.hidden = '1';
  if (window.__loaderInterval) clearInterval(window.__loaderInterval);
  const bar = document.getElementById('loaderProgressBar');
  const pct = document.getElementById('loaderPercentText');
  if (bar) bar.style.width = '100%';
  if (pct) pct.textContent = '100%';
  setTimeout(() => {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => overlay.remove(), 400);
  }, 150);
}

function applyStoreSettings() {
  if (pharmacyProfile.primaryColor) {
    applyDynamicThemeColor(pharmacyProfile.primaryColor);
    const colorPicker = document.getElementById('adminPrimaryColorPicker');
    if (colorPicker) colorPicker.value = pharmacyProfile.primaryColor;
  }

  loadDynamicTheme(pharmacyProfile.templateId);

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

  const adminLogoInput = document.getElementById('adminPharmacyLogoInput');
  const adminLogoPreview = document.getElementById('adminPharmacyLogoPreviewEl');
  const adminLogoBox = document.getElementById('adminPharmacyLogoPreviewBox');
  if (adminLogoInput && pharmacyProfile.logoUrl) {
    adminLogoInput.value = pharmacyProfile.logoUrl;
    if (adminLogoPreview) adminLogoPreview.src = pharmacyProfile.logoUrl;
    if (adminLogoBox) adminLogoBox.style.display = 'flex';
  }

  // تطبيق تخصيص شاشة التحميل الأولية
  const loaderWrap = document.getElementById('loaderCircleWrap');
  const loaderImg = document.getElementById('loaderPhotoImg');
  const loaderTitle = document.getElementById('loaderTitleText');
  const loaderSub = document.getElementById('loaderSubText');
  const loaderOverlay = document.getElementById('appLoadingOverlay');

  if (loaderWrap && pharmacyProfile.loaderCircleSize) {
    const sz = `${pharmacyProfile.loaderCircleSize}px`;
    loaderWrap.style.width = sz;
    loaderWrap.style.height = sz;
  }
  if (loaderImg) {
    const tImg = sanitizeUrl(pharmacyProfile.loaderImgUrl || pharmacyProfile.logoUrl || pharmacyProfile.bannerImgUrl);
    if (tImg) loaderImg.src = tImg;
  }
  if (loaderTitle && pharmacyProfile.loaderTitle) {
    loaderTitle.textContent = pharmacyProfile.loaderTitle;
  }
  if (loaderSub && pharmacyProfile.loaderSubText) {
    loaderSub.textContent = pharmacyProfile.loaderSubText;
  }
  // 🌟 (إصلاح #4) تطبيق لون/تدرج خلفية شاشة التحميل المختار من منتقي الألوان المرئي أو الحقل النصي
  if (loaderOverlay && pharmacyProfile.loaderBgColor) {
    loaderOverlay.style.background = pharmacyProfile.loaderBgColor;
  }

  const annEl = document.getElementById('announcementBar');
  const annTextEl = document.getElementById('announcementText');
  const pharmWrap = document.getElementById('homePharmacistCtaWrap');
  const drawerPharmBtn = document.getElementById('drawerConsultBtn');

  if (annEl) {
    const isVisible = (pharmacyProfile.showAnnouncement === true || pharmacyProfile.showAnnouncement === 'true' || pharmacyProfile.showAnnouncement === undefined);
    annEl.style.display = isVisible ? 'flex' : 'none';
  }
  if (annTextEl && pharmacyProfile.announcementText) {
    annTextEl.textContent = pharmacyProfile.announcementText;
  }
  // 🎠 البنر الرئيسي أصبح سلايدر متحرك بنقاط تصفح (بدل صورة ثابتة واحدة) — يُبنى بالكامل عبر renderHeroCarousel()
  renderHeroCarousel();

  if (pharmWrap) {
    const isPharmVisible = (pharmacyProfile.showPharmacistBanner === true || pharmacyProfile.showPharmacistBanner === 'true' || pharmacyProfile.showPharmacistBanner === undefined);
    pharmWrap.style.display = isPharmVisible ? 'block' : 'none';
  }
  if (drawerPharmBtn) {
    const isPharmVisible = (pharmacyProfile.showPharmacistBanner === true || pharmacyProfile.showPharmacistBanner === 'true' || pharmacyProfile.showPharmacistBanner === undefined);
    drawerPharmBtn.style.display = isPharmVisible ? 'flex' : 'none';
  }
  if (document.getElementById('pharmacistCtaTitle') && pharmacyProfile.pharmacistCtaTitle) {
    document.getElementById('pharmacistCtaTitle').textContent = pharmacyProfile.pharmacistCtaTitle;
  }
  if (document.getElementById('pharmacistCtaDesc') && pharmacyProfile.pharmacistCtaDesc) {
    document.getElementById('pharmacistCtaDesc').textContent = pharmacyProfile.pharmacistCtaDesc;
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

// ================= 31. FIRESTORE REALTIME SYNC (FIX #1: ADMIN-ONLY LIVE PRICE SYNC) =================
// 🌟 (إصلاح جذري — شاشة تحميل الأدمن لا تنتظر شيئاً فعلياً) الدالة السابقة كانت تُطلق كل
// اتصالات Firestore اللحظية (onSnapshot) دون أي طريقة لمعرفة متى وصلت أول دفعة بيانات
// فعلية من كل مصدر — فكان استدعاء hideAppLoadingOverlay() يحدث فوراً في نفس اللحظة (قبل
// وصول أي بيانات حقيقية بوقت طويل)، فيرى المشرف الواجهة بشكلها الافتراضي/الفارغ للحظات ثم
// تمتلئ تدريجياً أمام عينيه. الآن تُعيد هذه الدالة وعداً (Promise) واحداً يكتمل فقط بعد
// وصول أول دفعة فعلية من: بروفايل الصيدلية + الأقسام + البكجات + الكتالوج معاً — يستخدمه
// استدعاء الإقلاع أدناه مع حد أدنى زمني حقيقي قبل إخفاء الشاشة.
// 🛡️ (توفير قراءات Firestore) الزائر العادي لم يعد يفتح 4 اتصالات لحظية (الصيدلية + الأقسام + البكجات
// + 20 إشعاراً = عشرات القراءات بكل زيارة). بدلها طلب واحد لـ /api/storefront (ملف R2 بـ ETag، صفر قراءات
// Firestore). اتصالات Firestore اللحظية تبقى فقط للوحة الأدمن (admin.html). وإن فشل الطلب لأي سبب
// يعمل المسار القديم (لقطة Firestore) كاحتياط تلقائي.
function applyPharmacyDocData(data) {
  pharmacyProfile = { ...pharmacyProfile, ...data };
  if (pharmacyProfile.brandsData) brandsData = { ...brandsData, ...pharmacyProfile.brandsData };
  saveLocalState();
  applyStoreSettings();
  renderPromoCardsListAdmin();
  renderBrandStrip();
  checkStorefrontSubscriptionLock();
  checkAdminSubscriptionLock();
  checkAndRefreshCatalogIfStale();
  const navTitleEl = document.getElementById('adminNavTitle');
  if (navTitleEl) navTitleEl.textContent = `لوحة تحكم ${pharmacyProfile.name || 'الصيدلية'}`;
}

function applyCategoriesData(list) {
  if (!list || !list.length) return;
  categories = list;
  renderModernCategories();
  renderAdminCategoriesList();
  populateCategoryDropdowns();
  updateDiscountTargetOptions();
  populateBundleFilterDropdowns();
  populateOfferFilterDropdowns();
}

function applyBundlesData(list) {
  if (!list || !list.length) return;
  bundles = list;
  renderAdminBundlesList();
}

function applyNotificationsData(list) {
  notifications = list;
  renderNotifications();
}

const IS_ADMIN_PAGE = !!document.getElementById('adminSecStats');

// 🛍️ بعد تعديل أقسام/بكجات/إعدادات الصيدلية/إشعارات: تحديث لقطة المتجر للزوار (/api/storefront).
// مؤجَّلة 2 ثانية ومدمجة حتى لا تتكرر مع توالي الحفظ. تعمل بأي صفحة فيها مشرف مسجَّل.
let storefrontRefreshTimer = null;
function refreshStorefrontCache() {
  clearTimeout(storefrontRefreshTimer);
  storefrontRefreshTimer = setTimeout(async () => {
    try {
      const user = auth ? auth.currentUser : currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${WORKER_API_BASE}/api/admin/storefront/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId, 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) console.warn('Storefront snapshot refresh failed:', data.message);
    } catch (e) { console.warn('Storefront snapshot refresh error:', e); }
  }, 2000);
}



async function loadStorefrontSnapshot() {
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/storefront?pharmacy=${encodeURIComponent(currentPharmacyId)}`, {
      headers: { 'X-Pharmacy-Id': currentPharmacyId }
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || !data.pharmacy) return false;
    applyPharmacyDocData(data.pharmacy);
    applyCategoriesData(data.categories || []);
    applyBundlesData(data.bundles || []);
    // الواجهة كانت تعتمد Timestamp من Firestore (toDate)؛ نعيد تغليف التاريخ النصي بنفس الشكل
    applyNotificationsData((data.notifications || []).map(n => {
      const iso = n.createdAt;
      return { ...n, createdAt: iso ? { toDate: () => new Date(iso) } : null };
    }));
    return true;
  } catch (e) {
    console.warn('Storefront snapshot fallback to Firestore:', e);
    return false;
  }
}

// 🔐 اتصالات Firestore اللحظية صارت حصراً للوحة الأدمن وبعد التحقق من صلاحية المشرف (قواعد Firestore لم
// تعد تسمح بأي قراءة عامة). تُربط مرة واحدة فقط، وتُستدعى من onAuthStateChanged بعد تأكيد الصلاحية.
let adminLiveListenersAttached = false;
function attachAdminLiveListenersOnce() {
  if (adminLiveListenersAttached || !isFirebaseConfigured || !db) return;
  adminLiveListenersAttached = true;

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) applyPharmacyDocData(doc.data());
  }, err => console.warn(err));

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      applyCategoriesData(loaded);
    }
  }, err => console.warn(err));

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      applyBundlesData(loaded);
    }
  }, err => console.warn(err));

  listenToNotifications();
}

// 🛡️ (مقاومة الأعطال) إن فشل الووركر مؤقتاً لا نعود لقراءة Firestore مباشرة (كان ذلك يضاعف القراءات لحظة العطل
// تماماً). نعتمد على النسخة المحفوظة محلياً ونعيد المحاولة 3 مرات بفواصل متزايدة فقط.
function retryWithBackoff(fn, attempt = 0) {
  const delays = [15000, 60000, 180000];
  if (attempt >= delays.length) return;
  setTimeout(async () => {
    let ok = false;
    try { ok = await fn(); } catch (e) { ok = false; }
    if (!ok) retryWithBackoff(fn, attempt + 1);
  }, delays[attempt]);
}

function initFirestoreSync() {
  if (!isFirebaseConfigured || !db) return Promise.resolve();

  const cachedProds = localStorage.getItem(getStorageKey('products_cache'));
  if (cachedProds) {
    try {
      products = JSON.parse(cachedProds);
      renderCurrentActiveView();
    } catch (e) {}
  }

  // الجميع (زوار وأدمن) يأخذون لقطة المتجر من الووركر (R2 بـ ETag): صفر قراءات Firestore.
  const baseDataPromise = loadStorefrontSnapshot().then(ok => {
    if (!ok) retryWithBackoff(loadStorefrontSnapshot);
  });

  // المنتجات من كتالوج R2 فقط (يتحدث فوراً مع كل حفظ أدمن ومع كل طلب، وبـ ETag فلا تظهر نسخة قديمة).
  // الأدمن يتزامن مع أجهزة الطاقم الأخرى عبر إعادة الجلب عند العودة للتبويب.
  const catalogPromise = fetchCatalogFromR2().then(success => {
    if (!success) retryWithBackoff(() => fetchCatalogFromR2());
  });

  recordRealVisit();

  return Promise.allSettled([baseDataPromise, catalogPromise]);
}

// 🔄 مزامنة أجهزة الطاقم: عند عودة المشرف لتبويب اللوحة نعيد جلب الكتالوج (طلب ETag رخيص جداً).
let lastAdminCatalogRefreshAt = 0;
function setupAdminCatalogFocusRefresh() {
  if (window.__adminFocusRefreshAttached) return;
  window.__adminFocusRefreshAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!isCurrentUserAdmin()) return;
    const now = Date.now();
    if (now - lastAdminCatalogRefreshAt < 30000) return;
    lastAdminCatalogRefreshAt = now;
    fetchCatalogFromR2(true);
  });
}

// 🌟 جلب كتالوج المنتجات من كاش Cloudflare R2 السريع (متاح لجميع الزوار بأمان، بلا اتصال حي)
// (المتغير lastCatalogCacheStatus معرّف لاحقاً بقسم "GOOGLE AUTH" ويُستخدم هنا أيضاً)
// 🛡️ (إصلاح جذري نهائي — ضمان وصول آخر سعر للزبون دائماً) forceBust: عند تمرير true، يُضاف
// معامل فريد لرابط الطلب فيصبح مفتاح كاش مختلف كلياً بنظر Cloudflare — يتجاوز أي نسخة
// مخزَّنة سابقاً على الحافة بصرف النظر عن نجاح أو فشل أي عملية مسح كاش سابقة من الأدمن.
async function fetchCatalogFromR2(forceBust = false) {
  try {
    let url = `${WORKER_API_BASE}/api/catalog?pharmacy=${encodeURIComponent(currentPharmacyId)}`;
    if (forceBust) url += `&_fresh=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'X-Pharmacy-Id': currentPharmacyId }
    });
    if (res.ok) {
      const cacheStatus = res.headers.get('X-Cache-Status') || res.headers.get('cf-cache-status') || 'HIT';
      lastCatalogCacheStatus = cacheStatus;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        products = data;
        products.forEach(p => {
          if (p.brand && !brandsData[p.brand]) {
            brandsData[p.brand] = { name: p.brand, color: hashColor(p.brand), logoUrl: '' };
          }
        });
        saveLocalState();
        renderCurrentActiveView();
        renderModernCategories();
        checkLowStockAlerts();
        if (typeof renderAdminProductManagementGrid === 'function') renderAdminProductManagementGrid();
        return true;
      }
    }
  } catch (e) {
    console.warn('R2 catalog fetch fallback to Firestore:', e);
  }
  return false;
}

// 🛡️ (إصلاح جذري نهائي — "السعر ما يتحدث عند الزبائن") يقارن آخر طابع زمني لتحديث الكتالوج
// (pharmacyProfile.catalogUpdatedAt، يُكتب من الووركر عند كل تعديل سعر/منتج) بآخر نسخة رآها
// هذا المتصفح تحديداً (محفوظة محلياً). إن اختلفا، يُعاد جلب الكتالوج فوراً بمعامل تخطّي كاش
// صريح — فيصل السعر الصحيح الحقيقي حتى لو تعذّر مسح كاش الحافة من طرف الأدمن لأي سبب. هذا
// يعمل بصمت وبخلفية الصفحة، دون أي تأخير على التحميل الأولي السريع للموقع.
function checkAndRefreshCatalogIfStale() {
  try {
    const serverVersionRaw = pharmacyProfile.catalogUpdatedAt;
    if (!serverVersionRaw) return; // لا يوجد بعد أي تعديل مسجَّل — لا داعي لأي فحص
    const serverVersion = (serverVersionRaw.seconds !== undefined) ? String(serverVersionRaw.seconds) : String(serverVersionRaw);
    const localKey = getStorageKey('catalog_version');
    const localVersion = localStorage.getItem(localKey);

    if (localVersion === serverVersion) return; // نفس النسخة المرئية أصلاً — لا حاجة لإعادة الجلب

    fetchCatalogFromR2(true).then(() => {
      localStorage.setItem(localKey, serverVersion);
    });
  } catch (e) { /* غير حرج — التحميل العادي سيستمر بلا هذا التحسين فقط */ }
}

// ================= 32. NOTIFICATIONS & BROADCAST =================
function listenToNotifications() {
  if (!isFirebaseConfigured || !db) return;
  dbPaths.notificationsCol().orderBy('createdAt', 'desc').limit(20).onSnapshot(snap => {
    notifications = [];
    snap.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
    renderNotifications();
  }, err => console.warn(err));
}

function renderNotifications() {
  const unreadCount = notifications.filter(n => !readNotifs.has(n.id)).length;
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    badge.textContent = unreadCount;
  }

  const listEl = document.getElementById('notifList');
  if (listEl) {
    listEl.innerHTML = notifications.length === 0 ? `<div class="no-results" style="padding:30px 0;">لا توجد إشعارات جديدة حالياً 🌸</div>` : 
      notifications.map(n => {
        const timeStr = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleDateString('ar-IQ', {hour:'2-digit', minute:'2-digit'}) : 'الآن';
        return `
          <div class="notif-item">
            <div class="notif-item-header">
              <span class="notif-item-title">${sanitizeText(n.title)}</span>
              <span class="notif-item-time mono">${sanitizeText(timeStr)}</span>
            </div>
            <p class="notif-item-desc">${sanitizeText(n.body)}</p>
          </div>`;
      }).join('');
  }

  const adminHistory = document.getElementById('adminNotifsHistoryList');
  if (adminHistory) {
    adminHistory.innerHTML = notifications.map(n => `
      <div style="background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:800; font-size:13px; color:var(--rose-deep);">${sanitizeText(n.title)}</div>
          <div style="font-size:12px; color:var(--text-soft);">${sanitizeText(n.body)}</div>
        </div>
        <button onclick="deleteNotification('${sanitizeText(n.id)}')" style="color:var(--red); font-size:12px; font-weight:800;">حذف 🗑️</button>
      </div>`).join('');
  }
}

async function deleteNotification(id) {
  if (!assertAdmin()) return;
  if (confirm('حذف هذا الإشعار نهائياً؟')) {
    if (db) await dbPaths.notificationsCol().doc(String(id)).delete();
    refreshStorefrontCache();
    showToast('تم حذف الإشعار بنجاح ✓');
  }
}

// ================= 33. GOOGLE AUTH & REDIRECT (FIX #1: CACHE STATUS TOAST AFTER LOGIN) =================
let lastCatalogCacheStatus = null;

async function verifyStaffPermissions(user) {
  if (!user || !user.email) {
    currentStaffData = null;
    return;
  }
  if (user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
    currentStaffData = { role: 'owner', permissions: ['all'] };
    return;
  }
  try {
    const staffDocId = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const doc = await dbPaths.staffCol().doc(staffDocId).get();
    if (doc.exists) {
      currentStaffData = doc.data();
    } else {
      currentStaffData = null;
    }
  } catch (e) {
    console.warn("Staff verification err:", e);
    currentStaffData = null;
  }
}

// 🔐 (جديد — البند 6) تبويب التبديل بين "تسجيل الدخول" و"حساب جديد" لنموذج الهاتف/كلمة المرور
function switchPhoneAuthTab(mode) {
  const loginForm = document.getElementById('phoneAuthFormLogin');
  const registerForm = document.getElementById('phoneAuthFormRegister');
  const tabLogin = document.getElementById('phoneAuthTabLogin');
  const tabRegister = document.getElementById('phoneAuthTabRegister');
  const errBox = document.getElementById('phoneAuthErrorBox');
  if (errBox) { errBox.classList.add('hidden'); errBox.textContent = ''; }
  if (!loginForm || !registerForm) return;
  if (mode === 'register') {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.add('active');
  } else {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    if (tabRegister) tabRegister.classList.remove('active');
    if (tabLogin) tabLogin.classList.add('active');
  }
}

function showPhoneAuthError(msg) {
  const box = document.getElementById('phoneAuthErrorBox');
  if (box) { box.textContent = msg; box.classList.remove('hidden'); }
  showToast(msg);
}

// 🔐 (جديد — البند 6) تسجيل حساب جديد بالاسم + رقم الهاتف + كلمة مرور (رمز سري)، عبر
// /api/auth/phone-register الموجود مسبقاً بالووركر (Admin SDK)، ثم إتمام الدخول الفعلي على
// المتصفح بتوكن Firebase المخصّص (Custom Token) المُعاد من السيرفر — نفس آلية Google تماماً
// من ناحية إكمال الجلسة (verifyStaffPermissions + renderAccountView) بعد نجاح التوثيق.
async function registerWithPhone() {
  if (!auth) { showPhoneAuthError('⚠️ خدمة تسجيل الدخول غير مهيأة.'); return; }
  const name = (document.getElementById('phoneRegisterName').value || '').trim();
  const phone = (document.getElementById('phoneRegisterPhone').value || '').trim();
  const pin = (document.getElementById('phoneRegisterPin').value || '').trim();

  if (!name || phone.length < 8) { showPhoneAuthError('يرجى إدخال اسم ورقم هاتف صحيحين'); return; }
  if (!/^\d{4,6}$/.test(pin)) { showPhoneAuthError('كلمة المرور يجب أن تكون من 4 إلى 6 أرقام'); return; }

  const btn = document.querySelector('#phoneAuthFormRegister .auth-btn-google');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري إنشاء الحساب...'; }

  try {
    const res = await fetch(`${WORKER_API_BASE}/api/auth/phone-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId },
      body: JSON.stringify({ name, phone, pin })
    });
    const data = await res.json();
    if (!data.success) { showPhoneAuthError(data.message || '⚠️ تعذر إنشاء الحساب'); return; }

    const result = await auth.signInWithCustomToken(data.token);
    currentUser = result.user;
    try { await currentUser.updateProfile({ displayName: name }); } catch (e) { /* غير حرج */ }
    await verifyStaffPermissions(currentUser);
    showToast(`أهلاً بكِ ${sanitizeText(name)} 🌸`);
    updateUserHeaderProfile();
    renderAccountView();
    updateAdminInterfaceState();
  } catch (err) {
    console.error('Phone register error:', err);
    showPhoneAuthError('⚠️ تعذر إنشاء الحساب: ' + (err.message || 'خطأ غير معروف'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إنشاء الحساب'; }
  }
}

// 🔐 (جديد — البند 6) تسجيل الدخول برقم الهاتف + كلمة المرور، عبر /api/auth/phone-login
async function loginWithPhone() {
  if (!auth) { showPhoneAuthError('⚠️ خدمة تسجيل الدخول غير مهيأة.'); return; }
  const phone = (document.getElementById('phoneLoginPhone').value || '').trim();
  const pin = (document.getElementById('phoneLoginPin').value || '').trim();

  if (phone.length < 8 || !pin) { showPhoneAuthError('يرجى تعبئة رقم الهاتف وكلمة المرور'); return; }

  const btn = document.querySelector('#phoneAuthFormLogin .auth-btn-google');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري تسجيل الدخول...'; }

  try {
    const res = await fetch(`${WORKER_API_BASE}/api/auth/phone-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId },
      body: JSON.stringify({ phone, pin })
    });
    const data = await res.json();
    if (!data.success) { showPhoneAuthError(data.message || '⚠️ تعذر تسجيل الدخول'); return; }

    const result = await auth.signInWithCustomToken(data.token);
    currentUser = result.user;
    if (data.name && !currentUser.displayName) {
      try { await currentUser.updateProfile({ displayName: data.name }); } catch (e) { /* غير حرج */ }
    }
    await verifyStaffPermissions(currentUser);
    showToast(`أهلاً بعودتكِ ${sanitizeText(data.name || '')} 🌸`);
    updateUserHeaderProfile();
    renderAccountView();
    updateAdminInterfaceState();
  } catch (err) {
    console.error('Phone login error:', err);
    showPhoneAuthError('⚠️ تعذر تسجيل الدخول: ' + (err.message || 'خطأ غير معروف'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'تسجيل الدخول'; }
  }
}

// 🌟 (إصلاح جذري مؤكَّد بلقطة شاشة فعلية) الخطأ "Unable to process request due to missing
// initial state" يحدث على صفحة authDomain نفسها (xxx.firebaseapp.com) قبل أن تعود أصلاً
// لموقعنا — أي أن signInWithRedirect ينهار في منتصف الطريق، فلا تصل الجلسة أبداً ولا تصل
// حتى أي رسالة خطأ لكودنا لنعالجها (لأن الصفحة عالقة على دومين Firebase نفسه). هذا خلل
// معروف في Safari تحديداً بسبب سياسة عزل التخزين (Storage Partitioning) بين دومين الموقع
// ودومين authDomain المختلف عنه. الحل: العودة لاستخدام signInWithPopup كطريقة أساسية —
// فهي لا تحتاج التنقل الكامل عبر الصفحة ولا الاعتماد على sessionStorage الباقي بعد إعادة
// تحميل كاملة، فتنجو من هذا الانهيار تحديداً. مع عرض أي نتيجة (نجاح أو فشل) صراحة دوماً في
// صندوق الخطأ بالبطاقة (#adminGateAuthError) — لا صمت بعد الآن مهما كانت النتيجة.
function showAdminGateError(msg) {
  const box = document.getElementById('adminGateAuthError');
  if (box) { box.textContent = msg; box.classList.remove('hidden'); }
  showToast(msg);
}
function clearAdminGateError() {
  const box = document.getElementById('adminGateAuthError');
  if (box) { box.textContent = ''; box.classList.add('hidden'); }
}

async function signInWithGoogle() {
  if (!auth) {
    showAdminGateError('⚠️ خدمة تسجيل الدخول غير مهيأة (تحقق من إعدادات Firebase).');
    return;
  }

  if (isInAppBrowser()) {
    const modal = document.getElementById('iabModal');
    if (modal) modal.classList.add('open');
    else showAdminGateError('⚠️ لتسجيل الدخول بأمان عبر Google، افتحي الرابط من متصفح خارجي (Safari/Chrome) وليس من داخل تطبيق آخر.');
    return;
  }

  clearAdminGateError();
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await auth.signInWithPopup(provider);
    if (result && result.user) {
      currentUser = result.user;
      await verifyStaffPermissions(currentUser);
      showToast(`أهلاً بكِ ${sanitizeText(currentUser.displayName || '')} 🌸`);
      updateUserHeaderProfile();
      renderAccountView();
      updateAdminInterfaceState();
      announceCacheStatusToAdminIfNeeded();
    }
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      // إغلاق النافذة المنبثقة يدوياً من قبل المستخدم — ليس خطأً حقيقياً، لا داعي لإظهار رسالة
      return;
    }
    if (error.code === 'auth/unauthorized-domain') {
      showAdminGateError('⚠️ دومين الموقع الحالي غير مُدرَج ضمن "Authorized domains" بإعدادات Firebase Authentication. أضيفيه من Firebase Console.');
    } else if (error.code === 'auth/popup-blocked') {
      showAdminGateError('⚠️ المتصفح حجب النافذة المنبثقة. فعّلي السماح بالنوافذ المنبثقة لهذا الموقع ثم أعيدي المحاولة.');
    } else if (error.message && /missing initial state|storage-partitioned/i.test(error.message)) {
      showAdminGateError('⚠️ هذا المتصفح يحجب التخزين المؤقت اللازم لتسجيل الدخول (شائع بمتصفحات مدمجة أو إعدادات خصوصية صارمة). جربي متصفح Chrome، أو تأكدي أن "منع تتبع مواقع الويب عبر المواقع" غير مفعّل بإعدادات Safari لهذا الموقع تحديداً.');
    } else {
      showAdminGateError('⚠️ تعذر تسجيل الدخول: ' + (error.message || error.code || 'خطأ غير معروف'));
    }
  }
}

if (isFirebaseConfigured && auth) {
  auth.getRedirectResult()
    .then(async (result) => {
      if (result && result.user) {
        currentUser = result.user;
        await verifyStaffPermissions(currentUser);
        showToast(`أهلاً بكِ ${sanitizeText(currentUser.displayName || '')} 🌸`);
        updateUserHeaderProfile();
        renderAccountView();
        updateAdminInterfaceState();
        announceCacheStatusToAdminIfNeeded();
      }
    })
    .catch((error) => {
      console.error("Google Auth Redirect Error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        showAdminGateError('⚠️ يرجى إضافة دومين الموقع في Firebase Authorized Domains');
      } else if (error.code && error.code !== 'auth/popup-closed-by-user') {
        showAdminGateError('تعذر تسجيل الدخول (' + (error.message || error.code) + ')');
      }
    });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    currentUserEmailHash = (user && user.email) ? await computeEmailHash(user.email) : '';
    if (user) {
      await verifyStaffPermissions(user);
    } else {
      currentStaffData = null;
    }
    updateAdminInterfaceState();
    updateUserHeaderProfile();
    renderAccountView();

    // 🌟 الآن هوية المستخدم مؤكدة 100% — نعرض إشعار حالة الكاش هنا بعد ثانية واحدة
    if (user) {
      announceCacheStatusToAdminIfNeeded();
    }

    // 🛡️ (توفير قراءات) لا اشتراك لحظي بكل المنتجات للأدمن بعد الآن — الكتالوج من R2 (يتحدث فوراً).
    if (user && isCurrentUserAdmin()) {
      setupAdminCatalogFocusRefresh();
      if (IS_ADMIN_PAGE) attachAdminLiveListenersOnce();
    }

    // ⚡ (تحميل كسول) بمجرد تأكد صلاحيات الأدمن، نهيّئ فقط تبويب الإحصائيات الظاهر افتراضياً؛
    // بقية التبويبات (الطلبات، بنك المنتجات، الموظفين...) لا تُحمّل إلا عند نقر المشرف عليها فعلياً.
    if (user && isCurrentUserAdmin() && document.getElementById('adminSecStats')) {
      checkLowStockAlerts();
      switchAdminSection('stats');
    }
  });
}

async function handleSignOut() {
  if (auth) await auth.signOut();
  currentUser = null;
  currentStaffData = null;
  updateUserHeaderProfile();
  renderAccountView();
  updateAdminInterfaceState();
  showToast('تم تسجيل الخروج بنجاح');
}

function updateAdminInterfaceState() {
  const isAdmin = isCurrentUserAdmin();
  const topBar = document.getElementById('adminTopBar');
  const menuLink = document.getElementById('adminMenuLink');
  const bnAdmin = document.getElementById('bn-admin');
  const floatAddBtn = document.getElementById('adminFloatingAddBtn');
  const adminGate = document.getElementById('adminAuthGateModal');
  
  if (topBar) topBar.style.display = isAdmin ? 'flex' : 'none';
  if (menuLink) menuLink.style.display = isAdmin ? 'flex' : 'none';
  if (bnAdmin) bnAdmin.style.display = isAdmin ? 'flex' : 'none';
  if (floatAddBtn) floatAddBtn.style.display = isAdmin ? 'flex' : 'none';

  if (adminGate) {
    if (isAdmin) adminGate.classList.remove('locked');
    else adminGate.classList.add('locked');
  }

  // 🔒 (إصلاح #9) زر التقرير المالي (Excel/CSV) يُخفى تماماً عن أي مشرف عادي — يظهر
  // حصراً للمشرف العام للمنصة (isSuperAdmin)، تماشياً مع القيد المطبَّق أيضاً داخل
  // exportOrdersToCSV() نفسها (دفاع مزدوج: طبقة واجهة + طبقة منطق).
  const exportReportBtn = document.getElementById('btnExportCsvReport');
  if (exportReportBtn) exportReportBtn.style.display = isSuperAdmin() ? 'inline-flex' : 'none';
  const exportHtmlBtn = document.getElementById('btnExportHtmlReport');
  if (exportHtmlBtn) exportHtmlBtn.style.display = isSuperAdmin() ? 'inline-flex' : 'none';
}

function checkUrlHashForProduct() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  let pId = null;

  if (hash.startsWith('#p=')) {
    pId = hash.replace('#p=', '').trim();
  } else if (search.includes('p=')) {
    const params = new URLSearchParams(search);
    pId = params.get('p');
  }

  if (pId) {
    const p = findProduct(pId);
    if (p) {
      setTimeout(() => openProduct(pId, true), 150);
    }
  }
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

// ================= 35. INITIALIZATION & BOOTSTRAP =================
window.addEventListener('DOMContentLoaded', async () => {
  patchTenantLinks();
  applyStoreSettings();
  renderHome();
  renderModernCategories();
  populateCategoryDropdowns();
  updateCartBadge();
  renderAccountView();
  updateUserHeaderProfile();
  checkAndShowWelcomeModal();
  checkUrlHashForProduct();

  await loadDynamicTheme(pharmacyProfile.templateId);
  renderCurrentActiveView();

  // 🌟 (تحديث — مدة شاشة التحميل مضبوطة على 3 ثوانٍ بالضبط بطلب صريح) تنتظر الآن أمرين
  // معاً دائماً: (أ) مرور 3 ثوانٍ كاملة كحد أدنى، و(ب) اكتمال بيانات initFirestoreSync
  // الأربع فعلياً (البروفايل + الأقسام + البكجات + الكتالوج). فإن وصلت البيانات أسرع، تبقى
  // الشاشة حتى تكتمل الـ3 ثوانٍ بالضبط، وإن تأخرت البيانات (شبكة بطيئة) تبقى الشاشة حتى
  // اكتمال البيانات الفعلي كي لا تظهر بيانات قديمة أو ناقصة — هذا الملف يخدم كلا الصفحتين
  // index.html وadmin.html لأنهما يحمّلان script.js نفسه ويتشاركان نفس عنصر appLoadingOverlay،
  // فهذا التعديل الواحد يضبط مدة الشاشتين معاً. لا توجد هنا أي قراءة أو طلب شبكة إضافي —
  // فقط توقيت محلي بحت (setTimeout) لا علاقة له بالكاش أو القراءات إطلاقاً.
  const MIN_LOADER_DISPLAY_MS = 3000;
  const minDisplayPromise = new Promise(resolve => setTimeout(resolve, MIN_LOADER_DISPLAY_MS));
  const dataReadyPromise = initFirestoreSync();

  Promise.all([minDisplayPromise, dataReadyPromise]).finally(hideAppLoadingOverlay);

  window.addEventListener('hashchange', checkUrlHashForProduct);

  // ⚡ (تحميل كسول للوحة الأدمن) لا نجلب أي قائمة ثقيلة (طلبات، بنك منتجات، موظفين...) هنا مطلقاً.
  // بمجرد تأكد صلاحيات المشرف عبر auth.onAuthStateChanged، يتم تلقائياً تفعيل تبويب "الإحصائيات"
  // فقط كبداية، وبقية التبويبات (switchAdminSection) تجلب بياناتها حصراً عند الضغط عليها فعلياً —
  // هذا يقلل قراءات Firestore غير الضرورية عند كل فتح للوحة التحكم بشكل كبير.
  if (window.location.pathname.includes('admin.html') || document.getElementById('adminOrdersManageContainer')) {
    initAdminAudioAlertPreference();
  }
});
// ربط دوال البكجات والعروض المبوبة بالنطاق العام للنافذة (window)
window.populateBundleFilterDropdowns = populateBundleFilterDropdowns;
window.handleBundleCategoryFilterChange = handleBundleCategoryFilterChange;
window.handleBundleBrandFilterChange = handleBundleBrandFilterChange;
window.toggleBundleProductCheckbox = toggleBundleProductCheckbox;
window.removeBundleProductChip = removeBundleProductChip;
window.populateOfferFilterDropdowns = populateOfferFilterDropdowns;
window.handleOfferCategoryFilterChange = handleOfferCategoryFilterChange;
window.handleOfferBrandFilterChange = handleOfferBrandFilterChange;
window.toggleOfferProductCheckbox = toggleOfferProductCheckbox;
window.removeOfferProductChip = removeOfferProductChip;
// أدوات التنظيف (إصلاح #5)
window.scanForUncategorizedOrTestProducts = scanForUncategorizedOrTestProducts;
window.toggleCleanupSelection = toggleCleanupSelection;
window.cleanupArchiveSelected = cleanupArchiveSelected;
window.cleanupPermanentDeleteSelected = cleanupPermanentDeleteSelected;

// 🎯🔒 (الإصلاح الجذري الفعلي — تعديل المنتجات لا يعمل إطلاقاً) السبب الحقيقي المكتشف الآن
// بتتبع مسار الكود الفعلي: renderProductGrid() هنا يُفوّض رسم كل بطاقة منتج لنفس محرك
// القوالب المشترك (theme-engine.js) المستخدم بـ main.js (index.html). قالب البطاقة هناك
// يستدعي كل أزرار الأدمن حرفياً عبر window.App.openAdminQuickEditModal(...)،
// window.App.quickEditPrice(...)، window.App.quickToggleStock(...)،
// window.App.archiveProductConfirm(...)، window.App.addBundleToCart(...)، إلخ — لكن كائن
// النطاق "window.App" هذا **لم يكن مُعرَّفاً إطلاقاً في admin.html** (هو موجود فقط بنهاية
// main.js الخاص بـ index.html). النتيجة: كل ضغطة على أي زر من هذه الأزرار داخل لوحة الأدمن
// كانت تنهار فوراً بخطأ "Cannot read properties of undefined (reading 'openAdminQuickEditModal')"
// في كونسول المتصفح فقط (غير مرئي للمستخدم إطلاقاً) — فتبدو الأزرار "لا تعمل" تماماً كما
// وُصفت المشكلة. هذا يُفسّر أيضاً مشكلة "السعر لا يتحدّث للزبون": بما أن زر تعديل السعر لم
// يكن يعمل من الأساس، فالسعر في قاعدة البيانات نفسها لم يكن يتغيّر إطلاقاً — لا علاقة
// للمشكلة بالكاش على الأرجح، بل بعدم وصول أي تعديل لقاعدة البيانات من الأساس.
// الحل: تعريف window.App هنا أيضاً، بنفس أسماء الدوال المستخدمة فعلياً في هذا الملف (كلها
// موجودة مسبقاً كدوال عامة، لم يكن ناقصاً سوى تجميعها بهذا الكائن).
window.App = {
  openAdminQuickEditModal,
  quickEditPrice,
  quickToggleStock,
  archiveProductConfirm,
  addBundleToCart,
  addToCart,
  toggleWishlist,
  openProduct,
  openCategory,
  selectProductVariantCard,
  showView
};
window.showView = showView;
