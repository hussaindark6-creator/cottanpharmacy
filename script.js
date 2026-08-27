/* ==========================================================
   صيدلية القطن | Cottanpharmacy — Master Script Engine
   ========================================================== */

// ================= CONFIGURATION & CONSTANTS =================
const WORKER_API_BASE = "https://cottanbackend.hussaindark6.workers.dev";
const ADMIN_EMAIL = "hussaindark6@gmail.com";
let WHATSAPP_NUMBER = "9647813703288";

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

try {
  if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    isFirebaseConfigured = true;

    // تفعيل التخزين المحلي للجلسة لضمان بقاء تسجيل الدخول نشطاً
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
      console.warn("Persistence fallback:", err);
    });
  }
} catch (err) {
  console.warn("Firebase init error:", err);
}

// ================= SECURITY & SANITIZATION =================
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

function isCurrentUserAdmin() {
  const user = auth ? auth.currentUser : currentUser;
  return !!(user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase());
}

function assertAdmin() {
  if (!isCurrentUserAdmin()) {
    showToast('⚠️ غير مصرح: هذه العملية مخصصة للمشرف فقط.');
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
  return /Instagram|FBAN|FBAV|TikTok|Snapchat|Telegram|Line|Twitter|MicroMessenger|WhatsApp|musical_ly/i.test(ua);
}

async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
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
    console.warn("Worker API unreachable, falling back locally:", err);
    return { success: false, fallback: true };
  }
}

// ================= ICONS & GRAPHICS (STRICT INLINE SIZING) =================
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

// ================= STORE STATE & DEFAULT DATA =================
const skinTypes = [
  { id: 'all', label: 'الكل ✨' },
  { id: 'oily', label: 'دهنية ومختلطة 🫧' },
  { id: 'dry', label: 'جافة 🧴' },
  { id: 'sensitive', label: 'حساسة 🌿' },
  { id: 'acne', label: 'حب الشباب 🎯' },
  { id: 'brightening', label: 'تفتيح وتصبغات 🌸' },
  { id: 'hydration', label: 'ترطيب عميق 💧' }
];

let activeSkinFilter = 'all';

let brandsData = {
  'Cerave': { name: 'Cerave', color: '#5FAE6E', logoUrl: '' },
  'Simple': { name: 'Simple', color: '#C97F79', logoUrl: '' },
  'REVUELE': { name: 'REVUELE', color: '#D9A441', logoUrl: '' },
  'COSMO': { name: 'COSMO', color: '#B7A233', logoUrl: '' },
  'Skin1004': { name: 'Skin1004', color: '#8FAE4A', logoUrl: '' },
  'The Ordinary': { name: 'The Ordinary', color: '#4CAE93', logoUrl: '' },
  'DIADERM': { name: 'DIADERM', color: '#b01e4a', logoUrl: '' },
  'Photoblock': { name: 'Photoblock', color: '#4C8CAE', logoUrl: '' },
  'ISIS Pharma': { name: 'ISIS Pharma', color: '#4C6FAE', logoUrl: '' },
  'Uriage': { name: 'Uriage', color: '#5C5CAE', logoUrl: '' },
  'Dove': { name: 'Dove', color: '#7A4A6B', logoUrl: '' },
  'dr.Clinic': { name: 'dr.Clinic', color: '#C9463D', logoUrl: '' },
  'LACALUT': { name: 'LACALUT', color: '#C33A2E', logoUrl: '' },
  'ACM': { name: 'ACM', color: '#6B7078', logoUrl: '' }
};

let categories = [
  { id: 'face', label: 'العناية بالوجه', icon: 'face', imageUrl: '' },
  { id: 'moisturizer', label: 'مرطبات', icon: 'jar', imageUrl: '' },
  { id: 'serum', label: 'سيرومات', icon: 'bottle', imageUrl: '' },
  { id: 'sunscreen', label: 'واقي شمس', icon: 'sunscreen', imageUrl: '' },
  { id: 'baby', label: 'العناية بالأطفال', icon: 'baby', imageUrl: '' },
  { id: 'intimate', label: 'العناية بالمناطق الحساسة', icon: 'intimate', imageUrl: '' },
  { id: 'body', label: 'العناية بالجسم', icon: 'body', imageUrl: '' },
  { id: 'hair', label: 'العناية بالشعر', icon: 'hair', imageUrl: '' }
];

const initialDefaultProducts = [
  { id: '1', name: 'كريم سيرافي مرطب للبشرة الجافة', brand: 'Cerave', category: 'moisturizer', skinType: 'dry', size: '236 مل', price: 25000, rating: 4.8, reviews: 126, type: 'jar', inStock: true, isSpecialOffer: false, views: 1, orderCount: 0, description: 'كريم مرطب غني بالسيراميدات وحمض الهيالورونيك، يرمم حاجز البشرة ويمنحها ترطيباً يدوم 24 ساعة.', ingredients: 'Ceramides, Hyaluronic Acid, Glycerin', usage: 'يوضع على الوجه والجسم صباحاً ومساءً.' },
  { id: '2', name: 'رفيول حل نياسيناميد 10% + زنك', brand: 'REVUELE', category: 'serum', skinType: 'acne', size: '30 مل', price: 18000, rating: 4.7, reviews: 98, type: 'bottle', inStock: true, isSpecialOffer: false, views: 1, orderCount: 0, description: 'سيروم مركّز يقلل من ظهور المسام الواسعة ويوازن إفراز الدهون.', ingredients: 'Niacinamide 10%, Zinc PCA', usage: 'تُوضع نقاط على بشرة نظيفة مساءً.' },
  { id: '3', name: 'غسول سيمبل للبشرة الحساسة', brand: 'Simple', category: 'face', skinType: 'sensitive', size: '150 مل', price: 12000, rating: 4.6, reviews: 82, type: 'tube', inStock: true, isSpecialOffer: false, views: 1, orderCount: 0, description: 'غسول لطيف خالٍ من الصابون والعطور، ينظف البشرة بعمق دون تجفيفها.', ingredients: 'Glycerin, Panthenol, Vitamin B5', usage: 'يُدلّك على بشرة مبللة ثم يُشطف.' },
  { id: '4', name: 'كوزمو واقي شمس SPF50 PA+++', brand: 'COSMO', category: 'sunscreen', skinType: 'all', size: '50 مل', price: 19000, rating: 4.8, reviews: 90, type: 'tube', inStock: true, isSpecialOffer: false, views: 1, orderCount: 0, description: 'واقي شمس خفيف غير دهني بحماية عريضة، يمتص بسرعة.', ingredients: 'Zinc Oxide, Titanium Dioxide, Vitamin E', usage: 'يوضع صباحاً ويجدد كل ساعتين إلى 3 ساعات.' }
];

let products = [...initialDefaultProducts];
let notifications = [];
let cart = JSON.parse(localStorage.getItem('qutn_cart') || '{}');
let wishlist = new Set(JSON.parse(localStorage.getItem('qutn_wishlist') || '[]'));
let readNotifs = new Set(JSON.parse(localStorage.getItem('qutn_read_notifs') || '[]'));
let myOrders = JSON.parse(localStorage.getItem('qutn_my_orders') || '[]');
let productReviews = JSON.parse(localStorage.getItem('qutn_reviews') || '{}');
let currentView = 'home';
let listingMode = null, listingValue = null, listingCatActive = 'all';
let currentProductId = null, pdQty = 1, pdActiveTab = 'desc', deliveryMethod = 'standard';
let appliedPromo = null;

// نظام حفظ موضع الشاشة والصفحة السابقة
let previousViewBeforeProduct = 'home';
let previousScrollBeforeProduct = 0;

let totalOrdersCount = 0;
let todayVisitsCount = 0;
let todayRevenue = 0;
let monthlyRevenue = 0;
let weeklyVisitsData = [];

let storeSettings = {
  primaryColor: '#E85D8A',
  bannerImgUrl: 'https://imgdb.io/i/EQ4D9ag.png',
  announcementText: '✨ توصيل مجاني للطلبات فوق 50,000 د.ع لجميع محافظات العراق 🌸',
  showAnnouncement: true,
  showPharmacistBanner: true,
  pharmacistCtaTitle: 'استشر الصيدلي مجاناً 🩺',
  pharmacistCtaDesc: 'تحدثي مع الصيدلي المختص مباشرة للحصول على تشخيص دقيق لروتينك وروشتتك',
  socialWhatsapp: '9647813703288',
  socialTelegram: 'https://t.me/cottanpharmacy',
  socialInstagram: 'https://instagram.com/cottanpharmacy',
  socialPhone: '07813703288',
  deliveryFeeStandard: 4000,
  deliveryFeeExpress: 8000,
  heroMainTitle: 'صيدلية القطن',
  heroSubTitle: 'نحن هنا لتحسين بشرتك',
  heroDescTitle: 'منتجات أصلية لعناية صحية وجمال طبيعي',
  promoCards: [
    { title: 'عرض خاص من دوف', desc: 'عناية ناعمة وترطيب عميق لبشرتك', discount: 'خصم حتى 25%', img: '' },
    { title: 'عروض السيرومات العلاجية', desc: 'تغذية وإشراقة طبيعية لمظهر صحي', discount: 'خصم حتى 30%', img: '' }
  ]
};

function fmtPrice(n) { return (Number(n) || 0).toLocaleString('en-US') + ' د.ع'; }
function findProduct(id) { return products.find(p => String(p.id) === String(id)); }
function starIcon() { return `<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/></svg>`; }
function saveLocalState() {
  localStorage.setItem('qutn_cart', JSON.stringify(cart));
  localStorage.setItem('qutn_wishlist', JSON.stringify([...wishlist]));
  localStorage.setItem('qutn_my_orders', JSON.stringify(myOrders));
  localStorage.setItem('qutn_reviews', JSON.stringify(productReviews));
}

function getBrandColor(brandName) {
  if (brandsData[brandName] && brandsData[brandName].color) return sanitizeText(brandsData[brandName].color);
  return hashColor(brandName || 'Qutn');
}

// ================= DYNAMIC THEME ENGINE =================
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

// ================= PROMO CODES / COUPONS =================
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

  showToast('جاري التحقق من كود الخصم سحابياً...');
  const res = await apiFetch("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code: code.trim(), subtotal })
  });

  if (res && res.valid) {
    appliedPromo = { code: res.code, discountAmount: res.discountAmount };
    showToast(res.message || 'تم تطبيق الخصم بنجاح! 🎉');
    renderCart();
    renderCheckoutSummary();
  } else {
    appliedPromo = null;
    showToast((res && res.message) || 'كود الخصم غير صالح أو منتهي الصلاحية ❌');
    renderCart();
    renderCheckoutSummary();
  }
}

function removePromoCode() {
  appliedPromo = null;
  showToast('تم إلغاء كود الخصم');
  renderCart();
  renderCheckoutSummary();
}

async function fetchAdminCoupons() {
  const res = await apiFetch("/api/admin/coupons");
  if (res && res.coupons) {
    renderAdminCouponsList(res.coupons);
  }
}

function renderAdminCouponsList(coupons) {
  const container = document.getElementById('adminCouponsListGrid');
  if (!container) return;
  if (coupons.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:16px 0;">لا توجد أكواد خصم مسجلة حالياً.</div>`;
    return;
  }
  container.innerHTML = coupons.map(c => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:900; font-size:14px; color:var(--rose-deep); font-family:monospace;">
          ${sanitizeText(c.code)} 
          <span class="log-badge">${c.type === 'percentage' ? c.value + '%' : fmtPrice(c.value)}</span>
          ${c.active ? '<span style="color:#16A34A; font-size:11px; font-weight:800; margin-inline-start:6px;">● نشط</span>' : '<span style="color:#DC2626; font-size:11px; font-weight:800; margin-inline-start:6px;">● متوقف</span>'}
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">
          الاستخدام: ${c.usedCount || 0}/${c.maxUses || '∞'} · الحد الأدنى: ${fmtPrice(c.minSpend || 0)} · الانتهاء: ${c.expiry || 'دائم'}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="deleteAdminCoupon('${sanitizeText(c.id)}')" style="background:#FEE2E2; color:var(--red); padding:6px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

async function handleAdminCouponSave(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('saveCoupon', 1500)) return;

  const payload = {
    code: document.getElementById('couponCodeInput').value.trim().toUpperCase(),
    type: document.getElementById('couponTypeSelect').value,
    value: Number(document.getElementById('couponValueInput').value),
    minSpend: Number(document.getElementById('couponMinSpendInput').value || 0),
    maxUses: Number(document.getElementById('couponMaxUsesInput').value || 100),
    expiry: document.getElementById('couponExpiryInput').value,
    active: document.getElementById('couponActiveCheck').checked
  };

  const res = await apiFetch("/api/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
  if (res && res.success) {
    showToast('تم حفظ كود الخصم وتفعيله سحابياً بنجاح! 🎉');
    document.getElementById('couponCodeInput').value = '';
    document.getElementById('couponValueInput').value = '';
    fetchAdminCoupons();
  } else {
    showToast((res && res.message) || 'حدث خطأ أثناء حفظ الكوبون');
  }
}

async function deleteAdminCoupon(id) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا الكوبون نهائياً؟')) {
    await apiFetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    fetchAdminCoupons();
    showToast('تم حذف الكوبون بنجاح ✓');
  }
}

// ================= TELEGRAM BOT NOTIFICATIONS =================
async function handleSaveTelegramSettings(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  const botToken = document.getElementById('teleBotTokenInput').value.trim();
  const chatId = document.getElementById('teleChatIdInput').value.trim();

  await apiFetch("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({ telegramConfig: { botToken, chatId, enabled: true } })
  });
  showToast('تم حفظ إعدادات التلغرام بنجاح ✓');
}

async function testTelegramBotNotification() {
  if (!assertAdmin()) return;
  const botToken = document.getElementById('teleBotTokenInput').value.trim();
  const chatId = document.getElementById('teleChatIdInput').value.trim();

  if (!botToken || !chatId) {
    showToast('يرجى إدخال Bot Token و Chat ID أولاً');
    return;
  }

  showToast('جاري إرسال إشعار تجريبي إلى التلغرام...');
  const res = await apiFetch("/api/admin/telegram/test", {
    method: "POST",
    body: JSON.stringify({ botToken, chatId })
  });

  if (res && res.success) {
    showToast(res.message);
  } else {
    showToast((res && res.message) || 'تعذر إرسال الإشعار، تحققي من صحة التوكن ورقم الشات');
  }
}

// ================= AUDIT LOGS & SECURITY =================
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

async function handleSaveSecuritySettings(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  const maxOrdersPerHour = Number(document.getElementById('secMaxOrdersHour').value);
  const maxRequestsPerMin = Number(document.getElementById('secMaxReqsMin').value);

  await apiFetch("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({ rateLimits: { maxOrdersPerHour, maxRequestsPerMin } })
  });
  showToast('تم حفظ سياسات الحماية بنجاح ✓');
}

// ================= REAL DYNAMIC ANALYTICS =================
async function recordRealVisit() {
  const today = new Date().toISOString().split('T')[0];
  const visitKey = 'visited_' + today;
  
  try {
    if (!sessionStorage.getItem(visitKey)) {
      sessionStorage.setItem(visitKey, '1');
      await apiFetch("/api/analytics/visit", { method: "POST" });
      if (db) {
        await db.collection('analytics_daily').doc(today).set({
          visits: firebase.firestore.FieldValue.increment(1),
          date: today
        }, { merge: true });
      }
    }
    fetchRealAnalytics();
  } catch (e) { console.warn("Analytics visit error:", e); }
}

async function fetchRealAnalytics() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    let dRev = 0;
    let mRev = 0;

    const ordersSnap = await db.collection('orders').get();
    totalOrdersCount = Math.max(ordersSnap.size, myOrders.length);

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const oTotal = Number(o.total || o.verifiedTotal || 0);
      const oDate = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.date || '');
      if (oDate.startsWith(todayStr)) dRev += oTotal;
      if (oDate.startsWith(currentMonthStr)) mRev += oTotal;
    });

    myOrders.forEach(o => {
      const oTotal = Number(o.total || 0);
      if (o.date && o.date.includes(todayStr)) dRev = Math.max(dRev, oTotal);
      if (o.date && o.date.includes(currentMonthStr)) mRev = Math.max(mRev, oTotal);
    });

    todayRevenue = dRev;
    monthlyRevenue = mRev;

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }
    
    const visitsSnap = await db.collection('analytics_daily').get();
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
  } catch (e) { console.warn("Error fetching analytics:", e); }
}

function renderRealAnalyticsView() {
  const statDailyRev = document.getElementById('statDailyRevenue');
  const statMonthlyRev = document.getElementById('statMonthlyRevenue');
  const statVisits = document.getElementById('statDailyVisits');
  const statOrders = document.getElementById('statTotalOrdersV');

  if (statDailyRev) statDailyRev.textContent = fmtPrice(todayRevenue);
  if (statMonthlyRev) statMonthlyRev.textContent = fmtPrice(monthlyRevenue);
  if (statVisits) statVisits.textContent = todayVisitsCount;
  if (statOrders) statOrders.textContent = totalOrdersCount;

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
    const topOrdered = [...products].filter(p => (p.orderCount || 0) > 0).sort((a,b) => (b.orderCount || 0) - (a.orderCount || 0)).slice(0, 5);
    if (topOrdered.length === 0) {
      topOrdersEl.innerHTML = `<div class="no-results" style="padding:20px 0;">لا توجد طلبات مسجلة حتى الآن.</div>`;
    } else {
      topOrdersEl.innerHTML = topOrdered.map((p, idx) => `
        <div class="admin-rank-item">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="admin-rank-badge">${idx + 1}</span>
            <span style="font-weight:700;">${sanitizeText(p.name)} (${sanitizeText(p.brand)})</span>
          </div>
          <span class="mono" style="font-weight:800; color:var(--accent);">${p.orderCount} طلب شراء</span>
        </div>`).join('');
    }
  }

  const topViewsEl = document.getElementById('adminTopViewedList');
  if (topViewsEl) {
    const topViewed = [...products].filter(p => (p.views || 0) > 0).sort((a,b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    if (topViewed.length === 0) {
      topViewsEl.innerHTML = `<div class="no-results" style="padding:20px 0;">لا توجد مشاهدات مسجلة اليوم بعد.</div>`;
    } else {
      topViewsEl.innerHTML = topViewed.map((p, idx) => `
        <div class="admin-rank-item">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="admin-rank-badge">${idx + 1}</span>
            <span style="font-weight:700;">${sanitizeText(p.name)}</span>
          </div>
          <span class="mono" style="font-weight:800; color:#4B5563;">${p.views} مشاهدة</span>
        </div>`).join('');
    }
  }
}

// ================= IN-APP NOTIFICATIONS =================
function listenToNotifications() {
  if (!isFirebaseConfigured || !db) return;
  db.collection('notifications').orderBy('createdAt', 'desc').limit(20).onSnapshot(snap => {
    notifications = [];
    snap.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
    renderNotifications();
  }, err => console.warn("Notifications listener error:", err));
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
    if (notifications.length === 0) {
      listEl.innerHTML = `<div class="no-results" style="padding:30px 0;">لا توجد إشعارات جديدة حالياً 🌸</div>`;
    } else {
      listEl.innerHTML = notifications.map(n => {
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
  localStorage.setItem('qutn_read_notifs', JSON.stringify([...readNotifs]));
  renderNotifications();
}

function closeNotifModal() { 
  const modal = document.getElementById('notifModal');
  if (modal) modal.classList.remove('open'); 
}

async function handleSendBroadcastNotification(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('sendBroadcastNotif', 2000)) return;

  const title = document.getElementById('notifTitleInput').value.trim();
  const body = document.getElementById('notifBodyInput').value.trim();
  const type = document.getElementById('notifTypeInput').value;

  if (!title || !body) {
    showToast('يرجى تعبئة عنوان ونص الإشعار بالكامل');
    return;
  }

  try {
    await apiFetch("/api/admin/notifications", {
      method: "POST",
      body: JSON.stringify({ title, body, type })
    });
    if (db) {
      await db.collection('notifications').add({
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
    console.error(err);
    showToast('حدث خطأ أثناء إرسال الإشعار');
  }
}

async function deleteNotification(id) {
  if (!assertAdmin()) return;
  if (confirm('حذف هذا الإشعار نهائياً؟')) {
    await apiFetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    if (db) await db.collection('notifications').doc(String(id)).delete();
    showToast('تم حذف الإشعار بنجاح ✓');
  }
}

// ================= CATEGORIES MANAGEMENT =================
function renderModernCategories() {
  const container = document.getElementById('catRowFull');
  const totalCountEl = document.getElementById('categoriesTotalCount');
  if (totalCountEl) totalCountEl.textContent = `${categories.length} أقسام معتمدة`;
  if (!container) return;

  container.innerHTML = categories.map(c => {
    const count = products.filter(p => p.category === c.id).length;
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

  const catSelect = document.getElementById('adminProdCat');
  if (catSelect) {
    catSelect.innerHTML = categories.map(c => `<option value="${sanitizeText(c.id)}">${sanitizeText(c.label)}</option>`).join('');
  }
}

function renderAdminCategoriesList() {
  const container = document.getElementById('adminCategoriesListGrid');
  if (!container) return;
  container.innerHTML = categories.map(c => {
    const count = products.filter(p => p.category === c.id).length;
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
  if (cleanUrl && box && img) { img.src = cleanUrl; box.style.display = 'block'; }
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
  document.getElementById('adminCatFormTitle').textContent = 'إضافة قسم جديد';
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
  if (!assertAdmin()) return;
  if (!lockAction('saveAdminCat', 1200)) return;

  const catKey = document.getElementById('adminCatKeyId').value.trim();
  const id = document.getElementById('adminCatIdInput').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const label = document.getElementById('adminCatLabel').value.trim();
  const imageUrl = sanitizeUrl(document.getElementById('adminCatImgUrl').value.trim());
  const icon = document.getElementById('adminCatIconSelect').value;

  if (!id || !label) {
    showToast('يرجى كتابة اسم القسم والمعرف بشكل صحيح');
    return;
  }

  const payload = { id: catKey || id, label: sanitizeText(label), imageUrl, icon: sanitizeText(icon) };

  try {
    await apiFetch("/api/admin/categories", { method: "POST", body: JSON.stringify(payload) });
    if (db) await db.collection('categories').doc(payload.id).set(payload, { merge: true });
    showToast('تم حفظ القسم بنجاح في قاعدة البيانات ✓');
    resetAdminCatForm();
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء حفظ القسم');
  }
}

async function deleteAdminCategory(catId, catLabel) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف القسم "${catLabel}"؟`)) {
    try {
      await apiFetch(`/api/admin/categories/${catId}`, { method: "DELETE" });
      if (db) await db.collection('categories').doc(String(catId)).delete();
      showToast('تم حذف القسم بنجاح ✓');
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء حذف القسم');
    }
  }
}

// ================= DISCOUNTS, BULK RULES & PROMO CARDS =================
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
    sel.innerHTML = products.map(p => `<option value="${sanitizeText(p.id)}">${sanitizeText(p.name)} (${fmtPrice(p.price)})</option>`).join('');
  }
}

async function handleApplyBulkDiscount(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('bulkDiscount', 2000)) return;

  const scope = document.getElementById('discountScope').value;
  const target = document.getElementById('discountTargetSelect').value;
  const pct = Number(document.getElementById('discountPercentage').value);
  const action = document.getElementById('discountActionType').value;

  if (action === 'apply' && (isNaN(pct) || pct < 1 || pct > 90)) {
    showToast('يرجى إدخال نسبة خصم صحيحة بين 1% و 90%');
    return;
  }

  try {
    await apiFetch("/api/admin/discounts/bulk", {
      method: "POST",
      body: JSON.stringify({ scope, target, percentage: pct, action })
    });
    showToast(action === 'apply' ? `تم تطبيق خصم ${pct}% بنجاح عبر السيرفر ✓` : `تم إلغاء الخصم واسترجاع الأسعار الأصلية ✓`);
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء تطبيق الخصم');
  }
}

function loadPromoCardToEdit(idx) {
  const card = (storeSettings.promoCards && storeSettings.promoCards[idx]) || {};
  if (!document.getElementById('promoCardTitle')) return;
  document.getElementById('promoCardTitle').value = card.title || '';
  document.getElementById('promoCardDesc').value = card.desc || '';
  document.getElementById('promoCardDiscountText').value = card.discount || '';
  document.getElementById('promoCardImgUrl').value = card.img || '';
}

async function handleSavePromoCard(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('savePromoCard', 1200)) return;

  const idx = Number(document.getElementById('promoCardIndex').value);
  if (!storeSettings.promoCards) storeSettings.promoCards = [{}, {}];

  const title = document.getElementById('promoCardTitle').value.trim();
  const desc = document.getElementById('promoCardDesc').value.trim();
  const discount = document.getElementById('promoCardDiscountText').value.trim();
  const img = sanitizeUrl(document.getElementById('promoCardImgUrl').value.trim());

  if (!title || !desc || !discount) {
    showToast('يرجى تعبئة كافة حقول بطاقة العرض');
    return;
  }

  storeSettings.promoCards[idx] = {
    title: sanitizeText(title),
    desc: sanitizeText(desc),
    discount: sanitizeText(discount),
    img: img
  };

  try {
    await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify({ promoCards: storeSettings.promoCards }) });
    if (db) await db.collection('store_settings').doc('general').set({ promoCards: storeSettings.promoCards }, { merge: true });
    renderPromoBanners();
    showToast('تم حفظ بطاقة العرض بنجاح ✓');
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء حفظ البطاقة');
  }
}

function renderPromoBanners() {
  const el = document.getElementById('promoBanners');
  if (!el) return;
  const cards = storeSettings.promoCards || [
    { title: 'عرض خاص من دوف', desc: 'عناية ناعمة وترطيب عميق لبشرتك', discount: 'خصم حتى 25%' },
    { title: 'عروض السيرومات العلاجية', desc: 'تغذية وإشراقة طبيعية لمظهر صحي', discount: 'خصم حتى 30%' }
  ];

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

// ================= BRANDS MANAGEMENT =================
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
  document.getElementById('adminBrandFormTitle').textContent = '🏷️ إضافة ماركة جديدة';
  document.getElementById('adminSaveBrandBtn').textContent = '+ إضافة الماركة للشريط';
  document.getElementById('adminCancelBrandBtn').style.display = 'none';
}

async function handleSaveBrand(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('saveBrand', 1200)) return;

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
    await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify({ brandsData }) });
    if (db) await db.collection('store_settings').doc('general').set({ brandsData }, { merge: true });
    showToast(`تم حفظ وتحديث ماركة "${name}" بنجاح ✓`);
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء حفظ الماركة');
  }
  cancelAdminBrandEdit();
}

async function deleteAdminBrand(brandKey) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف ماركة "${brandKey}" من شريط الماركات؟`)) {
    delete brandsData[brandKey];
    renderAdminBrandsList();
    renderBrandStrip();
    try {
      await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify({ brandsData }) });
      if (db) await db.collection('store_settings').doc('general').set({ brandsData }, { merge: true });
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

// ================= PRODUCT MANAGEMENT & ON-CARD ACTIONS =================
async function quickEditPrice(id, currentPrice) {
  if (!assertAdmin()) return;
  const newPriceStr = prompt('تعديل السعر المباشر (د.ع):', currentPrice);
  if (newPriceStr === null) return;
  const newPrice = Number(newPriceStr.trim());
  if (isNaN(newPrice) || newPrice <= 0) {
    showToast('يرجى إدخال سعر صحيح أكبر من صفر');
    return;
  }
  await apiFetch("/api/admin/products", { method: "POST", body: JSON.stringify({ id, price: newPrice }) });
  if (db) await db.collection('products').doc(String(id)).set({ price: newPrice }, { merge: true });
  showToast('تم تحديث السعر فورياً ✓');
}

async function quickToggleStock(id) {
  if (!assertAdmin()) return;
  const p = findProduct(id);
  if (!p) return;
  const newStock = (p.inStock === false) ? true : false;
  await apiFetch("/api/admin/products", { method: "POST", body: JSON.stringify({ id, inStock: newStock }) });
  if (db) await db.collection('products').doc(String(id)).set({ inStock: newStock }, { merge: true });
  showToast(newStock ? 'تم التعيين: متوفر 🟢' : 'تم التعيين: نفذت الكمية 🔴');
}

function openAdminQuickEditModal(id) {
  if (!assertAdmin()) return;
  const p = findProduct(id);
  if (!p) return;
  document.getElementById('quickEditProdId').value = p.id;
  document.getElementById('quickEditProdName').value = p.name || '';
  document.getElementById('quickEditProdBrand').value = p.brand || '';
  document.getElementById('quickEditProdPrice').value = p.price || '';
  document.getElementById('quickEditProdImg').value = p.imageUrl || '';
  document.getElementById('quickEditProdSkinType').value = p.skinType || 'all';
  document.getElementById('adminQuickEditModal').classList.add('open');
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
  const imageUrl = sanitizeUrl(document.getElementById('quickEditProdImg').value.trim());
  const skinType = document.getElementById('quickEditProdSkinType').value;

  if (!name || !brand || isNaN(price) || price <= 0) {
    showToast('يرجى التأكد من كتابة الاسم والماركة والسعر بشكل صحيح');
    return;
  }

  const updates = { name: sanitizeText(name), brand: sanitizeText(brand), price, imageUrl, skinType };
  await apiFetch("/api/admin/products", { method: "POST", body: JSON.stringify({ id, ...updates }) });
  if (db) await db.collection('products').doc(String(id)).set(updates, { merge: true });
  closeAdminQuickEditModal();
  showToast('تم تحديث المنتج وحفظه سحابياً ✓');
}

function openAdminQuickAddModal() {
  if (!assertAdmin()) return;
  if (window.location.pathname.includes('admin.html')) {
    switchAdminSection('products');
  } else {
    window.location.href = 'admin.html';
  }
}

function previewAdminProdImg(url) {
  const box = document.getElementById('adminProdImgPreviewBox');
  const img = document.getElementById('adminProdImgPreviewEl');
  const cleanUrl = sanitizeUrl(url);
  if (cleanUrl && box && img) { img.src = cleanUrl; box.style.display = 'block'; }
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
  document.getElementById('adminProdImgUrl').value = '';
  document.getElementById('adminProdDesc').value = '';
  document.getElementById('adminProdIng').value = '';
  document.getElementById('adminProdUsage').value = '';
  document.getElementById('adminProdInStock').checked = true;
  document.getElementById('adminProdIsOffer').checked = false;
  document.getElementById('adminProdImgPreviewBox').style.display = 'none';
  document.getElementById('adminFormModeTitleV').textContent = 'إضافة منتج جديد';
  document.getElementById('adminSaveProdBtn').textContent = '💾 حفظ المنتج في قاعدة البيانات';
}

function editProductInAdmin(id) {
  const p = findProduct(id);
  if (!p) return;
  
  if (window.location.pathname.includes('admin.html')) {
    switchAdminSection('products');
  } else {
    window.location.href = 'admin.html';
    return;
  }

  document.getElementById('adminProdDocId').value = p.id;
  document.getElementById('adminProdName').value = p.name || '';
  document.getElementById('adminProdBrand').value = p.brand || '';
  document.getElementById('adminProdCat').value = p.category || (categories[0] ? categories[0].id : 'face');
  document.getElementById('adminProdSkinType').value = p.skinType || 'all';
  document.getElementById('adminProdSize').value = p.size || '';
  document.getElementById('adminProdPrice').value = p.price || '';
  document.getElementById('adminProdOldPrice').value = p.oldPrice || '';
  document.getElementById('adminProdImgUrl').value = p.imageUrl || '';
  document.getElementById('adminProdDesc').value = p.description || '';
  document.getElementById('adminProdIng').value = p.ingredients || '';
  document.getElementById('adminProdUsage').value = p.usage || '';
  document.getElementById('adminProdInStock').checked = (p.inStock !== false);
  document.getElementById('adminProdIsOffer').checked = !!(p.isSpecialOffer || p.oldPrice);

  if (p.imageUrl) previewAdminProdImg(p.imageUrl);
  document.getElementById('adminFormModeTitleV').textContent = 'تعديل المنتج: ' + p.name;
  document.getElementById('adminSaveProdBtn').textContent = '💾 حفظ التعديلات سحابياً';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

async function handleAdminProductSave(e) {
  e.preventDefault();
  if (!assertAdmin()) return;
  if (!lockAction('saveProductAdmin', 1200)) return;

  const docId = document.getElementById('adminProdDocId').value.trim();
  const name = document.getElementById('adminProdName').value.trim();
  const brand = document.getElementById('adminProdBrand').value.trim();
  const price = Number(document.getElementById('adminProdPrice').value);
  const oldPriceVal = document.getElementById('adminProdOldPrice').value.trim();
  const oldPrice = oldPriceVal ? Number(oldPriceVal) : null;

  if (!name || !brand) {
    showToast('يرجى كتابة اسم المنتج والماركة');
    return;
  }
  if (isNaN(price) || price <= 0) {
    showToast('يرجى إدخال سعر صحيح أكبر من صفر');
    return;
  }

  const payload = {
    name: sanitizeText(name),
    brand: sanitizeText(brand),
    category: sanitizeText(document.getElementById('adminProdCat').value),
    skinType: sanitizeText(document.getElementById('adminProdSkinType').value || 'all'),
    size: sanitizeText(document.getElementById('adminProdSize').value.trim() || 'عبوة قياسية'),
    price: price,
    oldPrice: oldPrice,
    imageUrl: sanitizeUrl(document.getElementById('adminProdImgUrl').value.trim()),
    description: sanitizeText(document.getElementById('adminProdDesc').value.trim()),
    ingredients: sanitizeText(document.getElementById('adminProdIng').value.trim()),
    usage: sanitizeText(document.getElementById('adminProdUsage').value.trim()),
    inStock: document.getElementById('adminProdInStock').checked,
    isSpecialOffer: document.getElementById('adminProdIsOffer').checked,
    rating: 4.8,
    reviews: 80,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (docId) {
      payload.id = docId;
      await apiFetch("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
      if (db) await db.collection('products').doc(docId).set(payload, { merge: true });
      showToast('تم حفظ تعديلات المنتج بنجاح ✓');
    } else {
      payload.views = 0;
      payload.orderCount = 0;
      await apiFetch("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
      if (db) await db.collection('products').add(payload);
      showToast('تمت إضافة المنتج الجديد بنجاح ✓');
    }
    resetAdminProductForm();
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء حفظ المنتج');
  }
}

async function deleteProductConfirm(id, name) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف المنتج "${name}" نهائياً من قاعدة البيانات؟`)) {
    await apiFetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (db) await db.collection('products').doc(String(id)).delete();
    showToast('تم حذف المنتج بنجاح ✓');
  }
}

// ================= ADMIN TABS CONTROLLER (FIXED & FULLY MATCHED) =================
function switchAdminSection(sec) {
  // مطابقة الـ 12 قسماً بالكامل لمنع أي أخطاء برمجية
  const sections = ['Stats', 'Orders', 'Coupons', 'Telegram', 'Audit', 'Cats', 'Products', 'Offers', 'Brands', 'Notifs', 'Design', 'Code'];
  
  sections.forEach(k => {
    const btn = document.getElementById('btnTabV' + k);
    const el = document.getElementById('adminSec' + k);
    const isTarget = (k.toLowerCase() === sec.toLowerCase());
    if (btn) btn.classList.toggle('active', isTarget);
    if (el) el.style.display = isTarget ? 'block' : 'none';
  });

  if (sec === 'stats') fetchRealAnalytics();
  if (sec === 'orders') fetchAdminOrdersList();
  if (sec === 'coupons') fetchAdminCoupons();
  if (sec === 'audit') fetchAuditLogs();
  if (sec === 'offers') {
    updateDiscountTargetOptions();
    loadPromoCardToEdit(0);
  }
  if (sec === 'cats') renderAdminCategoriesList();
  if (sec === 'brands') renderAdminBrandsList();
}

// ================= REALTIME ORDERS & EXCEL EXPORT =================
async function fetchAdminOrdersList() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(50).get();
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    renderAdminOrdersList(orders);
  } catch (e) {
    console.warn(e);
  }
}

function renderAdminOrdersList(orders) {
  const container = document.getElementById('adminOrdersManageContainer');
  if (!container) return;
  if (orders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:20px 0;">لا توجد طلبات مسجلة حتى الآن.</div>`;
    return;
  }

  container.innerHTML = orders.map(ord => `
    <div class="admin-order-manage-card">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--line); padding-bottom:8px; margin-bottom:8px;">
        <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
        <select class="admin-order-status-select" onchange="updateOrderStatus('${sanitizeText(ord.id)}', this.value)">
          <option value="قيد المعالجة والتجهيز 🚚" ${ord.status === 'قيد المعالجة والتجهيز 🚚' ? 'selected' : ''}>قيد التجهيز 🚚</option>
          <option value="تم الشحن مع المندوب 🛵" ${ord.status === 'تم الشحن مع المندوب 🛵' ? 'selected' : ''}>تم الشحن مع المندوب 🛵</option>
          <option value="تم التسليم بنجاح ✅" ${ord.status === 'تم التسليم بنجاح ✅' ? 'selected' : ''}>تم التسليم بنجاح ✅</option>
          <option value="طلب ملغي ❌" ${ord.status === 'طلب ملغي ❌' ? 'selected' : ''}>طلب ملغي ❌</option>
        </select>
      </div>
      <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px;">
        الزبون: <b>${sanitizeText(ord.name)}</b> (${sanitizeText(ord.phone)}) · العنوان: ${sanitizeText(ord.address)}
      </div>
      <div style="font-size:12px; color:var(--ink); margin-bottom:6px;">
        ${(ord.items || []).map(it => `• ${sanitizeText(it.name)} × ${it.quantity}`).join('<br>')}
      </div>
      <div style="font-weight:900; font-size:14px; color:var(--rose-deep); text-align:left;">
        الإجمالي: ${fmtPrice(ord.total)}
      </div>
    </div>
  `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  if (!assertAdmin()) return;
  if (db) {
    await db.collection('orders').doc(String(orderId)).set({ status: newStatus }, { merge: true });
    showToast(`تم تحديث حالة الطلب #${orderId} إلى: ${newStatus}`);
  }
}

async function exportOrdersToCSV() {
  if (!assertAdmin()) return;
  showToast('جاري تجهيز وتصدير ملف المبيعات...');
  try {
    const snap = await db.collection('orders').get();
    let csv = "رقم الطلب,التاريخ,اسم العميل,رقم الهاتف,العنوان,طريقة التوصيل,الحالة,المجموع (د.ع)\n";
    snap.forEach(d => {
      const o = d.data();
      csv += `"${o.id}","${o.date || ''}","${o.name || ''}","${o.phone || ''}","${(o.address || '').replace(/"/g, '""')}","${o.deliveryMethod || 'standard'}","${o.status || ''}","${o.total || 0}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_مبيعات_صيدلية_القطن_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('تم تصدير ملف Excel بنجاح! 📊');
  } catch (e) {
    console.error(e);
    showToast('حدث خطأ أثناء تصدير التقرير');
  }
}

// ================= DEEP LINKING & SHARING =================
function shareCurrentProduct() {
  if (!currentProductId) return;
  const p = findProduct(currentProductId);
  const shareUrl = `${window.location.origin}${window.location.pathname}#p=${currentProductId}`;
  
  if (navigator.share) {
    navigator.share({
      title: p ? p.name : 'صيدلية القطن',
      text: `شاهد ${p ? p.name : 'هذا المنتج'} في صيدلية القطن:`,
      url: shareUrl
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('📋 تم نسخ رابط المنتج المباشر بنجاح!');
    });
  }
}

function checkUrlHashForProduct() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#p=')) {
    const pId = hash.replace('#p=', '');
    if (pId && findProduct(pId)) {
      setTimeout(() => openProduct(pId, true), 200);
    }
  }
}

// ================= SKIN-TYPE & CONCERN FILTERS =================
function renderSkinTypeFilters() {
  const strip = document.getElementById('skinTypeFilterStrip');
  if (!strip) return;

  strip.innerHTML = skinTypes.map(st => `
    <button class="skin-filter-chip ${activeSkinFilter === st.id ? 'active' : ''}" onclick="selectSkinFilter('${st.id}')">
      ${st.label}
    </button>
  `).join('');
}

function selectSkinFilter(filterId) {
  activeSkinFilter = filterId;
  renderSkinTypeFilters();
  renderHomeProductGrid();
}

// ================= REVIEWS & CROSS-SELLING =================
function renderCrossSelling(currentP) {
  const grid = document.getElementById('pdSuggestedGrid');
  if (!grid || !currentP) return;

  const suggestions = products
    .filter(p => p.id !== currentP.id && (p.brand === currentP.brand || p.category !== currentP.category))
    .slice(0, 4);

  renderProductGrid('pdSuggestedGrid', suggestions);
}

function renderProductReviews(productId) {
  const container = document.getElementById('pdReviewsContainer');
  if (!container) return;

  const reviews = productReviews[productId] || [
    { author: 'مريم خ.', stars: 5, text: 'منتج أصلي ورائع جداً، لاحظت فرقاً ببشرتي من أول أسبوع!' },
    { author: 'هدى أ.', stars: 5, text: 'توصيل سريع وتغليف ممتاز شكراً صيدلية القطن 🌸' }
  ];

  container.innerHTML = `
    <div class="review-form" style="background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:14px;">
      <h4 style="margin:0 0 8px; font-size:13.5px; font-weight:800;">أضيفي تقييمك وتجربتكِ للمنتج ⭐</h4>
      <form onsubmit="submitProductReview(event)">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" id="reviewAuthorInput" placeholder="اسمكِ الكريم" style="flex:1; padding:8px; border:1px solid var(--line); border-radius:8px;" required>
          <select id="reviewStarsInput" style="flex:0.8; padding:8px; border:1px solid var(--line); border-radius:8px;">
            <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
            <option value="4">⭐⭐⭐⭐ (4/5)</option>
            <option value="3">⭐⭐⭐ (3/5)</option>
          </select>
        </div>
        <textarea id="reviewTextInput" rows="2" placeholder="اكتبي رأيك بكل صراحة..." style="width:100%; padding:8px; border:1px solid var(--line); border-radius:8px;" required></textarea>
        <button type="submit" style="background:var(--accent); color:#fff; font-weight:800; font-size:12px; padding:8px 18px; border-radius:999px; margin-top:6px;">إرسال التقييم</button>
      </form>
    </div>
    <div class="reviews-list">
      ${reviews.map(r => `
        <div class="review-item">
          <div class="review-author">
            <span>${sanitizeText(r.author)}</span>
            <span style="color:var(--gold);">★ ${r.stars}</span>
          </div>
          <div class="review-text">${sanitizeText(r.text)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function submitProductReview(e) {
  e.preventDefault();
  const author = document.getElementById('reviewAuthorInput').value.trim();
  const stars = Number(document.getElementById('reviewStarsInput').value);
  const text = document.getElementById('reviewTextInput').value.trim();

  if (!author || !text || !currentProductId) return;

  if (!productReviews[currentProductId]) productReviews[currentProductId] = [];
  productReviews[currentProductId].unshift({ author: sanitizeText(author), stars, text: sanitizeText(text) });
  saveLocalState();
  renderProductReviews(currentProductId);
  showToast('شكراً لمشاركتكِ تقييمك للمنتج 🌸');
}

// ================= SMART WELCOME DISCOUNT MODAL =================
function checkAndShowWelcomeModal() {
  if (!localStorage.getItem('qutn_welcomed')) {
    setTimeout(() => {
      const m = document.getElementById('welcomeOfferModal');
      if (m) m.classList.add('open');
    }, 2500);
  }
}

function closeWelcomeModal() {
  const m = document.getElementById('welcomeOfferModal');
  if (m) m.classList.remove('open');
  localStorage.setItem('qutn_welcomed', '1');
}

function copyWelcomeCode() {
  navigator.clipboard.writeText('QUTN10').then(() => {
    showToast('تم نسخ كود الخصم (QUTN10) بنجاح!');
  });
}

function applyWelcomeAndShop() {
  closeWelcomeModal();
  showToast('تسوقي الآن واستخدمي كود QUTN10 في السلة ✨');
}

// ================= CUSTOMER VIEW RENDERING =================
function renderCurrentActiveView() {
  if (currentView === 'home') renderHome();
  else if (currentView === 'listing') renderListing();
  else if (currentView === 'categories') renderModernCategories();
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
  renderSkinTypeFilters();
  renderBrandStrip();
  renderHomeProductGrid();
  renderPromoBanners();
}

let homeActiveBrand = 'all';
function renderHomeProductGrid() {
  const title = document.getElementById('homeGridTitle');
  if (!title) return;
  
  let list = products.slice();
  
  // تصفية حسب نوع البشرة
  if (activeSkinFilter !== 'all') {
    list = list.filter(p => p.skinType === activeSkinFilter || p.skinType === 'all');
  }

  // تصفية حسب الماركة
  if (homeActiveBrand === 'all') {
    title.textContent = 'الأكثر مبيعاً 🔥';
    list = list.sort((a,b) => (b.orderCount || 0) - (a.orderCount || 0));
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
    <div class="brand-chip all-chip ${homeActiveBrand === 'all' ? 'active' : ''}" onclick="selectHomeBrand('all')">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      <span>الكل</span>
    </div>`;
    
  strip.innerHTML = allChip + brandKeys.map(k => {
    const b = brandsData[k];
    const isActive = homeActiveBrand === k;
    const cleanLogo = sanitizeUrl(b.logoUrl);
    return `
      <div class="brand-chip ${isActive ? 'active' : ''}" onclick="selectHomeBrand('${sanitizeText(k)}')">
        ${cleanLogo ? `<img class="brand-chip-img" src="${cleanLogo}" alt="${sanitizeText(b.name || k)}">` : `<span class="brand-chip-dot" style="background:${sanitizeText(b.color)};"></span>`}
        <span>${sanitizeText(b.name || k)}</span>
      </div>`;
  }).join('');
}

function renderOffers() {
  const discounted = products.filter(p => p.oldPrice || p.isSpecialOffer);
  const countEl = document.getElementById('offersCount');
  if (countEl) countEl.textContent = discounted.length + ' عرض';
  renderProductGrid('offersGrid', discounted);
}

function renderWishlist() {
  const list = products.filter(p => wishlist.has(p.id));
  renderProductGrid('wishlistGrid', list, 'قائمتك المفضلة فارغة حالياً 🌸');
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
    const isStep1Done = true;
    const isStep2Done = ord.status && ord.status.includes('الشحن');
    const isStep3Done = ord.status && ord.status.includes('التسليم');

    return `
      <div class="order-card">
        <div class="order-card-header">
          <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
          <span class="order-card-status">${sanitizeText(ord.status || 'قيد المعالجة والتجهيز 🚚')}</span>
        </div>
        
        <!-- Timeline Tracker -->
        <div class="order-tracker-timeline">
          <div class="order-step ${isStep1Done ? 'done' : ''}">
            <div class="order-step-dot">1</div>
            <span>تم الطلب</span>
          </div>
          <div class="order-step ${isStep2Done ? 'done active' : (isStep1Done ? 'active' : '')}">
            <div class="order-step-dot">2</div>
            <span>خرج للتوصيل</span>
          </div>
          <div class="order-step ${isStep3Done ? 'done' : ''}">
            <div class="order-step-dot">3</div>
            <span>تم التسليم</span>
          </div>
        </div>

        <div style="font-size:11.5px; color:var(--text-soft); margin-bottom:8px;">
          التاريخ: <span class="mono">${sanitizeText(ord.date)}</span> · العنوان: ${sanitizeText(ord.address)}
        </div>
        <div style="background:var(--surface); border-radius:10px; padding:10px; margin-bottom:8px;">
          ${(ord.items || []).map(it => `
            <div class="order-item-row">
              <span>• ${sanitizeText(it.name)} × ${it.quantity}</span>
              <span class="mono">${fmtPrice(it.price * it.quantity)}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-card-footer">
          <span>المجموع الكلي:</span>
          <span class="mono" style="color:var(--rose-deep); font-size:16px;">${fmtPrice(ord.total)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderProductGrid(targetId, list, emptyMsg) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="no-results">${sanitizeText(emptyMsg) || 'لا توجد منتجات مطابقة حالياً.'}</div>`;
    return;
  }
  
  const isAdmin = isCurrentUserAdmin();

  el.innerHTML = list.map(p => {
    const color = getBrandColor(p.brand);
    const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
    const isWished = wishlist.has(p.id);
    const inStock = (p.inStock !== false);
    const cleanImg = sanitizeUrl(p.imageUrl);

    return `
      <div class="product-card" onclick="openProduct('${sanitizeText(p.id)}', true)">
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${sanitizeText(p.id)}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
        </button>
        ${discountPct ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
        ${!inStock ? `<span class="discount-badge" style="background:#EF4444; left:auto; right:12px; top:48px;">نفذت الكمية</span>` : ''}
        
        <div class="product-thumb" style="background:${color}18;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(p.name)}" loading="lazy">` : (icons[p.type] || icons.bottle)(color)}
        </div>
        <div class="p-rating">${starIcon()} ${p.rating || 4.8} (${p.reviews || 80})</div>
        <div class="p-name">${sanitizeText(p.name)}</div>
        <div class="p-size">${sanitizeText(p.size || '')}</div>
        <div class="p-price-row">
          <span class="p-price mono">${fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono">${fmtPrice(p.oldPrice)}</span>` : ''}
        </div>
        <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${sanitizeText(p.id)}')">
          ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
        </button>

        ${isAdmin ? `
          <div class="admin-card-actions" onclick="event.stopPropagation()">
            <button class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${sanitizeText(p.id)}')">${inStock ? 'متوفر 🟢' : 'نفذت 🔴'}</button>
            <button class="btn-admin-price" onclick="quickEditPrice('${sanitizeText(p.id)}', ${p.price})">السعر 💰</button>
            <button class="btn-admin-edit" onclick="openAdminQuickEditModal('${sanitizeText(p.id)}')">تعديل ✏️</button>
            <button class="btn-admin-del" onclick="deleteProductConfirm('${sanitizeText(p.id)}', '${sanitizeText(p.name)}')">🗑️</button>
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
  document.getElementById('pdRating').innerHTML = `${starIcon()} ${p.rating || 4.8} (${p.reviews || 80} تقييم)`;

  const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
  document.getElementById('pdPriceRow').innerHTML = `
    <span class="pd-price mono">${fmtPrice(p.price)}</span>
    ${p.oldPrice ? `<span class="pd-oldprice mono">${fmtPrice(p.oldPrice)}</span><span class="pd-discount">خصم ${discountPct}%</span>` : ''}`;

  const stockEl = document.getElementById('pdStock');
  const inStock = (p.inStock !== false);
  stockEl.className = inStock ? 'pd-stock' : 'pd-stock out';
  stockEl.innerHTML = inStock ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;"><path d="M5 13l4 4L19 7"/></svg><span>متوفر بالمخزون</span>` : `<span>نفذت الكمية حالياً</span>`;

  document.getElementById('pdTabDesc').textContent = p.description || 'منتج أصلي معتمد من صيدلية القطن.';
  document.getElementById('pdTabIng').textContent = p.ingredients || 'تركيبة غنية ومفحوصة جلدياً.';
  document.getElementById('pdTabUse').textContent = p.usage || 'يُوضع على بشرة نظيفة وفق الإرشادات.';
  
  // تفعيل التقييمات والمنتجات المقترحة
  renderProductReviews(p.id);
  renderCrossSelling(p);

  switchPdTab('desc');
  document.getElementById('pdQtyVal').textContent = pdQty;

  document.getElementById('pdAddBtn').onclick = () => {
    if (inStock) addToCart(p.id, false, pdQty);
    else showToast('عذراً، المنتج غير متوفر حالياً');
  };
}

// ================= دالة فتح تفاصيل المنتج مع حفظ موضع التمرير =================
function openProduct(id, isUserClick = false) {
  if (isUserClick) {
    previousViewBeforeProduct = (currentView !== 'product') ? currentView : 'home';
    previousScrollBeforeProduct = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  currentProductId = id;
  pdQty = 1;
  const p = findProduct(id);
  if (!p) return;

  if (isUserClick) {
    apiFetch(`/api/products/${id}/view`, { method: "POST" }).catch(() => {});
    if (db) {
      db.collection('products').doc(String(id)).set({
        views: firebase.firestore.FieldValue.increment(1)
      }, { merge: true }).catch(e => console.warn(e));
    }
  }

  renderProductDetailDOM(p);

  if (isUserClick) {
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
}

// ================= دالة الرجوع من المنتج (العودة لنفس المكان السابق بدون وميض) =================
function goBackFromProduct() {
  const targetView = previousViewBeforeProduct || 'home';
  const targetScroll = previousScrollBeforeProduct || 0;
  
  document.documentElement.style.scrollBehavior = 'auto';

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetEl = document.getElementById('view-' + targetView);
  if (targetEl) targetEl.classList.add('active');
  currentView = targetView;

  ['home', 'wishlist', 'categories', 'orders', 'cart', 'account', 'admin'].forEach(k => {
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

// ================= CART & CHECKOUT =================
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
    const p = findProduct(id);
    return sum + (p ? p.price * cart[id] : 0);
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
    const p = findProduct(id);
    if (!p) return '';
    const qty = cart[id];
    const color = getBrandColor(p.brand);
    const cleanImg = sanitizeUrl(p.imageUrl);
    return `
      <div class="cart-item">
        <div class="thumb" style="background:${color}18;">
          ${cleanImg ? `<img src="${cleanImg}">` : (icons[p.type] || icons.bottle)(color)}
        </div>
        <div class="info">
          <div class="name">${sanitizeText(p.name)}</div>
          <div class="brand">${sanitizeText(p.brand || '')} · ${sanitizeText(p.size || '')}</div>
          <div class="cart-qty-row">
            <button class="cart-qty-btn" onclick="changeCartQty('${sanitizeText(p.id)}', -1)">−</button>
            <span class="cart-qty-val mono">${qty}</span>
            <button class="cart-qty-btn" onclick="changeCartQty('${sanitizeText(p.id)}', 1)">+</button>
            <span class="cart-remove" onclick="removeCartItem('${sanitizeText(p.id)}')">حذف</span>
          </div>
        </div>
        <span class="p-price mono">${fmtPrice(p.price * qty)}</span>
      </div>`;
  }).join('');

  const subtotal = getCartSubtotal();
  const discount = appliedPromo ? appliedPromo.discountAmount : 0;
  const fee = (deliveryMethod === 'express') ? (storeSettings.deliveryFeeExpress || 8000) : (storeSettings.deliveryFeeStandard || 4000);
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  if (appliedPromo && promoBadge) {
    promoBadge.style.display = 'flex';
    promoBadge.className = 'applied-promo-tag';
    promoBadge.innerHTML = `<span>🎟️ تم تفعيل كود الخصم: <b>${appliedPromo.code}</b> (-${fmtPrice(discount)})</span><button type="button" onclick="removePromoCode()" style="color:#DC2626; font-weight:900; background:none;">✕</button>`;
  } else if (promoBadge) {
    promoBadge.style.display = 'none';
  }

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row" style="color:#16A34A; font-weight:800;"><span>خصم الكوبون</span><span class="mono">-${fmtPrice(discount)}</span></div>` : ''}
    <div class="summary-row"><span>رسوم التوصيل</span><span class="mono">${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>الإجمالي</span><span class="mono">${fmtPrice(finalTotal)}</span></div>
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
  const discount = appliedPromo ? appliedPromo.discountAmount : 0;
  const fee = (deliveryMethod === 'express') ? (storeSettings.deliveryFeeExpress || 8000) : (storeSettings.deliveryFeeStandard || 4000);
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row" style="color:#16A34A; font-weight:800;"><span>خصم الكوبون (${appliedPromo.code})</span><span class="mono">-${fmtPrice(discount)}</span></div>` : ''}
    <div class="summary-row"><span>رسوم التوصيل</span><span class="mono">${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>الإجمالي</span><span class="mono">${fmtPrice(finalTotal)}</span></div>`;
}

// ================= CONFIRM ORDER (TELEGRAM & WHATSAPP) =================
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
    confirmBtn.textContent = 'جاري تأكيد الطلب...';
  }

  const itemsPayload = ids.map(id => ({ id, quantity: cart[id] }));

  try {
    const response = await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        deliveryMethod,
        items: itemsPayload,
        promoCode: appliedPromo ? appliedPromo.code : null
      })
    });

    let grandTotal = getCartSubtotal() - (appliedPromo ? appliedPromo.discountAmount : 0) + (deliveryMethod === 'express' ? (storeSettings.deliveryFeeExpress || 8000) : (storeSettings.deliveryFeeStandard || 4000));
    let orderId = "QUTN-" + Math.floor(100000 + Math.random() * 900000);

    if (response && response.success) {
      grandTotal = response.verifiedTotal;
      orderId = response.orderId;
    }

    const itemObjects = ids.map(id => {
      const p = findProduct(id);
      return p ? { id: p.id, name: sanitizeText(p.name), brand: sanitizeText(p.brand), size: sanitizeText(p.size), price: p.price, quantity: cart[id] } : null;
    }).filter(Boolean);

    const newOrderObj = {
      id: orderId,
      date: new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      name,
      phone,
      address,
      deliveryMethod,
      items: itemObjects,
      total: grandTotal,
      status: 'قيد المعالجة والتجهيز 🚚'
    };
    myOrders.unshift(newOrderObj);

    if (db) {
      db.collection('orders').doc(orderId).set({
        ...newOrderObj,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.warn(e));
    }

    const lines = itemObjects.map(item => `${item.name} × ${item.quantity}`);
    const deliveryLabel = deliveryMethod === 'express' ? `سريع (${fmtPrice(storeSettings.deliveryFeeExpress || 8000)})` : `عادي (${fmtPrice(storeSettings.deliveryFeeStandard || 4000)})`;
    const promoInfo = appliedPromo ? `كود الخصم: ${appliedPromo.code} (-${fmtPrice(appliedPromo.discountAmount)})\n` : '';
    const msg = encodeURIComponent(`*طلب جديد - صيدلية القطن* 🌸\nرقم الطلب: #${orderId}\n\nالاسم: ${name}\nالهاتف: ${phone}\nالعنوان: ${address}\nالتوصيل: ${deliveryLabel}\n${promoInfo}\nالمنتجات المطلوبة:\n${lines.join('\n')}\n\nالإجمالي النهائي: ${fmtPrice(grandTotal)}`);

    cart = {};
    appliedPromo = null;
    updateCartBadge();
    saveLocalState();

    const targetPhone = storeSettings.socialWhatsapp || WHATSAPP_NUMBER;
    window.open(`https://wa.me/${targetPhone}?text=${msg}`, '_blank');

    const modalMsg = document.getElementById('successModalMsg');
    if (modalMsg) {
      modalMsg.textContent = `تم تسجيل طلبكِ رقم (#${orderId}) بنجاح بقيمة ${fmtPrice(grandTotal)}. جاري تجهيز الطلب للتوصيل إلى: ${address}.`;
    }
    const successModal = document.getElementById('orderSuccessModal');
    if (successModal) successModal.classList.add('open');

  } catch (err) {
    console.error(err);
    showToast('تعذر إرسال الطلب، يرجى المحاولة لاحقاً');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'تأكيد الطلب';
    }
  }
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

// ================= NAVIGATION =================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  currentView = name;
  closeMenu();
  window.scrollTo({top: 0, behavior: 'instant'});

  ['home', 'wishlist', 'categories', 'orders', 'cart', 'account', 'admin'].forEach(k => {
    const el = document.getElementById('bn-' + k);
    if (el) el.classList.toggle('active', name === k);
  });

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
  const targetNumber = storeSettings.socialWhatsapp || WHATSAPP_NUMBER || "9647813703288";
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
    bestsellers: 'الأكثر مبيعاً 🔥'
  };
  titleEl.textContent = titles[listingMode] || 'المنتجات';

  let list = products.slice();
  if (listingMode === 'category') {
    list = list.filter(p => p.category === listingValue);
  } else if (listingMode === 'search') {
    const t = listingValue.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(t) || (p.brand && p.brand.toLowerCase().includes(t)));
  } else if (listingMode === 'bestsellers') {
    list = list.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
}

// ================= ACCOUNT & AUTH =================
function updateUserHeaderProfile() {
  const chipAvatar = document.getElementById('userChipAvatar');
  const chipName = document.getElementById('userChipName');
  const logoutBtn = document.getElementById('userHeaderLogoutBtn');
  const bnAccountLbl = document.getElementById('bnAccountLbl');

  if (currentUser) {
    const rawName = currentUser.displayName || currentUser.email || 'حسابي';
    const firstName = sanitizeText(rawName.split(' ')[0].split('@')[0]);
    if (chipName) chipName.textContent = firstName;
    if (bnAccountLbl) bnAccountLbl.textContent = firstName;
    if (logoutBtn) logoutBtn.style.display = 'flex';
    const cleanPhoto = sanitizeUrl(currentUser.photoURL);
    if (chipAvatar) {
      chipAvatar.innerHTML = cleanPhoto 
        ? `<img src="${cleanPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : `<span style="font-size:12px; font-weight:900; color:var(--accent, #E85D8A);">${firstName.charAt(0).toUpperCase()}</span>`;
    }
  } else {
    if (chipName) chipName.textContent = 'دخول';
    if (bnAccountLbl) bnAccountLbl.textContent = 'حسابي';
    if (logoutBtn) logoutBtn.style.display = 'none';
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
            <h3>${sanitizeText(currentUser.displayName || currentUser.email)} ${isAdmin ? '⭐ (مشرف المتجر)' : ''}</h3>
            <p>${sanitizeText(currentUser.email || '')}</p>
            <div class="sync-indicator"><span class="sync-dot"></span><span>البيانات متزامنة سحابياً</span></div>
          </div>
        </div>
        ${isAdmin ? `<a class="auth-btn-google" style="margin-bottom:10px; background:#FEF3C7; color:#92400E; font-weight:800; display:flex;" href="admin.html">⚙️ لوحة تحكم وإدارة المتجر</a>` : ''}
        <button class="auth-btn-google" style="margin-bottom:10px;" onclick="showView('orders')">📦 عرض طلباتي وتتبع الشحن</button>
        <button class="auth-btn-logout" onclick="handleSignOut()">تسجيل الخروج</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="account-card">
        <div style="font-size:38px; margin-bottom:8px;">🌸</div>
        <h3 style="font-size:17px; font-weight:900; margin:0 0 6px;">مرحباً بك في صيدلية القطن</h3>
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
    const modal = document.getElementById('iabModal');
    if (modal) modal.classList.add('open');
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  auth.signInWithPopup(provider)
    .then(res => {
      if (res && res.user) {
        currentUser = res.user;
        showToast(`أهلاً بكِ ${sanitizeText(currentUser.displayName || '')} 🌸`);
        updateUserHeaderProfile();
        renderAccountView();
        updateAdminInterfaceState();
      }
    })
    .catch(e => {
      console.error("Google Auth Error:", e);
      if (e.code === 'auth/unauthorized-domain') {
        showToast('⚠️ يرجى إضافة دومين الموقع في قائمة Authorized Domains في Firebase');
      } else if (e.code !== 'auth/popup-closed-by-user') {
        showToast('تعذر تسجيل الدخول (' + (e.code || 'يرجى المحاولة مجدداً') + ')');
      }
    });
}

async function handleSignOut() {
  if (auth) await auth.signOut();
  currentUser = null;
  updateUserHeaderProfile();
  renderAccountView();
  updateAdminInterfaceState();
  showToast('تم تسجيل الخروج بنجاح');
}

if (isFirebaseConfigured && auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    updateAdminInterfaceState();
    updateUserHeaderProfile();
    renderAccountView();
  });
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
    if (isAdmin) {
      adminGate.classList.remove('locked');
    } else {
      adminGate.classList.add('locked');
    }
  }
}

// ================= CONSULTATION MODAL =================
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

  const targetPhone = storeSettings.socialWhatsapp || WHATSAPP_NUMBER || "9647813703288";
  const msg = encodeURIComponent(`🩺 *استشارة صيدلانية - صيدلية القطن:*\nالاسم: ${name}\nالعمر: ${age}\nالحالة: ${cond}\nالاستفسار: ${desc}`);
  window.open(`https://wa.me/${targetPhone}?text=${msg}`, '_blank');
  closeConsultModal();
}

function copyFullSourceCode() {
  navigator.clipboard.writeText('<!DOCTYPE html>\n' + document.documentElement.outerHTML)
    .then(() => showToast('📋 تم نسخ كود الصفحة بالكامل!'))
    .catch(() => showToast('تعذر النسخ التلقائي'));
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

// ================= INITIALIZATION & BOOTSTRAP =================
window.addEventListener('DOMContentLoaded', () => {
  renderHome();
  renderModernCategories();
  updateCartBadge();
  renderAccountView();
  updateUserHeaderProfile();
  initFirestoreSync();
  checkAndShowWelcomeModal();
  checkUrlHashForProduct();

  // تفعيل التتبع المباشر للروابط (Deep Linking)
  window.addEventListener('hashchange', checkUrlHashForProduct);

  // تهيئة لوحة التحكم عند فتح صفحة admin.html
  if (window.location.pathname.includes('admin.html')) {
    fetchRealAnalytics();
    fetchAdminOrdersList();
    fetchAdminCoupons();
    fetchAuditLogs();
    renderAdminCategoriesList();
    renderAdminBrandsList();
  }
});
