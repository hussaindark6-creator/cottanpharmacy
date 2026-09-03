/* ==========================================================
   SaaS Multi-Tenant Pharmacy Engine — app.js
   Version: 4.5.0 (Standalone Master Engine - Zero Missing Imports)
   ========================================================== */

// ================= 1. DOMAIN & TENANT RESOLVER =================
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

  const cachedId = sessionStorage.getItem('saas_active_pharmacy_id');
  const isPoisoned = cachedId && (
    cachedId.includes('pages.dev') || cachedId.includes('pharmacies-') ||
    cachedId.includes('workers.dev') || cachedId.includes('web.app') || cachedId.includes('localhost')
  );

  if (isPoisoned) {
    sessionStorage.removeItem('saas_active_pharmacy_id');
  } else if (cachedId && cachedId.trim()) {
    return cachedId.trim().toLowerCase();
  }

  const hostname = window.location.hostname.toLowerCase();
  const ignoredDomains = ['pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'github.io', 'localhost', '127.0.0.1'];
  const isPlatformHost = ignoredDomains.some(d => hostname === d || hostname.endsWith('.' + d));

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
  console.warn("Firebase Init Error:", err);
}

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
  userCartDoc: (uid, pId = currentPharmacyId) => db.collection('users').doc(uid).collection('pharmacies').doc(pId)
};

// ================= 3. SECURITY & SANITIZATION =================
function sanitizeText(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
  return String(text).toLowerCase().trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').replace(/[\s\-_]+/g, ' ');
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
  return isIAB;
}

// ================= 4. SMART FUZZY SEARCH =================
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
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
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

// ================= 5. ISOLATED STATE & PROFILE =================
const getStorageKey = (key) => `saas_${currentPharmacyId}_${key}`;

function safeJSONParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined' || raw === '[object Object]' || raw === 'null') return fallback;
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

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

let cart = safeJSONParse(getStorageKey('cart'), {});
let wishlist = new Set(safeJSONParse(getStorageKey('wishlist'), []));
let myOrders = safeJSONParse(getStorageKey('my_orders'), []);

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
  try {
    localStorage.setItem(getStorageKey('cart'), JSON.stringify(cart));
    localStorage.setItem(getStorageKey('wishlist'), JSON.stringify([...wishlist]));
    localStorage.setItem(getStorageKey('my_orders'), JSON.stringify(myOrders));
    localStorage.setItem(getStorageKey('store_settings'), JSON.stringify(pharmacyProfile));
    localStorage.setItem(getStorageKey('products_cache'), JSON.stringify(products));
  } catch (e) {}
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

// ================= 6. DESIGN TOKENS THEME =================
function applyTheme(templateId, hexColor) {
  const root = document.documentElement;
  const targetColor = hexColor || pharmacyProfile.primaryColor || '#E85D8A';
  if (/^#[0-9A-F]{6}$/i.test(targetColor)) {
    root.style.setProperty('--accent', targetColor);
    root.style.setProperty('--rose-deep', targetColor);
  }
}

function renderProductCard(p) {
  const color = getBrandColor(p.brand);
  const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
  const isWished = wishlist.has(p.id);
  const inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
  const cleanImg = sanitizeUrl(p.imageUrl);

  return `
    <div class="product-card" id="prod-card-${sanitizeText(p.id)}" onclick="window.App.openProduct('${sanitizeText(p.id)}', true)">
      <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); window.App.toggleWishlist('${sanitizeText(p.id)}')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
      </button>
      ${discountPct ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
      ${!inStock ? `<span class="badge-out-stock">نفذت الكمية</span>` : ''}
      
      <div class="product-thumb" style="background:${color}18;">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(p.name)}" loading="lazy">` : (icons[p.type] || icons.bottle)(color)}
      </div>
      <div class="p-rating" style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
        ${starIcon()} <span class="mono" style="font-weight:800;">${p.rating || 5.0}</span>
      </div>
      <div class="p-name">${sanitizeText(p.name)}</div>
      <div class="p-size">${sanitizeText(p.size || '')}</div>

      <div class="p-price-row">
        <span class="p-price mono">${fmtPrice(p.price)}</span>
        ${p.oldPrice ? `<span class="p-oldprice mono">${fmtPrice(p.oldPrice)}</span>` : ''}
      </div>
      <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); window.App.addToCart('${sanitizeText(p.id)}')">
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
      <div class="bundle-price-box">
        <span class="p-price mono" style="font-size:17px; color:var(--rose-deep);">${fmtPrice(b.price)}</span>
        ${b.oldPrice ? `<span class="p-oldprice mono" style="margin-inline-start:6px;">${fmtPrice(b.oldPrice)}</span>` : ''}
      </div>
      <button class="add-cart-btn" onclick="window.App.addBundleToCart('${sanitizeText(b.id)}')">
        🎁 أضف البكج كاملاً للسلة
      </button>
    </div>
  `;
}

function renderCategoryCard(c, count) {
  const cleanImg = sanitizeUrl(c.imageUrl);
  return `
    <div class="modern-cat-card" onclick="window.App.openCategory('${sanitizeText(c.id)}')">
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

// ================= 7. ORDERS & CHECKOUT =================
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
              throw new Error(`عذراً، نفدت كمية المنتج (${pData.name})`);
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

// ================= 8. CART & NAVIGATION =================
function addToCart(id, silent = false, quantity = 1) {
  cart[id] = (cart[id] || 0) + quantity;
  updateCartBadge();
  saveLocalState();
  if (!silent) showToast('تمت الإضافة للسلة ✓');
}

function addBundleToCart(bundleId) {
  const cartKey = 'bundle_' + bundleId;
  cart[cartKey] = (cart[cartKey] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  showToast('تمت إضافة البكج كاملاً للسلة! 🎁');
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
    <div class="brand-chip ${homeActiveBrand === 'all' ? 'active' : ''}" onclick="window.App.selectHomeBrand('all')">
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
      <div class="brand-chip ${isActive ? 'active' : ''}" onclick="window.App.selectHomeBrand('${sanitizeText(k)}')">
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
  if (bundles.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  grid.innerHTML = bundles.map(b => renderBundleCard(b)).join('');
}

function renderAllBundles() {
  const grid = document.getElementById('allBundlesGrid');
  const countEl = document.getElementById('allBundlesCount');
  if (countEl) countEl.textContent = bundles.length + ' بكجات توفير';
  if (!grid) return;
  if (bundles.length === 0) { grid.innerHTML = `<div class="no-results">لا توجد بكجات توفير متاحة حالياً 🌸</div>`; return; }
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
  if (!listEl || !summaryEl) return;

  if (ids.length === 0) {
    listEl.innerHTML = `<div class="no-results">سلتك فارغة — تصفّحي المنتجات وأضيفي ما يعجبك.</div>`;
    summaryEl.innerHTML = '';
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
            <button class="cart-qty-btn" onclick="window.App.changeCartQty('${sanitizeText(id)}', -1)">−</button>
            <span class="cart-qty-val mono">${qty}</span>
            <button class="cart-qty-btn" onclick="window.App.changeCartQty('${sanitizeText(id)}', 1)">+</button>
            <span class="cart-remove" onclick="window.App.removeCartItem('${sanitizeText(id)}')">حذف</span>
          </div>
        </div>
        <span class="p-price mono">${fmtPrice(item.price * qty)}</span>
      </div>`;
  }).join('');

  const subtotal = getCartSubtotal();
  const fee = (deliveryMethod === 'express') ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);
  const finalTotal = subtotal + fee;

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>
    <button class="checkout-btn" onclick="window.App.showView('checkout')">متابعة الطلب</button>`;
}

function renderCheckoutSummary() {
  const summaryEl = document.getElementById('checkoutSummaryBlock');
  if (!summaryEl) return;
  const subtotal = getCartSubtotal();
  const fee = (deliveryMethod === 'express') ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);
  const finalTotal = subtotal + fee;

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>`;
}

function renderPromoBanners() {
  const el = document.getElementById('promoBanners');
  if (!el) return;
  const cards = pharmacyProfile.promoCards || [];
  if (cards.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="section-head"><span></span><h2>عروض مميزة 🎁</h2></div>
    ${cards.map(c => `
      <div class="promo-banner">
        <div class="promo-thumb">${c.img ? `<img src="${sanitizeUrl(c.img)}">` : icons.bottle('var(--accent, #E85D8A)')}</div>
        <div class="promo-body">
          <h3>${sanitizeText(c.title)}</h3>
          <p>${sanitizeText(c.desc)}</p>
          <div class="promo-discount">${sanitizeText(c.discount)}</div>
          <button class="promo-cta" onclick="window.App.showView('offers')">تسوقي الآن</button>
        </div>
      </div>
    `).join('')}`;
}

function renderMyOrders() {
  const container = document.getElementById('myOrdersContainer');
  const countEl = document.getElementById('myOrdersCount');
  if (countEl) countEl.textContent = myOrders.length + ' طلب';
  if (!container) return;

  if (myOrders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:40px 16px;">لا توجد لديكِ طلبات مسجلة حتى الآن 🌸<br><button onclick="window.App.showView('home')" style="margin-top:14px; background:var(--accent); color:#fff; font-weight:800; font-size:12.5px; padding:8px 20px; border-radius:999px;">تصفح المنتجات</button></div>`;
    return;
  }

  container.innerHTML = myOrders.map(ord => `
    <div class="order-card">
      <div class="order-card-header">
        <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
        <span class="order-card-status">${sanitizeText(ord.status || 'قيد المعالجة والتجهيز 🚚')}</span>
      </div>
      <div style="font-size:11.5px; color:var(--text-soft); margin-bottom:8px;">
        التاريخ: <span class="mono">${sanitizeText(ord.date)}</span> · العنوان: ${sanitizeText(ord.address)}
      </div>
      <div class="order-card-footer">
        <span>المجموع الكلي: </span>
        <span class="mono" style="color:var(--rose-deep); font-size:16px;">${fmtPrice(ord.total)}</span>
      </div>
    </div>
  `).join('');
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
  document.getElementById('pdPriceRow').innerHTML = `<span class="pd-price mono">${fmtPrice(p.price)}</span>`;

  document.getElementById('pdTabDesc').textContent = p.description || 'منتج أصلي معتمد من الصيدلية.';
  document.getElementById('pdTabIng').textContent = p.ingredients || 'تركيبة غنية ومفحوصة جلدياً.';
  document.getElementById('pdTabUse').textContent = p.usage || 'يُوضع وفق الإرشادات الصيدلانية.';

  document.getElementById('pdAddBtn').onclick = () => {
    addToCart(p.id, false, 1);
  };
}

function openProduct(id) {
  currentProductId = id;
  const p = findProduct(id);
  if (!p) return;
  renderProductDetailDOM(p);
  showView('product');
}

function goBackFromProduct() {
  showView('home');
}

function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  listingMode = 'search';
  listingValue = term;
  showView('listing');
}

function openCategory(catId) {
  listingMode = 'category';
  listingValue = catId;
  showView('listing');
}

function openBestSellers() {
  listingMode = 'bestsellers';
  listingValue = null;
  showView('listing');
}

function renderListing() {
  const titleEl = document.getElementById('listingTitle');
  if (!titleEl) return;

  let list = products.filter(p => p.isDeleted !== true);
  if (listingMode === 'category') {
    list = list.filter(p => p.category === listingValue);
    titleEl.textContent = (categories.find(c => c.id === listingValue) || {}).label || 'القسم';
  } else if (listingMode === 'search') {
    list = executeFuzzyProductSearch(listingValue, products);
    titleEl.textContent = `نتائج البحث عن: "${listingValue}"`;
  } else {
    titleEl.textContent = 'الأكثر مبيعاً 🔥';
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
}

function selectDelivery(method) {
  deliveryMethod = method;
  document.getElementById('delStandard')?.classList.toggle('selected', method === 'standard');
  document.getElementById('delExpress')?.classList.toggle('selected', method === 'express');
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
  const saved = safeJSONParse('saas_customer_saved_profile', null);
  if (saved) {
    if (document.getElementById('custName')) document.getElementById('custName').value = saved.name || '';
    if (document.getElementById('custPhone')) document.getElementById('custPhone').value = saved.phone || '';
    if (document.getElementById('custAddress')) document.getElementById('custAddress').value = saved.address || '';
    document.getElementById('autofillNoticeBox')?.style.setProperty('display', 'flex');
  }
}

function clearSavedCustomerData() {
  localStorage.removeItem('saas_customer_saved_profile');
  if (document.getElementById('custName')) document.getElementById('custName').value = '';
  if (document.getElementById('custPhone')) document.getElementById('custPhone').value = '';
  if (document.getElementById('custAddress')) document.getElementById('custAddress').value = '';
  document.getElementById('autofillNoticeBox')?.style.setProperty('display', 'none');
  showToast('تم مسح البيانات المحفوظة');
}

function updateUserHeaderProfile() {
  const chipName = document.getElementById('userChipName');
  if (chipName) chipName.textContent = currentUser ? (currentUser.displayName || 'حسابي').split(' ')[0] : 'دخول';
}

function renderAccountView() {
  const container = document.getElementById('accountAuthContainer');
  if (!container) return;

  if (currentUser) {
    container.innerHTML = `
      <div class="account-card">
        <h3>${sanitizeText(currentUser.displayName || currentUser.email)}</h3>
        <p>${sanitizeText(currentUser.email || '')}</p>
        <button class="auth-btn-google" style="margin-top:14px;" onclick="window.App.showView('orders')">📦 عرض طلباتي وتتبع الشحن</button>
        <button class="auth-btn-logout" onclick="window.App.handleSignOut()">تسجيل الخروج</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="account-card">
        <h3>تسجيل الدخول المباشر</h3>
        <p style="font-size:12.5px; color:var(--text-soft); margin:8px 0 16px;">سجلي الدخول بنقرة واحدة لحفظ منتجاتك ومتابعة طلباتكِ:</p>
        <button class="auth-btn-google" onclick="window.App.signInWithGoogle()">دخول سريع عبر Google</button>
      </div>`;
  }
}

function signInWithGoogle() {
  if (!auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithRedirect(provider);
}

async function handleSignOut() {
  if (auth) await auth.signOut();
  currentUser = null;
  updateUserHeaderProfile();
  renderAccountView();
  showToast('تم تسجيل الخروج بنجاح');
}

function applyStoreSettings() {
  applyTheme(pharmacyProfile.templateId || 'template_default', pharmacyProfile.primaryColor);
  if (document.getElementById('headerLogoText')) document.getElementById('headerLogoText').textContent = pharmacyProfile.name || 'الصيدلية';
  if (document.getElementById('drawerLogoTitle')) document.getElementById('drawerLogoTitle').textContent = pharmacyProfile.name || 'الصيدلية';
}

function initFirestoreRealtimeSync() {
  if (!isFirebaseConfigured || !db) return;

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) {
      pharmacyProfile = { ...pharmacyProfile, ...doc.data() };
      applyStoreSettings();
      renderHome();
    }
  }, console.warn);

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      categories = [];
      snap.forEach(d => categories.push({ id: d.id, ...d.data() }));
      renderModernCategories();
    }
  }, console.warn);

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      bundles = [];
      snap.forEach(d => bundles.push({ id: d.id, ...d.data() }));
      renderHomeBundles();
      renderAllBundles();
    }
  }, console.warn);

  dbPaths.productsCol().onSnapshot(snap => {
    if (!snap.empty) {
      products = [];
      snap.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
      saveLocalState();
      renderCurrentActiveView();
    }
  }, console.warn);
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

// 🌟 تصدير كائن window.App الشامل
window.App = {
  showView, addToCart, addBundleToCart, changeCartQty, removeCartItem,
  selectDelivery, toggleWishlist, openProduct, goBackFromProduct,
  openCategory, openBestSellers, selectHomeBrand, onSearch, openMenu, closeMenu,
  openWhatsapp, executeAtomicOrderCheckout, openReceiptModal, closeReceiptModal,
  clearSavedCustomerData, signInWithGoogle, handleSignOut
};

// دوال مباشرة لضمان عمل أزرار الـ HTML
window.showView = showView;
window.openProduct = openProduct;
window.addToCart = addToCart;
window.openCategory = openCategory;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openWhatsapp = openWhatsapp;

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
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
