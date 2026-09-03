/* ==========================================================
   SaaS Multi-Tenant Engine — js/state.js
   Version: 4.4.0 (Crash-Safe State & Protected Storage)
   ========================================================== */

import { currentPharmacyId } from './config.js';
import { sanitizeText } from './security.js';

export const getStorageKey = (key) => `saas_${currentPharmacyId}_${key}`;

// 🛡️ دالة قراءة آمنة تمنع انهيار المتصفح لو كانت الذاكرة بها قيم تالفة
function safeJSONParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined' || raw === '[object Object]' || raw === 'null') {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch (e) {
    console.warn(`Safe Storage Reset for ${key}:`, e);
    return fallback;
  }
}

export let currentUser = null;
export let currentStaffData = null;

export function setCurrentUser(u) { currentUser = u; }
export function setCurrentStaffData(s) { currentStaffData = s; }

export let brandsData = {
  'Cerave': { name: 'Cerave', color: '#5FAE6E', logoUrl: '' },
  'Simple': { name: 'Simple', color: '#C97F79', logoUrl: '' },
  'REVUELE': { name: 'REVUELE', color: '#D9A441', logoUrl: '' },
  'COSMO': { name: 'COSMO', color: '#B7A233', logoUrl: '' }
};

export let categories = [];
export let products = [];
export let archivedProducts = [];
export let bundles = [];
export let notifications = [];
export let staffMembers = [];

export let cart = safeJSONParse(getStorageKey('cart'), {});
export let wishlist = new Set(safeJSONParse(getStorageKey('wishlist'), []));
export let readNotifs = new Set(safeJSONParse(getStorageKey('read_notifs'), []));
export let myOrders = safeJSONParse(getStorageKey('my_orders'), []);

export let currentView = 'home';
export let listingMode = null, listingValue = null, listingCatActive = 'all';
export let currentProductId = null, pdQty = 1, pdActiveTab = 'desc', deliveryMethod = 'standard';
export let appliedPromo = null;
export let isLowStockFilterActive = false;

export let previousViewBeforeProduct = 'home';
export let previousScrollBeforeProduct = 0;

export let pharmacyProfile = {
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

export function setPharmacyProfile(newProfile) {
  pharmacyProfile = { ...pharmacyProfile, ...newProfile };
}

export function setProducts(newProds) { products = newProds; }
export function setCategories(newCats) { categories = newCats; }
export function setBundles(newBundles) { bundles = newBundles; }
export function setArchivedProducts(newArchived) { archivedProducts = newArchived; }
export function setNotifications(newNotifs) { notifications = newNotifs; }
export function setStaffMembers(newStaff) { staffMembers = newStaff; }
export function setAppliedPromo(promo) { appliedPromo = promo; }
export function setDeliveryMethod(method) { deliveryMethod = method; }
export function setCurrentProductId(id) { currentProductId = id; }
export function setPdQty(q) { pdQty = q; }
export function setListingState(mode, val, cat) {
  listingMode = mode;
  listingValue = val;
  listingCatActive = cat;
}
export function setPreviousView(v, s) {
  previousViewBeforeProduct = v;
  previousScrollBeforeProduct = s;
}

export function fmtPrice(n) { return (Number(n) || 0).toLocaleString('en-US') + ' د.ع'; }
export function findProduct(id) { return products.find(p => String(p.id) === String(id)); }
export function findBundle(id) { return bundles.find(b => String(b.id) === String(id)); }
export function starIcon() { return `<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/></svg>`; }

export function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 62%)`;
}

export function getBrandColor(brandName) {
  if (brandsData[brandName] && brandsData[brandName].color) return sanitizeText(brandsData[brandName].color);
  return hashColor(brandName || 'Pharmacy');
}

export function saveLocalState() {
  try {
    localStorage.setItem(getStorageKey('cart'), JSON.stringify(cart));
    localStorage.setItem(getStorageKey('wishlist'), JSON.stringify([...wishlist]));
    localStorage.setItem(getStorageKey('my_orders'), JSON.stringify(myOrders));
    localStorage.setItem(getStorageKey('store_settings'), JSON.stringify(pharmacyProfile));
    localStorage.setItem(getStorageKey('products_cache'), JSON.stringify(products));
  } catch (e) {
    console.warn("Storage save fallback:", e);
  }
}

export const icons = {
  bottle: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9" y="11" width="6" height="8.4" rx="0.8" fill="${c}" fill-opacity=".26"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><rect x="5" y="9" width="14" height="12" rx="2.6" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="6.4" y="11" width="11.2" height="8.4" rx="1.4" fill="${c}" fill-opacity=".26"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="1.3"/></svg>`,
  tube: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><path d="M8 3h8l1 4.5c.3 1.3.5 2.6.5 4V19a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2v-7.5c0-1.4.2-2.7.5-4L8 3Z" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="7.6" y="13" width="8.8" height="6.4" rx="1.2" fill="${c}" fill-opacity=".26"/></svg>`,
  spray: c => `<svg viewBox="0 0 24 24" width="48" height="48" style="width:48px;height:48px;" fill="none"><rect x="8" y="10" width="9" height="11.4" rx="2" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width="1.5"/><rect x="9.2" y="12" width="6.6" height="7.6" rx="1" fill="${c}" fill-opacity=".26"/><path d="M11 10V7.4a1.6 1.6 0 0 1 1.6-1.6h1.4M11.5 3.6h4" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`
};

export const catIcons = {
  hair: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M6 20c1-4-1-7-1-10a7 7 0 0 1 14 0c0 3-2 6-1 10"/><path d="M9 20v-3M15 20v-3"/></svg>`,
  baby: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="13" r="7.5"/><path d="M9.5 12h.01M14.5 12h.01"/><path d="M10 15.5c.7.7 1.3 1 2 1s1.3-.3 2-1"/></svg>`,
  intimate: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M12 3c1.5 3 4 5 7 6-1 5-4 9-7 12-3-3-6-7-7-12 3-1 5.5-3 7-6Z"/><circle cx="12" cy="13" r="2.5"/></svg>`,
  jar: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><rect x="5" y="9" width="14" height="12" rx="2.6"/><rect x="4.4" y="6" width="15.2" height="3.4" rx="1.4"/></svg>`,
  bottle: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><path d="M10 2h4v3.2l1.4 1.6c.4.45.6 1 .6 1.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.4c0-.6.2-1.15.6-1.6L9 5.2V2Z"/></svg>`,
  sunscreen: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><rect x="8" y="6" width="8" height="15" rx="2"/><path d="M10 6V4.4a2 2 0 0 1 4 0V6"/></svg>`,
  body: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="5" r="2.3"/><path d="M7 21l1.5-8L6 9.5 8 8l4 2 4-2 2 1.5-2.5 3.5L17 21"/></svg>`,
  face: c => `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>`
};
