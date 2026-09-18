/* ==========================================================
   SaaS Multi-Tenant Engine — js/main.js
   Version: 6.3.0 (Race-Proof Home/Categories/Bundles Rendering,
                    Loader Waits for All Core Data Before Hiding,
                    Fast Edge-Cached Theme Fetch, Redirect-Based Google Auth)
   ========================================================== */

import {
  auth, db, dbPaths, isFirebaseConfigured, currentPharmacyId,
  patchTenantLinks, resolveCustomDomainTenant, WORKER_API_BASE
} from './config.js';

import {
  sanitizeText, sanitizeUrl, apiFetch, isInAppBrowser, isCurrentUserAdmin
} from './security.js';

import {
  currentUser, setCurrentUser, currentStaffData,
  cart, wishlist, myOrders, categories, products, bundles, brandsData, setBrandsData,
  pharmacyProfile, setPharmacyProfile, setProducts, setCategories, setBundles,
  listingMode, listingValue, setListingState,
  currentProductId, setCurrentProductId,
  pdQty, setPdQty, setPdActiveTab,
  deliveryMethod, setDeliveryMethod,
  appliedPromo, setAppliedPromo,
  currentView, setCurrentView,
  previousViewBeforeProduct, previousScrollBeforeProduct, setPreviousView,
  fmtPrice, findProduct, findBundle, getBrandColor, icons, starIcon, saveLocalState
} from './state.js';

import { applyTheme, renderHeroBanner, renderProductCard, renderBundleCard, renderCategoryCard, selectProductVariantCard } from './theme-engine.js';
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
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
function showView(name, skipScrollTop = false) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  setCurrentView(name);
  closeMenu();
  if (!skipScrollTop) window.scrollTo({ top: 0, behavior: 'instant' });

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
// 🌟 سلايدر البانرات العلوي، ربط المنتجات والألوان
// (إصلاح #3: فرض لون/تدرج شريحة العرض المختار من لوحة التحكم بقوة عبر Inline Style)
// ---------------------------------------------------------
let currentHeroSlideIndex = 0;

function renderHeroSlider() {
  const container = document.getElementById('heroBannerContainer');
  const dotsContainer = document.getElementById('heroSliderDots');
  if (!container) return;

  const promoCards = pharmacyProfile.promoCards || [];
  const mainBannerHtml = `<div class="hero-slide" data-slide-index="0">${renderHeroBanner(pharmacyProfile)}</div>`;

  const promoSlidesHtml = promoCards.map((c, idx) => {
    // 🌟 (إصلاح #3) نطبّق لون/تدرج الخلفية المختار من الأدمن بقوة (!important) عبر الـ Inline Style
    // كي يطغى دائماً على تدرج الخلفية الافتراضي المعرّف في كلاس .hero-promo-slide بملف style.css.
    const rawBg = (c.slideBgColor || '').toString().trim();
    const customBgStyle = rawBg ? `background: ${sanitizeText(rawBg)} !important;` : '';

    return `
      <div class="hero-slide" data-slide-index="${idx + 1}" onclick="window.App.openPromoSlideOffer('${sanitizeText(c.id)}')">
        <div class="hero-promo-slide" style="${customBgStyle}">
          <div class="banner-text-col">
            ${c.discount ? `<span style="display:inline-block; font-size:11px; font-weight:900; background:#fff; color:var(--accent); padding:3px 10px; border-radius:999px; width:fit-content; border:1px solid var(--line); margin-bottom:6px;">${sanitizeText(c.discount)}</span>` : ''}
            <h2 class="main-title" style="font-size: clamp(20px, 3.2vw, 30px);">${sanitizeText(c.title)}</h2>
            <p class="sub-title">${sanitizeText(c.desc)}</p>
            <p class="desc-title"><span>تصفحي منتجات هذا العرض 🎁</span></p>
          </div>
          ${c.img ? `<div class="banner-model-col"><img src="${sanitizeUrl(c.img)}" alt="${sanitizeText(c.title)}" loading="lazy"></div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = mainBannerHtml + promoSlidesHtml;

  const totalSlides = 1 + promoCards.length;
  if (dotsContainer) {
    if (totalSlides > 1) {
      dotsContainer.style.display = 'flex';
      dotsContainer.innerHTML = Array.from({ length: totalSlides }).map((_, i) =>
        `<button type="button" class="hero-slider-dot ${i === 0 ? 'active' : ''}" onclick="window.App.goToHeroSlide(${i})" aria-label="الشريحة ${i + 1}"></button>`
      ).join('');
    } else {
      dotsContainer.style.display = 'none';
    }
  }

  setupHeroSliderScrollListener();
}

function setupHeroSliderScrollListener() {
  const container = document.getElementById('heroBannerContainer');
  if (!container || container.dataset.scrollBound) return;
  container.dataset.scrollBound = '1';

  let scrollTimeout;
  container.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const slideWidth = container.clientWidth;
      if (slideWidth > 0) {
        const slideIdx = Math.round(container.scrollLeft / slideWidth);
        updateHeroSliderDots(Math.abs(slideIdx));
      }
    }, 60);
  }, { passive: true });
}

function updateHeroSliderDots(activeIndex) {
  currentHeroSlideIndex = activeIndex;
  const dots = document.querySelectorAll('.hero-slider-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === activeIndex);
  });
}

function goToHeroSlide(index) {
  const container = document.getElementById('heroBannerContainer');
  if (!container) return;
  const slideWidth = container.clientWidth;
  container.scrollTo({
    left: index * slideWidth,
    behavior: 'smooth'
  });
  updateHeroSliderDots(index);
}

// عند نقر الزبون على شريحة عرض: فتح صفحة المنتجات المحددة لهذا العرض حصراً
function openPromoSlideOffer(cardId) {
  const card = (pharmacyProfile.promoCards || []).find(c => String(c.id) === String(cardId));
  if (!card) {
    showView('offers');
    return;
  }
  if (card.productIds && Array.isArray(card.productIds) && card.productIds.length > 0) {
    setListingState('promo_offer', card.productIds, 'all');
    window.__currentPromoTitle = card.title || 'منتجات العرض';
    listingDisplayLimit = 30;
    showView('listing');
  } else {
    showView('offers');
  }
}

// ---------------------------------------------------------
// 🏠 الرئيسية والتصفح التدريجي بـ 30 منتجاً
// ---------------------------------------------------------
let homeActiveBrand = 'all';
let homeDisplayLimit = 30;
let listingDisplayLimit = 30;

function renderHome() {
  renderHeroSlider();
  renderBrandStrip();
  renderHomeProductGrid();
  renderHomeBundles();
}

function renderHomeProductGrid() {
  const title = document.getElementById('homeGridTitle');
  const loadMoreWrap = document.getElementById('homeLoadMoreWrap');
  if (!title) return;

  let list = products.filter(p => p.isDeleted !== true);
  if (homeActiveBrand === 'all') {
    title.textContent = 'الأكثر مبيعاً 🔥';
    list = list.sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0));
  } else {
    title.textContent = 'منتجات ' + homeActiveBrand;
    list = list.filter(p => p.brand === homeActiveBrand);
  }

  const visibleList = list.slice(0, homeDisplayLimit);
  renderProductGrid('bestSellersGrid', visibleList);

  if (loadMoreWrap) {
    if (list.length > homeDisplayLimit) {
      loadMoreWrap.style.display = 'block';
      const remaining = list.length - homeDisplayLimit;
      const btn = document.getElementById('homeLoadMoreBtn');
      if (btn) btn.textContent = `عرض المزيد من المنتجات (المتبقي: ${remaining}) ⬇️`;
    } else {
      loadMoreWrap.style.display = 'none';
    }
  }
}

function loadMoreHomeProducts() {
  homeDisplayLimit += 30;
  renderHomeProductGrid();
}

function selectHomeBrand(brand) {
  homeActiveBrand = brand;
  homeDisplayLimit = 30;
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
  const discountAmount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount) + fee;

  summaryEl.innerHTML = `
    <div class="summary-row"><span>المجموع الفرعي للمنتجات</span><span class="mono">${fmtPrice(subtotal)}</span></div>
    ${discountAmount > 0 ? `<div class="summary-row" style="color:#10B981;"><span>خصم الكوبون (${sanitizeText(appliedPromo.code)})</span><span class="mono">-${fmtPrice(discountAmount)}</span></div>` : ''}
    <div class="summary-row"><span>أجرة التوصيل</span><span class="mono">+${fmtPrice(fee)}</span></div>
    <div class="summary-row total"><span>المجموع الإجمالي المطلوب</span><span class="mono">${fmtPrice(finalTotal)}</span></div>`;
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
// 📄 تفاصيل المنتج ونظام تقييم النجوم التفاعلي
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

  const pdRatingEl = document.getElementById('pdRating');
  if (pdRatingEl) {
    const reviewCount = Number(p.reviews || 0);
    const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
    pdRatingEl.innerHTML = reviewCount > 0
      ? `${starIcon()} <span class="mono" style="font-weight:800;">${avgRating}</span> <span style="font-size:12px; color:var(--text-soft);">(${reviewCount} تقييم)</span>`
      : `<span style="font-size:12px; color:var(--text-soft); font-weight:700;">⭐ منتج جديد (0 تقييم)</span>`;
  }

  document.getElementById('pdTabDesc').textContent = p.description || 'منتج أصلي معتمد من الصيدلية.';
  document.getElementById('pdTabIng').textContent = p.ingredients || 'تركيبة غنية ومفحوصة جلدياً.';
  document.getElementById('pdTabUse').textContent = p.usage || 'يُوضع وفق الإرشادات الصيدلانية.';

  // تقييم الزبون التفاعلي المسجل محلياً
  const ratedKey = `saas_${currentPharmacyId}_rated_${p.id}`;
  const userPrevRating = localStorage.getItem(ratedKey);
  const starsContainer = document.getElementById('productInteractiveStars');
  if (starsContainer) {
    const starsButtons = starsContainer.querySelectorAll('.star-btn');
    starsButtons.forEach((btn, idx) => {
      btn.classList.toggle('active', userPrevRating && idx < Number(userPrevRating));
    });
  }
  const ratingMsg = document.getElementById('instantRatingMsg');
  if (ratingMsg) {
    ratingMsg.textContent = userPrevRating ? `تقييمكِ المسجل: ${userPrevRating} نجوم ⭐` : '';
  }

  const qtyValEl = document.getElementById('pdQtyVal');
  if (qtyValEl) qtyValEl.textContent = pdQty;
  switchPdTab('desc');

  document.getElementById('pdAddBtn').onclick = () => {
    addToCart(p.id, false, pdQty);
  };
}

function rateProductInstant(stars) {
  if (!currentProductId) return;
  const p = findProduct(currentProductId);
  if (!p) return;

  const ratedKey = `saas_${currentPharmacyId}_rated_${currentProductId}`;
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
    dbPaths.productsCol().doc(String(currentProductId)).set({
      rating: newRating,
      reviews: newReviews
    }, { merge: true }).catch(console.warn);
  }

  document.querySelectorAll('#productInteractiveStars .star-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx < stars);
  });
  const msgEl = document.getElementById('instantRatingMsg');
  if (msgEl) msgEl.textContent = `تم تسجيل تقييمك (${stars} نجوم) بنجاح! شكراً لكِ 🌸`;
  showToast(`تم تقييم المنتج بـ ${stars} نجوم ⭐`);
  saveLocalState();
  renderProductDetailDOM(p);
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
  const tabMap = { desc: 'pdTabDesc', ing: 'pdTabIng', use: 'pdTabUse', reviews: 'pdTabReviews' };
  const tabOrder = ['desc', 'ing', 'use', 'reviews'];

  document.querySelectorAll('.pd-tabs .pd-tab').forEach((btn, idx) => {
    btn.classList.toggle('active', tabOrder[idx] === tab);
  });
  Object.entries(tabMap).forEach(([key, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.classList.toggle('active', key === tab);
  });
}

function openProduct(id) {
  setPreviousView(currentView, window.scrollY);
  setCurrentProductId(id);
  const p = findProduct(id);
  if (!p) return;
  setPdQty(1);
  setPdActiveTab('desc');
  renderProductDetailDOM(p);
  showView('product');
}

function goBackFromProduct() {
  showView(previousViewBeforeProduct || 'home', true);
  requestAnimationFrame(() => {
    window.scrollTo({ top: previousScrollBeforeProduct || 0, behavior: 'instant' });
  });
}

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
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('📋 تم نسخ رابط المنتج المباشر بنجاح!');
    }).catch(() => {
      showToast('⚠️ تعذر نسخ الرابط، جربي يدوياً من شريط العنوان.');
    });
  } else {
    showToast('⚠️ متصفحك لا يدعم النسخ التلقائي.');
  }
}

function checkUrlHashForProduct() {
  const hash = window.location.hash || '';
  const match = hash.match(/#p=([a-zA-Z0-9_\-]+)/);
  if (match && match[1]) {
    openProduct(match[1]);
  }
}

// ---------------------------------------------------------
// 🔎 البحث والتصنيفات وعروض السلايدر المخصصة
// ---------------------------------------------------------
function onSearch(val) {
  const term = val.trim();
  if (!term) return;
  listingDisplayLimit = 30;
  setListingState('search', term, 'all');
  showView('listing');
}

function openCategory(catId) {
  listingDisplayLimit = 30;
  setListingState('category', catId, 'all');
  showView('listing');
}

function openBestSellers() {
  listingDisplayLimit = 30;
  setListingState('bestsellers', null, 'all');
  showView('listing');
}

function renderListing() {
  const titleEl = document.getElementById('listingTitle');
  const loadMoreWrap = document.getElementById('listingLoadMoreWrap');
  if (!titleEl) return;

  let list = products.filter(p => p.isDeleted !== true);

  if (listingMode === 'category') {
    list = list.filter(p => p.category === listingValue);
    titleEl.textContent = (categories.find(c => c.id === listingValue) || {}).label || 'القسم';
  } else if (listingMode === 'search') {
    list = executeFuzzyProductSearch(listingValue, products);
    titleEl.textContent = `نتائج البحث عن: "${listingValue}"`;
  } else if (listingMode === 'promo_offer') {
    const allowedSet = new Set((listingValue || []).map(String));
    list = list.filter(p => allowedSet.has(String(p.id)));
    titleEl.textContent = `عروض: ${window.__currentPromoTitle || 'المنتجات المشمولة بالعرض'}`;
  } else {
    titleEl.textContent = 'الأكثر مبيعاً 🔥';
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';

  const visibleList = list.slice(0, listingDisplayLimit);
  renderProductGrid('listingGrid', visibleList);

  if (loadMoreWrap) {
    if (list.length > listingDisplayLimit) {
      loadMoreWrap.style.display = 'block';
      const remaining = list.length - listingDisplayLimit;
      const btn = document.getElementById('listingLoadMoreBtn');
      if (btn) btn.textContent = `عرض المزيد من المنتجات (المتبقي: ${remaining}) ⬇️`;
    } else {
      loadMoreWrap.style.display = 'none';
    }
  }
}

function loadMoreListingProducts() {
  listingDisplayLimit += 30;
  renderListing();
}

function selectDelivery(method) {
  setDeliveryMethod(method);
  document.getElementById('delStandard')?.classList.toggle('selected', method === 'standard');
  document.getElementById('delExpress')?.classList.toggle('selected', method === 'express');
  renderCheckoutSummary();
}

async function applyPromoCode() {
  const input = document.getElementById('promoCodeInput');
  const statusEl = document.getElementById('promoCodeStatus');
  const code = input ? input.value.trim() : '';

  if (!code) {
    if (statusEl) { statusEl.textContent = 'يرجى كتابة كود الخصم أولاً'; statusEl.style.color = '#DC2626'; }
    return;
  }

  const subtotal = getCartSubtotal();
  if (statusEl) { statusEl.textContent = 'جاري التحقق من الكود... ⏳'; statusEl.style.color = 'var(--text-soft)'; }

  const res = await apiFetch('/api/coupons/validate', {
    method: 'POST',
    body: JSON.stringify({ code, subtotal })
  });

  if (res && res.success) {
    setAppliedPromo({ code: res.code, discountAmount: res.discountAmount, type: res.type });
    if (statusEl) { statusEl.textContent = res.message || 'تم تفعيل الكود بنجاح ✓'; statusEl.style.color = '#10B981'; }
    if (input) input.disabled = true;
    const btn = document.getElementById('applyPromoBtn');
    if (btn) { btn.textContent = 'إلغاء'; btn.setAttribute('onclick', 'window.App.removePromoCode()'); }
    renderCheckoutSummary();
  } else {
    setAppliedPromo(null);
    if (statusEl) { statusEl.textContent = (res && res.message) || 'كود الخصم غير صحيح'; statusEl.style.color = '#DC2626'; }
    renderCheckoutSummary();
  }
}

function removePromoCode() {
  setAppliedPromo(null);
  const input = document.getElementById('promoCodeInput');
  const statusEl = document.getElementById('promoCodeStatus');
  const btn = document.getElementById('applyPromoBtn');
  if (input) { input.disabled = false; input.value = ''; }
  if (statusEl) statusEl.textContent = '';
  if (btn) { btn.textContent = 'تفعيل'; btn.setAttribute('onclick', 'window.App.applyPromoCode()'); }
  renderCheckoutSummary();
}

function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderCurrentActiveView();
}

// ---------------------------------------------------------
// 🛠️ التعديل السريع مع اختيار القسم وتحديث العداد
// ---------------------------------------------------------
async function quickEditPrice(id, currentPrice) {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  const newPriceStr = prompt('تعديل السعر المباشر (د.ع):', currentPrice);
  if (newPriceStr === null) return;
  const newPrice = Number(newPriceStr.trim());
  if (isNaN(newPrice) || newPrice <= 0) {
    showToast('يرجى إدخال سعر صحيح أكبر من صفر');
    return;
  }
  if (db) await dbPaths.productsCol().doc(String(id)).set({ price: newPrice }, { merge: true });
  showToast('تم تحديث السعر فورياً ✓');
}

async function quickToggleStock(id) {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  const p = findProduct(id);
  if (!p) return;
  const newStock = (p.inStock === false) ? true : false;
  if (db) await dbPaths.productsCol().doc(String(id)).set({ inStock: newStock }, { merge: true });
  showToast(newStock ? 'تم التعيين: متوفر 🟢' : 'تم التعيين: نفذت الكمية 🔴');
}

async function archiveProductConfirm(id, name) {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  if (confirm(`هل أنتِ متأكدة من نقل المنتج "${name}" إلى سلة المحذوفات؟`)) {
    if (db) {
      await dbPaths.productsCol().doc(String(id)).set({
        isDeleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      showToast(`تم نقل "${name}" إلى سلة المحذوفات 🗑️`);
    }
  }
}

function populateSfQuickEditCategories(selectedCatId) {
  const select = document.getElementById('sfQuickEditProdCat');
  if (!select) return;
  select.innerHTML = categories.map(c =>
    `<option value="${sanitizeText(c.id)}" ${c.id === selectedCatId ? 'selected' : ''}>${sanitizeText(c.label)}</option>`
  ).join('');
}

// 🌟 (إصلاح جذري — نافذة التعديل السريع لا تفتح) السبب الحقيقي: عناصر النافذة
// (#sfQuickEditModal وكل الحقول بداخلها) غير موجودة إطلاقاً بملف index.html، بينما تحاول
// openAdminQuickEditModal الوصول لها مباشرة عبر getElementById(...).value — فيرمي المتصفح
// خطأ "Cannot set properties of null" في أول سطر، وينهار تنفيذ الدالة بالكامل قبل أن تصل
// أبداً لسطر إظهار النافذة (.classList.add('open')). الحل المعماري الأنسب الذي لا يتطلب أي
// تعديل على ملف HTML منفصل: بناء عناصر النافذة ديناميكياً وحقنها في الصفحة تلقائياً عند أول
// استخدام فقط (باستخدام كلاسات admin-quick-modal-overlay / admin-quick-card / form-field
// الجاهزة والمُنسّقة أصلاً بملف style.css)، فتُصلح نفسها بنفسها بدون أي كسر لأي شيء آخر.
function ensureQuickEditModalMarkup() {
  if (document.getElementById('sfQuickEditModal')) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="admin-quick-modal-overlay" id="sfQuickEditModal">
      <div class="admin-quick-card" style="max-width:460px; text-align:right; max-height:88vh; overflow-y:auto;">
        <div class="consult-header" style="padding:0 0 12px; border-bottom:1px solid var(--line); margin-bottom:14px;">
          <h4 style="margin:0; font-weight:900;">تعديل سريع للمنتج ✏️</h4>
          <button type="button" onclick="window.App.closeSfQuickEditModal()" style="font-weight:900; font-size:16px;">✕</button>
        </div>
        <input type="hidden" id="sfQuickEditProdId">
        <div class="form-field">
          <label>اسم المنتج</label>
          <input type="text" id="sfQuickEditProdName">
        </div>
        <div class="form-field">
          <label>القسم</label>
          <select id="sfQuickEditProdCat"></select>
        </div>
        <div class="form-field">
          <label>الكمية بالمخزون</label>
          <input type="number" id="sfQuickEditProdStockQty" min="0">
        </div>
        <div class="form-field">
          <label>رابط صورة المنتج</label>
          <input type="text" id="sfQuickEditProdImg">
          <div id="sfQuickEditProdImgPreviewBox" style="display:none; margin-top:8px; justify-content:center;">
            <img id="sfQuickEditProdImgPreviewEl" style="width:70px; height:70px; object-fit:cover; border-radius:12px; border:1px solid var(--line);">
          </div>
        </div>
        <div class="form-field">
          <label>الوصف</label>
          <textarea id="sfQuickEditProdDesc" rows="2"></textarea>
        </div>
        <div class="form-field">
          <label>المكونات</label>
          <textarea id="sfQuickEditProdIng" rows="2"></textarea>
        </div>
        <div class="form-field">
          <label>طريقة الاستخدام</label>
          <textarea id="sfQuickEditProdUsage" rows="2"></textarea>
        </div>
        <div style="display:flex; gap:10px;">
          <div class="form-field" style="flex:1;">
            <label>التقييم</label>
            <input type="number" id="sfQuickEditProdRating" step="0.1" min="0" max="5">
          </div>
          <div class="form-field" style="flex:1;">
            <label>عدد التقييمات</label>
            <input type="number" id="sfQuickEditProdReviews" min="0">
          </div>
        </div>
        <button type="button" class="auth-btn-google" style="margin-top:6px;" onclick="window.App.saveSfQuickEdit()">💾 حفظ التعديلات فورياً</button>
      </div>
    </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

function openAdminQuickEditModal(id) {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  const p = findProduct(id);
  if (!p) return;

  ensureQuickEditModalMarkup();

  document.getElementById('sfQuickEditProdId').value = id;
  document.getElementById('sfQuickEditProdName').value = p.name || '';
  document.getElementById('sfQuickEditProdStockQty').value = (p.stockQuantity !== undefined) ? p.stockQuantity : 10;
  document.getElementById('sfQuickEditProdRating').value = p.rating || '';
  document.getElementById('sfQuickEditProdReviews').value = p.reviews || 0;
  document.getElementById('sfQuickEditProdDesc').value = p.description || '';
  document.getElementById('sfQuickEditProdIng').value = p.ingredients || '';
  document.getElementById('sfQuickEditProdUsage').value = p.usage || '';

  populateSfQuickEditCategories(p.category || (categories[0] ? categories[0].id : ''));

  const imgInput = document.getElementById('sfQuickEditProdImg');
  const imgPreview = document.getElementById('sfQuickEditProdImgPreviewEl');
  const imgBox = document.getElementById('sfQuickEditProdImgPreviewBox');
  if (p.imageUrl) {
    imgInput.value = p.imageUrl;
    imgPreview.src = p.imageUrl;
    imgBox.style.display = 'flex';
  } else {
    imgInput.value = '';
    imgBox.style.display = 'none';
  }

  document.getElementById('sfQuickEditModal')?.classList.add('open');
}

function closeSfQuickEditModal() {
  document.getElementById('sfQuickEditModal')?.classList.remove('open');
}

async function saveSfQuickEdit() {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  const id = document.getElementById('sfQuickEditProdId').value;
  const name = document.getElementById('sfQuickEditProdName').value.trim();
  const category = document.getElementById('sfQuickEditProdCat')?.value || '';
  const stockQty = Number(document.getElementById('sfQuickEditProdStockQty').value || 0);
  const imgUrl = sanitizeUrl(document.getElementById('sfQuickEditProdImg').value.trim());
  const desc = document.getElementById('sfQuickEditProdDesc').value.trim();
  const ing = document.getElementById('sfQuickEditProdIng').value.trim();
  const usage = document.getElementById('sfQuickEditProdUsage').value.trim();
  const rating = Number(document.getElementById('sfQuickEditProdRating').value || 0) || 0;
  const reviews = Number(document.getElementById('sfQuickEditProdReviews').value || 0) || 0;

  if (!name) {
    showToast('يرجى إدخال اسم المنتج');
    return;
  }

  if (db) {
    await dbPaths.productsCol().doc(String(id)).set({
      name: sanitizeText(name),
      category: sanitizeText(category),
      stockQuantity: stockQty,
      inStock: stockQty > 0,
      imageUrl: imgUrl,
      description: sanitizeText(desc),
      ingredients: sanitizeText(ing),
      usage: sanitizeText(usage),
      rating,
      reviews
    }, { merge: true });

    const p = findProduct(id);
    if (p) {
      p.name = name;
      p.category = category;
      p.stockQuantity = stockQty;
      p.inStock = stockQty > 0;
      p.imageUrl = imgUrl;
    }
    renderModernCategories();
    renderCurrentActiveView();
  }

  showToast('تم حفظ تعديلات المنتج وتحديث القسم فورياً ✓');
  closeSfQuickEditModal();
}

// ---------------------------------------------------------
// ⚡ (إصلاح #1) أداة يدوية لتوليد وحبس كتالوج R2 السحابي بنقرة واحدة من لوحة التحكم
// ---------------------------------------------------------
async function manualRebuildR2Catalog() {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;

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

// ---------------------------------------------------------
// 📂 القائمة الجانبية والبيانات المحفوظة
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
// 🔐 الحساب والتسجيل
// ---------------------------------------------------------
function updateUserHeaderProfile() {
  const chipName = document.getElementById('userChipName');
  if (chipName) chipName.textContent = currentUser ? (currentUser.displayName || 'حسابي').split(' ')[0] : 'دخول';
}

function updateAdminInterfaceState() {
  const isAdmin = isCurrentUserAdmin(pharmacyProfile, currentStaffData);
  const topBar = document.getElementById('adminTopBar');
  const menuLink = document.getElementById('adminMenuLink');
  const bnAdmin = document.getElementById('bn-admin');
  if (topBar) topBar.style.display = isAdmin ? 'flex' : 'none';
  if (menuLink) menuLink.style.display = isAdmin ? 'flex' : 'none';
  if (bnAdmin) bnAdmin.style.display = isAdmin ? 'flex' : 'none';
}

// 🌟 (إصلاح — Phone Login UI) accountAuthTab يتحكم الآن فقط بالتبديل بين "دخول" و"تسجيل حساب"
// ضمن نموذج الهاتف نفسه. زر Google لم يعد يُخفي نموذج الهاتف داخل تبويب منفصل — كلاهما
// ظاهر دائماً في نفس الوقت، لأن إخفاء نموذج الهاتف خلف تبويب هو ما جعله يبدو "اختفى" من الواجهة.
let accountAuthTab = 'phone-login';

function setAccountAuthTab(tab) {
  accountAuthTab = tab;
  renderAccountView();
}

function renderAccountView() {
  const container = document.getElementById('accountAuthContainer');
  if (!container) return;

  if (currentUser) {
    const isPhoneUser = (currentUser.uid || '').startsWith('phone_');
    const subLine = isPhoneUser
      ? sanitizeText(currentUser.phoneNumber || currentUser.reloadUserInfo?.phoneNumber || '')
      : sanitizeText(currentUser.email || '');
    container.innerHTML = `
      <div class="account-card">
        <h3>${sanitizeText(currentUser.displayName || 'حسابي')}</h3>
        <p>${subLine}</p>
        <button class="auth-btn-google" style="margin-top:14px;" onclick="window.App.showView('orders')">📦 عرض طلباتي وتتبع الشحن</button>
        <button class="auth-btn-logout" onclick="window.App.handleSignOut()">تسجيل الخروج</button>
      </div>`;
    return;
  }

  const isRegister = accountAuthTab === 'phone-register';
  container.innerHTML = `
    <div class="account-card">
      <h3>تسجيل الدخول</h3>
      <p style="font-size:12.5px; color:var(--text-soft); margin:8px 0 16px;">سجلي الدخول بنقرة واحدة لحفظ منتجاتك ومتابعة طلباتكِ:</p>
      <button class="auth-btn-google" onclick="window.App.signInWithGoogle()">دخول سريع عبر Google</button>

      <div style="display:flex; align-items:center; gap:10px; margin:18px 0;">
        <div style="flex:1; height:1px; background:var(--line);"></div>
        <span style="font-size:11.5px; color:var(--text-soft); font-weight:800;">أو بالاسم ورقم الهاتف</span>
        <div style="flex:1; height:1px; background:var(--line);"></div>
      </div>

      <h3 style="font-size:14px;">${isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول برقم الهاتف'}</h3>
      <div id="phoneAuthStatus" style="margin:8px 0; font-size:12px; font-weight:800;"></div>
      ${isRegister ? `
        <div class="form-field">
          <label>الاسم</label>
          <input type="text" id="phoneAuthName" placeholder="مثال: سارة أحمد">
        </div>` : ''}
      <div class="form-field">
        <label>رقم الهاتف</label>
        <input type="tel" id="phoneAuthPhone" placeholder="07xxxxxxxxx">
      </div>
      <div class="form-field">
        <label>الرمز السري (4 إلى 6 أرقام)</label>
        <input type="password" id="phoneAuthPin" inputmode="numeric" maxlength="6" placeholder="••••">
      </div>
      <button class="auth-btn-google" onclick="window.App.${isRegister ? 'registerWithPhone' : 'loginWithPhone'}()">${isRegister ? 'إنشاء الحساب' : 'دخول'}</button>
      <p style="text-align:center; font-size:12px; margin-top:12px; color:var(--text-soft);">
        ${isRegister ? 'عندك حساب؟' : 'ما عندك حساب؟'}
        <span style="color:var(--accent); font-weight:800; cursor:pointer;" onclick="window.App.setAccountAuthTab('${isRegister ? 'phone-login' : 'phone-register'}')">${isRegister ? 'دخول' : 'إنشاء حساب جديد'}</span>
      </p>
    </div>`;
}

async function registerWithPhone() {
  const name = document.getElementById('phoneAuthName')?.value.trim();
  const phone = document.getElementById('phoneAuthPhone')?.value.trim();
  const pin = document.getElementById('phoneAuthPin')?.value.trim();
  const statusEl = document.getElementById('phoneAuthStatus');

  if (!name || !phone || !pin) {
    if (statusEl) { statusEl.textContent = 'يرجى تعبئة كل الحقول'; statusEl.style.color = '#DC2626'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'جاري إنشاء الحساب... ⏳'; statusEl.style.color = 'var(--text-soft)'; }

  const res = await apiFetch('/api/auth/phone-register', {
    method: 'POST',
    body: JSON.stringify({ name, phone, pin })
  });

  if (res && res.success && res.token) {
    await completePhoneSignIn(res.token, res.name);
  } else {
    if (statusEl) { statusEl.textContent = (res && res.message) || 'تعذر إنشاء الحساب'; statusEl.style.color = '#DC2626'; }
  }
}

async function loginWithPhone() {
  const phone = document.getElementById('phoneAuthPhone')?.value.trim();
  const pin = document.getElementById('phoneAuthPin')?.value.trim();
  const statusEl = document.getElementById('phoneAuthStatus');

  if (!phone || !pin) {
    if (statusEl) { statusEl.textContent = 'يرجى تعبئة رقم الهاتف والرمز السري'; statusEl.style.color = '#DC2626'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'جاري تسجيل الدخول... ⏳'; statusEl.style.color = 'var(--text-soft)'; }

  const res = await apiFetch('/api/auth/phone-login', {
    method: 'POST',
    body: JSON.stringify({ phone, pin })
  });

  if (res && res.success && res.token) {
    await completePhoneSignIn(res.token, res.name);
  } else {
    if (statusEl) { statusEl.textContent = (res && res.message) || 'تعذر تسجيل الدخول'; statusEl.style.color = '#DC2626'; }
  }
}

async function completePhoneSignIn(token, name) {
  if (!auth) return;
  try {
    const cred = await auth.signInWithCustomToken(token);
    if (cred && cred.user && name) {
      await cred.user.updateProfile({ displayName: name });
      setCurrentUser(auth.currentUser);
    }
    showToast(`مرحباً ${name || ''} 🌸`);
  } catch (err) {
    showToast('⚠️ تعذر تسجيل الدخول، حاولي مجدداً');
  }
}

function explainAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return '⚠️ هذا النطاق غير مصرّح له بتسجيل الدخول عبر Google.';
    case 'auth/operation-not-supported-in-this-environment':
      return '⚠️ يرجى فتح الرابط بمتصفح خارجي (Chrome/Safari).';
    case 'auth/popup-blocked':
      return '⚠️ تم حظر نافذة تسجيل الدخول من المتصفح.';
    case 'auth/network-request-failed':
      return '⚠️ تعذر الاتصال بالإنترنت، يرجى التحقق من الشبكة.';
    default:
      return `⚠️ تعذر تسجيل الدخول: ${err && err.message ? err.message : 'خطأ غير معروف'}`;
  }
}

// 🌟 (إصلاح جذري — Google Auth لا تكتمل الجلسة) السبب الحقيقي: signInWithPopup يعتمد على
// إطار iframe مخفي مستضاف على authDomain الموحّد للمشروع (cottanpharmacy.firebaseapp.com)
// لتمرير نتيجة الدخول للنافذة الأصلية عبر تخزين طرف-ثالث (Third-Party Storage). بما أن هذا
// مشروع Multi-Tenant يعمل على نطاقات فرعية ودومينات مخصصة متعددة (مختلفة عن authDomain)،
// تحظر المتصفحات الحديثة (Chrome/Safari) هذا التخزين الطرف-ثالث بشكل افتراضي. النتيجة
// العملية: تُفتح نافذة جوجل، يختار الزبون حسابه، تُغلق النافذة بنجاح ظاهرياً... لكن الـ SDK
// يعجز عن قراءة النتيجة من الإطار المخفي فيرفض الـ Promise برمز "auth/popup-closed-by-user"
// (وهو رمز كان يُتجاهل عمداً بالكود القديم بوصفه إلغاءً من المستخدم!) فلا تكتمل الجلسة ولا
// تُحفظ أبداً — تماماً كما وُصفت المشكلة. الحل المعماري السليم: الانتقال الكامل لآلية
// signInWithRedirect، وهي تنقّل حقيقي على مستوى الصفحة (Top-Level Navigation) لا تحتاج أي
// تواصل بين نافذتين ولا تتأثر بحجب التخزين الطرف-ثالث إطلاقاً.
function signInWithGoogle() {
  if (!auth) {
    showToast('⚠️ تعذر الاتصال بخدمة تسجيل الدخول.');
    return;
  }
  if (isInAppBrowser()) {
    showToast('⚠️ افتحي الرابط بمتصفح خارجي مثل Chrome أو Safari.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  showToast('جاري تحويلك لتسجيل الدخول عبر Google... 🔄');
  auth.signInWithRedirect(provider).catch(err => {
    showToast(explainAuthError(err));
  });
}

// 🌟 يُستدعى فور تحميل الصفحة بعد رجوع Google للموقع (Redirect). لازم تحديث الواجهة يدوياً
// هنا أيضاً (لا الاعتماد فقط على onAuthStateChanged) لضمان ظهور رسالة الترحيب وتحديث
// حالة الحساب فوراً بدون أي تأخير أو الحاجة لتفاعل إضافي من الزبون.
function captureAuthRedirectResult() {
  if (!auth) return;
  auth.getRedirectResult().then(result => {
    if (result && result.user) {
      showToast(`مرحباً ${result.user.displayName || ''} 🌸`);
      setCurrentUser(result.user);
      updateUserHeaderProfile();
      updateAdminInterfaceState();
      renderAccountView();
      renderCurrentActiveView();
    }
  }).catch(err => {
    if (err && err.code) showToast(explainAuthError(err));
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
// 🎨 إعدادات المتجر وشاشة التحميل الديناميكية
// (إصلاح #4: تطبيق لون/تدرج خلفية شاشة التحميل من منتقي الألوان المرئي أو الحقل النصي المتقدم)
// ---------------------------------------------------------
function applyStoreSettings() {
  applyTheme(pharmacyProfile.templateId || 'template_default', pharmacyProfile.primaryColor);
  if (document.getElementById('headerLogoText')) document.getElementById('headerLogoText').textContent = pharmacyProfile.name || 'الصيدلية';
  if (document.getElementById('drawerLogoTitle')) document.getElementById('drawerLogoTitle').textContent = pharmacyProfile.name || 'الصيدلية';

  const logoMark = document.getElementById('headerLogoMark');
  if (logoMark) {
    const cleanLogo = sanitizeUrl(pharmacyProfile.logoUrl);
    logoMark.innerHTML = cleanLogo
      ? `<img src="${cleanLogo}" alt="${sanitizeText(pharmacyProfile.name || '')}" style="width:26px; height:26px; object-fit:cover; border-radius:50%;">`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #E85D8A)" stroke-width="2"><circle cx="12" cy="8" r="3"/><circle cx="8" cy="10" r="3"/><circle cx="16" cy="10" r="3"/><path d="M12 13v7"/></svg>`;
  }

  // تخصيص شاشة التحميل الأولية ديناميكياً
  const loaderWrap = document.getElementById('loaderCircleWrap');
  const loaderImg = document.getElementById('loaderPhotoImg');
  const loaderTitle = document.getElementById('loaderTitleText');
  const loaderOverlay = document.getElementById('appLoadingOverlay');

  if (loaderWrap && pharmacyProfile.loaderCircleSize) {
    const sz = `${pharmacyProfile.loaderCircleSize}px`;
    loaderWrap.style.width = sz;
    loaderWrap.style.height = sz;
  }
  if (loaderImg) {
    const targetImg = sanitizeUrl(pharmacyProfile.loaderImgUrl || pharmacyProfile.logoUrl || pharmacyProfile.bannerImgUrl);
    if (targetImg) loaderImg.src = targetImg;
  }
  if (loaderTitle && pharmacyProfile.loaderTitle) {
    loaderTitle.textContent = pharmacyProfile.loaderTitle;
  }
  // 🌟 (إصلاح #4) قيمة loaderBgColor تُحفظ إما من منتقي الألوان المرئي (hex) أو من الحقل النصي
  // المتقدم (تدرج CSS)؛ نطبقها مباشرة على خلفية شاشة التحميل بدون أي فقدان لميزة التدرجات.
  if (loaderOverlay && pharmacyProfile.loaderBgColor) {
    loaderOverlay.style.background = pharmacyProfile.loaderBgColor;
  }

  renderHeroSlider();
}

// ---------------------------------------------------------
// 🚀 مزامنة البيانات السحابية (كاش R2 لساعة كاملة + فصل onSnapshot)
// (إصلاح #1: حفظ حالة الكاش وعرض التوست فقط بعد تأكيد تسجيل دخول المشرف داخل
//  auth.onAuthStateChanged، ومنع onSnapshot للمنتجات تماماً عن غير المشرف المعتمد)
// ---------------------------------------------------------
let lastCatalogCacheStatus = null;

async function fetchCatalogFromR2() {
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/catalog?pharmacy=${encodeURIComponent(currentPharmacyId)}`);
    if (res.ok) {
      const cacheStatus = res.headers.get("X-Cache-Status") || res.headers.get("cf-cache-status") || "HIT";
      lastCatalogCacheStatus = cacheStatus;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setProducts(data);
        saveLocalState();
        renderCurrentActiveView();
        // ⚠️ لا نعرض توست حالة الكاش هنا لأن هوية المستخدم (مشرف أم لا) لم تُحسم بعد في هذه
        // اللحظة من دورة تحميل الصفحة — سيتم عرضه لاحقاً من داخل auth.onAuthStateChanged
        // عبر announceCacheStatusToAdminIfNeeded() بعد التأكد الكامل من صلاحيات المستخدم.
        return true;
      }
    }
  } catch (e) {
    console.warn("R2 catalog fetch fallback to Firestore:", e);
  }
  return false;
}

// 🌟 (إصلاح #1) يُستدعى فقط من داخل auth.onAuthStateChanged بعد التأكد الفعلي من هوية
// المستخدم وصلاحياته الإدارية — يعرض إشعار حالة كاش R2 (HIT/MISS) بعد ثانية واحدة بالضبط.
function announceCacheStatusToAdminIfNeeded() {
  if (!lastCatalogCacheStatus) return;
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) return;
  setTimeout(() => {
    showToast(`⚡ كاش Cloudflare R2: [${lastCatalogCacheStatus}] (كاش ساعة كاملة)`);
  }, 1000);
}

// 🌟 (جديد — حل جذري لوميض التصميم وتأخر تحديث شاشة التحميل) جلب سريع لإعدادات الثيم من
// كاش R2/Cache API عبر /api/theme (نفس سرعة /api/catalog تماماً — عادة أقل من 150ms من
// الحافة) بدل انتظار قراءة Firestore الحية الأبطأ نسبياً. يُستدعى فور الإقلاع، فوق الكاش
// المحلي الفوري (state.js) القادم من الزيارة السابقة، ويُستبدل لاحقاً ببيانات Firestore
// الحية الكاملة (onSnapshot) بمجرد وصولها — كل ذلك دون أي قراءة إضافية لحصة Firestore.
async function fetchThemeFromR2() {
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/theme?pharmacy=${encodeURIComponent(currentPharmacyId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        setPharmacyProfile(data);
        applyStoreSettings();
        renderHeroSlider();
        return true;
      }
    }
  } catch (e) {
    console.warn("Theme R2 fetch fallback to Firestore:", e);
  }
  return false;
}

function initFirestoreRealtimeSync() {
  if (!isFirebaseConfigured || !db) return;

  function applyPharmacyDocData(data) {
    setPharmacyProfile(data);
    if (data.brandsData) setBrandsData({ ...brandsData, ...data.brandsData });
    applyStoreSettings();
    renderCurrentActiveView();
  }

  const pharmacyDocPromise = dbPaths.pharmacyDoc().get({ source: 'server' }).then(doc => {
    if (doc.exists) applyPharmacyDocData(doc.data());
  }).catch(() => {});

  dbPaths.pharmacyDoc().onSnapshot(doc => {
    if (doc.exists) applyPharmacyDocData(doc.data());
  }, console.warn);

  // 🌟 (إصلاح جذري — "الأقسام/البكجات ما تظهر إلا بعد الرجوع للصفحة") السبب الحقيقي: كل
  // مستمع بيانات (بروفايل الصيدلية، الأقسام، البكجات) كان يستدعي دالة رسم "خاصة به" فقط
  // (renderHome أو renderModernCategories)، دون أي تنسيق بين الاثنين. لو وصلت بيانات
  // البروفايل بعد وصول الأقسام/البكجات (وهذا متوقع جداً — كل قراءة شبكة تصل بترتيب مختلف
  // كل مرة)، كان renderHome() القديم يعيد رسم قسم البكجات فقط باستخدام بيانات تلك اللحظة،
  // بينما لا شيء يعيد رسم الأقسام على الإطلاق إلا عند تبديل العرض يدوياً — فتبقى فارغة حتى
  // يغادر الزائر الصفحة ويعود إليها (وعندها تكون البيانات قد وصلت فعلاً بالذاكرة). الحل:
  // كل مستمع الآن يستدعي renderCurrentActiveView() بعد تحديث حالته الخاصة — فأياً كان
  // العرض الحالي (رئيسية/أقسام/بكجات)، يُعاد رسمه بأحدث نسخة من كل البيانات المتوفرة في
  // الذاكرة في تلك اللحظة، بغضّ النظر عن ترتيب وصول الشبكة.
  const categoriesPromise = dbPaths.categoriesCol().get({ source: 'server' }).then(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setCategories(list);
      renderCurrentActiveView();
    }
  }).catch(() => {});

  dbPaths.categoriesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setCategories(list);
      renderCurrentActiveView();
    }
  }, console.warn);

  const bundlesPromise = dbPaths.bundlesCol().get({ source: 'server' }).then(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setBundles(list);
      renderHomeBundles();
      renderCurrentActiveView();
    }
  }).catch(() => {});

  dbPaths.bundlesCol().onSnapshot(snap => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setBundles(list);
      renderHomeBundles();
      renderCurrentActiveView();
    }
  }, console.warn);

  let didCheckSharedLink = false;
  function applyProductsSnapshot(snap) {
    if (!snap.empty) {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setProducts(list);
      saveLocalState();
      renderCurrentActiveView();
      if (!didCheckSharedLink) {
        didCheckSharedLink = true;
        checkUrlHashForProduct();
      }
    }
  }

  // 1. جلب الكتالوج من كاش R2 السريع أولاً (متاح لجميع الزوار — لا يكشف onSnapshot اللحظي)
  const catalogPromise = fetchCatalogFromR2().then(success => {
    if (!success) {
      return dbPaths.productsCol().get({ source: 'server' }).then(applyProductsSnapshot).catch(() => {});
    }
  });

  // 2. 🛡️ (إصلاح #1) الحل الجذري لمنع وصول السعر للزبائن فورياً عبر WebSockets:
  // لا يُفتح اتصال Firestore المباشر onSnapshot على المنتجات إطلاقاً لغير المشرف المعتمد.
  // هذا الفحص يُعاد تكراره أيضاً داخل auth.onAuthStateChanged أدناه فور تأكد الهوية،
  // بحيث يبقى كاش الـ 60 دقيقة هو المصدر الوحيد للزوار العاديين طوال الوقت.
  if (isCurrentUserAdmin(pharmacyProfile, currentStaffData)) {
    window.__adminProductsSyncAttached = true;
    dbPaths.productsCol().onSnapshot(applyProductsSnapshot, console.warn);
  }

  // 🌟 (إصلاح جذري — "الموقع يظهر بشكله القديم ثم يتحدّث") شاشة التحميل كانت تُخفى فور
  // استجابة بروفايل الصيدلية فقط، حتى لو لم تصل بعد بيانات الأقسام/البكجات/الكتالوج —
  // فيرى الزائر الصفحة "فارغة جزئياً" مباشرة بعد اختفاء شاشة التحميل، ثم تمتلئ تدريجياً
  // أمام عينيه (وهو بالضبط الإحساس الذي وُصف بأنه "غير احترافي"). الآن تنتظر شاشة
  // التحميل اكتمال كل البيانات الأساسية الأربع معاً قبل أن تختفي، فيظهر الموقع دفعة واحدة
  // بشكله النهائي الكامل. لا يوجد أي تأخير اصطناعي مُضاف هنا — فقط انتظار حقيقي لما هو
  // ضروري أصلاً، مع بقاء صمام الأمان (6 ثوانٍ كحد أقصى في index.html) كخط دفاع أخير إن
  // تعطلت الشبكة تماماً.
  Promise.allSettled([pharmacyDocPromise, categoriesPromise, bundlesPromise, catalogPromise]).finally(hideAppLoadingOverlay);
}

function hideAppLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (!overlay || overlay.dataset.hidden) return;
  overlay.dataset.hidden = '1';
  if (window.__loaderInterval) clearInterval(window.__loaderInterval);
  const bar = document.getElementById('loaderProgressBar');
  const text = document.getElementById('loaderPercentText');
  if (bar) bar.style.width = '100%';
  if (text) text.textContent = '100%';
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }, 180);
}

async function bootstrapApp() {
  await resolveCustomDomainTenant();
  setTimeout(hideAppLoadingOverlay, 4000);

  patchTenantLinks();
  applyStoreSettings();
  renderHome();
  renderModernCategories();
  updateCartBadge();
  updateUserHeaderProfile();
  updateAdminInterfaceState();
  fetchThemeFromR2(); // ⚡ لا ننتظرها (fire-and-forget) — تُحدِّث الواجهة أول ما تصل، عادة قبل استجابة Firestore بكثير
  initFirestoreRealtimeSync();
  checkUrlHashForProduct();

  if (auth) {
    captureAuthRedirectResult();
    auth.onAuthStateChanged(user => {
      setCurrentUser(user);
      updateUserHeaderProfile();
      updateAdminInterfaceState();
      renderAccountView();
      renderCurrentActiveView();

      const adminConfirmedNow = isCurrentUserAdmin(pharmacyProfile, currentStaffData);

      // تفعيل المزامنة اللحظية إذا اتضح أن المستخدم مشرف (ومنعها تماماً غير ذلك)
      if (user && adminConfirmedNow && !window.__adminProductsSyncAttached) {
        window.__adminProductsSyncAttached = true;
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

      // 🌟 (إصلاح #1) الآن فقط — بعد أن أصبحت هوية المستخدم وصلاحياته مؤكدة 100% —
      // نعرض إشعار حالة كاش R2 (HIT/MISS) للمشرف، بعد ثانية واحدة بالضبط من هذه اللحظة.
      if (user && adminConfirmedNow) {
        announceCacheStatusToAdminIfNeeded();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', bootstrapApp);

// ---------------------------------------------------------
// 🌟 تصدير كائن window.App الشامل
// ---------------------------------------------------------
window.App = {
  showView, addToCart, addBundleToCart, changeCartQty, removeCartItem,
  selectDelivery, toggleWishlist, openProduct, goBackFromProduct,
  openCategory, openBestSellers, selectHomeBrand, onSearch, openMenu, closeMenu,
  openWhatsapp, executeAtomicOrderCheckout: () => executeAtomicOrderCheckout(showToast),
  openReceiptModal, closeReceiptModal,
  clearSavedCustomerData, signInWithGoogle, handleSignOut,
  changePdQty, switchPdTab, selectProductVariantCard,
  quickEditPrice, quickToggleStock, archiveProductConfirm, openAdminQuickEditModal,
  closeSfQuickEditModal, saveSfQuickEdit,
  shareCurrentProduct, applyPromoCode, removePromoCode,
  setAccountAuthTab, registerWithPhone, loginWithPhone,
  rateProductInstant, loadMoreHomeProducts, loadMoreListingProducts,
  goToHeroSlide, openPromoSlideOffer, manualRebuildR2Catalog
};

// دوال مباشرة لضمان عمل أزرار onclick
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
window.uploadDirectImageFile = uploadDirectImageFile;
window.manualRebuildR2Catalog = manualRebuildR2Catalog;
