/* ==========================================================
   SaaS Multi-Tenant Engine — js/main.js
   المتحكم الرئيسي بالصفحة (Page Controller)
   يربط الوحدات التسعة سوا: state / config / security / orders /
   search / theme-engine / theme-presets / upload
   هذا الملف يحتوي فقط على منطق "الواجهة والعرض" اللي ما كان
   موجود بأي وحدة من التسعة (رسم الصفحات، التنقل، السلة، الحساب)
   ========================================================== */

import {
  auth, db, dbPaths, isFirebaseConfigured, currentPharmacyId,
  patchTenantLinks
} from './config.js';

import {
  sanitizeText, sanitizeUrl, apiFetch, isInAppBrowser
} from './security.js';

import {
  currentUser, setCurrentUser,
  cart, wishlist, myOrders, categories, products, bundles, brandsData,
  pharmacyProfile, setPharmacyProfile, setProducts, setCategories, setBundles,
  listingMode, listingValue, setListingState,
  currentProductId, setCurrentProductId,
  pdQty, setPdQty, setPdActiveTab,
  deliveryMethod, setDeliveryMethod,
  currentView, setCurrentView,
  fmtPrice, findProduct, findBundle, getBrandColor, icons, saveLocalState
} from './state.js';

import { applyTheme, renderProductCard, renderBundleCard, renderCategoryCard, selectProductVariantCard } from './theme-engine.js';
import { executeFuzzyProductSearch } from './search.js';
import { executeAtomicOrderCheckout, openReceiptModal, closeReceiptModal } from './orders.js';
import { uploadDirectImageFile } from './upload.js';

// ---------------------------------------------------------
// 🍞 التوست
// ---------------------------------------------------------
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ---------------------------------------------------------
// 🛒 السلة
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 🧭 التنقل بين الصفحات (Views)
// ---------------------------------------------------------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  setCurrentView(name);
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'instant' });

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

// ---------------------------------------------------------
// 🏠 الرئيسية
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 🛍️ السلة والدفع
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 📄 صفحة تفاصيل المنتج
// ---------------------------------------------------------
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

  const qtyValEl = document.getElementById('pdQtyVal');
  if (qtyValEl) qtyValEl.textContent = pdQty;
  switchPdTab('desc');

  document.getElementById('pdAddBtn').onclick = () => {
    addToCart(p.id, false, pdQty);
  };
}

function changePdQty(delta) {
  const p = findProduct(currentProductId);
  const maxQty = (p && p.stockQuantity !== undefined) ? Math.max(1, Number(p.stockQuantity)) : 99;
  const newQty = Math.min(Math.max(1, pdQty + delta), maxQty);
  setPdQty(newQty);
  const el = document.getElementById('pdQtyVal');
  if (el) el.textContent = newQty;
}

function switchPdTab(tab) {
  setPdActiveTab(tab);
  const tabMap = { desc: 'pdTabDesc', ing: 'pdTabIng', use: 'pdTabUse' };
  const tabOrder = ['desc', 'ing', 'use'];

  document.querySelectorAll('.pd-tabs .pd-tab').forEach((btn, idx) => {
    btn.classList.toggle('active', tabOrder[idx] === tab);
  });
  Object.entries(tabMap).forEach(([key, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.classList.toggle('active', key === tab);
  });
}

function openProduct(id) {
  setCurrentProductId(id);
  const p = findProduct(id);
  if (!p) return;
  setPdQty(1);
  setPdActiveTab('desc');
  renderProductDetailDOM(p);
  showView('product');
}

function goBackFromProduct() {
  showView('home');
}

// ---------------------------------------------------------
// 🔎 البحث والتصنيفات
// ---------------------------------------------------------
function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  setListingState('search', term, 'all');
  showView('listing');
}

function openCategory(catId) {
  setListingState('category', catId, 'all');
  showView('listing');
}

function openBestSellers() {
  setListingState('bestsellers', null, 'all');
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
  setDeliveryMethod(method);
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

// ---------------------------------------------------------
// 📂 القائمة الجانبية والواتساب
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 👤 بيانات الزبون المحفوظة محلياً
// ---------------------------------------------------------
function safeJSONParseLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined' || raw === 'null') return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function checkAndAutofillCustomer() {
  const saved = safeJSONParseLocal('saas_customer_saved_profile', null);
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

// ---------------------------------------------------------
// 🔐 الحساب وتسجيل الدخول عبر Google
// ---------------------------------------------------------
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

function explainAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return '⚠️ هذا النطاق غير مصرّح له بتسجيل الدخول عبر Google. يجب إضافته لقائمة "Authorized domains" في إعدادات Firebase Authentication.';
    case 'auth/operation-not-supported-in-this-environment':
      return '⚠️ تسجيل الدخول عبر Google غير مدعوم داخل هذا المتصفح المدمج (مثل تطبيق تيليجرام/انستغرام). افتحي الرابط بمتصفح خارجي (Chrome/Safari).';
    case 'auth/popup-blocked':
      return '⚠️ تم حظر نافذة تسجيل الدخول من المتصفح. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.';
    case 'auth/network-request-failed':
      return '⚠️ تعذر الاتصال بالإنترنت، يرجى التحقق من الشبكة والمحاولة مجدداً.';
    case 'auth/operation-not-allowed':
      return '⚠️ خاصية "تسجيل الدخول عبر Google" غير مفعّلة بمشروع Firebase. فعّليها من: Authentication → Sign-in method → Google.';
    case 'auth/internal-error':
      return '⚠️ خطأ داخلي من Firebase أثناء تسجيل الدخول. جربي مرة ثانية بعد دقيقة.';
    default:
      return `⚠️ تعذر تسجيل الدخول: ${err && err.message ? err.message : 'خطأ غير معروف'}`;
  }
}

function signInWithGoogle() {
  if (!auth) {
    showToast('⚠️ تعذر الاتصال بخدمة تسجيل الدخول (Firebase غير مهيأ).');
    return;
  }
  // 🛡️ گوگل يحظر تسجيل الدخول داخل متصفحات التطبيقات المدمجة (تيليجرام/انستغرام/واتساب...)
  // بدون رمي أي خطأ قابل للالتقاط بالجافاسكربت — يعني بدونها يبدو وكأن الزر "ما يشتغل" بصمت
  if (isInAppBrowser()) {
    showToast('⚠️ تسجيل الدخول عبر Google لا يعمل داخل متصفح التطبيق هذا (تيليجرام/انستغرام..). افتحي الرابط بمتصفح خارجي مثل Chrome أو Safari من القائمة (⋮ أو مشاركة ← فتح في المتصفح).');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  // ⚠️ signInWithPopup بدل signInWithRedirect: الطريقة الثانية تفشل بصمت على Safari/iOS
  // (تعلق على صفحة "Continue to the app" وترجع بدون تسجيل دخول) بسبب منع Safari
  // لتخزين/كوكيز الطرف الثالث بين دومين cottanpharmacy.firebaseapp.com وموقعك الفعلي.
  auth.signInWithPopup(provider).then(result => {
    if (result && result.user) {
      showToast(`مرحباً ${result.user.displayName || ''} 🌸`);
    }
  }).catch(err => {
    console.error('Google Sign-In popup error:', err);
    if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
    showToast(explainAuthError(err));
  });
}

function captureAuthRedirectResult() {
  if (!auth) return;
  auth.getRedirectResult().then(result => {
    if (result && result.user) {
      showToast(`مرحباً ${result.user.displayName || ''} 🌸`);
    }
  }).catch(err => {
    console.error('Google Sign-In redirect result error:', err);
    showToast(explainAuthError(err));
  });
}

async function handleSignOut() {
  if (auth) await auth.signOut();
  setCurrentUser(null);
  updateUserHeaderProfile();
  renderAccountView();
  showToast('تم تسجيل الخروج بنجاح');
}

// ---------------------------------------------------------
// 🎨 إعدادات المتجر والمزامنة اللحظية مع Firestore
// ---------------------------------------------------------
function applyStoreSettings() {
  applyTheme(pharmacyProfile.templateId || 'template_default', pharmacyProfile.primaryColor);
  if (document.getElementById('headerLogoText')) document.getElementById('headerLogoText').textContent = pharmacyProfile.name || 'الصيدلية';
  if (document.getElementById('drawerLogoTitle')) document.getElementById('drawerLogoTitle').textContent = pharmacyProfile.name || 'الصيدلية';
}

function initFirestoreRealtimeSync() {
  if (!isFirebaseConfigured || !db) return;

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) {
      setPharmacyProfile(doc.data());
      applyStoreSettings();
      renderHome();
    }
  }, console.warn);

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setCategories(list);
      renderModernCategories();
    }
  }, console.warn);

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setBundles(list);
      renderHomeBundles();
      renderAllBundles();
    }
  }, console.warn);

  dbPaths.productsCol().onSnapshot(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setProducts(list);
      saveLocalState();
      renderCurrentActiveView();
    }
  }, console.warn);
}

// ---------------------------------------------------------
// 🚀 نقطة الانطلاق
// ---------------------------------------------------------
function bootstrapApp() {
  patchTenantLinks();
  applyStoreSettings();
  renderHome();
  renderModernCategories();
  updateCartBadge();
  updateUserHeaderProfile();
  initFirestoreRealtimeSync();

  if (auth) {
    captureAuthRedirectResult();
    auth.onAuthStateChanged(user => {
      setCurrentUser(user);
      updateUserHeaderProfile();
      renderAccountView();
    });
  }
}

document.addEventListener('DOMContentLoaded', bootstrapApp);

// ---------------------------------------------------------
// 🌟 تصدير كائن window.App الشامل (تستخدمه الكروت المرسومة ديناميكياً)
// ---------------------------------------------------------
window.App = {
  showView, addToCart, addBundleToCart, changeCartQty, removeCartItem,
  selectDelivery, toggleWishlist, openProduct, goBackFromProduct,
  openCategory, openBestSellers, selectHomeBrand, onSearch, openMenu, closeMenu,
  openWhatsapp, executeAtomicOrderCheckout: () => executeAtomicOrderCheckout(showToast),
  openReceiptModal, closeReceiptModal,
  clearSavedCustomerData, signInWithGoogle, handleSignOut,
  changePdQty, switchPdTab, selectProductVariantCard
};

// دوال مباشرة لضمان عمل أزرار onclick الثابتة بـ Index.html
// (في ES module ما تنحط تلقائياً على window متل السكربت العادي، لازم تصدير صريح)
window.showView = showView;
window.openProduct = openProduct;
window.addToCart = addToCart;
window.openCategory = openCategory;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openWhatsapp = openWhatsapp;
window.changePdQty = changePdQty;
window.switchPdTab = switchPdTab;
window.clearSavedCustomerData = clearSavedCustomerData;
window.closeReceiptModal = closeReceiptModal;
window.executeAtomicOrderCheckout = () => executeAtomicOrderCheckout(showToast);
window.goBackFromProduct = goBackFromProduct;
window.openBestSellers = openBestSellers;
window.selectDelivery = selectDelivery;
window.onSearch = onSearch;
