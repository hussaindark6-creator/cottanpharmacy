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
const WORKER_API_BASE = "https://cottanbackend.hussaindark6.workers.dev";
const SUPER_ADMIN_EMAIL = "hussaindark6@gmail.com";

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

function escapeHtml(str) {
  return sanitizeText(str);
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

function isCurrentUserAdmin() {
  if (isSuperAdmin()) return true;
  if (currentUser && pharmacyProfile.adminEmail && currentUser.email.toLowerCase().trim() === pharmacyProfile.adminEmail.toLowerCase().trim()) {
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

async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Pharmacy-Id": currentPharmacyId,
    ...(options.headers || {})
  };

  const user = auth ? auth.currentUser : currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (e) {
      console.warn("Could not get ID token:", e);
    }
  }

  try {
    const res = await fetch(`${WORKER_API_BASE}${endpoint}`, { ...options, headers });
    return await res.json();
  } catch (err) {
    return { success: false, fallback: true };
  }
}

// دالة تلقائية لإعادة بناء كتالوج R2 السحابي بالكامل (مسح شامل من Firestore) - تُستخدم فقط
// للعمليات التي تمس عدة منتجات دفعة واحدة (خصم مجمّع، حفظ بكج/عرض، ...) لأنها أثقل وأبطأ.
function triggerR2CatalogRebuild() {
  apiFetch('/api/admin/catalog/rebuild', { method: 'POST' })
    .then(res => {
      if (res && res.success) console.log("R2 catalog rebuilt successfully:", res.totalProducts);
    })
    .catch(err => console.warn("R2 catalog rebuild notice:", err));
}

// ⚡ تحديث سريع بـ 0 قراءات من Firestore: يعدّل صنفاً واحداً مباشرة داخل ملف الكتالوج المخزّن في
// R2 (بدل إعادة مسح كل المنتجات)، ويُستخدم في التعديلات الفردية السريعة (السعر، المخزون، التعديل الشامل)
function updateR2CatalogItem(productId, updates) {
  apiFetch('/api/admin/catalog/update-item', {
    method: 'POST',
    body: JSON.stringify({ productId: String(productId), updates })
  }).then(res => {
    if (!res || !res.success) {
      // 🛡️ (إصلاح — "السعر لا يتحدّث للزبون") كان هذا الفشل صامتاً تماماً؛ الآن يظهر تحذير
      // صريح للأدمن إن تعذّر تحديث كاش R2 فعلياً (مثلاً: سلة R2 غير مربوطة بالووركر)، بدل
      // أن يعتقد الأدمن أن كل شيء تم بنجاح بينما الزبون سيستمر برؤية السعر القديم.
      showToast('⚠️ تم حفظ التعديل، لكن تعذّر تحديث كاش المتجر فوراً — سيُعاد بناؤه تلقائياً الآن.');
      triggerR2CatalogRebuild();
    }
  }).catch(() => {
    showToast('⚠️ تعذر الاتصال بالووركر لتحديث كاش المتجر — سيُعاد بناؤه عند المحاولة التالية.');
    triggerR2CatalogRebuild();
  });
}

// 🗑️ حذف صورة يتيمة من Cloudflare R2 (تُستدعى عند الحذف النهائي لمنتج أو استبدال صورته بأخرى)
function deleteOrphanImageFromR2(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.includes('/api/images/')) return;
  apiFetch('/api/admin/images/delete', {
    method: 'POST',
    body: JSON.stringify({ imageUrl })
  }).catch(err => console.warn('Orphan image delete notice:', err));
}

// 🌟 أداة يدوية بواجهة توست واضحة: توليد وحبس كتالوج R2 السحابي فوراً بنقرة واحدة (إصلاح #1)
async function manualRebuildR2Catalog() {
  if (!assertAdmin()) return;
  if (!lockAction('manualRebuildR2Catalog', 3000)) return;

  const btn = document.getElementById('btnManualRebuildCache');
  const originalLabel = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ جاري توليد الكتالوج وحبسه في R2...';
  }

  showToast('جاري توليد كتالوج R2 السحابي ومسح الكاش القديم...');

  try {
    const res = await apiFetch('/api/admin/catalog/rebuild', { method: 'POST' });
    if (res && res.success) {
      showToast(`✅ تم توليد وحبس كتالوج R2 بنجاح (${res.totalProducts || 0} منتج) وتفعيل الكاش الجديد لمدة ساعة! ⚡`);
    } else {
      showToast('⚠️ تعذر توليد الكتالوج، يرجى المحاولة مجدداً بعد قليل.');
    }
  } catch (err) {
    showToast('⚠️ خطأ أثناء الاتصال بسيرفر R2، تحقق من الاتصال.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel || '⚡ توليد وحبس كتالوج R2 السحابي الآن';
    }
  }
}
window.manualRebuildR2Catalog = manualRebuildR2Catalog;

// دالة رفع الصور المباشرة من الاستوديو أو الكاميرا إلى Cloudflare R2
async function uploadDirectImageFile(fileInput, targetHiddenUrlId, previewImgId, previewBoxId) {
  const file = fileInput.files[0];
  if (!file) return;

  showToast('جاري رفع ومعالجة الصورة سحابياً... ⏳');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${WORKER_API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 'X-Pharmacy-Id': currentPharmacyId },
      body: formData
    });

    const data = await res.json();
    if (data && data.success && data.imageUrl) {
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = data.imageUrl;

      if (previewImgId) {
        const previewEl = document.getElementById(previewImgId);
        if (previewEl) previewEl.src = data.imageUrl;
      }
      if (previewBoxId) {
        const previewBox = document.getElementById(previewBoxId);
        if (previewBox) previewBox.style.display = 'flex';
      }

      showToast('تم رفع وحفظ الصورة بنجاح! 📸');
    } else {
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64 = e.target.result;
        const hiddenInp = document.getElementById(targetHiddenUrlId);
        if (hiddenInp) hiddenInp.value = base64;
        if (previewImgId) document.getElementById(previewImgId).src = base64;
        if (previewBoxId) document.getElementById(previewBoxId).style.display = 'flex';
        showToast('تم حفظ الصورة محلياً بنجاح ✓');
      };
      reader.readAsDataURL(file);
    }
  } catch (err) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = base64;
      if (previewImgId) document.getElementById(previewImgId).src = base64;
      if (previewBoxId) document.getElementById(previewBoxId).style.display = 'flex';
      showToast('تم حفظ الصورة بنجاح ✓');
    };
    reader.readAsDataURL(file);
  }
}

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

// ================= 8. STOREFRONT KILL SWITCH =================
function checkStorefrontSubscriptionLock() {
  const isSuspended = pharmacyProfile.isActive === false;
  const todayStr = new Date().toISOString().split('T')[0];
  const isExpired = pharmacyProfile.subscriptionExpiry && pharmacyProfile.subscriptionExpiry < todayStr;

  const freezeModal = document.getElementById('storefrontFreezeModal');
  if (freezeModal) {
    if (isSuspended || isExpired) {
      freezeModal.classList.add('open');
      const freezeDesc = document.getElementById('storefrontFreezeDesc');
      if (freezeDesc) {
        freezeDesc.textContent = isSuspended 
          ? 'عذراً، هذا المتجر متوقف مؤقتاً لأعمال الصيانة والتجديد. يرجى مراجعة إدارة الصيدلية.' 
          : 'عذراً، انتهت صلاحية اشتراك هذا المتجر مؤقتاً. يرجى مراجعة الإدارة.';
      }
    } else {
      freezeModal.classList.remove('open');
    }
  }
}

// ================= 8b. ADMIN PANEL SUBSCRIPTION LOCK GATE =================
function checkAdminSubscriptionLock() {
  const isSuspended = pharmacyProfile.isActive === false;
  const todayStr = new Date().toISOString().split('T')[0];
  const isExpired = pharmacyProfile.subscriptionExpiry && pharmacyProfile.subscriptionExpiry < todayStr;

  const gate = document.getElementById('subscriptionLockGate');
  if (!gate) return;

  if ((isSuspended || isExpired) && !isSuperAdmin()) {
    gate.style.display = 'flex';
    const titleEl = document.getElementById('lockGateTitle');
    const descEl = document.getElementById('lockGateDesc');
    if (titleEl) titleEl.textContent = isSuspended ? 'المتجر موقوف مؤقتاً' : 'انتهت مدة الاشتراك';
    if (descEl) {
      descEl.textContent = isSuspended
        ? 'تم إيقاف صيدليتك مؤقتاً من قبل إدارة المنصة. يرجى التواصل معهم لمعرفة السبب وإعادة التفعيل.'
        : 'انتهت فترة اشتراك صيدليتك بالمنصة. يرجى تجديد الاشتراك لاستعادة الوصول الكامل للوحة التحكم.';
    }
  } else {
    gate.style.display = 'none';
  }
}

// ================= 9. SMART LOW-STOCK DETECTOR =================
function checkLowStockAlerts() {
  const outOfStock = products.filter(p => (p.inStock === false || (p.stockQuantity !== undefined && p.stockQuantity <= 0)) && p.isDeleted !== true);
  const alertBanner = document.getElementById('adminLowStockAlertBanner');
  const alertCount = document.getElementById('adminLowStockCount');

  if (alertBanner && alertCount) {
    if (outOfStock.length > 0) {
      alertCount.textContent = outOfStock.length;
      alertBanner.style.display = 'flex';
    } else {
      alertBanner.style.display = 'none';
    }
  }
}

// ================= 11. CONFIRM ORDER =================
// 🛡️🔒 (إصلاح أمني/وظيفي جذري — الطلبات كانت معطّلة فعلياً) هذه الدالة كانت تكتب الطلب
// مباشرة من المتصفح إلى Firestore بسعر يحسبه العميل نفسه محلياً (ثغرة تلاعب بالسعر)، وبعد
// تحديث firestore.rules (allow create: if false على orders) أصبحت هذه الكتابة المباشرة
// تُرفض دائماً من Firestore — أي أن تأكيد الطلب توقف عن العمل فعلياً بالكامل رغم عدم ظهور
// أي خطأ واضح للزبون (كانت الأخطاء تُبتلع بصمت داخل catch ثم يتابع الكود وكأن شيئاً لم
// يحدث، فيظهر "نجاح" وهمي بلا طلب مكتوب فعلياً في قاعدة البيانات).
// الحل الجذري: أصبح هذا المسار الآن يستدعي حصراً /api/orders على الووركر، الذي يعيد
// احتساب كل الأسعار من مصدرها الحقيقي عبر Admin SDK ضمن معاملة Firestore ذرية واحدة
// (تحقق من السعر الحقيقي + خصم المخزون + كتابة الطلب معاً)، ويرسل إشعار تيليجرام تلقائياً
// بنفسه — فلا حاجة لأي كتابة مباشرة أو استدعاء تيليجرام منفصل من المتصفح بعد الآن.
async function confirmOrder() {
  if (!lockAction('confirmOrder', 2500)) return;

  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  
  if (!name || !phone || !address) {
    showToast('يرجى تعبئة الاسم والهاتف والعنوان أولاً');
    return;
  }
  if (phone.length < 8) {
    showToast('يرجى كتابة رقم هاتف صحيح');
    return;
  }

  const ids = Object.keys(cart);
  if (ids.length === 0) { showToast('سلتك فارغة'); return; }

  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'جاري التحقق من المخزون وتأكيد الطلب... ⏳';
  }

  localStorage.setItem('saas_customer_saved_profile', JSON.stringify({ name, phone, address }));

  // هذه القيم "تقديرية" فقط لبناء طلب الإرسال — القيم الحقيقية النهائية المعتمدة تأتي
  // حصراً من استجابة الووركر أدناه بعد إعادة الاحتساب من المصدر الحقيقي.
  const itemsPayloadForServer = ids.map(id => {
    const isBundle = id.startsWith('bundle_');
    const item = isBundle ? findBundle(id.replace('bundle_', '')) : findProduct(id);
    return {
      id: id,
      name: item ? (item.name || item.title) : 'منتج',
      price: item ? Number(item.price || 0) : 0,
      quantity: Number(cart[id] || 1),
      isBundle: isBundle
    };
  });

  let serverResult;
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pharmacy-Id': currentPharmacyId
      },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        deliveryMethod: deliveryMethod,
        items: itemsPayloadForServer,
        promoCode: appliedPromo ? appliedPromo.code : null,
        userId: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null
      })
    });
    serverResult = await res.json();
  } catch (err) {
    console.error('Order network error:', err);
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'تأكيد الطلب'; }
    showToast('⚠️ تعذر الاتصال بالسيرفر لتأكيد الطلب. تحققي من اتصال الإنترنت وحاولي مجدداً.');
    return;
  }

  if (!serverResult || !serverResult.success) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'تأكيد الطلب'; }
    showToast((serverResult && serverResult.message) || '⚠️ تعذر إتمام الطلب. حاولي مجدداً.');
    return;
  }

  // ✅ الطلب مُثبَّت فعلياً بفايرستور من طرف السيرفر بنجاح — نبني الكائن المحلي حصراً من
  // بيانات السيرفر الموثوقة (لا من حسابات المتصفح المحلية) لعرضه وإرساله للواتساب.
  const order = serverResult.order;
  const orderId = serverResult.orderId;
  const grandTotal = serverResult.verifiedTotal;
  const verifiedItems = serverResult.verifiedItems || [];
  const calculatedSubtotal = order ? Number(order.subtotal || 0) : 0;
  const deliveryFee = order ? Number(order.deliveryFee || 0) : 0;
  const discountAmount = order ? Number(order.discountAmount || 0) : 0;

  const newOrderObj = order ? { ...order } : {
    id: orderId, pharmacyId: currentPharmacyId,
    userId: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : null,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    name, phone, address, deliveryMethod, items: verifiedItems, subtotal: calculatedSubtotal,
    deliveryFee, discountAmount, promoCode: appliedPromo ? appliedPromo.code : null, total: grandTotal,
    status: 'قيد المعالجة والتجهيز 🚚'
  };

  myOrders.unshift(newOrderObj);
  saveLocalState();

  const lines = verifiedItems.map(item => `• ${item.isBundle ? '🎁 [بكج توفير] ' : ''}${item.name} (${fmtPrice(item.unitPrice)} × ${item.quantity} قطع) = ${fmtPrice(item.lineTotal)}`);
  const deliveryLabel = deliveryMethod === 'express' ? `سريع (${fmtPrice(deliveryFee)})` : `عادي (${fmtPrice(deliveryFee)})`;
  const promoInfo = appliedPromo ? `🎟️ *كود الخصم المطبق:* ${appliedPromo.code} (-${fmtPrice(discountAmount)})\n` : '';

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
    `💵 *المجموع الفرعي للمنتجات:* ${fmtPrice(calculatedSubtotal)}\n` +
    `${promoInfo}` +
    `🚚 *أجرة التوصيل:* ${fmtPrice(deliveryFee)}\n` +
    `💰 *المجموع الإجمالي المطلوب للدفع:* *${fmtPrice(grandTotal)}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `✨ يرجى تأكيد الطلب من قبل الصيدلي 🌸`;

  cart = {};
  appliedPromo = null;
  updateCartBadge();
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

// ================= 12. PROMO CODES / COUPONS =================
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

async function fetchAdminCoupons() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.couponsCol().get();
    const coupons = [];
    snap.forEach(d => coupons.push({ id: d.id, ...d.data() }));
    renderAdminCouponsList(coupons);
  } catch (e) { console.warn(e); }
}

function renderAdminCouponsList(coupons) {
  const container = document.getElementById('adminCouponsListGrid');
  if (!container) return;
  if (coupons.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:16px 0;">لا توجد أكواد خصم مسجلة لهذه الصيدلية.</div>`;
    return;
  }
  container.innerHTML = coupons.map(c => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:900; font-size:14px; color:var(--rose-deep); font-family:monospace;">
          ${sanitizeText(c.code || c.id)} 
          <span class="log-badge">${c.type === 'percentage' ? c.value + '%' : fmtPrice(c.value)}</span>
          ${c.active ? '<span style="color:#16A34A; font-size:11px; font-weight:800; margin-inline-start:6px;">● نشط</span>' : '<span style="color:#DC2626; font-size:11px; font-weight:800; margin-inline-start:6px;">● متوقف</span>'}
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">
          الاستخدام: ${c.usedCount || 0}/${c.maxUses || '∞'} · الحد الأدنى: ${fmtPrice(c.minSpend || 0)} · الانتهاء: ${c.expiry || 'دائم'}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="editAdminCoupon('${sanitizeText(c.id)}', ${JSON.stringify(c).replace(/"/g, '&quot;')})" style="background:#DBEAFE; color:#1D4ED8; padding:6px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
        <button onclick="deleteAdminCoupon('${sanitizeText(c.id)}')" style="background:#FEE2E2; color:var(--red); padding:6px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

function editAdminCoupon(id, coupon) {
  document.getElementById('couponDocId').value = id;
  document.getElementById('couponCodeInput').value = coupon.code || id;
  document.getElementById('couponTypeSelect').value = coupon.type || 'percentage';
  document.getElementById('couponValueInput').value = coupon.value || '';
  document.getElementById('couponMinSpendInput').value = coupon.minSpend || 0;
  document.getElementById('couponMaxUsesInput').value = coupon.maxUses || 100;
  document.getElementById('couponExpiryInput').value = coupon.expiry || '';
  document.getElementById('couponActiveCheck').checked = coupon.active !== false;

  const titleEl = document.getElementById('adminCouponFormTitle');
  if (titleEl) titleEl.textContent = '✏️ تعديل كود الخصم';
  const saveBtn = document.getElementById('btnSaveCoupon');
  if (saveBtn) saveBtn.textContent = '💾 حفظ التعديلات';

  document.getElementById('adminCouponForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetAdminCouponForm() {
  document.getElementById('adminCouponForm')?.reset();
  document.getElementById('couponDocId').value = '';
  const titleEl = document.getElementById('adminCouponFormTitle');
  if (titleEl) titleEl.textContent = '🎟️ إضافة كود خصم جديد';
  const saveBtn = document.getElementById('btnSaveCoupon');
  if (saveBtn) saveBtn.textContent = '💾 حفظ وتفعيل كود الخصم سحابياً';
}

async function handleAdminCouponSave(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveCoupon', 1500)) return;

  const editingId = document.getElementById('couponDocId').value.trim();
  const payload = {
    code: document.getElementById('couponCodeInput').value.trim().toUpperCase(),
    type: document.getElementById('couponTypeSelect').value,
    value: Number(document.getElementById('couponValueInput').value),
    minSpend: Number(document.getElementById('couponMinSpendInput').value || 0),
    maxUses: Number(document.getElementById('couponMaxUsesInput').value || 100),
    expiry: document.getElementById('couponExpiryInput').value,
    active: document.getElementById('couponActiveCheck').checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    await dbPaths.couponsCol().doc(payload.code).set(payload, { merge: true });
    if (editingId && editingId !== payload.code) {
      await dbPaths.couponsCol().doc(editingId).delete().catch(() => {});
    }
    showToast(editingId ? 'تم حفظ تعديلات كود الخصم بنجاح! ✓' : 'تم حفظ كود الخصم وتفعيله سحابياً بنجاح! 🎉');
    resetAdminCouponForm();
    fetchAdminCoupons();
  }
}

async function deleteAdminCoupon(id) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا الكوبون نهائياً؟')) {
    if (db) await dbPaths.couponsCol().doc(String(id)).delete();
    fetchAdminCoupons();
    showToast('تم حذف الكوبون بنجاح ✓');
  }
}

// ================= 13. BUNDLES SYSTEM (CATEGORIZED TABBED SELECTOR — FIX #2) =================
let currentBundleSelectedProductIds = [];

// 🌟 تعبئة قوائم الأقسام والماركات المنسدلة لمنتقي البكجات المبوب
function populateBundleFilterDropdowns() {
  const catSel = document.getElementById('bundleFilterCategorySelect');
  const brandSel = document.getElementById('bundleFilterBrandSelect');
  if (catSel) {
    catSel.innerHTML = `<option value="">📂 تصفح حسب القسم...</option>` +
      categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');
  }
  if (brandSel) {
    const brandKeys = Object.keys(brandsData);
    brandSel.innerHTML = `<option value="">🏢 تصفح حسب الماركة...</option>` +
      brandKeys.map(k => `<option value="${sanitizeText(k)}">${sanitizeText(brandsData[k].name || k)}</option>`).join('');
  }
}

function handleBundleCategoryFilterChange() {
  const catSel = document.getElementById('bundleFilterCategorySelect');
  const brandSel = document.getElementById('bundleFilterBrandSelect');
  const val = catSel ? catSel.value : '';
  if (val && brandSel) brandSel.value = '';
  renderBundleCategorizedList('category', val);
}

function handleBundleBrandFilterChange() {
  const catSel = document.getElementById('bundleFilterCategorySelect');
  const brandSel = document.getElementById('bundleFilterBrandSelect');
  const val = brandSel ? brandSel.value : '';
  if (val && catSel) catSel.value = '';
  renderBundleCategorizedList('brand', val);
}

function renderBundleCategorizedList(mode, value) {
  const listEl = document.getElementById('bundleCategorizedProductsList');
  if (!listEl) return;
  if (!value) {
    listEl.innerHTML = `<div class="categorized-picker-empty">اختر قسماً أو ماركة أعلاه لعرض منتجاتها هنا.</div>`;
    return;
  }
  const matched = products.filter(p => {
    if (p.isDeleted === true) return false;
    return mode === 'category' ? p.category === value : p.brand === value;
  });
  if (matched.length === 0) {
    listEl.innerHTML = `<div class="categorized-picker-empty">لا توجد منتجات ضمن هذا التصنيف حالياً.</div>`;
    return;
  }
  listEl.innerHTML = matched.map(p => {
    const isChecked = currentBundleSelectedProductIds.includes(String(p.id));
    return `
      <label class="categorized-picker-item">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleBundleProductCheckbox('${sanitizeText(p.id)}', this.checked)">
        <span class="cp-name">${sanitizeText(p.name)} <span style="color:var(--text-soft); font-weight:600;">(${sanitizeText(p.brand || '')})</span></span>
        <span class="cp-price">${fmtPrice(p.price)}</span>
      </label>
    `;
  }).join('');
}

function toggleBundleProductCheckbox(id, checked) {
  if (checked) {
    if (!currentBundleSelectedProductIds.includes(String(id))) currentBundleSelectedProductIds.push(String(id));
  } else {
    currentBundleSelectedProductIds = currentBundleSelectedProductIds.filter(x => x !== String(id));
  }
  renderBundleChips();
}

function renderBundleChips() {
  const container = document.getElementById('bundleChipsContainer');
  if (!container) return;
  if (currentBundleSelectedProductIds.length === 0) {
    container.innerHTML = `<span style="font-size:11.5px; color:var(--text-soft); align-self:center;" id="bundleChipsPlaceholder">لم تُحدد أي منتجات بعد — اختر قسماً أو ماركة أعلاه وحدد المنتجات بواسطة صناديق الاختيار.</span>`;
    return;
  }
  container.innerHTML = currentBundleSelectedProductIds.map(id => {
    const p = findProduct(id);
    const name = p ? p.name : id;
    const price = p ? fmtPrice(p.price) : '';
    return `
      <div class="bundle-chip">
        <span>${sanitizeText(name)}</span>
        <span class="chip-price">(${price})</span>
        <span class="bundle-chip-remove" onclick="removeBundleProductChip('${sanitizeText(id)}')">✕</span>
      </div>
    `;
  }).join('');
}

function searchBundleProducts(q) {
  // ⚠️ تم استبدال البحث النصي بنظام التصفح المبوب حسب القسم/الماركة (renderBundleCategorizedList).
  // الدالة أُبقيت فارغة للحفاظ على التوافق مع أي استدعاء قديم متبقٍ في القوالب الخارجية.
}

function addBundleProductChip(id) {
  if (!currentBundleSelectedProductIds.includes(String(id))) {
    currentBundleSelectedProductIds.push(String(id));
    renderBundleChips();
  }
}

function removeBundleProductChip(id) {
  currentBundleSelectedProductIds = currentBundleSelectedProductIds.filter(x => x !== String(id));
  renderBundleChips();
  // إعادة رسم القائمة المبوبة الحالية (إن كانت مفتوحة) لتحديث حالة صناديق الاختيار
  const activeCat = document.getElementById('bundleFilterCategorySelect')?.value;
  const activeBrand = document.getElementById('bundleFilterBrandSelect')?.value;
  if (activeCat) renderBundleCategorizedList('category', activeCat);
  else if (activeBrand) renderBundleCategorizedList('brand', activeBrand);
}

function renderAdminBundlesList() {
  const container = document.getElementById('adminBundlesListGrid');
  if (!container) return;
  if (bundles.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:16px 0;">لا توجد بكجات مسجلة بعد.</div>`;
    return;
  }

  container.innerHTML = bundles.map(b => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:900; font-size:14px; color:var(--ink);">
          🎁 ${sanitizeText(b.title)} 
          <span class="log-badge" style="background:#DCFCE7; color:#16A34A;">${fmtPrice(b.price)}</span>
          ${b.oldPrice ? `<span style="font-size:11px; color:var(--text-soft); text-decoration:line-through; margin-inline-start:4px;">${fmtPrice(b.oldPrice)}</span>` : ''}
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">
          ${sanitizeText(b.description)} · ${(b.productIds || []).length} منتجات مرتبطة
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="editAdminBundle('${sanitizeText(b.id)}')" style="background:#E0E7FF; color:#3730A3; padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
        <button onclick="deleteAdminBundle('${sanitizeText(b.id)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

function editAdminBundle(bundleId) {
  const b = findBundle(bundleId);
  if (!b) return;
  document.getElementById('bundleDocId').value = b.id;
  document.getElementById('bundleTitleInput').value = b.title || '';
  document.getElementById('bundleDescInput').value = b.description || '';
  document.getElementById('bundleOldPriceInput').value = b.oldPrice || '';
  document.getElementById('bundlePriceInput').value = b.price || '';
  document.getElementById('bundleSavingsInput').value = b.savingsBadge || '';
  document.getElementById('bundleImgInput').value = b.imageUrl || '';

  currentBundleSelectedProductIds = (b.productIds || []).map(String);
  if (document.getElementById('bundleFilterCategorySelect')) document.getElementById('bundleFilterCategorySelect').value = '';
  if (document.getElementById('bundleFilterBrandSelect')) document.getElementById('bundleFilterBrandSelect').value = '';
  renderBundleCategorizedList('category', '');
  renderBundleChips();

  document.getElementById('adminBundleFormTitle').textContent = '✏️ تعديل البكج: ' + b.title;
  document.getElementById('btnSaveBundle').textContent = '💾 حفظ تعديلات البكج';
}

function resetAdminBundleForm() {
  if (!document.getElementById('bundleDocId')) return;
  document.getElementById('bundleDocId').value = '';
  document.getElementById('bundleTitleInput').value = '';
  document.getElementById('bundleDescInput').value = '';
  document.getElementById('bundleOldPriceInput').value = '';
  document.getElementById('bundlePriceInput').value = '';
  document.getElementById('bundleSavingsInput').value = 'وفر 15,000 د.ع 💸';
  document.getElementById('bundleImgInput').value = '';
  currentBundleSelectedProductIds = [];
  if (document.getElementById('bundleFilterCategorySelect')) document.getElementById('bundleFilterCategorySelect').value = '';
  if (document.getElementById('bundleFilterBrandSelect')) document.getElementById('bundleFilterBrandSelect').value = '';
  renderBundleCategorizedList('category', '');
  renderBundleChips();
  document.getElementById('adminBundleFormTitle').textContent = '🎁 إضافة حزمة / بكج توفير جديد';
  document.getElementById('btnSaveBundle').textContent = '💾 حفظ وتفعيل البكج في المتجر';
}

async function handleAdminBundleSave(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveBundle', 1500)) return;

  const docId = document.getElementById('bundleDocId').value.trim();
  const title = document.getElementById('bundleTitleInput').value.trim();
  const desc = document.getElementById('bundleDescInput').value.trim();
  const oldPrice = Number(document.getElementById('bundleOldPriceInput').value);
  const price = Number(document.getElementById('bundlePriceInput').value);
  const savings = document.getElementById('bundleSavingsInput').value.trim();
  const img = sanitizeUrl(document.getElementById('bundleImgInput').value.trim());

  if (!title || !desc || isNaN(price) || price <= 0) {
    showToast('يرجى التأكد من ملء جميع الحقول الإلزامية');
    return;
  }

  const payload = {
    id: docId || ('b_' + Date.now()),
    title: sanitizeText(title),
    description: sanitizeText(desc),
    oldPrice: oldPrice || null,
    price: price,
    savingsBadge: sanitizeText(savings),
    imageUrl: img,
    productIds: currentBundleSelectedProductIds.slice(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    await dbPaths.bundlesCol().doc(payload.id).set(payload, { merge: true });
    triggerR2CatalogRebuild();
    showToast('تم حفظ بكج التوفير وتحديث السيرفر بنجاح! 🎁');
    resetAdminBundleForm();
  }
}

async function deleteAdminBundle(id) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا البكج؟')) {
    if (db) {
      await dbPaths.bundlesCol().doc(String(id)).delete();
      triggerR2CatalogRebuild();
    }
    showToast('تم حذف البكج بنجاح ✓');
  }
}

// ================= 14. 80mm THERMAL RECEIPTS =================
function openReceiptModal(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId)) || (window.adminLastOrdersList && window.adminLastOrdersList.find(o => String(o.id) === String(orderId)));
  if (!ord) {
    showToast('تعذر العثور على بيانات الطلب');
    return;
  }

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

  document.getElementById('recOrderId').textContent = '#' + ord.id;
  document.getElementById('recOrderDate').textContent = ord.date || '';
  document.getElementById('recCustName').textContent = ord.name || '';
  document.getElementById('recCustPhone').textContent = ord.phone || '';
  document.getElementById('recCustAddress').textContent = ord.address || '';
  document.getElementById('recDeliveryType').textContent = (ord.deliveryMethod === 'express') ? 'توصيل سريع 🛵' : 'توصيل عادي 🚚';
  document.getElementById('recStorePhone').textContent = pharmacyProfile.socialPhone || '07813703288';

  const recStoreTitle = document.querySelector('.receipt-header h3');
  if (recStoreTitle) recStoreTitle.textContent = `${pharmacyProfile.name || 'الصيدلية'} 🌸`;

  document.getElementById('recDeliveryFee').textContent = fmtPrice(delFee);
  document.getElementById('recGrandTotal').textContent = fmtPrice(exactGrandTotal);

  const discRow = document.getElementById('recDiscountRow');
  if (discRow) {
    if (discountVal > 0) {
      discRow.style.display = 'flex';
      document.getElementById('recDiscountVal').textContent = '-' + fmtPrice(discountVal);
    } else {
      discRow.style.display = 'none';
    }
  }

  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.add('open');

  // 🖨️📤 (إصلاح — "الطباعة تفتح نافذة الطباعة مباشرة بدل المشاركة") نحفظ بيانات الطلب
  // الحالي هنا كي تستخدمها shareOrPrintReceipt() لبناء نص الوصل ومشاركته عبر واجهة
  // المشاركة الأصلية للجهاز (تحتوي خيار "طباعة" ضمنها على iOS، وتطبيقات المشاركة على
  // أندرويد) بدل فتح نافذة طباعة المتصفح مباشرة.
  window.__currentReceiptOrder = { order: ord, itemsSubtotal, delFee, discountVal, exactGrandTotal };
}

function closeReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.remove('open');
}

// 🖨️📤 (إصلاح جذري) السبب الحقيقي لعدم ظهور خيار "طباعة" بواجهة المشاركة: مشاركة نص عادي
// (text) عبر Web Share API لا تُفعِّل خيار الطباعة إطلاقاً على iOS — خيار الطباعة يظهر فقط
// عند مشاركة صورة أو ملف PDF/مستند حقيقي. الحل: نرسم الوصل كصورة PNG فعلية عبر Canvas
// (بلا أي مكتبة خارجية)، ثم نشاركها كملف — فتظهر "طباعة" ضمن واجهة المشاركة تلقائياً لأنها
// صورة قابلة للطباعة فعلياً، مع بقاء فتح واجهة المشاركة فورياً كما هو مطلوب.
async function shareOrPrintReceipt() {
  const data = window.__currentReceiptOrder;
  if (!data) { window.print(); return; }

  const { order, delFee, discountVal, exactGrandTotal } = data;

  try {
    const blob = await buildReceiptImageBlob(order, delFee, discountVal, exactGrandTotal);
    const file = new File([blob], `receipt-${order.id}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `وصل الطلب #${order.id}` });
      return;
    }
    if (navigator.share) {
      // بعض المتصفحات تدعم navigator.share لكن بلا ملفات — نشارك رابط الصورة كحل وسيط
      const imgUrl = URL.createObjectURL(blob);
      await navigator.share({ title: `وصل الطلب #${order.id}`, text: `وصل الطلب #${order.id}`, url: imgUrl });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // المستخدم ألغى المشاركة بنفسه
    console.warn('Receipt share failed, falling back to print:', err);
  }
  // احتياط وحيد: متصفح لا يدعم المشاركة أو فشلت الصورة (غالباً حاسوب مكتبي)
  window.print();
}

// 🖼️ يبني صورة PNG للوصل عبر Canvas مباشرة (بلا مكتبات خارجية) بترتيب RTL صحيح
function buildReceiptImageBlob(order, delFee, discountVal, exactGrandTotal) {
  return new Promise((resolve, reject) => {
    try {
      const scale = 2;
      const width = 380;
      const padX = 20;
      const lineH = 26;
      const items = order.items || [];

      let y = 0;
      y += 40; // اسم الصيدلية
      y += 20; // خط فاصل
      y += lineH * 5; // رقم الوصل + التاريخ + العميل + الهاتف + العنوان
      y += 20; // خط فاصل
      y += lineH * Math.max(items.length, 1);
      y += 20; // خط فاصل
      y += lineH * (2 + (discountVal > 0 ? 1 : 0));
      y += 50; // تذييل
      const height = y + 30;

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1a1a1a';

      let cy = 30;
      ctx.font = '900 18px Tahoma, Arial';
      ctx.fillText(pharmacyProfile.name || 'الصيدلية', width - padX, cy);
      cy += 20;

      const dashedLine = () => {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(padX, cy);
        ctx.lineTo(width - padX, cy);
        ctx.stroke();
        ctx.restore();
        cy += 20;
      };
      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      const infoLines = [
        `رقم الوصل: #${order.id}`,
        `التاريخ: ${order.date || ''}`,
        `العميل: ${order.name || ''}`,
        `الهاتف: ${order.phone || ''}`,
        `العنوان: ${order.address || ''}`
      ];
      infoLines.forEach(line => { ctx.fillText(line, width - padX, cy); cy += lineH; });

      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      if (items.length === 0) {
        ctx.fillText('لا توجد عناصر', width - padX, cy); cy += lineH;
      } else {
        items.forEach(it => {
          const unitPrice = Number(it.price || it.unitPrice || 0);
          const qty = Number(it.quantity || 1);
          const itemTotal = Number(it.lineTotal) || (unitPrice * qty);
          const line = `${it.isBundle ? '🎁 ' : ''}${it.name} × ${qty} = ${fmtPrice(itemTotal)}`;
          ctx.fillText(line, width - padX, cy);
          cy += lineH;
        });
      }

      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      ctx.fillText(`أجرة التوصيل: ${fmtPrice(delFee)}`, width - padX, cy); cy += lineH;
      if (discountVal > 0) {
        ctx.fillStyle = '#B91C1C';
        ctx.fillText(`الخصم: -${fmtPrice(discountVal)}`, width - padX, cy); cy += lineH;
        ctx.fillStyle = '#1a1a1a';
      }
      ctx.font = '900 16px Tahoma, Arial';
      ctx.fillText(`المجموع الكلي: ${fmtPrice(exactGrandTotal)}`, width - padX, cy); cy += 30;

      ctx.font = '700 12px Tahoma, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('شكراً لتسوقكم معنا 🌸', width / 2, cy);

      canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error('تعذر إنشاء صورة الوصل'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

// ================= 15. REAL RATINGS ENGINE & AUTOFILL =================
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
  } else {
    if (noticeBox) noticeBox.style.display = 'none';
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
  const noticeBox = document.getElementById('autofillNoticeBox');
  if (noticeBox) noticeBox.style.display = 'none';
  showToast('تم مسح البيانات المحفوظة');
}

// ================= 16. BULK DISCOUNTS ENGINE =================
function updateDiscountTargetOptions() {
  const scopeEl = document.getElementById('discountScope');
  if (!scopeEl) return;
  const scope = scopeEl.value;
  const wrap = document.getElementById('discountTargetWrap');
  const lbl = document.getElementById('discountTargetLbl');
  const sel = document.getElementById('discountTargetSelect');

  if (scope === 'all') {
    wrap.style.display = 'none';
    sel.removeAttribute('required');
    return;
  }

  wrap.style.display = 'block';
  sel.setAttribute('required', 'required');

  if (scope === 'brand') {
    lbl.textContent = 'اختيار الماركة / الشركة *';
    const brands = Object.keys(brandsData);
    sel.innerHTML = brands.map(b => `<option value="${sanitizeText(b)}">${sanitizeText(b)}</option>`).join('');
  } else if (scope === 'category') {
    lbl.textContent = 'اختيار القسم *';
    sel.innerHTML = categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');
  } else if (scope === 'product') {
    lbl.textContent = 'اختيار المنتج المحدد *';
    const activeProds = products.filter(p => p.isDeleted !== true);
    sel.innerHTML = activeProds.map(p => `<option value="${sanitizeText(p.id)}">${sanitizeText(p.name)} (${fmtPrice(p.price)})</option>`).join('');
  }
}

async function handleApplyBulkDiscount(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('bulkDiscount', 2000)) return;

  const scope = document.getElementById('discountScope').value;
  const target = document.getElementById('discountTargetSelect').value;
  const pct = Number(document.getElementById('discountPercentage').value);
  const action = document.getElementById('discountActionType').value;

  if (action === 'apply' && (isNaN(pct) || pct < 1 || pct > 90)) {
    showToast('يرجى إدخال نسبة خصم صحيحة بين 1% و 90%');
    return;
  }

  let targetProducts = [];
  const activeProds = products.filter(p => p.isDeleted !== true);
  if (scope === 'all') targetProducts = activeProds.slice();
  else if (scope === 'brand') targetProducts = activeProds.filter(p => p.brand === target);
  else if (scope === 'category') targetProducts = activeProds.filter(p => p.category === target);
  else if (scope === 'product') targetProducts = activeProds.filter(p => String(p.id) === String(target));

  if (targetProducts.length === 0) {
    showToast('لم يتم العثور على منتجات مطابقة');
    return;
  }

  showToast('جاري تطبيق الخصم وتحديث أسعار المنتجات...');
  const batch = db ? db.batch() : null;

  targetProducts.forEach(p => {
    if (action === 'apply') {
      const originalPrice = p.oldPrice || p.price;
      const newPrice = Math.round(originalPrice * (1 - pct / 100));
      p.oldPrice = originalPrice;
      p.price = newPrice;
      p.isSpecialOffer = true;
    } else {
      if (p.oldPrice) {
        p.price = p.oldPrice;
        p.oldPrice = null;
        p.isSpecialOffer = false;
      }
    }
    if (batch && p.id) {
      const docRef = dbPaths.productsCol().doc(String(p.id));
      batch.set(docRef, { price: p.price, oldPrice: p.oldPrice || null, isSpecialOffer: !!p.isSpecialOffer }, { merge: true });
    }
  });

  if (batch) {
    try { 
      await batch.commit(); 
      triggerR2CatalogRebuild();
    } catch (err) { console.warn("Batch commit warning:", err); }
  }

  saveLocalState();
  renderCurrentActiveView();
  showToast(action === 'apply' ? `تم تطبيق خصم ${pct}% على ${targetProducts.length} منتج فورياً! ✓` : `تم استرجاع الأسعار الأصلية بنجاح ✓`);
}

// ================= 16b. BULK PRICE & CURRENCY MULTIPLIER TOOL =================
function updatePriceMultiplierTargetOptions() {
  const scopeEl = document.getElementById('priceMultScope');
  if (!scopeEl) return;
  const scope = scopeEl.value;
  const wrap = document.getElementById('priceMultTargetWrap');
  const lbl = document.getElementById('priceMultTargetLbl');
  const sel = document.getElementById('priceMultTargetSelect');
  if (!wrap || !sel) return;

  if (scope === 'all') {
    wrap.style.display = 'none';
    sel.removeAttribute('required');
    return;
  }
  wrap.style.display = 'block';
  sel.setAttribute('required', 'required');

  if (scope === 'brand') {
    lbl.textContent = 'اختيار الماركة / الشركة *';
    sel.innerHTML = Object.keys(brandsData).map(b => `<option value="${sanitizeText(b)}">${sanitizeText(b)}</option>`).join('');
  } else if (scope === 'category') {
    lbl.textContent = 'اختيار القسم *';
    sel.innerHTML = categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');
  }
}

// دالة التقريب الذكي لأقرب فئة نقدية (250 أو 500 د.ع) حسب اختيار المشرف
function roundPriceToNearest(price, nearest) {
  if (!nearest || nearest <= 0) return Math.round(price);
  return Math.round(price / nearest) * nearest;
}

async function handleApplyBulkPriceMultiplier(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('bulkPriceMultiplier', 2000)) return;

  const scope = document.getElementById('priceMultScope').value;
  const target = document.getElementById('priceMultTargetSelect') ? document.getElementById('priceMultTargetSelect').value : '';
  const pct = Number(document.getElementById('priceMultPercentage').value);
  const direction = document.getElementById('priceMultDirection').value; // 'increase' | 'decrease'
  const roundTo = Number(document.getElementById('priceMultRoundTo').value || 0);

  if (isNaN(pct) || pct <= 0 || pct > 500) {
    showToast('يرجى إدخال نسبة صحيحة أكبر من صفر');
    return;
  }

  let targetProducts = [];
  const activeProds = products.filter(p => p.isDeleted !== true);
  if (scope === 'all') targetProducts = activeProds.slice();
  else if (scope === 'brand') targetProducts = activeProds.filter(p => p.brand === target);
  else if (scope === 'category') targetProducts = activeProds.filter(p => p.category === target);

  if (targetProducts.length === 0) {
    showToast('لم يتم العثور على منتجات مطابقة لهذا النطاق');
    return;
  }

  if (!confirm(`سيتم ${direction === 'increase' ? 'رفع' : 'خفض'} أسعار (${targetProducts.length}) منتج بنسبة ${pct}%. هل أنتِ متأكدة؟`)) return;

  showToast('جاري تعديل الأسعار دفعة واحدة...');
  const batch = db ? db.batch() : null;
  const multiplier = direction === 'increase' ? (1 + pct / 100) : (1 - pct / 100);

  targetProducts.forEach(p => {
    let newPrice = Math.max(0, p.price * multiplier);
    if (roundTo > 0) newPrice = roundPriceToNearest(newPrice, roundTo);
    p.price = newPrice;
    if (batch && p.id) {
      const docRef = dbPaths.productsCol().doc(String(p.id));
      batch.set(docRef, { price: newPrice }, { merge: true });
    }
  });

  if (batch) {
    try {
      await batch.commit();
      triggerR2CatalogRebuild();
    } catch (err) {
      console.warn('Bulk price multiplier batch warning:', err);
      showToast('حدث خطأ أثناء تحديث بعض الأسعار');
      return;
    }
  }

  saveLocalState();
  renderCurrentActiveView();
  showToast(`✅ تم تعديل أسعار ${targetProducts.length} منتج بنسبة ${direction === 'increase' ? '+' : '-'}${pct}% بنجاح!`);
}

// ================= 17. HERO SLIDER OFFERS & PROMO CARDS CRUD (CATEGORIZED SELECTOR — FIX #2) =================
let currentOfferSelectedProductIds = [];

function populateOfferFilterDropdowns() {
  const catSel = document.getElementById('offerFilterCategorySelect');
  const brandSel = document.getElementById('offerFilterBrandSelect');
  if (catSel) {
    catSel.innerHTML = `<option value="">📂 تصفح حسب القسم...</option>` +
      categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');
  }
  if (brandSel) {
    const brandKeys = Object.keys(brandsData);
    brandSel.innerHTML = `<option value="">🏢 تصفح حسب الماركة...</option>` +
      brandKeys.map(k => `<option value="${sanitizeText(k)}">${sanitizeText(brandsData[k].name || k)}</option>`).join('');
  }
}

function handleOfferCategoryFilterChange() {
  const catSel = document.getElementById('offerFilterCategorySelect');
  const brandSel = document.getElementById('offerFilterBrandSelect');
  const val = catSel ? catSel.value : '';
  if (val && brandSel) brandSel.value = '';
  renderOfferCategorizedList('category', val);
}

function handleOfferBrandFilterChange() {
  const catSel = document.getElementById('offerFilterCategorySelect');
  const brandSel = document.getElementById('offerFilterBrandSelect');
  const val = brandSel ? brandSel.value : '';
  if (val && catSel) catSel.value = '';
  renderOfferCategorizedList('brand', val);
}

function renderOfferCategorizedList(mode, value) {
  const listEl = document.getElementById('offerCategorizedProductsList');
  if (!listEl) return;
  if (!value) {
    listEl.innerHTML = `<div class="categorized-picker-empty">اختر قسماً أو ماركة أعلاه لعرض منتجاتها هنا.</div>`;
    return;
  }
  const matched = products.filter(p => {
    if (p.isDeleted === true) return false;
    return mode === 'category' ? p.category === value : p.brand === value;
  });
  if (matched.length === 0) {
    listEl.innerHTML = `<div class="categorized-picker-empty">لا توجد منتجات ضمن هذا التصنيف حالياً.</div>`;
    return;
  }
  listEl.innerHTML = matched.map(p => {
    const isChecked = currentOfferSelectedProductIds.includes(String(p.id));
    return `
      <label class="categorized-picker-item">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleOfferProductCheckbox('${sanitizeText(p.id)}', this.checked)">
        <span class="cp-name">${sanitizeText(p.name)} <span style="color:var(--text-soft); font-weight:600;">(${sanitizeText(p.brand || '')})</span></span>
        <span class="cp-price">${fmtPrice(p.price)}</span>
      </label>
    `;
  }).join('');
}

function toggleOfferProductCheckbox(id, checked) {
  if (checked) {
    if (!currentOfferSelectedProductIds.includes(String(id))) currentOfferSelectedProductIds.push(String(id));
  } else {
    currentOfferSelectedProductIds = currentOfferSelectedProductIds.filter(x => x !== String(id));
  }
  renderOfferProdChips();
}

function renderOfferProdChips() {
  const container = document.getElementById('offerProdChipsContainer');
  if (!container) return;
  if (currentOfferSelectedProductIds.length === 0) {
    container.innerHTML = `<span style="font-size:11.5px; color:var(--text-soft); align-self:center;" id="offerProdChipsPlaceholder">لم يتم تحديد منتجات بعد (إذا تركتها فارغة سيفتح كل العروض).</span>`;
    return;
  }
  container.innerHTML = currentOfferSelectedProductIds.map(id => {
    const p = findProduct(id);
    const name = p ? p.name : id;
    return `
      <div class="bundle-chip">
        <span>${sanitizeText(name)}</span>
        <span class="bundle-chip-remove" onclick="removeOfferProductChip('${sanitizeText(id)}')">✕</span>
      </div>
    `;
  }).join('');
}

function searchOfferProducts(q) {
  // ⚠️ تم استبدال البحث النصي بنظام التصفح المبوب حسب القسم/الماركة (renderOfferCategorizedList).
  // الدالة أُبقيت فارغة للحفاظ على التوافق مع أي استدعاء قديم متبقٍ في القوالب الخارجية.
}

function addOfferProductChip(id) {
  if (!currentOfferSelectedProductIds.includes(String(id))) {
    currentOfferSelectedProductIds.push(String(id));
    renderOfferProdChips();
  }
}

function removeOfferProductChip(id) {
  currentOfferSelectedProductIds = currentOfferSelectedProductIds.filter(x => x !== String(id));
  renderOfferProdChips();
  const activeCat = document.getElementById('offerFilterCategorySelect')?.value;
  const activeBrand = document.getElementById('offerFilterBrandSelect')?.value;
  if (activeCat) renderOfferCategorizedList('category', activeCat);
  else if (activeBrand) renderOfferCategorizedList('brand', activeBrand);
}

function renderPromoCardsListAdmin() {
  const container = document.getElementById('adminPromoCardsListGrid');
  if (!container) return;
  const cards = pharmacyProfile.promoCards || [];

  if (cards.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:14px 0;">لا توجد شرائح عروض نشطة بالسلايدر.</div>`;
    return;
  }

  container.innerHTML = cards.map(c => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:40px; height:40px; border-radius:8px; background:var(--surface); display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${c.img ? `<img src="${sanitizeUrl(c.img)}" style="width:100%; height:100%; object-fit:cover;">` : icons.bottle('var(--accent)')}
        </div>
        <div>
          <div style="font-weight:900; font-size:13.5px;">${sanitizeText(c.title)} <span class="log-badge">${sanitizeText(c.discount)}</span></div>
          <div style="font-size:11.5px; color:var(--text-soft);">${sanitizeText(c.desc)} · ${(c.productIds || []).length} منتجات مشمولة</div>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="editPromoCard('${sanitizeText(c.id)}')" style="background:#E0E7FF; color:#3730A3; padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
        <button onclick="deletePromoCard('${sanitizeText(c.id)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

function editPromoCard(cardId) {
  const card = (pharmacyProfile.promoCards || []).find(c => c.id === cardId);
  if (!card) return;
  document.getElementById('promoCardDocId').value = card.id;
  document.getElementById('promoCardTitle').value = card.title || '';
  document.getElementById('promoCardDesc').value = card.desc || '';
  document.getElementById('promoCardDiscountText').value = card.discount || '';
  document.getElementById('promoCardImgUrl').value = card.img || '';

  if (document.getElementById('promoCardBgColor')) document.getElementById('promoCardBgColor').value = card.slideBgColor || '#FFF0F3';
  if (document.getElementById('promoCardBgColorText')) document.getElementById('promoCardBgColorText').value = card.slideBgColor || '';

  currentOfferSelectedProductIds = (card.productIds || []).map(String);
  if (document.getElementById('offerFilterCategorySelect')) document.getElementById('offerFilterCategorySelect').value = '';
  if (document.getElementById('offerFilterBrandSelect')) document.getElementById('offerFilterBrandSelect').value = '';
  renderOfferCategorizedList('category', '');
  renderOfferProdChips();

  document.getElementById('adminPromoCardFormTitle').textContent = '✏️ تعديل شريحة العرض: ' + card.title;
  document.getElementById('adminSavePromoCardBtn').textContent = '💾 حفظ تعديلات الشريحة بالسلايدر';
}

function resetPromoCardForm() {
  if (!document.getElementById('promoCardDocId')) return;
  document.getElementById('promoCardDocId').value = '';
  document.getElementById('promoCardTitle').value = '';
  document.getElementById('promoCardDesc').value = '';
  document.getElementById('promoCardDiscountText').value = '';
  document.getElementById('promoCardImgUrl').value = '';
  if (document.getElementById('promoCardBgColor')) document.getElementById('promoCardBgColor').value = '#FFF0F3';
  if (document.getElementById('promoCardBgColorText')) document.getElementById('promoCardBgColorText').value = '';
  currentOfferSelectedProductIds = [];
  if (document.getElementById('offerFilterCategorySelect')) document.getElementById('offerFilterCategorySelect').value = '';
  if (document.getElementById('offerFilterBrandSelect')) document.getElementById('offerFilterBrandSelect').value = '';
  renderOfferCategorizedList('category', '');
  renderOfferProdChips();
  document.getElementById('adminPromoCardFormTitle').textContent = '🎁 إضافة شريحة عرض جديدة للسلايدر العلوي';
  document.getElementById('adminSavePromoCardBtn').textContent = '💾 حفظ شريحة العرض في السلايدر';
}

async function handleSavePromoCard(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('savePromoCard', 1200)) return;

  const docId = document.getElementById('promoCardDocId').value.trim();
  const title = document.getElementById('promoCardTitle').value.trim();
  const desc = document.getElementById('promoCardDesc').value.trim();
  const discount = document.getElementById('promoCardDiscountText').value.trim();
  const img = sanitizeUrl(document.getElementById('promoCardImgUrl').value.trim());

  const bgColorVal = document.getElementById('promoCardBgColorText')?.value.trim() || document.getElementById('promoCardBgColor')?.value || '';

  if (!title || !desc || !discount) {
    showToast('يرجى تعبئة كافة الحقول المطلوبة');
    return;
  }

  if (!pharmacyProfile.promoCards) pharmacyProfile.promoCards = [];

  const cardObj = {
    id: docId || ('pc_' + Date.now()),
    title: sanitizeText(title),
    desc: sanitizeText(desc),
    discount: sanitizeText(discount),
    img: img,
    slideBgColor: bgColorVal,
    productIds: currentOfferSelectedProductIds.slice()
  };

  const idx = pharmacyProfile.promoCards.findIndex(c => c.id === cardObj.id);
  if (idx > -1) pharmacyProfile.promoCards[idx] = cardObj;
  else pharmacyProfile.promoCards.unshift(cardObj);

  saveLocalState();
  renderPromoCardsListAdmin();

  try {
    if (db) {
      await dbPaths.pharmacyDoc().set({ promoCards: pharmacyProfile.promoCards }, { merge: true });
      triggerR2CatalogRebuild();
    }
    showToast('تم حفظ شريحة العرض وتحديث السلايدر العلوي بنجاح ✓');
    resetPromoCardForm();
  } catch (err) { console.error(err); }
}

async function deletePromoCard(cardId) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذه الشريحة من السلايدر؟')) {
    pharmacyProfile.promoCards = (pharmacyProfile.promoCards || []).filter(c => c.id !== cardId);
    saveLocalState();
    renderPromoCardsListAdmin();
    if (db) {
      await dbPaths.pharmacyDoc().set({ promoCards: pharmacyProfile.promoCards }, { merge: true });
      triggerR2CatalogRebuild();
    }
    showToast('تم حذف الشريحة من السلايدر بنجاح ✓');
  }
}

// ================= 18. REAL ANALYTICS =================
async function recordRealVisit() {
  const today = new Date().toISOString().split('T')[0];
  const visitKey = getStorageKey('visited_' + today);
  try {
    if (!sessionStorage.getItem(visitKey)) {
      sessionStorage.setItem(visitKey, '1');
      if (db) {
        await dbPaths.analyticsDailyCol().doc(today).set({
          visits: firebase.firestore.FieldValue.increment(1),
          date: today
        }, { merge: true });
      }
    }
    fetchRealAnalytics();
  } catch (e) { console.warn(e); }
}

async function fetchRealAnalytics() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);
    // 📊 (جديد — إعادة تعيين إحصائيات المبيعات) لا نحذف أي طلب فعلي من قاعدة البيانات؛
    // فقط نتجاهل أي طلب تم قبل لحظة "إعادة التعيين" عند حساب أرقام لوحة التحكم، بينما تبقى
    // كل الطلبات والتقارير التفصيلية سليمة كما هي. هذا أأمن بكثير من حذف بيانات حقيقية.
    const resetAtMs = pharmacyProfile.salesStatsResetAt ? new Date(pharmacyProfile.salesStatsResetAt).getTime() : 0;

    // 📊 (إعادة بناء الداشبورد — تقرير احترافي) نحسب أيضاً أمس والشهر الماضي للمقارنة
    // (نسبة التغيّر ▲▼)، ومتوسط قيمة الطلب، ومبيعات كل قسم هذا الشهر — كل هذا من نفس
    // مسح الطلبات الواحد، بلا أي قراءة إضافية من Firestore.
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    let dRev = 0, mRev = 0, dProfit = 0, mProfit = 0, dOrders = 0, mOrders = 0;
    let yRev = 0, lmRev = 0;
    const categoryRevMap = {};
    const ordersSnap = await dbPaths.ordersCol().get();
    totalOrdersCount = Math.max(ordersSnap.size, myOrders.length);

    const productSalesMap = {};

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const oTotal = Number(o.total || o.verifiedTotal || 0);
      const oDate = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.date || '');
      const oTimeMs = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : (oDate ? new Date(oDate).getTime() : 0);
      if (resetAtMs && oTimeMs && oTimeMs < resetAtMs) return; // 🔄 استُبعد لأنه قبل نقطة إعادة التعيين
      const isToday = oDate.startsWith(todayStr);
      const isThisMonth = oDate.startsWith(currentMonthStr);
      const isYesterday = oDate.startsWith(yesterdayStr);
      const isLastMonth = oDate.startsWith(lastMonthStr);
      if (isToday) { dRev += oTotal; dOrders++; }
      if (isThisMonth) {
        mRev += oTotal; mOrders++;
        (o.items || []).forEach(it => {
          const prod = it && it.id ? findProduct(it.id) : null;
          const catLabel = prod ? (categories.find(c => c.id === prod.category)?.label || prod.category || 'غير مصنف') : (it.isBundle ? '🎁 بكجات' : 'غير مصنف');
          const lineRev = Number(it.lineTotal) || (Number(it.unitPrice || 0) * Number(it.quantity || 1));
          categoryRevMap[catLabel] = (categoryRevMap[catLabel] || 0) + lineRev;
        });
      }
      if (isYesterday) yRev += oTotal;
      if (isLastMonth) lmRev += oTotal;

      // 📊 (البند 10) صافي الربح اليومي/الشهري — يُحتسب من unitCostPrice المحفوظة كلقطة
      // داخل كل عنصر طلب وقت الشراء الفعلي (وليس السعر الحالي بالمخزون، تفادياً لتحريف
      // الأرباح التاريخية عند تغيّر أسعار التكلفة لاحقاً). البنود بلا تكلفة مسجّلة لا تُحتسب.
      (o.items || []).forEach(it => {
        if (it && it.id) {
          productSalesMap[it.id] = (productSalesMap[it.id] || 0) + Number(it.quantity || 1);
        }
        if (it && it.unitCostPrice !== undefined && it.unitCostPrice !== null) {
          const lineProfit = (Number(it.unitPrice || 0) - Number(it.unitCostPrice || 0)) * Number(it.quantity || 1);
          if (isToday) dProfit += lineProfit;
          if (isThisMonth) mProfit += lineProfit;
        }
      });
    });

    todayRevenue = dRev;
    monthlyRevenue = mRev;
    todayProfit = dProfit;
    monthlyProfit = mProfit;
    todayOrdersCount = dOrders;
    monthlyOrdersCount = mOrders;
    yesterdayRevenue = yRev;
    lastMonthRevenue = lmRev;
    avgOrderValueToday = dOrders > 0 ? Math.round(dRev / dOrders) : 0;
    avgOrderValueMonth = mOrders > 0 ? Math.round(mRev / mOrders) : 0;
    topCategoriesThisMonth = Object.entries(categoryRevMap)
      .map(([label, rev]) => ({ label, rev }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 5);

    products.forEach(p => {
      if (productSalesMap[p.id]) {
        p.orderCount = Math.max(Number(p.orderCount || 0), productSalesMap[p.id]);
      }
    });

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }
    
    const visitsSnap = await dbPaths.analyticsDailyCol().get();
    const visitsMap = {};
    visitsSnap.forEach(doc => { visitsMap[doc.id] = (doc.data().visits || 0); });

    todayVisitsCount = visitsMap[todayStr] || 0;

    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    weeklyVisitsData = last7Days.map(dateStr => {
      const dObj = new Date(dateStr);
      return {
        date: dateStr,
        day: dayNames[dObj.getDay()],
        visits: visitsMap[dateStr] || 0
      };
    });

    renderRealAnalyticsView();
  } catch (e) { console.warn(e); }
}

// 🔄 (جديد — إعادة تعيين إحصائيات المبيعات من لوحة التحكم) لا تحذف أي طلب فعلي؛ فقط تسجّل
// "نقطة بداية" جديدة (salesStatsResetAt) بمستند الصيدلية، وتستبعد fetchRealAnalytics أي طلب
// أقدم منها عند حساب أرقام اليوم/الشهر — بيانات الطلبات والتقارير المالية تبقى سليمة بالكامل.
async function resetSalesStats() {
  if (!isSuperAdmin() && !isCurrentUserAdmin()) { showToast('⚠️ هذه الميزة متاحة للمشرفين فقط'); return; }
  if (!confirm('سيتم تصفير أرقام المبيعات المعروضة بلوحة التحكم (اليوم/الشهر) والبدء من جديد اعتباراً من الآن. الطلبات الفعلية والتقارير المالية لن تتأثر أو تُحذف. هل تريدين المتابعة؟')) return;

  try {
    const nowIso = new Date().toISOString();
    if (db) await dbPaths.pharmacyDoc().set({ salesStatsResetAt: nowIso }, { merge: true });
    pharmacyProfile.salesStatsResetAt = nowIso;
    showToast('✅ تم تصفير إحصائيات المبيعات — البدء من جديد الآن.');
    fetchRealAnalytics();
  } catch (err) {
    showToast('⚠️ تعذر تصفير الإحصائيات: ' + err.message);
  }
}

function renderRealAnalyticsView() {
  const statDailyRev = document.getElementById('statDailyRevenue');
  const statMonthlyRev = document.getElementById('statMonthlyRevenue');
  const statVisits = document.getElementById('statDailyVisits');
  const statOrders = document.getElementById('statTotalOrdersV');
  const statDailyProfitEl = document.getElementById('statDailyProfit');
  const statMonthlyProfitEl = document.getElementById('statMonthlyProfit');
  const statDailyOrdersEl = document.getElementById('statDailyOrders');
  const statMonthlyOrdersEl = document.getElementById('statMonthlyOrders');
  const resetInfoEl = document.getElementById('salesResetInfo');
  if (resetInfoEl) {
    resetInfoEl.textContent = pharmacyProfile.salesStatsResetAt
      ? `آخر تصفير: ${new Date(pharmacyProfile.salesStatsResetAt).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' })}`
      : '';
  }

  if (statDailyRev) statDailyRev.textContent = fmtPrice(todayRevenue);
  if (statMonthlyRev) statMonthlyRev.textContent = fmtPrice(monthlyRevenue);
  if (statVisits) statVisits.textContent = todayVisitsCount;
  if (statOrders) statOrders.textContent = totalOrdersCount;
  if (statDailyProfitEl) statDailyProfitEl.textContent = fmtPrice(todayProfit);
  if (statMonthlyProfitEl) statMonthlyProfitEl.textContent = fmtPrice(monthlyProfit);
  if (statDailyOrdersEl) statDailyOrdersEl.textContent = todayOrdersCount;
  if (statMonthlyOrdersEl) statMonthlyOrdersEl.textContent = monthlyOrdersCount;

  // 📈📉 (إعادة بناء الداشبورد) شارات المقارنة — نسبة تغيّر مبيعات اليوم عن أمس، والشهر
  // الحالي عن الشهر الماضي، بلون أخضر للارتفاع وأحمر للانخفاض.
  const renderDeltaBadge = (elId, current, previous) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!previous || previous <= 0) { el.textContent = ''; el.style.display = 'none'; return; }
    const pct = Math.round(((current - previous) / previous) * 100);
    const isUp = pct >= 0;
    el.style.display = 'inline-flex';
    el.style.color = isUp ? '#059669' : '#DC2626';
    el.style.background = isUp ? '#ECFDF5' : '#FEF2F2';
    el.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(pct)}%`;
  };
  renderDeltaBadge('statDailyRevDelta', todayRevenue, yesterdayRevenue);
  renderDeltaBadge('statMonthlyRevDelta', monthlyRevenue, lastMonthRevenue);

  const aovDailyEl = document.getElementById('statAovDaily');
  const aovMonthlyEl = document.getElementById('statAovMonthly');
  if (aovDailyEl) aovDailyEl.textContent = fmtPrice(avgOrderValueToday);
  if (aovMonthlyEl) aovMonthlyEl.textContent = fmtPrice(avgOrderValueMonth);

  // 🗂️ (إعادة بناء الداشبورد) أداء الأقسام هذا الشهر — أي أقسام تحقق أعلى مبيعات فعلياً
  const catPerfEl = document.getElementById('adminCategoryPerfList');
  if (catPerfEl) {
    const maxCatRev = topCategoriesThisMonth.length ? Math.max(...topCategoriesThisMonth.map(c => c.rev), 1) : 1;
    catPerfEl.innerHTML = topCategoriesThisMonth.length === 0
      ? `<div class="no-results" style="padding:16px 0;">لا توجد مبيعات مصنّفة هذا الشهر بعد.</div>`
      : topCategoriesThisMonth.map(c => {
          const pct = Math.round((c.rev / maxCatRev) * 100);
          return `
            <div class="admin-rank-item-pro">
              <div class="admin-rank-item-top">
                <span style="font-weight:800;">${sanitizeText(c.label)}</span>
                <span class="mono" style="font-weight:900; color:var(--accent);">${fmtPrice(c.rev)}</span>
              </div>
              <div class="admin-rank-bar-track"><div class="admin-rank-bar-fill" style="width:${pct}%;"></div></div>
            </div>`;
        }).join('');
  }

  const chartContainer = document.getElementById('adminRealChartBars');
  if (chartContainer && weeklyVisitsData.length > 0) {
    const maxVisits = Math.max(...weeklyVisitsData.map(v => v.visits), 1);
    chartContainer.innerHTML = weeklyVisitsData.map(d => {
      const pct = (d.visits > 0) ? Math.round((d.visits / maxVisits) * 90) + 10 : 4;
      return `
        <div class="chart-bar-col">
          <span class="mono" style="font-size:10px; font-weight:800; color:var(--accent);">${d.visits > 0 ? d.visits : '0'}</span>
          <div class="chart-bar-fill" style="height: ${pct}%;"></div>
          <span class="chart-bar-lbl">${d.day}</span>
        </div>`;
    }).join('');
  }

  const topOrdersEl = document.getElementById('adminTopOrderedList');
  if (topOrdersEl) {
    const topOrdered = products.filter(p => (Number(p.orderCount) || 0) > 0 && p.isDeleted !== true)
      .sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0))
      .slice(0, 5);

    // 🏆 (البند 10) قسم "الأكثر مبيعاً" بشكل احترافي أكثر — ميداليات ذهبية/فضية/برونزية
    // للمراكز الثلاثة الأولى، وشريط تقدّم نسبي يقارن كل منتج بأعلى مبيعات مسجّلة.
    const medalIcons = ['🥇', '🥈', '🥉'];
    const maxOrderCount = topOrdered.length ? Math.max(...topOrdered.map(p => Number(p.orderCount) || 0), 1) : 1;

    topOrdersEl.innerHTML = topOrdered.length === 0 ? `<div class="no-results" style="padding:20px 0;">لا توجد مبيعات مسجلة حتى الآن.</div>` : 
      topOrdered.map((p, idx) => {
        const pct = Math.round(((Number(p.orderCount) || 0) / maxOrderCount) * 100);
        return `
        <div class="admin-rank-item admin-rank-item-pro">
          <div class="admin-rank-item-top">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="admin-rank-badge admin-rank-badge-pro">${medalIcons[idx] || (idx + 1)}</span>
              <span style="font-weight:800;">${sanitizeText(p.name)} <span style="font-weight:600; color:var(--text-soft); font-size:11.5px;">(${sanitizeText(p.brand || '')})</span></span>
            </div>
            <span class="mono" style="font-weight:900; color:var(--accent);">${p.orderCount} مبيعة</span>
          </div>
          <div class="admin-rank-bar-track"><div class="admin-rank-bar-fill" style="width:${pct}%;"></div></div>
        </div>`;
      }).join('');
  }
}

// ================= 19. REALTIME ORDERS SNAPSHOT =================
let adminOrdersUnsubscribe = null;

// ================= 19b. AUDIO ALERT FOR NEW ORDERS =================
let knownOrderIdsForAlert = null; // null = أول تحميل، لا نُنبّه على الطلبات الموجودة أصلاً
let adminAlertMuted = false;
let audioAlertRepeatTimer = null;

function getAudioMuteStorageKey() {
  return `saas_${currentPharmacyId}_admin_alert_muted`;
}

function initAdminAudioAlertPreference() {
  adminAlertMuted = localStorage.getItem(getAudioMuteStorageKey()) === '1';
  updateAudioMuteButtonUI();
}

function toggleAdminAudioAlertMute() {
  adminAlertMuted = !adminAlertMuted;
  localStorage.setItem(getAudioMuteStorageKey(), adminAlertMuted ? '1' : '0');
  if (adminAlertMuted && audioAlertRepeatTimer) {
    clearInterval(audioAlertRepeatTimer);
    audioAlertRepeatTimer = null;
  }
  updateAudioMuteButtonUI();
  showToast(adminAlertMuted ? '🔇 تم كتم تنبيه الطلبات الجديدة' : '🔊 تم تفعيل تنبيه الطلبات الجديدة');
}

function updateAudioMuteButtonUI() {
  const btn = document.getElementById('adminAlertMuteBtn');
  if (!btn) return;
  btn.textContent = adminAlertMuted ? '🔇' : '🔊';
  btn.title = adminAlertMuted ? 'تفعيل صوت تنبيه الطلبات' : 'كتم صوت تنبيه الطلبات';
  btn.style.background = adminAlertMuted ? '#374151' : '#F59E0B';
}

// نغمة تنبيه مُولّدة برمجياً عبر Web Audio API (بدون أي ملف صوتي خارجي)
function playNewOrderBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.18);
    playTone(1108, now + 0.22, 0.22);
  } catch (e) {
    console.warn('Audio alert error:', e);
  }
}

function triggerRepeatingNewOrderAlert() {
  if (adminAlertMuted) return;
  if (audioAlertRepeatTimer) clearInterval(audioAlertRepeatTimer);
  let repeats = 0;
  playNewOrderBeep();
  audioAlertRepeatTimer = setInterval(() => {
    repeats++;
    if (repeats >= 4) {
      clearInterval(audioAlertRepeatTimer);
      audioAlertRepeatTimer = null;
      return;
    }
    playNewOrderBeep();
  }, 1600);
}

function listenToAdminOrdersRealtime() {
  if (!isFirebaseConfigured || !db) return;

  if (adminOrdersUnsubscribe) {
    adminOrdersUnsubscribe();
  }

  adminOrdersUnsubscribe = dbPaths.ordersCol().onSnapshot(snap => {
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    orders.sort((a, b) => {
      const timeA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : new Date(a.date || 0).getTime();
      const timeB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : new Date(b.date || 0).getTime();
      return timeB - timeA;
    });

    // 🔔 التنبيه الصوتي: نقارن معرّفات الطلبات الحالية بآخر لقطة معروفة لاكتشاف أي طلب جديد فعلاً
    const currentIds = new Set(orders.map(o => o.id));
    if (knownOrderIdsForAlert !== null) {
      const hasNewOrder = orders.some(o => !knownOrderIdsForAlert.has(o.id));
      if (hasNewOrder) {
        triggerRepeatingNewOrderAlert();
        showToast('🛎️ لديك طلب جديد وارد الآن!');
      }
    }
    knownOrderIdsForAlert = currentIds;

    window.adminLastOrdersList = orders;
    totalOrdersCount = orders.length;

    renderAdminOrdersList(orders);
    fetchRealAnalytics();
  }, err => console.warn("Orders Snapshot Warning:", err));
}

async function fetchAdminOrdersList() {
  listenToAdminOrdersRealtime();
}

function renderAdminOrdersList(orders) {
  const container = document.getElementById('adminOrdersManageContainer');
  if (!container) return;

  const timeFilter = document.getElementById('reportTimeRange') ? document.getElementById('reportTimeRange').value : 'all';
  const statusFilter = document.getElementById('reportStatusFilter') ? document.getElementById('reportStatusFilter').value : 'all';

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7);

  let displayOrders = (orders || []).filter(o => {
    const oDate = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.date || '');
    if (timeFilter === 'today' && !oDate.startsWith(todayStr)) return false;
    if (timeFilter === 'yesterday' && !oDate.startsWith(yesterdayStr)) return false;
    if (timeFilter === 'month' && !oDate.startsWith(monthStr)) return false;

    if (statusFilter === 'delivered' && !(o.status && o.status.includes('التسليم'))) return false;
    if (statusFilter === 'shipping' && !(o.status && o.status.includes('الشحن'))) return false;
    if (statusFilter === 'processing' && !(o.status && o.status.includes('المعالجة'))) return false;
    if (statusFilter === 'customer_cancelled' && !(o.status && o.status.includes('الزبون'))) return false;
    if (statusFilter === 'cancelled' && !(o.status && o.status.includes('ملغي'))) return false;

    return true;
  });

  if (displayOrders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:24px 0;">لا توجد طلبات مسجلة حالياً.</div>`;
    return;
  }

  container.innerHTML = displayOrders.map(ord => {
    const items = ord.items || [];
    let itemsCalcSubtotal = 0;
    
    const itemsHtml = items.map(it => {
      const unitPrice = Number(it.price || it.unitPrice || 0);
      const qty = Number(it.quantity || 1);
      const lineTotal = Number(it.lineTotal) || (unitPrice * qty);
      itemsCalcSubtotal += lineTotal;
      return `• ${it.isBundle ? '🎁 [بكج] ' : ''}${sanitizeText(it.name || 'منتج')} (${fmtPrice(unitPrice)} × ${qty} قطع) = <b>${fmtPrice(lineTotal)}</b>`;
    }).join('<br>');

    const delFee = (ord.deliveryFee !== undefined) 
      ? Number(ord.deliveryFee) 
      : ((ord.deliveryMethod === 'express') ? (pharmacyProfile.deliveryFeeExpress || 8000) : (pharmacyProfile.deliveryFeeStandard || 4000));
      
    const discountVal = Number(ord.discountAmount || 0);
    const subtotalVal = Number(ord.subtotal) || itemsCalcSubtotal;
    const grandTotal = Number(ord.total) || Math.max(0, subtotalVal - discountVal) + delFee;
    const isCancelled = ord.status && ord.status.includes('ملغي');

    return `
      <div class="admin-order-manage-card">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--line); padding-bottom:8px; margin-bottom:8px;">
          <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" onclick="openReceiptModal('${sanitizeText(ord.id)}')" style="background:#10B981; color:#fff; font-size:11px; font-weight:800; padding:6px 12px; border-radius:8px; cursor:pointer;">🖨️ طباعة وصل</button>
            <select class="admin-order-status-select" onchange="updateOrderStatus('${sanitizeText(ord.id)}', this.value)">
              <option value="قيد المعالجة والتجهيز 🚚" ${ord.status === 'قيد المعالجة والتجهيز 🚚' ? 'selected' : ''}>قيد التجهيز 🚚</option>
              <option value="تم الشحن مع المندوب 🛵" ${ord.status === 'تم الشحن مع المندوب 🛵' ? 'selected' : ''}>تم الشحن 🛵</option>
              <option value="تم التسليم بنجاح ✅" ${ord.status === 'تم التسليم بنجاح ✅' ? 'selected' : ''}>تم التسليم ✅</option>
              <option value="طلب ملغي من قبل الزبون ❌" ${ord.status === 'طلب ملغي من قبل الزبون ❌' ? 'selected' : ''}>ملغي من الزبون ❌</option>
              <option value="طلب ملغي ❌" ${ord.status === 'طلب ملغي ❌' ? 'selected' : ''}>طلب ملغي ❌</option>
            </select>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px;">
          التاريخ: <span class="mono">${sanitizeText(ord.date || '')}</span> · الزبون: <b>${sanitizeText(ord.name || '')}</b> (${sanitizeText(ord.phone || '')})
        </div>
        <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px;">
          العنوان: ${sanitizeText(ord.address || '')} (${ord.deliveryMethod === 'express' ? 'توصيل سريع' : 'توصيل عادي'})
        </div>
        <div style="font-size:12px; color:var(--ink); margin-bottom:6px; background:#F9FAFB; padding:8px 10px; border-radius:8px;">
          ${itemsHtml}
        </div>
        <div class="order-pricing-box" style="margin:6px 0; background:#FFF; border:1px dashed var(--line);">
          <div class="order-pricing-row"><span>المجموع الفرعي للمنتجات:</span><span class="mono">${fmtPrice(subtotalVal)}</span></div>
          ${discountVal > 0 ? `<div class="order-pricing-row discount-row"><span>🎟️ خصم الكوبون (${ord.promoCode || 'كود'}):</span><span class="mono">-${fmtPrice(discountVal)}</span></div>` : ''}
          <div class="order-pricing-row"><span>أجرة التوصيل:</span><span class="mono">+${fmtPrice(delFee)}</span></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--line); padding-top:6px; margin-top:6px;">
          <span style="font-size:12px; font-weight:700; color:${isCancelled ? '#DC2626' : 'var(--text-soft)'};">الحالة: ${sanitizeText(ord.status || 'قيد التجهيز')}</span>
          <span style="font-weight:900; font-size:15px; color:var(--rose-deep);">المجموع الكلي: ${fmtPrice(grandTotal)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  if (!assertAdmin()) return;
  if (db) {
    await dbPaths.ordersCol().doc(String(orderId)).set({ status: newStatus }, { merge: true });
    showToast(`تم تحديث حالة الطلب #${orderId} إلى: ${newStatus}`);
  }
}

// ================= 20. EXCEL/CSV EXPORT =================
// ================= 20b. FINANCIAL REPORT: GROUPED BY 3 CATEGORIES + ENGLISH DATES =================
// ⚠️ ملاحظة تقنية مهمة: لا يحتوي نظام المنتجات على حقل "سعر التكلفة" (Cost Price)، لذا يُحتسب هنا
// "صافي المبيعات" (Total Sales) لكل قسم كمؤشر مالي دقيق بدل "الربح الصافي" الذي يتطلب تسجيل تكلفة
// شراء كل صنف أولاً. يمكن إضافة حقل costPrice لاحقاً لمنتج لاحتساب ربح حقيقي دقيق.
function classifyCategoryGroup(categoryIdOrLabel) {
  const s = (categoryIdOrLabel || '').toString().toLowerCase();
  if (s.includes('milk') || s.includes('حليب')) return 'baby_milk';
  if (s.includes('dental') || s.includes('tooth') || s.includes('paste') || s.includes('اسنان') || s.includes('سنان') || s.includes('oral')) return 'oral_care';
  return 'cosmetics';
}

function getOrderItemGroup(item) {
  if (item.isBundle) return 'cosmetics';
  const prod = findProduct(item.id) || archivedProducts.find(p => String(p.id) === String(item.id));
  const catId = prod ? prod.category : '';
  const catObj = categories.find(c => c.id === catId);
  return classifyCategoryGroup((catObj && catObj.label) || catId);
}

// تنسيق تاريخ الطلب بالإنجليزية الكاملة (مثال: September 16, 2026, 02:30 PM) بدل الأشهر العربية
function formatOrderDateEnglish(o) {
  try {
    if (o.createdAt && typeof o.createdAt.toDate === 'function') {
      return o.createdAt.toDate().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
  } catch (e) {}
  // احتياط: إن لم يوجد createdAt (طلبات قديمة محلية)، نعرض التاريخ المخزن كما هو
  return o.date || '';
}

const REPORT_GROUP_LABELS = {
  cosmetics: 'Cosmetics & Personal Care (قسم الكوزمتك)',
  baby_milk: 'Baby Milk & Formula (قسم حليب الأطفال)',
  oral_care: 'Oral & Dental Care (قسم عناية الأسنان)'
};

// 🛡️🔒 (إصلاح أمني — CSV/Formula Injection) اسم الزبون ورقم هاتفه يُكتبان من قبل الزبون
// نفسه عند الطلب بلا أي قيد، ثم يُدرجان هنا مباشرة داخل ملف CSV يفتحه الأدمن لاحقاً ببرنامج
// جداول بيانات (Excel/Sheets). لو بدأ الاسم بأحد الرموز =+-@ أو بحرف تبويب، تفسّره أغلب
// برامج الجداول كصيغة (Formula) قابلة للتنفيذ بدل نص عادي — وهي ثغرة معروفة (CSV/Formula
// Injection) قد تُستخدم لفتح روابط خبيثة أو تسريب بيانات من ملف الأدمن. الحل القياسي:
// إضافة علامة اقتباس أحادية ' في بداية أي قيمة تبدأ بأحد هذه الرموز، فتُجبر البرامج على
// معاملتها كنص صرف بدل صيغة، مع مضاعفة أي علامات اقتباس مزدوجة داخل القيمة كما كان يحدث
// سابقاً لحقل itemsFormatted فقط (والآن يُطبَّق على كل حقل نصي قادم من الزبون بلا استثناء).
function csvSafeField(val) {
  let s = String(val == null ? '' : val).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

async function buildDetailedOrdersCSV() {
  let orders = window.adminLastOrdersList || [];
  if (orders.length === 0 && db) {
    const snap = await dbPaths.ordersCol().orderBy('createdAt', 'desc').get();
    snap.forEach(d => orders.push(d.data()));
  }
  if (orders.length === 0) orders = myOrders;

  const groups = {
    cosmetics: { orders: new Set(), totalSales: 0, rows: [] },
    baby_milk: { orders: new Set(), totalSales: 0, rows: [] },
    oral_care: { orders: new Set(), totalSales: 0, rows: [] }
  };

  let totalCOD = 0, totalDelivery = 0, totalNetStore = 0;
  // 🌟 (جديد — صافي الربح) نعتمد حصراً على unitCostPrice المحفوظة كلقطة داخل كل طلب وقت
  // البيع (وليس سعر التكلفة الحالي للمنتج، الذي قد يتغيّر لاحقاً من لوحة التحكم فيُفسد دقة
  // تقارير الأشهر السابقة). itemsMissingCost يُحصي عدد القطع المباعة التي لم يُحدَّد لها
  // سعر تكلفة بعد، ليكون الرقم النهائي صريحاً بأنه "حد أدنى" للربح لا رقماً نهائياً دقيقاً
  // 100% ما دام بعض المنتجات ناقصة سعر التكلفة.
  let totalCostOfGoods = 0, itemsMissingCost = 0, itemsWithCost = 0;

  orders.forEach(o => {
    const orderTotal = Number(o.total || 0);
    const delFee = (o.deliveryFee !== undefined) ? Number(o.deliveryFee) : ((o.deliveryMethod === 'express') ? (pharmacyProfile.deliveryFeeExpress || 8000) : (pharmacyProfile.deliveryFeeStandard || 4000));
    const netStore = Math.max(0, orderTotal - delFee);
    totalCOD += orderTotal;
    totalDelivery += delFee;
    totalNetStore += netStore;

    (o.items || []).forEach(it => {
      if (it.isBundle) return; // هامش ربح البكجات غير محسوب حالياً (خارج نطاق هذا الإصلاح)
      const qty = Number(it.quantity || 1);
      if (it.unitCostPrice !== undefined && it.unitCostPrice !== null) {
        totalCostOfGoods += Number(it.unitCostPrice) * qty;
        itemsWithCost += qty;
      } else {
        itemsMissingCost += qty;
      }
    });

    const englishDate = formatOrderDateEnglish(o);
    const itemsByGroup = { cosmetics: [], baby_milk: [], oral_care: [] };

    (o.items || []).forEach(it => {
      const group = getOrderItemGroup(it);
      itemsByGroup[group].push(it);
    });

    Object.keys(itemsByGroup).forEach(group => {
      const itemsInGroup = itemsByGroup[group];
      if (itemsInGroup.length === 0) return;
      const groupSubtotal = itemsInGroup.reduce((sum, it) => sum + (Number(it.lineTotal) || (Number(it.price || it.unitPrice || 0) * Number(it.quantity || 1))), 0);
      groups[group].orders.add(o.id);
      groups[group].totalSales += groupSubtotal;
      const itemsFormatted = itemsInGroup.map(it => `${it.name} (x${it.quantity})`).join(' + ');
      groups[group].rows.push(
        `"${csvSafeField(o.id)}","${englishDate}","${csvSafeField(o.name || '')}","${csvSafeField(o.phone || '')}","${csvSafeField(itemsFormatted)}","${groupSubtotal}"`
      );
    });
  });

  let csv = `SaaS Pharmacy Financial Report - ${pharmacyProfile.name || currentPharmacyId}\n`;
  csv += `Generated: ${new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n`;

  ['cosmetics', 'baby_milk', 'oral_care'].forEach(group => {
    const g = groups[group];
    csv += `=== ${REPORT_GROUP_LABELS[group]} ===\n`;
    csv += `Order ID,Date,Customer Name,Phone Number,Items Ordered,Section Sales (IQD)\n`;
    if (g.rows.length === 0) {
      csv += `"No orders in this section yet","","","","",""\n`;
    } else {
      csv += g.rows.join('\n') + '\n';
    }
    csv += `"SECTION TOTALS","${g.orders.size} Orders","","","","${g.totalSales} IQD"\n\n`;
  });

  csv += `=== OVERALL STORE TOTALS ===\n`;
  csv += `"TOTAL ORDERS","${orders.length}"\n`;
  csv += `"TOTAL SALES (IQD)","${totalCOD}"\n`;
  csv += `"TOTAL DELIVERY FEES (IQD)","${totalDelivery}"\n`;
  csv += `"NET STORE REVENUE (IQD, excl. delivery)","${totalNetStore}"\n`;
  csv += `"TOTAL COST OF GOODS SOLD (IQD)","${totalCostOfGoods}"\n`;
  csv += `"ESTIMATED NET PROFIT (IQD, excl. delivery)","${Math.max(0, totalNetStore - totalCostOfGoods)}"\n`;
  if (itemsMissingCost > 0) {
    csv += `"NOTE","${itemsMissingCost} sold unit(s) had no costPrice set — profit figure above is a minimum estimate, not exact"\n`;
  }

  return { csv, totalOrders: orders.length, totalRevenue: totalCOD, totalDelivery, totalNetStore, totalCostOfGoods, netProfit: Math.max(0, totalNetStore - totalCostOfGoods), itemsMissingCost };
}

// 🔒 (إصلاح #9 — التقارير حصراً للمشرف العام) كانت متاحة لأي مشرف صيدلية (assertAdmin
// فقط)، بينما التقرير المالي يحتوي بيانات حساسة (التكلفة، صافي الربح). أصبحت الآن مقيَّدة
// بـ isSuperAdmin() حصراً، والزر نفسه يُخفى عن المشرف العادي في الواجهة (admin.html).
async function exportOrdersToCSV() {
  if (!isSuperAdmin()) { showToast('⚠️ التقارير المالية متاحة حصراً للمشرف العام للمنصة'); return; }
  showToast('جاري تصدير وتحميل ملف المبيعات المقسّم حسب الأقسام...');
  try {
    const report = await buildDetailedOrdersCSV();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).replace(/\s|,/g, '-');
    const fileName = `Sales_Report_${currentPharmacyId}_${dateStr}.csv`;

    const blob = new Blob(["\uFEFF" + report.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`تم تنزيل ${fileName} بنجاح! 📊`);
  } catch (e) { console.error(e); }
}

// ================= 21. CLINICAL PRODUCTS CRUD, DIRECT UPLOAD & AUTO-CROWDSOURCING =================

function toggleLowStockFilter() {
  isLowStockFilterActive = !isLowStockFilterActive;
  const btn = document.getElementById('btnFilterLowStock');
  if (btn) {
    btn.style.background = isLowStockFilterActive ? '#DC2626' : '#FEF3C7';
    btn.style.color = isLowStockFilterActive ? '#fff' : '#B45309';
    btn.textContent = isLowStockFilterActive ? '✕ إلغاء فلتر النواقص' : '⚠️ عرض المنتجات النافذة فقط';
  }
  renderCurrentActiveView();
}

async function quickEditPrice(id, currentPrice) {
  if (!assertAdmin()) return;
  const newPriceStr = prompt('تعديل السعر المباشر (د.ع):', currentPrice);
  if (newPriceStr === null) return;
  const newPrice = Number(newPriceStr.trim());
  if (isNaN(newPrice) || newPrice <= 0) {
    showToast('يرجى إدخال سعر صحيح أكبر من صفر');
    return;
  }
  try {
    if (!db) throw new Error('لا يوجد اتصال بقاعدة البيانات');
    await dbPaths.productsCol().doc(String(id)).set({ price: newPrice }, { merge: true });
    updateR2CatalogItem(id, { price: newPrice });
    showToast('تم تحديث السعر ومسح الكاش فورياً ✓');
  } catch (err) {
    console.error('quickEditPrice failed:', err);
    showToast('⚠️ تعذر تحديث السعر: ' + err.message);
  }
}

async function quickToggleStock(id) {
  if (!assertAdmin()) return;
  const p = findProduct(id);
  if (!p) return;
  const newStock = (p.inStock === false) ? true : false;
  try {
    if (!db) throw new Error('لا يوجد اتصال بقاعدة البيانات');
    await dbPaths.productsCol().doc(String(id)).set({ inStock: newStock }, { merge: true });
    updateR2CatalogItem(id, { inStock: newStock });
    showToast(newStock ? 'تم التعيين: متوفر 🟢' : 'تم التعيين: نفذت الكمية 🔴');
  } catch (err) {
    console.error('quickToggleStock failed:', err);
    showToast('⚠️ تعذر تحديث حالة المخزون: ' + err.message);
  }
}

// 🛡️ (إصلاح — "زر التعديل المباشر لا يعمل") لم أجد عبر المراجعة الساكنة للكود خللاً مؤكداً
// يمنع فتح هذه النافذة (كل عناصرها موجودة فعلياً بالـ HTML)، لكن أي خطأ غير متوقع (تعارض
// إضافة مستقبلية، بيانات منتج ناقصة بشكل غير معتاد...) كان سيفشل بصمت تام دون أي أثر مرئي
// للأدمن — فيبدو الزر "لا يعمل" دون أي تفسير. التغليف بـ try/catch هنا يضمن ظهور رسالة
// خطأ صريحة بدل الصمت أياً كان السبب الفعلي، مما يجعل أي عطل مستقبلي قابلاً للتشخيص فوراً.
// 🎯🛡️ (الإصلاح الجذري المؤكَّد بلقطة الشاشة) اتضح أن هذه الدالة (المُصدَّرة عبر window.App
// بالإصلاح السابق) قد تُستدعى فعلياً من صفحة لا تحتوي عناصر هذه النافذة إطلاقاً (كما ظهر
// حرفياً برسالة الخطأ بالصورة المرسلة). بدل الاعتماد على افتراض أن هذه العناصر موجودة
// دائماً بالصفحة، أصبحت الدالة الآن "ذاتية الإصلاح": تبني نافذة التعديل الكاملة ديناميكياً
// بنفسها عند أول استخدام إن لم تكن موجودة أصلاً — بنفس الأسلوب المطبَّق مسبقاً بنجاح على
// 🛡️🐛 (إصلاح جذري — التعديل المباشر من الصفحة الرئيسية) بطلب صريح: التعديل السريع على
// السعر والتفاصيل يجب أن يعمل مباشرة من الصفحة الرئيسية (index.html) بحساب الأدمن، بلا أي
// توجيه لصفحة أخرى. المشكلة سابقاً أن هذه الدالة كانت تُنشئ نسخة ناقصة مختلفة عن نافذة
// admin.html الكاملة (تفتقد حقل النوع Type، وتُزاحم حقول السعر بصف واحد) — فتنهار عملية
// الحفظ بصمت. الحل: هذه النسخة الآن كاملة ومطابقة تماماً لنافذة admin.html حقلاً بحقل (بما
// فيها نوع العبوة وحقول السعر المنفصلة بصفوف كاملة العرض)، فتعمل باستقلالية وموثوقية على
// أي صفحة تفتقد النافذة الثابتة، دون أي حاجة للتنقل خارج الصفحة الحالية.
function ensureAdminQuickEditModalMarkup() {
  if (document.getElementById('adminQuickEditModal')) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="admin-quick-modal-overlay" id="adminQuickEditModal">
      <div class="admin-quick-card" style="max-width: 620px; max-height: 90vh; overflow-y: auto;">
        <div class="consult-header">
          <h3 style="color:#111827; font-weight:900;">✏️ تعديل تفاصيل الصنف بالكامل</h3>
          <button class="icon-btn" onclick="closeAdminQuickEditModal()">✕</button>
        </div>
        <div style="padding:18px; text-align:right;">
          <input type="hidden" id="quickEditProdId">

          <div class="form-field">
            <label>اسم المنتج الكامل *</label>
            <input type="text" id="quickEditProdName" required>
          </div>

          <div style="display:flex; gap:10px;">
            <div class="form-field" style="flex:1;">
              <label>الماركة / الشركة *</label>
              <input type="text" id="quickEditProdBrand" required>
            </div>
            <div class="form-field" style="flex:1;">
              <label>القسم / التصنيف *</label>
              <select id="quickEditProdCat" required></select>
            </div>
          </div>

          <div class="form-field">
            <label>السعر الحالي — بعد الخصم إن وُجد (د.ع) *</label>
            <input type="number" class="price-input-lg" id="quickEditProdPrice" required>
          </div>
          <div class="form-field">
            <label>السعر قبل الخصم (اختياري — للمقارنة فقط)</label>
            <input type="number" class="price-input-lg" id="quickEditProdOldPrice">
          </div>
          <div class="form-field">
            <label>سعر التكلفة (اختياري — لحساب صافي الربح) 💰</label>
            <input type="number" class="price-input-lg" id="quickEditProdCostPrice" min="0" step="0.01" placeholder="مثال: 3500">
          </div>

          <div style="display:flex; gap:10px;">
            <div class="form-field" style="flex:1;">
              <label>الحجم / العبوة</label>
              <input type="text" id="quickEditProdSize" placeholder="236 مل">
            </div>
            <div class="form-field" style="flex:1;">
              <label>الكمية بالمخزن *</label>
              <input type="number" id="quickEditProdStockQty" placeholder="10" min="0" required>
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <div class="form-field" style="flex:1;">
              <label>⭐ التقييم (من 1 إلى 5)</label>
              <input type="number" id="quickEditProdRating" placeholder="4.8" min="1" max="5" step="0.1">
            </div>
            <div class="form-field" style="flex:1;">
              <label>عدد التقييمات المعروضة</label>
              <input type="number" id="quickEditProdReviews" placeholder="0" min="0">
            </div>
            <div class="form-field" style="flex:1;">
              <label>نوع العبوة (الأيقونة)</label>
              <select id="quickEditProdType">
                <option value="bottle">زجاجة (Bottle)</option>
                <option value="jar">مرطبان (Jar)</option>
                <option value="tube">أنبوب (Tube)</option>
                <option value="spray">بخاخ (Spray)</option>
              </select>
            </div>
          </div>

          <div class="form-field">
            <label>تغيير صورة الصنف (من المعرض مباشرة)</label>
            <input type="file" accept="image/*" onchange="uploadDirectImageFile(this, 'quickEditProdImg', 'quickEditProdImgPreviewEl', 'quickEditProdImgPreviewBox')" style="width:100%; padding:8px; border:1.5px dashed var(--line); border-radius:12px; background:#fff; font-size:12px;">
            <input type="hidden" id="quickEditProdImg" value="">
            <div id="quickEditProdImgPreviewBox" style="margin-top:8px; display:none; align-items:center; gap:10px;">
              <img id="quickEditProdImgPreviewEl" src="" style="height:70px; width:70px; object-fit:cover; border-radius:10px; border:1px solid var(--line);" alt="Edit Preview">
              <span style="font-size:11px; color:#16A34A; font-weight:800;">✅ تم تحديث الصورة</span>
            </div>
          </div>

          <div class="form-field">
            <label>الوصف المفصل والفوائد الطبية</label>
            <textarea id="quickEditProdDesc" rows="3" placeholder="تفاصيل المنتج والفوائد..."></textarea>
          </div>

          <div style="display:flex; gap:10px;">
            <div class="form-field" style="flex:1;">
              <label>المكونات الفعالة والتركيبة (Ingredients)</label>
              <input type="text" id="quickEditProdIng" placeholder="Hyaluronic Acid, Ceramides...">
            </div>
            <div class="form-field" style="flex:1;">
              <label>طريقة الاستخدام والإرشادات (Usage)</label>
              <input type="text" id="quickEditProdUsage" placeholder="يوضع صباحاً ومساءً...">
            </div>
          </div>

          <div class="admin-toggle-switch">
            <span>متوفر في المخزون (In Stock)</span>
            <input type="checkbox" id="quickEditProdInStock" style="width:20px; height:20px; cursor:pointer;">
          </div>

          <div class="admin-toggle-switch">
            <span>تفعيل كعرض خاص (Special Offer)</span>
            <input type="checkbox" id="quickEditProdIsOffer" style="width:20px; height:20px; cursor:pointer;">
          </div>

          <button class="admin-btn-save" onclick="saveAdminQuickEdit()">💾 حفظ التعديلات سحابياً</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

function openAdminQuickEditModal(id) {
  if (!assertAdmin()) return;

  try {
    const p = findProduct(id) || archivedProducts.find(x => String(x.id) === String(id));
    if (!p) {
      showToast('⚠️ تعذر العثور على هذا المنتج (قد يكون حُذف أو أُرشف).');
      return;
    }

    ensureAdminQuickEditModalMarkup();
    populateCategoryDropdowns();

    document.getElementById('quickEditProdId').value = p.id;
    document.getElementById('quickEditProdName').value = p.name || '';
    document.getElementById('quickEditProdBrand').value = p.brand || '';
    document.getElementById('quickEditProdPrice').value = p.price || '';
    if (document.getElementById('quickEditProdOldPrice')) document.getElementById('quickEditProdOldPrice').value = p.oldPrice || '';
    if (document.getElementById('quickEditProdCostPrice')) document.getElementById('quickEditProdCostPrice').value = (p.costPrice !== undefined && p.costPrice !== null) ? p.costPrice : '';
    if (document.getElementById('quickEditProdSize')) document.getElementById('quickEditProdSize').value = p.size || '';
    if (document.getElementById('quickEditProdStockQty')) document.getElementById('quickEditProdStockQty').value = (p.stockQuantity !== undefined ? p.stockQuantity : 10);
    if (document.getElementById('quickEditProdRating')) document.getElementById('quickEditProdRating').value = p.rating || '';
    if (document.getElementById('quickEditProdReviews')) document.getElementById('quickEditProdReviews').value = p.reviews || 0;
    if (document.getElementById('quickEditProdCat')) document.getElementById('quickEditProdCat').value = p.category || (categories[0] ? categories[0].id : 'face');
    if (document.getElementById('quickEditProdType')) document.getElementById('quickEditProdType').value = p.type || 'bottle';

    const imgUrlInp = document.getElementById('quickEditProdImg');
    const imgPreviewEl = document.getElementById('quickEditProdImgPreviewEl');
    const imgPreviewBox = document.getElementById('quickEditProdImgPreviewBox');
    if (imgUrlInp) imgUrlInp.value = p.imageUrl || '';
    if (p.imageUrl && imgPreviewEl && imgPreviewBox) {
      imgPreviewEl.src = p.imageUrl;
      imgPreviewBox.style.display = 'flex';
    } else if (imgPreviewBox) {
      imgPreviewBox.style.display = 'none';
    }

    if (document.getElementById('quickEditProdDesc')) document.getElementById('quickEditProdDesc').value = p.description || '';
    if (document.getElementById('quickEditProdIng')) document.getElementById('quickEditProdIng').value = p.ingredients || p.medicalIndications || '';
    if (document.getElementById('quickEditProdUsage')) document.getElementById('quickEditProdUsage').value = p.usage || '';
    if (document.getElementById('quickEditProdInStock')) document.getElementById('quickEditProdInStock').checked = (p.inStock !== false);
    if (document.getElementById('quickEditProdIsOffer')) document.getElementById('quickEditProdIsOffer').checked = !!p.isSpecialOffer;

    const modal = document.getElementById('adminQuickEditModal');
    if (modal) {
      modal.classList.add('open');
    } else {
      showToast('⚠️ خطأ داخلي: نافذة التعديل غير موجودة بالصفحة (adminQuickEditModal).');
    }
  } catch (err) {
    console.error('openAdminQuickEditModal crashed:', err);
    showToast('⚠️ تعذر فتح نافذة التعديل: ' + err.message);
  }
}

function closeAdminQuickEditModal() {
  const m = document.getElementById('adminQuickEditModal');
  if (m) m.classList.remove('open');
}

async function saveAdminQuickEdit() {
  if (!assertAdmin()) return;

  const id = document.getElementById('quickEditProdId').value;
  const name = document.getElementById('quickEditProdName').value.trim();
  const brand = document.getElementById('quickEditProdBrand').value.trim();
  const price = Number(document.getElementById('quickEditProdPrice').value);
  const oldPriceVal = document.getElementById('quickEditProdOldPrice') ? document.getElementById('quickEditProdOldPrice').value.trim() : '';
  const oldPrice = oldPriceVal ? Number(oldPriceVal) : null;
  const costPriceVal = document.getElementById('quickEditProdCostPrice') ? document.getElementById('quickEditProdCostPrice').value.trim() : '';
  const costPrice = costPriceVal ? Number(costPriceVal) : null;
  const size = document.getElementById('quickEditProdSize') ? document.getElementById('quickEditProdSize').value.trim() : 'عبوة قياسية';
  const stockQty = document.getElementById('quickEditProdStockQty') ? Number(document.getElementById('quickEditProdStockQty').value || 10) : 10;
  const category = document.getElementById('quickEditProdCat') ? document.getElementById('quickEditProdCat').value : '';
  const type = document.getElementById('quickEditProdType') ? document.getElementById('quickEditProdType').value : 'bottle';
  const imageUrl = document.getElementById('quickEditProdImg') ? sanitizeUrl(document.getElementById('quickEditProdImg').value.trim()) : '';
  const description = document.getElementById('quickEditProdDesc') ? sanitizeText(document.getElementById('quickEditProdDesc').value.trim()) : '';
  const ingredients = document.getElementById('quickEditProdIng') ? sanitizeText(document.getElementById('quickEditProdIng').value.trim()) : '';
  const usage = document.getElementById('quickEditProdUsage') ? sanitizeText(document.getElementById('quickEditProdUsage').value.trim()) : '';
  const inStock = document.getElementById('quickEditProdInStock') ? document.getElementById('quickEditProdInStock').checked : true;
  const isSpecialOffer = document.getElementById('quickEditProdIsOffer') ? document.getElementById('quickEditProdIsOffer').checked : false;
  const rating = document.getElementById('quickEditProdRating') ? Number(document.getElementById('quickEditProdRating').value || 0) || 0 : 0;
  const reviews = document.getElementById('quickEditProdReviews') ? Number(document.getElementById('quickEditProdReviews').value || 0) || 0 : 0;

  if (!name || !brand || isNaN(price) || price <= 0) {
    showToast('يرجى التأكد من كتابة الاسم والماركة والسعر');
    return;
  }

  const updates = {
    name: sanitizeText(name),
    brand: sanitizeText(brand),
    price,
    oldPrice,
    costPrice,
    size,
    stockQuantity: stockQty,
    category,
    type,
    imageUrl,
    description,
    ingredients,
    usage,
    inStock: inStock && stockQty > 0,
    isSpecialOffer,
    rating,
    reviews
  };

  const saveBtn = document.querySelector('#adminQuickEditModal .admin-btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...'; }

  // 🛡️ (إصلاح — "لا يمكنني تعديل المنتجات") الكتابة لفايرستور هنا لم تكن مغلّفة بمعالجة
  // أخطاء إطلاقاً — أي فشل (صلاحيات، اتصال، معرّف غير صالح) كان يفشل بصمت تام (Unhandled
  // Promise Rejection مرئية فقط بكونسول المتصفح)، فتبقى النافذة مفتوحة بلا أي تفسير،
  // ويبدو الأمر تماماً وكأن "التعديل لا يُحفظ إطلاقاً". الآن أي فشل يظهر كرسالة صريحة.
  try {
    if (!db) throw new Error('لا يوجد اتصال بقاعدة البيانات');
    const existingProd = findProduct(id);
    const oldImageUrl = existingProd ? existingProd.imageUrl : null;

    await dbPaths.productsCol().doc(String(id)).set(
      { ...updates, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // 🔄 تحديث النسخة المحلية بالذاكرة فوراً (products array) كي يعكس renderCurrentActiveView
    // السعر الجديد مباشرة بلا انتظار مزامنة onSnapshot أو إعادة تحميل الصفحة يدوياً.
    if (existingProd) Object.assign(existingProd, updates);

    // 🐛 (إصلاح إضافي) updates كان يُرسَل لتحديث كاش R2 وهو يحتوي على FieldValue.serverTimestamp()
    // (كائن خاص بـ Firestore SDK لا يُسلسَل بشكل صحيح عبر JSON.stringify) — الآن نرسل نسخة
    // نظيفة من البيانات الفعلية فقط (بلا أي كائن FieldValue) لضمان وصول كل الحقول بشكل سليم.
    updateR2CatalogItem(id, updates);

    // 🗑️ إذا تم استبدال صورة المنتج بأخرى جديدة، نحذف الصورة القديمة اليتيمة من R2 تلقائياً
    if (oldImageUrl && imageUrl && oldImageUrl !== imageUrl) {
      deleteOrphanImageFromR2(oldImageUrl);
    }

    closeAdminQuickEditModal();
    showToast('تم تحديث تفاصيل الصنف فورياً ✓');
    // 🔄 (إصلاح) تحديث فوري لبطاقة المنتج المعروضة أمام الأدمن بنفس اللحظة (كان يبقى
    // السعر القديم ظاهراً على الشاشة حتى يُعاد تحميل الصفحة يدوياً، فيبدو وكأن الحفظ فشل).
    if (typeof renderCurrentActiveView === 'function') renderCurrentActiveView();
  } catch (err) {
    console.error('saveAdminQuickEdit failed:', err);
    showToast('⚠️ تعذر حفظ التعديل: ' + (err.message || 'خطأ غير معروف') + ' — يرجى إعادة المحاولة.');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ التعديلات سحابياً'; }
  }
}

function openAdminQuickAddModal() {
  if (!assertAdmin()) return;
  if (window.location.pathname.includes('admin.html')) {
    switchAdminSection('products');
  } else {
    window.location.href = getTenantUrl('admin.html');
  }
}

function previewAdminProdImg(url) {
  const box = document.getElementById('adminProdImgPreviewBox');
  const img = document.getElementById('adminProdImgPreviewEl');
  const cleanUrl = sanitizeUrl(url);
  if (cleanUrl && box && img) { img.src = cleanUrl; box.style.display = 'flex'; }
  else if (box) { box.style.display = 'none'; }
}

function resetAdminProductForm() {
  if (!document.getElementById('adminProdDocId')) return;
  document.getElementById('adminProdDocId').value = '';
  document.getElementById('adminProdName').value = '';
  document.getElementById('adminProdBrand').value = '';
  document.getElementById('adminProdSize').value = '';
  document.getElementById('adminProdPrice').value = '';
  document.getElementById('adminProdOldPrice').value = '';
  if (document.getElementById('adminProdCostPrice')) document.getElementById('adminProdCostPrice').value = '';
  document.getElementById('adminProdImgUrl').value = '';
  document.getElementById('adminProdDesc').value = '';
  document.getElementById('adminProdIng').value = '';
  document.getElementById('adminProdUsage').value = '';
  if (document.getElementById('adminProdStockQty')) document.getElementById('adminProdStockQty').value = '10';
  document.getElementById('adminProdInStock').checked = true;
  document.getElementById('adminProdIsOffer').checked = false;
  document.getElementById('adminProdImgPreviewBox').style.display = 'none';
  document.getElementById('adminFormModeTitleV').textContent = 'إضافة منتج أو دواء جديد';
  document.getElementById('adminSaveProdBtn').textContent = '💾 حفظ المنتج في قاعدة البيانات';
}

async function handleAdminProductSave(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveProductAdmin', 1200)) return;

  const docId = document.getElementById('adminProdDocId').value.trim();
  const name = document.getElementById('adminProdName').value.trim();
  const brand = document.getElementById('adminProdBrand').value.trim();
  const price = Number(document.getElementById('adminProdPrice').value);
  const oldPriceVal = document.getElementById('adminProdOldPrice').value.trim();
  const oldPrice = oldPriceVal ? Number(oldPriceVal) : null;
  const costPriceVal = document.getElementById('adminProdCostPrice') ? document.getElementById('adminProdCostPrice').value.trim() : '';
  const costPrice = costPriceVal ? Number(costPriceVal) : null;
  const stockQty = document.getElementById('adminProdStockQty') ? Number(document.getElementById('adminProdStockQty').value || 10) : 10;

  if (!name || !brand || isNaN(price) || price <= 0) {
    showToast('يرجى التأكد من كتابة الاسم والماركة والسعر');
    return;
  }

  const payload = {
    name: sanitizeText(name),
    brand: sanitizeText(brand),
    category: sanitizeText(document.getElementById('adminProdCat').value),
    type: sanitizeText(document.getElementById('adminProdType').value || 'bottle'),
    size: sanitizeText(document.getElementById('adminProdSize').value.trim() || 'عبوة قياسية'),
    stockQuantity: stockQty,
    price: price,
    oldPrice: oldPrice,
    costPrice: costPrice,
    imageUrl: sanitizeUrl(document.getElementById('adminProdImgUrl').value.trim()),
    description: sanitizeText(document.getElementById('adminProdDesc').value.trim()),
    ingredients: sanitizeText(document.getElementById('adminProdIng').value.trim()),
    usage: sanitizeText(document.getElementById('adminProdUsage').value.trim()),
    inStock: document.getElementById('adminProdInStock').checked && stockQty > 0,
    isSpecialOffer: document.getElementById('adminProdIsOffer').checked,
    rating: Number(document.getElementById('adminProdRating')?.value || 0) || 0,
    reviews: Number(document.getElementById('adminProdReviews')?.value || 0) || 0,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (docId) {
      payload.id = docId;
      if (db) await dbPaths.productsCol().doc(docId).set(payload, { merge: true });
      showToast('تم حفظ تعديلات المنتج بنجاح ✓');
    } else {
      payload.isDeleted = false;
      payload.views = 0;
      payload.orderCount = 0;
      if (db) {
        const newRef = await dbPaths.productsCol().add(payload);
        
        try {
          const subDocId = `sub_${currentPharmacyId}_${newRef.id}`;
          await dbPaths.masterCatalogSubmissionsCol().doc(subDocId).set({
            submissionId: subDocId,
            sourcePharmacyId: currentPharmacyId,
            sourcePharmacyName: pharmacyProfile.name || currentPharmacyId,
            productData: {
              ...payload,
              suggestedPrice: payload.price
            },
            status: 'pending_review',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (crowdErr) {
          console.warn("Crowdsourcing hook warning:", crowdErr);
        }
      }
      showToast('تمت إضافة المنتج بنجاح! ✓');
    }
    triggerR2CatalogRebuild();
    resetAdminProductForm();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ المنتج');
  }
}

// ----------------- سلة المحذوفات والأرشفة (SOFT DELETE) -----------------
async function archiveProductConfirm(id, name) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من نقل المنتج "${name}" إلى سلة المحذوفات؟`)) {
    if (db) {
      await dbPaths.productsCol().doc(String(id)).set({
        isDeleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      triggerR2CatalogRebuild();
      showToast(`تم نقل "${name}" إلى سلة المحذوفات 🗑️`);
    }
  }
}

async function restoreProduct(id) {
  if (!assertAdmin()) return;
  if (db) {
    await dbPaths.productsCol().doc(String(id)).set({
      isDeleted: false,
      restoredAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    triggerR2CatalogRebuild();
    showToast('تم استرجاع المنتج وإعادته للمتجر بنجاح! ♻️');
    fetchArchivedProducts();
  }
}

async function permanentDeleteProduct(id, name) {
  if (!assertAdmin()) return;
  if (confirm(`تحذير نهائي: هل تريد حذف "${name}" نهائياً من قاعدة البيانات بلا رجعة؟`)) {
    if (db) {
      const existingProd = archivedProducts.find(x => String(x.id) === String(id)) || findProduct(id);
      const imgToDelete = existingProd ? existingProd.imageUrl : null;
      await dbPaths.productsCol().doc(String(id)).delete();
      triggerR2CatalogRebuild();
      if (imgToDelete) deleteOrphanImageFromR2(imgToDelete); // 🗑️ حذف الصورة اليتيمة من R2 نهائياً
      showToast('تم حذف المنتج نهائياً من السيرفر');
      fetchArchivedProducts();
    }
  }
}

async function fetchArchivedProducts() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.productsCol().where('isDeleted', '==', true).get();
    archivedProducts = [];
    snap.forEach(d => archivedProducts.push({ id: d.id, ...d.data() }));
    renderTrashBinList();
  } catch (e) {
    console.warn("Archived products fetch error:", e);
  }
}

function renderTrashBinList() {
  const container = document.getElementById('adminTrashListGrid');
  const countEl = document.getElementById('adminTrashCount');
  if (countEl) countEl.textContent = archivedProducts.length;
  if (!container) return;

  if (archivedProducts.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:20px 0;">سلة المحذوفات فارغة حالياً 🌸</div>`;
    return;
  }

  container.innerHTML = archivedProducts.map(p => `
    <div style="background:#fff; border:1.5px solid #FEE2E2; border-radius:12px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:40px; height:40px; border-radius:8px; background:#FEF2F2; display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${p.imageUrl ? `<img src="${sanitizeUrl(p.imageUrl)}" style="width:100%; height:100%; object-fit:cover;">` : icons.bottle('#EF4444')}
        </div>
        <div>
          <div style="font-weight:800; font-size:13.5px; color:var(--ink);">${sanitizeText(p.name)} (${sanitizeText(p.brand || '')})</div>
          <div style="font-size:11px; color:var(--text-soft); font-family:monospace;">${fmtPrice(p.price)}</div>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" onclick="restoreProduct('${sanitizeText(p.id)}')" style="background:#DCFCE7; color:#166534; font-weight:800; font-size:11px; padding:6px 12px; border-radius:8px;">
          ♻️ استرجاع
        </button>
        <button type="button" onclick="permanentDeleteProduct('${sanitizeText(p.id)}', '${sanitizeText(p.name)}')" style="background:#FEE2E2; color:#991B1B; font-weight:800; font-size:11px; padding:6px 10px; border-radius:8px;">
          حذف نهائي ❌
        </button>
      </div>
    </div>
  `).join('');
}

// ================= 21b. CLEANUP TOOL: UNCATEGORIZED / TEST PRODUCTS (FIX #5) =================
const SUSPICIOUS_TEST_KEYWORDS = ['test', 'تجربة', 'demo', 'sample', 'placeholder', 'example', 'novalac', 'lactonic', 'تست', 'xxx', 'dummy'];
let cleanupSelectedIds = new Set();
let cleanupLastFlaggedList = [];

function scanForUncategorizedOrTestProducts() {
  const knownCategoryIds = new Set(categories.map(c => c.id));
  const flagged = products.filter(p => {
    if (p.isDeleted === true) return false;
    const noCategory = !p.category || !knownCategoryIds.has(p.category);
    const nameLower = (p.name || '').toLowerCase();
    const brandLower = (p.brand || '').toLowerCase();
    const looksLikeTest = SUSPICIOUS_TEST_KEYWORDS.some(kw => nameLower.includes(kw) || brandLower.includes(kw));
    return noCategory || looksLikeTest;
  });
  cleanupLastFlaggedList = flagged;
  renderCleanupScanResults(flagged);
}

function renderCleanupScanResults(flagged) {
  const container = document.getElementById('adminCleanupResultsGrid');
  const countEl = document.getElementById('adminCleanupCount');
  const actionsBar = document.getElementById('adminCleanupActionsBar');
  if (!container) return;

  cleanupSelectedIds = new Set();
  const selCountEl = document.getElementById('adminCleanupSelectedCount');
  if (selCountEl) selCountEl.textContent = '0';
  if (countEl) countEl.textContent = flagged.length;

  if (flagged.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:20px 0;">🌸 ممتاز! لا توجد منتجات غير مصنفة أو تجريبية حالياً.</div>`;
    if (actionsBar) actionsBar.style.display = 'none';
    return;
  }

  if (actionsBar) actionsBar.style.display = 'flex';
  const knownCategoryIds = new Set(categories.map(c => c.id));

  container.innerHTML = flagged.map(p => {
    const noCategory = !p.category || !knownCategoryIds.has(p.category);
    return `
      <label style="display:flex; align-items:center; gap:10px; background:#FFFBEB; border:1.5px solid #FDE68A; border-radius:12px; padding:10px 14px; cursor:pointer;">
        <input type="checkbox" onchange="toggleCleanupSelection('${sanitizeText(p.id)}', this.checked)" style="width:18px; height:18px; accent-color:#D97706; cursor:pointer; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; font-size:13px; color:#92400E;">${sanitizeText(p.name || 'بدون اسم')} <span style="font-weight:600; color:#B45309;">(${sanitizeText(p.brand || 'بدون ماركة')})</span></div>
          <div style="font-size:11px; color:#B45309; margin-top:2px;">
            ${noCategory ? '⚠️ بدون قسم مصنف صحيح' : '🔎 اسم يشبه بيانات تجريبية'} · السعر: ${fmtPrice(p.price)}
          </div>
        </div>
      </label>
    `;
  }).join('');
}

function toggleCleanupSelection(id, checked) {
  if (checked) cleanupSelectedIds.add(String(id));
  else cleanupSelectedIds.delete(String(id));
  const cntBadge = document.getElementById('adminCleanupSelectedCount');
  if (cntBadge) cntBadge.textContent = cleanupSelectedIds.size;
}

async function cleanupArchiveSelected() {
  if (!assertAdmin()) return;
  if (cleanupSelectedIds.size === 0) { showToast('يرجى تحديد منتج واحد على الأقل'); return; }
  if (!confirm(`نقل (${cleanupSelectedIds.size}) منتج إلى سلة المحذوفات؟`)) return;
  showToast('جاري النقل لسلة المحذوفات...');
  try {
    if (db) {
      const batch = db.batch();
      cleanupSelectedIds.forEach(id => {
        const ref = dbPaths.productsCol().doc(String(id));
        batch.set(ref, { isDeleted: true, deletedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      triggerR2CatalogRebuild();
    }
    showToast('✅ تم نقل الأصناف المحددة لسلة المحذوفات بنجاح');
    scanForUncategorizedOrTestProducts();
  } catch (err) {
    showToast('⚠️ خطأ أثناء النقل: ' + (err && err.message ? err.message : ''));
  }
}

async function cleanupPermanentDeleteSelected() {
  if (!assertAdmin()) return;
  if (cleanupSelectedIds.size === 0) { showToast('يرجى تحديد منتج واحد على الأقل'); return; }
  if (!confirm(`تحذير نهائي: حذف (${cleanupSelectedIds.size}) منتج نهائياً بلا رجعة؟`)) return;
  showToast('جاري الحذف النهائي...');
  try {
    if (db) {
      const batch = db.batch();
      cleanupSelectedIds.forEach(id => {
        const ref = dbPaths.productsCol().doc(String(id));
        batch.delete(ref);
      });
      await batch.commit();
      triggerR2CatalogRebuild();
    }
    showToast('✅ تم الحذف النهائي للأصناف المحددة');
    scanForUncategorizedOrTestProducts();
  } catch (err) {
    showToast('⚠️ خطأ أثناء الحذف: ' + (err && err.message ? err.message : ''));
  }
}

// ================= 22. ADMIN SECTIONS CONTROLLER =================
function switchAdminSection(sec) {
  const sections = ['Stats', 'Orders', 'Import', 'Products', 'Cats', 'Offers', 'Bundles', 'Coupons', 'Brands', 'Notifs', 'Audit', 'Staff', 'Design', 'Subscription', 'Trash'];
  
  sections.forEach(k => {
    const btn = document.getElementById('btnTabV' + k);
    const el = document.getElementById('adminSec' + k);
    const isTarget = (k.toLowerCase() === sec.toLowerCase());
    if (btn) btn.classList.toggle('active', isTarget);
    if (el) el.style.display = isTarget ? 'block' : 'none';
  });

  if (sec === 'stats') fetchRealAnalytics();
  if (sec === 'orders') fetchAdminOrdersList();
  if (sec === 'import' && typeof fetchTenantMasterCatalog === 'function') fetchTenantMasterCatalog();
  if (sec === 'products') { populateCategoryDropdowns(); }
  if (sec === 'coupons') fetchAdminCoupons();
  if (sec === 'bundles') {
    populateBundleFilterDropdowns();
    renderBundleChips();
    renderAdminBundlesList();
  }
  if (sec === 'audit') fetchAuditLogs();
  if (sec === 'offers') {
    updateDiscountTargetOptions();
    updatePriceMultiplierTargetOptions();
    populateOfferFilterDropdowns();
    renderOfferProdChips();
    renderPromoCardsListAdmin();
  }
  if (sec === 'cats') renderAdminCategoriesList();
  if (sec === 'brands') renderAdminBrandsList();
  if (sec === 'staff') fetchStaffList();
  if (sec === 'subscription') fetchSuperAdminPaymentInfo();
  if (sec === 'trash') fetchArchivedProducts();
}

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
      const bId = id.replace('bundle_', '');
      const b = findBundle(bId);
      return sum + (b ? Number(b.price || 0) * cart[id] : 0);
    } else {
      const p = findProduct(id);
      return sum + (p ? Number(p.price || 0) * cart[id] : 0);
    }
  }, 0);
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

function selectDelivery(method) {
  deliveryMethod = method;
  const std = document.getElementById('delStandard');
  const exp = document.getElementById('delExpress');
  if (std) std.classList.toggle('selected', method === 'standard');
  if (exp) exp.classList.toggle('selected', method === 'express');
  renderCheckoutSummary();
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

function closeSuccessModal() {
  const successModal = document.getElementById('orderSuccessModal');
  if (successModal) successModal.classList.remove('open');
  showView('home');
}

function closeSuccessModalAndGoOrders() {
  const successModal = document.getElementById('orderSuccessModal');
  if (successModal) successModal.classList.remove('open');
  showView('orders');
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

function openMenu() {
  const drawer = document.getElementById('menuDrawer');
  const overlay = document.getElementById('menuOverlay');
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closeMenu() {
  const drawer = document.getElementById('menuDrawer');
  const overlay = document.getElementById('menuOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function openWhatsapp() {
  const targetNumber = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  window.open(`https://wa.me/${targetNumber}`, '_blank');
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

function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  listingMode = 'search';
  listingValue = term;
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
    bestsellers: 'الأكثر مبيعاً 🔥',
    promo_offer: `عروض: ${window.__currentPromoTitle || 'المنتجات المشمولة بالعرض'}`
  };
  titleEl.textContent = titles[listingMode] || 'المنتجات';

  let list = products.filter(p => p.isDeleted !== true);
  if (listingMode === 'category') {
    list = list.filter(p => p.category === listingValue);
  } else if (listingMode === 'search') {
    const qNorm = normalizeArabic(listingValue);
    list = list.filter(p => {
      const nameNorm = normalizeArabic(p.name || '');
      const brandNorm = normalizeArabic(p.brand || '');
      const descNorm = normalizeArabic(p.description || '');
      const ingNorm = normalizeArabic(p.ingredients || '');
      return nameNorm.includes(qNorm) || brandNorm.includes(qNorm) || descNorm.includes(qNorm) || ingNorm.includes(qNorm);
    });
  } else if (listingMode === 'bestsellers') {
    list = list.sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0));
  } else if (listingMode === 'promo_offer') {
    const allowedSet = new Set((listingValue || []).map(String));
    list = list.filter(p => allowedSet.has(String(p.id)));
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
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

function renderHeroCarousel() {
  const track = document.getElementById('heroCarouselTrack');
  const dotsWrap = document.getElementById('heroCarouselDots');
  if (!track) return;

  const promoCards = pharmacyProfile.promoCards || [];
  const mainSlideHtml = `
    <div class="hero-slide" data-slide-index="0">
      <div class="qutn-hybrid-banner" onclick="showView('listing'); openBestSellers();">
        <div class="banner-text-col">
          <h2 class="main-title">${sanitizeText(pharmacyProfile.heroMainTitle || 'متجر الصيدلية')}</h2>
          <p class="sub-title">${sanitizeText(pharmacyProfile.heroSubTitle || '')}</p>
          <p class="desc-title"><span>${sanitizeText(pharmacyProfile.heroDescTitle || '')}</span></p>
          <button type="button" class="hero-cta-btn" onclick="event.stopPropagation(); showView('listing'); openBestSellers();">تسوقي الآن ←</button>
        </div>
        ${pharmacyProfile.bannerImgUrl ? `<div class="banner-model-col"><img src="${sanitizeUrl(pharmacyProfile.bannerImgUrl)}" alt="banner" loading="lazy"></div>` : ''}
      </div>
    </div>`;

  const promoSlidesHtml = promoCards.map((c, idx) => {
    const rawBg = (c.slideBgColor || '').toString().trim();
    const customBgStyle = rawBg ? `background: ${sanitizeText(rawBg)} !important;` : '';
    return `
      <div class="hero-slide" data-slide-index="${idx + 1}">
        <div class="hero-promo-slide" style="${customBgStyle}" onclick="openPromoSlideOffer('${sanitizeText(c.id)}')">
          <div class="banner-text-col">
            ${c.discount ? `<span class="hero-promo-badge">${sanitizeText(c.discount)}</span>` : ''}
            <h2 class="main-title" style="font-size: clamp(20px, 3.2vw, 30px);">${sanitizeText(c.title)}</h2>
            <p class="sub-title">${sanitizeText(c.desc)}</p>
            <button type="button" class="hero-cta-btn" onclick="event.stopPropagation(); openPromoSlideOffer('${sanitizeText(c.id)}')">تسوقي الآن ←</button>
          </div>
          ${c.img ? `<div class="banner-model-col"><img src="${sanitizeUrl(c.img)}" alt="${sanitizeText(c.title)}" loading="lazy"></div>` : ''}
        </div>
      </div>`;
  }).join('');

  track.innerHTML = mainSlideHtml + promoSlidesHtml;

  const totalSlides = 1 + promoCards.length;
  if (dotsWrap) {
    if (totalSlides > 1) {
      dotsWrap.style.display = 'flex';
      dotsWrap.innerHTML = Array.from({ length: totalSlides }).map((_, i) =>
        `<button type="button" class="hero-slider-dot ${i === 0 ? 'active' : ''}" onclick="goToHeroSlide(${i})" aria-label="الشريحة ${i + 1}"></button>`
      ).join('');
    } else {
      dotsWrap.style.display = 'none';
    }
  }

  setupHeroCarouselScrollListener();
}

function setupHeroCarouselScrollListener() {
  const track = document.getElementById('heroCarouselTrack');
  if (!track || track.dataset.scrollBound) return;
  track.dataset.scrollBound = '1';
  let t;
  track.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const w = track.clientWidth;
      if (w > 0) updateHeroCarouselDots(Math.round(Math.abs(track.scrollLeft) / w));
    }, 60);
  }, { passive: true });
}

function updateHeroCarouselDots(activeIndex) {
  currentHeroSlideIndex = activeIndex;
  document.querySelectorAll('.hero-slider-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === activeIndex);
  });
}

function goToHeroSlide(index) {
  const track = document.getElementById('heroCarouselTrack');
  if (!track) return;
  const w = track.clientWidth;
  track.scrollTo({ left: index * w * (document.dir === 'rtl' ? -1 : 1), behavior: 'smooth' });
  updateHeroCarouselDots(index);
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

function renderOffers() {
  // 🌟 (إصلاح #3) "العروض" يجب أن تعرض حصراً منتجات عليها خصم فعلي وقائم فعلاً — أي أن
  // سعرها الحالي أقل من السعر قبل الخصم (oldPrice > price)، وليس أي منتج فقط وُضع له
  // سعر قديم في الماضي أو فُعِّل عليه مربع "عرض خاص" بلا فرق سعر حقيقي حالياً. هذا يمنع
  // ظهور منتجات في صفحة العروض بلا أي خصم ظاهر فعلياً (شارة الخصم كانت تختفي بصمت).
  const discounted = products.filter(p =>
    p.isDeleted !== true &&
    Number(p.oldPrice) > 0 &&
    Number(p.oldPrice) > Number(p.price)
  );
  const countEl = document.getElementById('offersCount');
  if (countEl) countEl.textContent = discounted.length + ' عرض';
  renderProductGrid('offersGrid', discounted);
}

// ================= 24b. STOREFRONT BUNDLES VIEW (كانت مفقودة بالكامل من واجهة الزبائن) =================
function addBundleToCart(bundleId) {
  const cartKey = 'bundle_' + bundleId;
  cart[cartKey] = (cart[cartKey] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  showToast('تمت إضافة البكج كاملاً للسلة! 🎁');
}

// 🎁 (جديد) نافذة تفاصيل البكج — تفتح عند الضغط على بطاقة البكج نفسها (وليس فقط زر
// الإضافة)، وتعرض كل منتج داخل البكج بصورته الحقيقية واسمه وماركته، مع زر إضافة للسلة.
function openBundleDetail(bundleId) {
  const b = findBundle(bundleId);
  if (!b) return;

  const linkedProducts = (b.productIds || []).map(id => findProduct(id)).filter(Boolean);

  const titleEl = document.getElementById('bundleDetailTitle');
  const descEl = document.getElementById('bundleDetailDesc');
  const listEl = document.getElementById('bundleDetailProductsList');
  const priceEl = document.getElementById('bundleDetailPrice');
  const oldPriceEl = document.getElementById('bundleDetailOldPrice');
  const addBtn = document.getElementById('bundleDetailAddBtn');
  const badgeEl = document.getElementById('bundleDetailBadge');

  if (titleEl) titleEl.textContent = '🎁 ' + (b.title || '');
  if (descEl) descEl.textContent = b.description || '';
  if (badgeEl) badgeEl.textContent = b.savingsBadge || 'بكج توفير 🎁';
  if (priceEl) priceEl.textContent = fmtPrice(b.price);
  if (oldPriceEl) oldPriceEl.textContent = b.oldPrice ? fmtPrice(b.oldPrice) : '';
  if (addBtn) addBtn.setAttribute('onclick', `addBundleToCart('${sanitizeText(b.id)}'); closeBundleDetail();`);

  if (listEl) {
    listEl.innerHTML = linkedProducts.length === 0
      ? `<div class="no-results" style="padding:10px 0;">لا توجد تفاصيل منتجات مضافة لهذا البكج بعد.</div>`
      : linkedProducts.map(p => {
          const pImg = sanitizeUrl(p.imageUrl);
          return `
            <div style="display:flex; align-items:center; gap:10px; padding:8px; border:1.5px solid var(--line); border-radius:14px;">
              <div style="width:48px; height:48px; flex-shrink:0; border-radius:10px; overflow:hidden; background:var(--surface); display:flex; align-items:center; justify-content:center;">
                ${pImg ? `<img src="${pImg}" alt="${sanitizeText(p.name)}" style="width:100%; height:100%; object-fit:cover;">` : (icons[p.type] || icons.bottle)(getBrandColor(p.brand))}
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:800; font-size:13px;">${sanitizeText(p.name)}</div>
                <div style="font-size:11px; color:var(--text-soft);">${sanitizeText(p.brand || '')}${p.size ? ' · ' + sanitizeText(p.size) : ''}</div>
              </div>
            </div>`;
        }).join('');
  }

  const modal = document.getElementById('bundleDetailModal');
  if (modal) modal.classList.add('open');
}

function closeBundleDetail() {
  const modal = document.getElementById('bundleDetailModal');
  if (modal) modal.classList.remove('open');
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

function renderAllBundles() {
  const grid = document.getElementById('allBundlesGrid');
  const countEl = document.getElementById('allBundlesCount');
  if (countEl) countEl.textContent = bundles.length + ' بكجات توفير';
  if (!grid) return;
  if (bundles.length === 0) {
    grid.innerHTML = `<div class="no-results">لا توجد بكجات توفير متاحة حالياً 🌸</div>`;
    return;
  }
  grid.innerHTML = bundles.map(b => renderBundleCardHtml(b)).join('');
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

// ================= 25. MY ORDERS VIEW =================
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

    const delFee = (ord.deliveryFee !== undefined) 
      ? Number(ord.deliveryFee) 
      : (ord.deliveryMethod === 'express' ? 8000 : 4000);

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
          التاريخ: <span class="mono">${sanitizeText(ord.date)}</span> · العنوان: ${sanitizeText(ord.address)} (${ord.deliveryMethod === 'express' ? 'توصيل سريع' : 'توصيل عادي'})
        </div>
        <div style="background:var(--surface); border-radius:10px; padding:10px; margin-bottom:8px;">
          ${itemsHtml}
        </div>
        <div class="order-pricing-box">
          <div class="order-pricing-row"><span>المجموع الفرعي للمنتجات:</span><span class="mono">${fmtPrice(subtotalVal)}</span></div>
          ${discountVal > 0 ? `<div class="order-pricing-row discount-row"><span>🎟️ خصم الكوبون (${ord.promoCode || 'كود'}):</span><span class="mono">-${fmtPrice(discountVal)}</span></div>` : ''}
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
      console.warn("Cancellation sync fallback:", err);
    }
  }
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
  
  const isAdmin = isCurrentUserAdmin();

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

    const reviewCount = Number(p.reviews || 0);
    const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
    const ratingHtml = reviewCount > 0
      ? `${starIcon()} <span class="mono" style="font-weight:800;">${avgRating}</span> <span style="font-size:10px; color:var(--text-soft);">(${reviewCount})</span>`
      : `<span style="font-size:10.5px; color:var(--text-soft); font-weight:700;">⭐ جديد (0 تقييم)</span>`;

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
        <div class="p-size">${sanitizeText(p.size || '')}</div>
        <div class="p-price-row">
          <span class="p-price mono" id="price-val-${sanitizeText(p.id)}">${fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${sanitizeText(p.id)}">${fmtPrice(p.oldPrice)}</span>` : ''}
        </div>
        <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${sanitizeText(p.id)}')">
          ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
        </button>

        ${isAdmin ? `
          <div class="admin-card-actions" onclick="event.stopPropagation()">
            <button type="button" class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${sanitizeText(p.id)}')">${inStock ? 'متوفر 🟢' : 'نافذ 🔴'}</button>
            <button type="button" class="btn-admin-price" onclick="quickEditPrice('${sanitizeText(p.id)}', ${p.price})">السعر 💰</button>
            <button type="button" class="btn-admin-edit" onclick="openAdminQuickEditModal('${sanitizeText(p.id)}')">تعديل ✏️</button>
            <button type="button" class="btn-admin-del" onclick="archiveProductConfirm('${sanitizeText(p.id)}', '${sanitizeText(p.name)}')">🗑️</button>
          </div>` : ''}
      </div>`;
  }).join('');
}

function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderCurrentActiveView();
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
  stockEl.innerHTML = inStock ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;"><path d="M5 13l4 4L19 7"/></svg><span>متوفر بالمخزون (${p.stockQuantity !== undefined ? p.stockQuantity : 'متوفر'} قطعة)</span>` : `<span>نفذت الكمية حالياً</span>`;

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

function openProduct(id, isUserClick = false) {
  if (isUserClick) {
    previousViewBeforeProduct = (currentView !== 'product') ? currentView : 'home';
    previousScrollBeforeProduct = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
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
  requestAnimationFrame(() => {
    document.documentElement.style.scrollBehavior = '';
  });
}

function goBackFromProduct() {
  const targetView = previousViewBeforeProduct || 'home';
  const targetScroll = previousScrollBeforeProduct || 0;
  
  if (window.location.hash.startsWith('#p=')) {
    history.replaceState(null, null, ' ');
  }

  document.documentElement.style.scrollBehavior = 'auto';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetEl = document.getElementById('view-' + targetView);
  if (targetEl) targetEl.classList.add('active');
  currentView = targetView;

  ['home', 'wishlist', 'categories', 'bundles', 'orders', 'cart', 'account', 'admin'].forEach(k => {
    const el = document.getElementById('bn-' + k);
    if (el) el.classList.toggle('active', targetView === k);
  });

  window.scrollTo(0, targetScroll);
  requestAnimationFrame(() => {
    window.scrollTo(0, targetScroll);
    document.documentElement.style.scrollBehavior = '';
  });
}

function switchPdTab(tab) {
  pdActiveTab = tab;
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

// ================= 27. CATEGORIES & BRANDS =================
function renderModernCategories() {
  const container = document.getElementById('catRowFull');
  const totalCountEl = document.getElementById('categoriesTotalCount');
  if (totalCountEl) totalCountEl.textContent = `${categories.length} أقسام معتمدة`;
  
  if (container) {
    container.innerHTML = categories.map(c => {
      const count = products.filter(p => p.category === c.id && p.isDeleted !== true).length;
      
      if (activeThemeModule && typeof activeThemeModule.renderCategoryCard === 'function') {
        try {
          return activeThemeModule.renderCategoryCard(c, count, getTemplateHelpers());
        } catch (e) {
          console.warn("[Theme Engine] خطأ في عرض بطاقة القسم:", e);
        }
      }

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
        </div>`;
    }).join('');
  }
  populateCategoryDropdowns();
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

function resetAdminCatForm() {
  if (!document.getElementById('adminCatKeyId')) return;
  document.getElementById('adminCatKeyId').value = '';
  document.getElementById('adminCatLabel').value = '';
  document.getElementById('adminCatIdInput').value = '';
  document.getElementById('adminCatIdInput').disabled = false;
  document.getElementById('adminCatImgUrl').value = '';
  document.getElementById('adminCatImgPreviewBox').style.display = 'none';
  document.getElementById('adminCatFormTitle').textContent = 'إضافة قسم رئيسي جديد';
  document.getElementById('adminSaveCatBtn').textContent = '💾 حفظ القسم في قاعدة البيانات';
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

async function handleAdminCategorySave(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveAdminCat', 1200)) return;

  const catKey = document.getElementById('adminCatKeyId').value.trim();
  const id = document.getElementById('adminCatIdInput').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const label = document.getElementById('adminCatLabel').value.trim();
  const imageUrl = sanitizeUrl(document.getElementById('adminCatImgUrl').value.trim());
  const iconSelectEl = document.getElementById('adminCatIconSelect');
  const icon = iconSelectEl ? iconSelectEl.value : 'jar';

  if (!id || !label) {
    showToast('يرجى كتابة اسم القسم والمعرف بشكل صحيح');
    return;
  }

  const payload = { id: catKey || id, label: sanitizeText(label), imageUrl, icon: sanitizeText(icon) };

  try {
    if (db) await dbPaths.categoriesCol().doc(payload.id).set(payload, { merge: true });
    showToast('تم حفظ القسم بنجاح في قاعدة البيانات ✓');
    resetAdminCatForm();
    populateCategoryDropdowns();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ القسم');
  }
}

async function deleteAdminCategory(catId, catLabel) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف القسم "${catLabel}"؟`)) {
    try {
      if (db) await dbPaths.categoriesCol().doc(String(catId)).delete();
      showToast('تم حذف القسم بنجاح ✓');
      populateCategoryDropdowns();
    } catch (e) { console.error(e); }
  }
}

function previewBrandLogoImg(url) {
  const wrap = document.getElementById('adminBrandLogoPreviewWrap');
  const img = document.getElementById('adminBrandLogoPreviewImg');
  const cleanUrl = sanitizeUrl(url);
  if (cleanUrl && wrap && img) { img.src = cleanUrl; wrap.style.display = 'block'; }
  else if (wrap) { wrap.style.display = 'none'; }
}

function editAdminBrand(brandKey) {
  const b = brandsData[brandKey];
  if (!b) return;
  document.getElementById('adminBrandOriginalKey').value = brandKey;
  document.getElementById('adminBrandNameInput').value = b.name || brandKey;
  document.getElementById('adminBrandColorInput').value = b.color || '#E85D8A';
  document.getElementById('adminBrandLogoInput').value = b.logoUrl || '';
  if (b.logoUrl) previewBrandLogoImg(b.logoUrl);
  
  document.getElementById('adminBrandFormTitle').textContent = '✏️ تعديل الماركة: ' + (b.name || brandKey);
  document.getElementById('adminSaveBrandBtn').textContent = '💾 حفظ التعديلات';
  document.getElementById('adminCancelBrandBtn').style.display = 'block';
  window.scrollTo({ top: document.getElementById('adminSecBrands').offsetTop - 60, behavior: 'smooth' });
}

function cancelAdminBrandEdit() {
  if (!document.getElementById('adminBrandOriginalKey')) return;
  document.getElementById('adminBrandOriginalKey').value = '';
  document.getElementById('adminBrandNameInput').value = '';
  document.getElementById('adminBrandColorInput').value = '#E85D8A';
  document.getElementById('adminBrandLogoInput').value = '';
  document.getElementById('adminBrandLogoPreviewWrap').style.display = 'none';
  document.getElementById('adminBrandFormTitle').textContent = '🏢 إضافة ماركة جديدة';
  document.getElementById('adminSaveBrandBtn').textContent = '+ إضافة الماركة للشريط';
  document.getElementById('adminCancelBrandBtn').style.display = 'none';
}

async function handleSaveBrand(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveBrand', 1200)) return;

  const originalKey = document.getElementById('adminBrandOriginalKey').value.trim();
  const name = document.getElementById('adminBrandNameInput').value.trim();
  const color = document.getElementById('adminBrandColorInput').value;
  const logoUrl = sanitizeUrl(document.getElementById('adminBrandLogoInput').value.trim());
  if (!name) {
    showToast('يرجى كتابة اسم الماركة');
    return;
  }

  if (originalKey && originalKey !== name) {
    delete brandsData[originalKey];
  }

  brandsData[name] = { name: sanitizeText(name), color: sanitizeText(color), logoUrl };
  renderAdminBrandsList();
  renderBrandStrip();

  try {
    if (db) await dbPaths.pharmacyDoc().set({ brandsData }, { merge: true });
    showToast(`تم حفظ وتحديث ماركة "${name}" بنجاح ✓`);
  } catch (err) { console.error(err); }
  cancelAdminBrandEdit();
}

async function deleteAdminBrand(brandKey) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف ماركة "${brandKey}" من الشريط؟`)) {
    delete brandsData[brandKey];
    renderAdminBrandsList();
    renderBrandStrip();
    try {
      if (db) await dbPaths.pharmacyDoc().set({ brandsData }, { merge: true });
      showToast('تم حذف الماركة بنجاح ✓');
    } catch (err) { console.error(err); }
  }
}

function renderAdminBrandsList() {
  const container = document.getElementById('adminBrandsListGrid');
  if (!container) return;
  const keys = Object.keys(brandsData);
  container.innerHTML = keys.map(k => {
    const b = brandsData[k];
    const cleanLogo = sanitizeUrl(b.logoUrl);
    return `
      <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden;">
            ${cleanLogo ? `<img src="${cleanLogo}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="width:14px; height:14px; border-radius:50%; background:${sanitizeText(b.color)};"></span>`}
          </div>
          <div>
            <div style="font-weight:800; font-size:13.5px;">${sanitizeText(b.name || k)}</div>
            <div style="font-size:11px; color:var(--text-soft); font-family:monospace;">${sanitizeText(b.color)}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button onclick="editAdminBrand('${sanitizeText(k)}')" style="background:#E0E7FF; color:#3730A3; padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
          <button onclick="deleteAdminBrand('${sanitizeText(k)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ================= 28. STAFF MANAGEMENT =================
async function fetchStaffList() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.staffCol().get();
    staffMembers = [];
    snap.forEach(d => staffMembers.push({ id: d.id, ...d.data() }));
    renderStaffList();
  } catch (err) { console.warn(err); }
}

function renderStaffList() {
  const container = document.getElementById('adminStaffListGrid');
  if (!container) return;

  if (staffMembers.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:14px 0;">لا يوجد موظفون مضافون لهذه الصيدلية حالياً.</div>`;
    return;
  }

  container.innerHTML = staffMembers.map(st => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:800; font-size:13.5px; color:var(--ink);">
          👤 ${sanitizeText(st.name || 'موظف')} (${sanitizeText(st.email)})
          <span class="log-badge" style="background:#E0E7FF; color:#3730A3;">${sanitizeText(st.role || 'staff')}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">
          الصلاحيات: ${(st.permissions || ['all']).join(', ')}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="deleteStaffMember('${sanitizeText(st.id)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

async function handleAddStaffMember(e) {
  e.preventDefault();
  if (!assertAdmin()) return;

  const email = document.getElementById('staffEmailInput').value.trim().toLowerCase();
  const name = document.getElementById('staffNameInput').value.trim();
  const role = document.getElementById('staffRoleSelect').value;

  if (!email || !name) {
    showToast('يرجى كتابة اسم وبريد الموظف');
    return;
  }

  const staffDocId = email.replace(/[^a-z0-9]/g, '_');
  const payload = {
    email,
    name: sanitizeText(name),
    role,
    permissions: role === 'owner' ? ['all'] : ['orders', 'products', 'analytics'],
    addedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    await dbPaths.staffCol().doc(staffDocId).set(payload, { merge: true });
    showToast(`تم إضافة الموظف "${name}" بنجاح ✓`);
    document.getElementById('staffEmailInput').value = '';
    document.getElementById('staffNameInput').value = '';
    fetchStaffList();
  }
}

async function deleteStaffMember(staffId) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا الموظف؟')) {
    if (db) await dbPaths.staffCol().doc(staffId).delete();
    showToast('تم حذف الموظف بنجاح');
    fetchStaffList();
  }
}

// ================= 29. SUPER ADMIN PAYMENT INFO =================
async function fetchSuperAdminPaymentInfo() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.systemDoc('payment_info').get();
    if (snap.exists) {
      superAdminPaymentInfo = { ...superAdminPaymentInfo, ...snap.data() };
    }
    renderPharmacySubscriptionCard();
  } catch (e) {
    console.warn("Payment info fetch error:", e);
  }
}

function renderPharmacySubscriptionCard() {
  const container = document.getElementById('pharmacySubscriptionDetailsWrap');
  if (!container) return;

  const price = Number(pharmacyProfile.subscriptionPrice || 50000);
  const expiry = pharmacyProfile.subscriptionExpiry || '2099-12-31';

  const today = new Date();
  const expDate = new Date(expiry);
  const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
  const isExp = diffDays <= 0;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:18px;">
      <div style="background:#F0FDF4; border:1.5px solid #BBF7D0; border-radius:14px; padding:14px; text-align:center;">
        <div style="font-size:11.5px; font-weight:800; color:#15803D; margin-bottom:4px;">💰 سعر الاشتراك الشهري المعتمد</div>
        <div class="mono" style="font-size:20px; font-weight:900; color:#166534;">${fmtPrice(price)}</div>
      </div>
      <div style="background:${isExp ? '#FEF2F2' : '#EFF6FF'}; border:1.5px solid ${isExp ? '#FECACA' : '#BFDBFE'}; border-radius:14px; padding:14px; text-align:center;">
        <div style="font-size:11.5px; font-weight:800; color:${isExp ? '#DC2626' : '#1E40AF'}; margin-bottom:4px;">⏳ تاريخ انتهاء الصلاحية</div>
        <div class="mono" style="font-size:16px; font-weight:900; color:${isExp ? '#991B1B' : '#1E3A8A'};">${expiry} (${isExp ? 'منتهي' : diffDays + ' يوم متبقي'})</div>
      </div>
    </div>

    <div style="background:#F8FAFC; border:1.5px solid #E2E8F0; border-radius:16px; padding:18px; text-align:right;">
      <h4 style="margin:0 0 10px; font-size:14px; font-weight:900; color:#0F172A; display:flex; align-items:center; gap:6px;">
        💳 بيانات بطاقات ومحافظ الدفع المعتمدة للمنصة:
      </h4>
      <div style="font-size:12.5px; color:#334155; line-height:1.8; space-y:6px;">
        <div>👤 <b>اسم المستفيد:</b> <span class="mono">${sanitizeText(superAdminPaymentInfo.cardHolder || 'Hussain Admin')}</span></div>
        <div>💳 <b>رقم بطاقة Qi Card / ماستركارد:</b> <span class="mono" style="background:#E2E8F0; padding:2px 8px; border-radius:6px; font-weight:900;">${sanitizeText(superAdminPaymentInfo.qiCardNumber || '----')}</span></div>
        <div>📱 <b>محفظة زين كاش (ZainCash):</b> <span class="mono" style="background:#E2E8F0; padding:2px 8px; border-radius:6px; font-weight:900;">${sanitizeText(superAdminPaymentInfo.zainCashNumber || '07813703288')}</span></div>
        <div style="margin-top:8px; font-size:11.5px; color:#64748B;">📌 <i>${sanitizeText(superAdminPaymentInfo.notes || 'يرجى إرسال وصل التحويل عبر الواتساب لتجديد الاشتراك فورياً.')}</i></div>
      </div>
      
      <div style="margin-top:14px; display:flex; gap:10px;">
        <button type="button" onclick="sendRenewalReceiptWhatsApp(${price})" class="admin-btn-save" style="margin:0; background:linear-gradient(135deg, #25D366 0%, #128C7E 100%); font-size:13px;">
          📲 إرسال إشعار السداد ووصل التحويل عبر واتساب
        </button>
      </div>
    </div>
  `;
}

function sendRenewalReceiptWhatsApp(price) {
  const adminMsg = encodeURIComponent(`🌸 *طلب تجديد اشتراك صيدلية*\nاسم الصيدلية: ${pharmacyProfile.name}\nالمعرف: ${currentPharmacyId}\nالمبلغ المحول: ${price.toLocaleString()} د.ع\nتاريخ الطلب: ${new Date().toLocaleDateString('ar-IQ')}\nيرجى اعتماد التجديد.`);
  window.open(`https://wa.me/9647813703288?text=${adminMsg}`, '_blank');
}

// ================= 30. THEME, LOGO, LOADER & BRANDING CUSTOMIZATION =================
async function handleSaveCustomization(e) {
  e.preventDefault();
  if (!assertAdmin(showToast)) return;

  const getVal = (id, defaultVal = '') => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : defaultVal;
  };
  const getChecked = (id, defaultVal = false) => {
    const el = document.getElementById(id);
    return el ? el.checked : defaultVal;
  };

  const primaryColor = getVal('adminPrimaryColorPicker', pharmacyProfile.primaryColor || '#E85D8A');
  const deliveryStd = Number(getVal('adminDeliveryStandard', 4000));
  const deliveryExp = Number(getVal('adminDeliveryExpress', 8000));

  const newSettings = {
    name: sanitizeText(getVal('adminPharmacyNameInput', pharmacyProfile.name || 'الصيدلية')),
    logoUrl: sanitizeUrl(getVal('adminPharmacyLogoInput', pharmacyProfile.logoUrl || '')),
    primaryColor: primaryColor,
    deliveryFeeStandard: deliveryStd,
    deliveryFeeExpress: deliveryExp,
    showAnnouncement: getChecked('adminShowAnnouncement', true),
    announcementText: sanitizeText(getVal('adminAnnouncementText', '✨ أهلاً بكم في متجرنا الإلكتروني 🌸')),
    showPharmacistBanner: getChecked('adminShowPharmacistBanner', true),
    pharmacistCtaTitle: sanitizeText(getVal('adminPharmacistTitleInput', 'استشر الصيدلي مجاناً 🩺')),
    pharmacistCtaDesc: sanitizeText(getVal('adminPharmacistDescInput', 'تحدث مع الصيدلي المختص مباشرة للحصول على تشخيص دقيق لروتينك وروشتتك')),
    socialWhatsapp: sanitizeText(getVal('adminSocialWhatsappInput', '9647813703288')),
    socialTelegram: sanitizeText(getVal('adminSocialTelegramInput', '')),
    socialInstagram: sanitizeText(getVal('adminSocialInstagramInput', '')),
    socialPhone: sanitizeText(getVal('adminSocialPhoneInput', '07813703288')),
    heroMainTitle: sanitizeText(getVal('adminHeroMainTitle', 'متجر الصيدلية')),
    heroSubTitle: sanitizeText(getVal('adminHeroSubTitle', 'نحن هنا لتحسين صحتكم وجمالكم')),
    heroDescTitle: sanitizeText(getVal('adminHeroDescTitle', 'منتجات أصلية ومعتمدة 100%')),
    bannerImgUrl: sanitizeUrl(getVal('adminBannerImgInput', 'https://imgdb.io/i/EQ4D9ag.png')),
    loaderImgUrl: sanitizeUrl(getVal('adminLoaderImgInput', pharmacyProfile.loaderImgUrl || '')),
    loaderCircleSize: Number(getVal('adminLoaderCircleSize', pharmacyProfile.loaderCircleSize || 150)),
    loaderTitle: sanitizeText(getVal('adminLoaderTitleInput', pharmacyProfile.loaderTitle || 'جاري تحميل الموقع')),
    loaderSubText: sanitizeText(getVal('adminLoaderSubInput', pharmacyProfile.loaderSubText || 'انتظر لحظة من فضلك ..')),
    // 🌟 (إصلاح #4) يقرأ القيمة من الحقل النصي المتزامن مع منتقي الألوان المرئي adminLoaderBgColorPicker
    loaderBgColor: sanitizeText(getVal('adminLoaderBgColor', pharmacyProfile.loaderBgColor || 'linear-gradient(160deg, #FDF2F6 0%, #FFF9FB 45%, #FBEAF1 100%)')),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  pharmacyProfile = { ...pharmacyProfile, ...newSettings };
  saveLocalState();
  applyStoreSettings();
  showToast('تم تطبيق وحفظ الهوية والشعار وشاشة التحميل سحابياً! ✨');

  try {
    if (db) await dbPaths.pharmacyDoc().set(newSettings, { merge: true });
  } catch (err) { console.warn(err); }
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
function initFirestoreSync() {
  if (!isFirebaseConfigured || !db) return Promise.resolve();

  const cachedProds = localStorage.getItem(getStorageKey('products_cache'));
  if (cachedProds) {
    try {
      products = JSON.parse(cachedProds);
      renderCurrentActiveView();
    } catch (e) {}
  }

  const pharmacyDocPromise = new Promise(resolve => {
    let resolved = false;
    dbPaths.pharmacyDoc().onSnapshot(doc => {
      if (doc.exists) {
        pharmacyProfile = { ...pharmacyProfile, ...doc.data() };
        if (pharmacyProfile.brandsData) brandsData = { ...brandsData, ...pharmacyProfile.brandsData };
        saveLocalState();
        applyStoreSettings();
        renderPromoCardsListAdmin();
        renderBrandStrip();
        checkStorefrontSubscriptionLock();
        checkAdminSubscriptionLock();
        const navTitleEl = document.getElementById('adminNavTitle');
        if (navTitleEl) navTitleEl.textContent = `لوحة تحكم ${pharmacyProfile.name || 'الصيدلية'}`;
      }
      if (!resolved) { resolved = true; resolve(); }
    }, err => { console.warn(err); if (!resolved) { resolved = true; resolve(); } });
  });

  const categoriesPromise = new Promise(resolve => {
    let resolved = false;
    dbPaths.categoriesCol().onSnapshot(snap => {
      if (!snap.empty) {
        const loaded = [];
        snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
        categories = loaded;
        renderModernCategories();
        renderAdminCategoriesList();
        populateCategoryDropdowns();
        updateDiscountTargetOptions();
        populateBundleFilterDropdowns();
        populateOfferFilterDropdowns();
      }
      if (!resolved) { resolved = true; resolve(); }
    }, err => { console.warn(err); if (!resolved) { resolved = true; resolve(); } });
  });

  const bundlesPromise = new Promise(resolve => {
    let resolved = false;
    dbPaths.bundlesCol().onSnapshot(snap => {
      if (!snap.empty) {
        const loaded = [];
        snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
        bundles = loaded;
        renderAdminBundlesList();
      }
      if (!resolved) { resolved = true; resolve(); }
    }, err => { console.warn(err); if (!resolved) { resolved = true; resolve(); } });
  });

  // 🛡️ (إصلاح حرج - عزل الأسعار عن الزبائن) script.js يخدم كلاً من index.html (الزبائن) و
  // admin.html (الإدارة) معاً، لذا فتح onSnapshot على المنتجات هنا بلا شرط كان يعني تسريب اتصال
  // Firestore اللحظي (وبالتالي الأسعار الحقيقية والتعديلات الفورية) لأي زائر عادي في المتجر أيضاً.
  // الحل: كل الزوار (بمن فيهم الزبائن) يحصلون على قائمة المنتجات فقط عبر كاش R2 السحابي (ساعة
  // كاملة، بلا اتصال حي)، بينما الاشتراك اللحظي (onSnapshot) لا يُفتح إلا بعد التأكد الفعلي من أن
  // المستخدم مشرف معتمد (يتم تفعيله من داخل auth.onAuthStateChanged أدناه بعد إثبات الهوية).
  function applyProductsSnapshot(snap) {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(doc => loaded.push({ id: doc.id, ...doc.data() }));
      products = loaded;

      products.forEach(p => {
        if (p.brand && !brandsData[p.brand]) {
          brandsData[p.brand] = { name: p.brand, color: hashColor(p.brand), logoUrl: '' };
        }
      });

      saveLocalState();
      renderCurrentActiveView();
      renderModernCategories();
      checkLowStockAlerts();
      if (isCurrentUserAdmin()) fetchRealAnalytics();
    }
  }

  const catalogPromise = fetchCatalogFromR2().then(success => {
    if (!success) {
      // احتياط: إن تعذر جلب كاش R2 (سيرفر غير مهيأ)، نجلب لقطة واحدة غير حية من Firestore بدل فتح اتصال دائم
      return dbPaths.productsCol().get().then(applyProductsSnapshot).catch(err => console.warn(err));
    }
  });

  if (isCurrentUserAdmin() && !window.__adminProductsSyncAttached) {
    window.__adminProductsSyncAttached = true;
    dbPaths.productsCol().onSnapshot(applyProductsSnapshot, err => console.warn(err));
  }

  listenToNotifications();
  recordRealVisit();

  return Promise.allSettled([pharmacyDocPromise, categoriesPromise, bundlesPromise, catalogPromise]);
}

// 🌟 جلب كتالوج المنتجات من كاش Cloudflare R2 السريع (متاح لجميع الزوار بأمان، بلا اتصال حي)
// (المتغير lastCatalogCacheStatus معرّف لاحقاً بقسم "GOOGLE AUTH" ويُستخدم هنا أيضاً)
async function fetchCatalogFromR2() {
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/catalog?pharmacy=${encodeURIComponent(currentPharmacyId)}`, {
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
        return true;
      }
    }
  } catch (e) {
    console.warn('R2 catalog fetch fallback to Firestore:', e);
  }
  return false;
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

function openNotifModal() {
  const modal = document.getElementById('notifModal');
  if (modal) modal.classList.add('open');
  notifications.forEach(n => readNotifs.add(n.id));
  localStorage.setItem(getStorageKey('read_notifs'), JSON.stringify([...readNotifs]));
  renderNotifications();
}

function closeNotifModal() { 
  const modal = document.getElementById('notifModal');
  if (modal) modal.classList.remove('open'); 
}

async function handleSendBroadcastNotification(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('sendBroadcastNotif', 2000)) return;

  const title = document.getElementById('notifTitleInput').value.trim();
  const body = document.getElementById('notifBodyInput').value.trim();
  const type = document.getElementById('notifTypeInput').value;

  if (!title || !body) {
    showToast('يرجى تعبئة عنوان ونص الإشعار بالكامل');
    return;
  }

  try {
    if (db) {
      await dbPaths.notificationsCol().add({
        title: sanitizeText(title),
        body: sanitizeText(body),
        type: sanitizeText(type),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    document.getElementById('notifTitleInput').value = '';
    document.getElementById('notifBodyInput').value = '';
    showToast('🚀 تم إرسال الإشعار لجميع المستخدمين بنجاح!');
  } catch (err) {
    showToast('حدث خطأ أثناء إرسال الإشعار');
  }
}

async function deleteNotification(id) {
  if (!assertAdmin()) return;
  if (confirm('حذف هذا الإشعار نهائياً؟')) {
    if (db) await dbPaths.notificationsCol().doc(String(id)).delete();
    showToast('تم حذف الإشعار بنجاح ✓');
  }
}

async function fetchAuditLogs() {
  const res = await apiFetch("/api/admin/logs");
  const tbody = document.getElementById('adminAuditLogsTbody');
  if (!tbody) return;

  if (res && res.logs && res.logs.length > 0) {
    tbody.innerHTML = res.logs.map(log => `
      <tr>
        <td><span class="log-badge">${sanitizeText(log.action)}</span></td>
        <td>${sanitizeText(log.details)}</td>
        <td>${sanitizeText(log.adminEmail)}</td>
        <td class="mono" style="font-size:10px;">${new Date(log.timestamp).toLocaleTimeString('ar-IQ')}</td>
        <td class="mono" style="font-size:10px;">${sanitizeText(log.ip)}</td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:14px;">لا توجد سجلات بعد.</td></tr>`;
  }
}

// ================= 33. GOOGLE AUTH & REDIRECT (FIX #1: CACHE STATUS TOAST AFTER LOGIN) =================
let lastCatalogCacheStatus = null;

function updateUserHeaderProfile() {
  // 🔧 (إصلاح — أيقونة الهمبرغر تختفي) هذه الدالة كانت تستبدل innerHTML الخاص بأيقونة
  // القائمة العلوية (☰) بصورة المستخدم/حرف الاسم الأول أو أيقونة دخول صغيرة 16px، فتُلغي
  // شكل الهمبرغر الكبير الواضح المطلوب بالكامل عند كل تحميل صفحة أو تسجيل دخول/خروج. زر
  // القائمة يجب أن يبقى ثابتاً كأيقونة ☰ دائماً بغض النظر عن حالة تسجيل الدخول — عرض صورة
  // أو حرف المستخدم موجود أصلاً داخل قائمة الدرج نفسها (menu-link الخاص بـ"حسابي"), فلا
  // داعي لتكرارها فوق الزر وتخريب شكله.
  const chipName = document.getElementById('userChipName');
  const logoutBtn = document.getElementById('userHeaderLogoutBtn');
  const bnAccountLbl = document.getElementById('bnAccountLbl');

  if (currentUser) {
    const rawName = currentUser.displayName || currentUser.email || 'حسابي';
    const firstName = sanitizeText(rawName.split(' ')[0].split('@')[0]);
    if (chipName) chipName.textContent = firstName;
    if (bnAccountLbl) bnAccountLbl.textContent = firstName;
    if (logoutBtn) logoutBtn.style.display = 'flex';
  } else {
    if (chipName) chipName.textContent = 'دخول';
    if (bnAccountLbl) bnAccountLbl.textContent = 'حسابي';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

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
            <p>${sanitizeText(currentUser.email || currentUser.phoneNumber || '')}</p>
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
        <p style="font-size:12.5px; color:var(--text-soft); margin:0 0 16px;">سجلي الدخول لحفظ منتجاتك المفضلة ومتابعة طلباتكِ:</p>

        <div class="phone-auth-tabs">
          <button type="button" class="phone-auth-tab active" id="phoneAuthTabLogin" onclick="switchPhoneAuthTab('login')">تسجيل الدخول</button>
          <button type="button" class="phone-auth-tab" id="phoneAuthTabRegister" onclick="switchPhoneAuthTab('register')">حساب جديد</button>
        </div>

        <div id="phoneAuthErrorBox" class="phone-auth-error hidden"></div>

        <div id="phoneAuthFormLogin">
          <div class="form-field" style="text-align:right;">
            <label>رقم الهاتف</label>
            <input type="tel" id="phoneLoginPhone" placeholder="07xxxxxxxxx" inputmode="numeric">
          </div>
          <div class="form-field" style="text-align:right;">
            <label>كلمة المرور (رمز سري من 4 إلى 6 أرقام)</label>
            <input type="password" id="phoneLoginPin" placeholder="••••" inputmode="numeric" maxlength="6">
          </div>
          <button class="auth-btn-google" style="background:var(--accent); color:#fff; border:none; margin-bottom:10px;" onclick="loginWithPhone()">تسجيل الدخول</button>
        </div>

        <div id="phoneAuthFormRegister" class="hidden">
          <div class="form-field" style="text-align:right;">
            <label>الاسم الكامل</label>
            <input type="text" id="phoneRegisterName" placeholder="اسمكِ الكامل">
          </div>
          <div class="form-field" style="text-align:right;">
            <label>رقم الهاتف</label>
            <input type="tel" id="phoneRegisterPhone" placeholder="07xxxxxxxxx" inputmode="numeric">
          </div>
          <div class="form-field" style="text-align:right;">
            <label>كلمة المرور (رمز سري من 4 إلى 6 أرقام)</label>
            <input type="password" id="phoneRegisterPin" placeholder="••••" inputmode="numeric" maxlength="6">
          </div>
          <button class="auth-btn-google" style="background:var(--accent); color:#fff; border:none; margin-bottom:10px;" onclick="registerWithPhone()">إنشاء الحساب</button>
        </div>

        <div class="auth-divider"><span>أو</span></div>

        <button class="auth-btn-google" onclick="signInWithGoogle()">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          المتابعة عبر Google
        </button>
      </div>`;
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

// 🌟 يبقى هذا كخط دفاع ثانوي فقط: لو نجح المتصفح فعلاً بإكمال تدفّق Redirect في حالات
// نادرة (بعض المتصفحات لا تعاني من مشكلة storage-partitioning)، تُستقبل نتيجته هنا أيضاً.
function announceCacheStatusToAdminIfNeeded() {
  if (!lastCatalogCacheStatus) return;
  if (!isCurrentUserAdmin()) return;
  setTimeout(() => {
    showToast(`⚡ كاش Cloudflare R2: [${lastCatalogCacheStatus}] (كاش ساعة كاملة)`);
  }, 1000);
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

    // 🛡️ تفعيل الاشتراك اللحظي بالمنتجات (السعر الحي) حصراً بعد تأكيد أن المستخدم مشرف معتمد
    if (user && isCurrentUserAdmin() && db && !window.__adminProductsSyncAttached) {
      window.__adminProductsSyncAttached = true;
      dbPaths.productsCol().onSnapshot(snap => {
        if (!snap.empty) {
          const loaded = [];
          snap.forEach(doc => loaded.push({ id: doc.id, ...doc.data() }));
          products = loaded;
          products.forEach(p => {
            if (p.brand && !brandsData[p.brand]) {
              brandsData[p.brand] = { name: p.brand, color: hashColor(p.brand), logoUrl: '' };
            }
          });
          saveLocalState();
          renderCurrentActiveView();
          renderModernCategories();
          checkLowStockAlerts();
          fetchRealAnalytics();
        }
      }, err => console.warn(err));
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
}

// ================= 34. SHARE & CONSULTATION =================
function shareCurrentProduct() {
  if (!currentProductId) return;
  const p = findProduct(currentProductId);
  const shareUrl = `${window.location.origin}${window.location.pathname}?pharmacy=${encodeURIComponent(currentPharmacyId)}#p=${currentProductId}`;
  
  if (navigator.share) {
    navigator.share({
      title: p ? p.name : pharmacyProfile.name,
      text: `شاهد ${p ? p.name : 'هذا المنتج'} في ${pharmacyProfile.name}:`,
      url: shareUrl
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('📋 تم نسخ رابط المنتج المباشر بنجاح!');
    });
  }
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

function openConsultModal() {
  const m = document.getElementById('consultModal');
  if (m) m.classList.add('open');
}

function closeConsultModal() {
  const m = document.getElementById('consultModal');
  if (m) m.classList.remove('open');
}

function selectConsultCondition(btn) {
  document.querySelectorAll('.consult-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('consultCondition').value = btn.getAttribute('data-val');
}

function handleConsultSubmit(e) {
  e.preventDefault();
  if (!lockAction('consultSubmit', 2000)) return;

  const name = document.getElementById('consultName').value.trim();
  const age = document.getElementById('consultAge').value.trim();
  const cond = document.getElementById('consultCondition').value;
  const desc = document.getElementById('consultDesc').value.trim();

  if (!name || !age || !desc) {
    showToast('يرجى تعبئة كافة حقول الاستشارة');
    return;
  }

  const targetPhone = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  const msg = encodeURIComponent(`🩺 *استشارة صيدلانية - ${pharmacyProfile.name || 'الصيدلية'}:*\nالاسم: ${name}\nالعمر: ${age}\nالحالة: ${cond}\nالاستفسار: ${desc}`);
  window.open(`https://wa.me/${targetPhone}?text=${msg}`, '_blank');
  closeConsultModal();
}

function checkAndShowWelcomeModal() {
  if (!localStorage.getItem(getStorageKey('welcomed'))) {
    setTimeout(() => {
      const m = document.getElementById('welcomeOfferModal');
      if (m) m.classList.add('open');
    }, 2500);
  }
}

function closeWelcomeModal() {
  const m = document.getElementById('welcomeOfferModal');
  if (m) m.classList.remove('open');
  localStorage.setItem(getStorageKey('welcomed'), '1');
}

function copyWelcomeCode() {
  navigator.clipboard.writeText('QUTN10').then(() => {
    showToast('تم نسخ كود الخصم (QUTN10) بنجاح!');
  });
}

function applyWelcomeAndShop() {
  closeWelcomeModal();
  showToast('تسوقي الآن واستخدمي كود الخصم في السلة ✨');
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
