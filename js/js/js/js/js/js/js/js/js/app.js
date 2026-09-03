/* ==========================================================
   SaaS Multi-Tenant Engine — js/app.js
   Version: 4.3.0 (Master Zero-Crash Application Coordinator)
   ========================================================== */

// 🌟 تهيئة كائن window.App في السطر الأول لضمان توفره لجميع عناصر HTML
window.App = window.App || {};

import { 
  db, auth, isFirebaseConfigured, dbPaths, currentPharmacyId, 
  patchTenantLinks, getTenantUrl, DEFAULT_PHARMACY_ID, SUPER_ADMIN_EMAIL 
} from './config.js';

import { 
  pharmacyProfile, setPharmacyProfile, products, setProducts, 
  categories, setCategories, bundles, setBundles, notifications, 
  setNotifications, archivedProducts, setArchivedProducts, cart, 
  wishlist, myOrders, brandsData, currentView, currentProductId, 
  pdQty, pdActiveTab, deliveryMethod, appliedPromo, isLowStockFilterActive, 
  currentUser, setCurrentUser, currentStaffData, setCurrentStaffData, 
  fmtPrice, starIcon, getBrandColor, icons, catIcons, findProduct, 
  findBundle, saveLocalState, getStorageKey, setAppliedPromo, 
  setDeliveryMethod, setCurrentProductId, setPdQty, setListingState, 
  setPreviousView, previousViewBeforeProduct, previousScrollBeforeProduct
} from './state.js';

import { 
  sanitizeText, sanitizeUrl, normalizeArabic, isCurrentUserAdmin, 
  assertAdmin, lockAction, isInAppBrowser, apiFetch, isSuperAdmin 
} from './security.js';

import { executeFuzzyProductSearch } from './search.js';
import { uploadDirectImageFile } from './upload.js';
import { executeAtomicOrderCheckout, openReceiptModal, closeReceiptModal } from './orders.js';
import { applyTheme, renderProductCard, renderBundleCard, renderCategoryCard, selectProductVariantCard } from './theme-engine.js';

// ================= 1. STOREFRONT LOCK & KILL SWITCH =================
export function checkStorefrontSubscriptionLock() {
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

// ================= 2. CART & CLOUD SYNC =================
export function addToCart(id, silent = false, quantity = 1) {
  cart[id] = (cart[id] || 0) + quantity;
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  if (!silent) showToast('تمت الإضافة للسلة ✓');
}

export function addBundleToCart(bundleId) {
  const cartKey = 'bundle_' + bundleId;
  cart[cartKey] = (cart[cartKey] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  showToast('تمت إضافة البكج كاملاً للسلة بتخفيض التوفير! 🎁');
}

export function changeCartQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  renderCart();
}

export function removeCartItem(id) {
  delete cart[id];
  updateCartBadge();
  saveLocalState();
  syncCartToCloud();
  renderCart();
}

export function updateCartBadge() {
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const b1 = document.getElementById('cartBadge');
  const b2 = document.getElementById('bnCartBadge');
  if (b1) { b1.style.display = count > 0 ? 'flex' : 'none'; b1.textContent = count; }
  if (b2) { b2.style.display = count > 0 ? 'flex' : 'none'; b2.textContent = count; }
}

export function getCartSubtotal() {
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

export async function syncCartToCloud() {
  if (!auth || !auth.currentUser || !db) return;
  try {
    await dbPaths.userCartDoc(auth.currentUser.uid).set({
      cart: cart,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {}
}

export async function mergeCloudCartOnLogin(user) {
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

// ================= 3. VIEWS CONTROLLER =================
export function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  window.currentViewName = name;
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

export function renderCurrentActiveView() {
  const v = window.currentViewName || 'home';
  if (v === 'home') renderHome();
  else if (v === 'listing') renderListing();
  else if (v === 'categories') renderModernCategories();
  else if (v === 'bundles') renderAllBundles();
  else if (v === 'orders') renderMyOrders();
  else if (v === 'offers') renderOffers();
  else if (v === 'wishlist') renderWishlist();
  else if (v === 'cart') renderCart();
  else if (v === 'checkout') renderCheckoutSummary();
  else if (v === 'account') renderAccountView();
  else if (v === 'product' && currentProductId) {
    const p = findProduct(currentProductId);
    if (p) renderProductDetailDOM(p);
  }
}

export function renderHome() {
  renderBrandStrip();
  renderHomeProductGrid();
  renderHomeBundles();
  renderPromoBanners();
}

let homeActiveBrand = 'all';
export function renderHomeProductGrid() {
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

export function selectHomeBrand(brand) {
  homeActiveBrand = brand;
  renderBrandStrip();
  renderHomeProductGrid();
}

export function renderBrandStrip() {
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

export function renderProductGrid(targetId, list, emptyMsg) {
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

export function renderModernCategories() {
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

export function renderHomeBundles() {
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

export function renderAllBundles() {
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

export function renderOffers() {
  const discounted = products.filter(p => (p.oldPrice || p.isSpecialOffer) && p.isDeleted !== true);
  const countEl = document.getElementById('offersCount');
  if (countEl) countEl.textContent = discounted.length + ' عرض';
  renderProductGrid('offersGrid', discounted);
}

export function renderWishlist() {
  const list = products.filter(p => wishlist.has(p.id) && p.isDeleted !== true);
  renderProductGrid('wishlistGrid', list, 'قائمتك المفضلة فارغة حالياً 🌸');
}

export function renderCart() {
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
  const discount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const fee = (deliveryMethod === 'express') ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  if (appliedPromo && promoBadge) {
    promoBadge.style.display = 'flex';
    promoBadge.className = 'applied-promo-tag';
    promoBadge.innerHTML = `<span>🎟️ تم تفعيل كود الخصم: <b>${appliedPromo.code}</b> (-${fmtPrice(discount)})</span><button type="button" onclick="window.App.removePromoCode()" style="color:#DC2626; font-weight:900; background:none; cursor:pointer;">✕</button>`;
  } else if (promoBadge) {
    promoBadge.style.display = 'none';
  }

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discount > 0 ? `<div class="summary-row discount-row"><span>خصم الكوبون (${appliedPromo.code})</span><span class="mono">-${fmtPrice(discount)}</span></div>` : ''}
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>
    <button class="checkout-btn" onclick="window.App.showView('checkout')">متابعة الطلب</button>`;
}

export function renderCheckoutSummary() {
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

export function renderPromoBanners() {
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
            <button class="promo-cta" onclick="window.App.showView('offers')">تسوقي الآن</button>
          </div>
        </div>`;
    }).join('')}`;
}

export function renderMyOrders() {
  const container = document.getElementById('myOrdersContainer');
  const countEl = document.getElementById('myOrdersCount');
  if (countEl) countEl.textContent = myOrders.length + ' طلب';
  if (!container) return;

  if (myOrders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:40px 16px;">لا توجد لديكِ طلبات مسجلة حتى الآن 🌸<br><button onclick="window.App.showView('home')" style="margin-top:14px; background:var(--accent); color:#fff; font-weight:800; font-size:12.5px; padding:8px 20px; border-radius:999px;">تصفح المنتجات</button></div>`;
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
            ${isProcessing ? `<button type="button" class="btn-cancel-order" onclick="window.App.cancelMyOrder('${sanitizeText(ord.id)}')">❌ إلغاء الطلب</button>` : ''}
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

export function renderProductDetailDOM(p) {
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

export function rateProductInstant(stars) {
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

export function openProduct(id, isUserClick = false) {
  if (isUserClick) {
    setPreviousView((window.currentViewName !== 'product') ? window.currentViewName : 'home', window.scrollY || 0);
  }

  setCurrentProductId(id);
  setPdQty(1);
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
    window.currentViewName = 'product';
    window.scrollTo(0, 0);
  }
}

export function goBackFromProduct() {
  const targetView = previousViewBeforeProduct || 'home';
  const targetScroll = previousScrollBeforeProduct || 0;
  showView(targetView);
  window.scrollTo(0, targetScroll);
}

export function switchPdTab(tab) {
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

export function changePdQty(delta) {
  setPdQty(Math.max(1, pdQty + delta));
  const qtyEl = document.getElementById('pdQtyVal');
  if (qtyEl) qtyEl.textContent = pdQty;
}

export function renderCrossSelling(currentP) {
  const grid = document.getElementById('pdSuggestedGrid');
  if (!grid || !currentP) return;

  const suggestions = products
    .filter(p => p.id !== currentP.id && p.isDeleted !== true && (p.brand === currentP.brand || p.category !== currentP.category))
    .slice(0, 4);

  renderProductGrid('pdSuggestedGrid', suggestions);
}

export function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  setListingState('search', term, 'all');
  renderListing();
  showListingView();
}

export function openCategory(catId) {
  setListingState('category', catId, catId);
  renderListing();
  showListingView();
}

export function openBestSellers() {
  setListingState('bestsellers', null, 'all');
  renderListing();
  showListingView();
}

export function showListingView() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const lView = document.getElementById('view-listing');
  if (lView) lView.classList.add('active');
  window.currentViewName = 'listing';
  window.scrollTo({top: 0, behavior: 'instant'});
}

export function renderListing() {
  const titleEl = document.getElementById('listingTitle');
  if (!titleEl) return;
  const titles = {
    category: (categories.find(c => c.id === window.listingValue) || {}).label,
    search: `نتائج البحث عن: "${window.listingValue}"`,
    bestsellers: 'الأكثر مبيعاً 🔥'
  };
  titleEl.textContent = titles[window.listingMode] || 'المنتجات';

  let list = products.filter(p => p.isDeleted !== true);
  if (window.listingMode === 'category') {
    list = list.filter(p => p.category === window.listingValue);
  } else if (window.listingMode === 'search') {
    list = executeFuzzyProductSearch(window.listingValue, products);
  } else if (window.listingMode === 'bestsellers') {
    list = list.sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0));
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
}

export function selectDelivery(method) {
  setDeliveryMethod(method);
  const std = document.getElementById('delStandard');
  const exp = document.getElementById('delExpress');
  if (std) std.classList.toggle('selected', method === 'standard');
  if (exp) exp.classList.toggle('selected', method === 'express');
  renderCheckoutSummary();
}

export async function applyPromoCode(code) {
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

      setAppliedPromo({ code: cleanCode, discountAmount });
      showToast('تم تطبيق الخصم بنجاح! 🎉');
      renderCart();
      renderCheckoutSummary();
      return;
    }
  } catch (err) {
    console.warn(err);
  }

  setAppliedPromo(null);
  showToast('كود الخصم غير صالح أو منتهي الصلاحية ❌');
  renderCart();
  renderCheckoutSummary();
}

export function removePromoCode() {
  setAppliedPromo(null);
  showToast('تم إلغاء كود الخصم');
  renderCart();
  renderCheckoutSummary();
}

export function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderCurrentActiveView();
}

export function openMenu() {
  document.getElementById('menuDrawer')?.classList.add('open');
  document.getElementById('menuOverlay')?.classList.add('open');
}

export function closeMenu() {
  document.getElementById('menuDrawer')?.classList.remove('open');
  document.getElementById('menuOverlay')?.classList.remove('open');
}

export function openWhatsapp() {
  const targetNumber = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  window.open(`https://wa.me/${targetNumber}`, '_blank');
}

export function checkAndAutofillCustomer() {
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

export function clearSavedCustomerData() {
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

export async function cancelMyOrder(orderId) {
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

// ================= 4. AUTH & USER PROFILE =================
export function updateUserHeaderProfile() {
  const chipAvatar = document.getElementById('userChipAvatar');
  const chipName = document.getElementById('userChipName');
  const bnAccountLbl = document.getElementById('bnAccountLbl');

  const user = auth ? auth.currentUser : null;
  if (user) {
    const rawName = user.displayName || user.email || 'حسابي';
    const firstName = sanitizeText(rawName.split(' ')[0].split('@')[0]);
    if (chipName) chipName.textContent = firstName;
    if (bnAccountLbl) bnAccountLbl.textContent = firstName;
    const cleanPhoto = sanitizeUrl(user.photoURL);
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

export function renderAccountView() {
  const container = document.getElementById('accountAuthContainer');
  if (!container) return;

  const user = auth ? auth.currentUser : null;
  if (user) {
    const isAdmin = isCurrentUserAdmin(pharmacyProfile, currentStaffData);
    const cleanPhoto = sanitizeUrl(user.photoURL);
    container.innerHTML = `
      <div class="account-card">
        <div class="user-profile-header">
          <div class="user-avatar"><img src="${cleanPhoto || 'https://imgdb.io/i/EQ4D9ag.png'}"></div>
          <div class="user-info">
            <h3>${sanitizeText(user.displayName || user.email)} ${isAdmin ? '⭐ (مشرف الصيدلية)' : ''}</h3>
            <p>${sanitizeText(user.email || '')}</p>
            <div class="sync-indicator"><span class="sync-dot"></span><span>البيانات متزامنة مع ${sanitizeText(pharmacyProfile.name || 'الصيدلية')}</span></div>
          </div>
        </div>
        ${isAdmin ? `<a class="auth-btn-google" style="margin-bottom:10px; background:#FEF3C7; color:#92400E; font-weight:800; display:flex;" href="${getTenantUrl('admin.html')}">⚙️ لوحة تحكم وإدارة الصيدلية</a>` : ''}
        <button class="auth-btn-google" style="margin-bottom:10px;" onclick="window.App.showView('orders')">📦 عرض طلباتي وتتبع الشحن</button>
        <button class="auth-btn-logout" onclick="window.App.handleSignOut()">تسجيل الخروج</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="account-card">
        <div style="font-size:38px; margin-bottom:8px;">🌸</div>
        <h3 style="font-size:17px; font-weight:900; margin:0 0 6px;">مرحباً بك في ${sanitizeText(pharmacyProfile.name || 'الصيدلية')}</h3>
        <p style="font-size:12.5px; color:var(--text-soft); margin:0 0 20px;">سجلي الدخول بنقرة واحدة لحفظ منتجاتك المفضلة ومتابعة طلباتكِ:</p>
        <button class="auth-btn-google" onclick="window.App.signInWithGoogle()">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          تسجيل الدخول المباشر عبر Google
        </button>
      </div>`;
  }
}

export function signInWithGoogle() {
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

export async function handleSignOut() {
  if (auth) await auth.signOut();
  setCurrentUser(null);
  setCurrentStaffData(null);
  updateUserHeaderProfile();
  renderAccountView();
  showToast('تم تسجيل الخروج بنجاح');
}

export function applyStoreSettings() {
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

// ================= 5. FIRESTORE REALTIME SYNC =================
export function initFirestoreRealtimeSync() {
  if (!isFirebaseConfigured || !db) return;

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) {
      setPharmacyProfile(doc.data());
      applyStoreSettings();
      renderHome();
      checkStorefrontSubscriptionLock();
    }
  }, err => console.warn(err));

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      setCategories(loaded);
      renderModernCategories();
    }
  }, err => console.warn(err));

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      setBundles(loaded);
      renderHomeBundles();
      renderAllBundles();
    }
  }, err => console.warn(err));

  dbPaths.productsCol().onSnapshot(snap => {
    if (!snap.empty) {
      const loaded = [];
      snap.forEach(doc => loaded.push({ id: doc.id, ...doc.data() }));
      setProducts(loaded);
      saveLocalState();
      renderCurrentActiveView();
    }
  }, err => console.warn(err));
}

let toastTimer;
export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ================= 6. GLOBAL BRIDGE & EVENT HANDLERS =================
Object.assign(window.App, {
  showView,
  addToCart,
  addBundleToCart,
  changeCartQty,
  removeCartItem,
  selectDelivery,
  applyPromoCode,
  removePromoCode,
  toggleWishlist,
  openProduct,
  goBackFromProduct,
  switchPdTab,
  changePdQty,
  rateProductInstant,
  openCategory,
  openBestSellers,
  selectHomeBrand,
  onSearch,
  openMenu,
  closeMenu,
  openWhatsapp,
  executeAtomicOrderCheckout: () => executeAtomicOrderCheckout(showToast),
  openReceiptModal,
  closeReceiptModal,
  cancelMyOrder,
  clearSavedCustomerData,
  selectProductVariantCard,
  signInWithGoogle,
  handleSignOut,
  quickToggleStock: async (id) => {
    const p = findProduct(id);
    if (!p || !db) return;
    const newStock = !p.inStock;
    await dbPaths.productsCol().doc(String(id)).set({ inStock: newStock }, { merge: true });
    showToast(newStock ? 'متوفر 🟢' : 'نافذ 🔴');
  },
  quickEditPrice: async (id, curPrice) => {
    const val = prompt('تعديل السعر (د.ع):', curPrice);
    if (!val) return;
    const newP = Number(val.trim());
    if (newP > 0 && db) {
      await dbPaths.productsCol().doc(String(id)).set({ price: newP }, { merge: true });
      showToast('تم تحديث السعر ✓');
    }
  },
  openAdminQuickEditModal: () => {
    window.location.href = getTenantUrl('admin.html');
  },
  archiveProductConfirm: async (id, name) => {
    if (!confirm(`نقل "${name}" إلى سلة المحذوفات؟`)) return;
    if (db) {
      await dbPaths.productsCol().doc(String(id)).set({ isDeleted: true }, { merge: true });
      showToast('تم نقل المنتج للمحذوفات 🗑️');
    }
  }
});

// دوال مباشرة للنطاق العام لضمان التوافق المطلق مع أزرار HTML
window.showView = showView;
window.openProduct = openProduct;
window.addToCart = addToCart;
window.openCategory = openCategory;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openWhatsapp = openWhatsapp;

// ================= 7. SAFE BOOTSTRAP HOOK =================
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
      setCurrentUser(user);
      updateUserHeaderProfile();
      renderAccountView();
      if (user) mergeCloudCartOnLogin(user);
    });
  }
}

// تشغيل فوري حتى لو انتهى حدث التحميل قبل قراءة الملف
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
