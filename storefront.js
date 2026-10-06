/* ==========================================================
   storefront.js — كود واجهة الزبون (المتجر) فقط — يُحمَّل من index.html وحده
   مقتطع حرفياً من script.js بلا أي تغيير بالمنطق (دوال فقط، لا متغيرات حالة).
   سكربت كلاسيكي (ليس module): يشارك النطاق العام مع script.js، وكل ما يحتاجه من متغيرات
   ودوال مشتركة يُقرأ وقت الاستدعاء.
   ترتيب التحميل بـ index.html: admin-stubs.js ثم storefront.js ثم script.js
   (يجب أن يسبق script.js لأن window.App يشير إلى بعض دوال هذا الملف وقت تحميله).
   admin.html لا يحمّل هذا الملف؛ يحمّل بدله storefront-stubs.js (بدائل فارغة الأثر).
   ========================================================== */

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
    // 🛡️ هوية صاحب الطلب يحددها الووركر من توكن Firebase الموثّق (لا من جسم الطلب)
    const orderHeaders = {
      'Content-Type': 'application/json',
      'X-Pharmacy-Id': currentPharmacyId
    };
    try {
      const authUser = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
      if (authUser && typeof authUser.getIdToken === 'function') {
        orderHeaders['Authorization'] = `Bearer ${await authUser.getIdToken()}`;
      }
    } catch (e) { console.warn('Could not attach ID token to order:', e); }

    // 🛡️ حماية من البوتات: Turnstile (إن ضُبط مفتاحه) + حقل فخ مخفي يملؤه البوتات فقط
    const cfToken = TURNSTILE_SITE_KEY ? await getTurnstileToken() : '';
    if (TURNSTILE_SITE_KEY && !cfToken) {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'تأكيد الطلب'; }
      showToast('⚠️ تعذر التحقق الأمني، حدّثي الصفحة وحاولي مجدداً.');
      return;
    }
    const hpEl = document.getElementById('hpWebsite');

    const res = await fetch(`${WORKER_API_BASE}/api/orders`, {
      method: 'POST',
      headers: orderHeaders,
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        deliveryMethod: deliveryMethod,
        items: itemsPayloadForServer,
        promoCode: appliedPromo ? appliedPromo.code : null,
        cfToken,
        website: hpEl ? hpEl.value : ''
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
// ---- Cloudflare Turnstile (يُحمَّل كسولاً فقط عند وجود مفتاح الموقع) ----
let turnstileWidgetId = null;
let turnstileScriptPromise = null;
function loadTurnstileScript() {
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { turnstileScriptPromise = null; reject(new Error('turnstile load failed')); };
    document.head.appendChild(s);
  });
  return turnstileScriptPromise;
}

async function getTurnstileToken() {
  try {
    await loadTurnstileScript();
    const box = document.getElementById('turnstileBox');
    if (!box || !window.turnstile) return '';
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(''), 20000);
      const done = (t) => { clearTimeout(timer); resolve(t || ''); };
      if (turnstileWidgetId !== null) { try { window.turnstile.remove(turnstileWidgetId); } catch (e) {} turnstileWidgetId = null; }
      box.innerHTML = '';
      turnstileWidgetId = window.turnstile.render(box, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: done,
        'error-callback': () => done(''),
        'expired-callback': () => done('')
      });
    });
  } catch (e) { console.warn(e); return ''; }
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
    // 🔐 التحقق عبر الووركر (قواعد Firestore لم تعد تسمح للزبائن بقراءة الكوبونات مباشرة، حتى لا يمكن سحب
    // كل الأكواد). الووركر يطبّق نفس الشروط عند تثبيت الطلب: التفعيل، الانتهاء، الحد الأدنى، وعدد مرات الاستخدام.
    const cleanCode = code.trim().toUpperCase();
    const res = await fetch(`${WORKER_API_BASE}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId },
      body: JSON.stringify({ code: cleanCode, subtotal })
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.success) {
      appliedPromo = { code: data.code || cleanCode, discountAmount: Number(data.discountAmount || 0) };
      showToast('تم تطبيق الخصم بنجاح! 🎉');
      renderCart();
      renderCheckoutSummary();
      return;
    }
    appliedPromo = null;
    showToast((data && data.message) || 'كود الخصم غير صالح أو منتهي الصلاحية ❌');
    return;
  } catch (err) {
    console.warn(err);
  }

  appliedPromo = null;
  showToast('تعذر التحقق من كود الخصم الآن، حاولي بعد قليل ⚠️');
  renderCart();
  renderCheckoutSummary();
}

// ================= 15. REAL RATINGS ENGINE & AUTOFILL =================
// 🛡️ (توفير كتابات Firestore) تم إلغاء تصويت الزبائن بالنجوم نهائياً (كان يكتب بمستند المنتج
// عند كل تقييم). تقييم المنتج المعروض يبقى قيمة يحددها الأدمن من لوحة التحكم فقط.

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

function updateCartBadge() {
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const b1 = document.getElementById('cartBadge');
  const b2 = document.getElementById('bnCartBadge');
  if (b1) { b1.style.display = count > 0 ? 'flex' : 'none'; b1.textContent = count; }
  if (b2) { b2.style.display = count > 0 ? 'flex' : 'none'; b2.textContent = count; }
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
    bestsellers: 'المنتجات المتوفرة',
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
    list = list.filter(p => p.inStock !== false);
  } else if (listingMode === 'promo_offer') {
    const allowedSet = new Set((listingValue || []).map(String));
    list = list.filter(p => allowedSet.has(String(p.id)));
  }

  const countEl = document.getElementById('listingCount');
  if (countEl) countEl.textContent = list.length + ' منتج';
  renderProductGrid('listingGrid', list);
}

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

  // 🛡️🐛 (إصلاح — الشريحة الأولى (اسم الصيدلية) لا تظهر أولاً عند الدخول) بالرغم من أن
  // شريحة اسم الصيدلية تُبنى دائماً أولاً بترتيب DOM هنا فوق (mainSlideHtml قبل
  // promoSlidesHtml)، فمكان التمرير الأفقي الابتدائي (scrollLeft) بحاوية RTL يختلف سلوكه
  // فعلياً بين المتصفحات (بعضها يبدأ من site الشريحة الأخيرة بدل الأولى في سياق RTL) — وهذا
  // بالضبط ما يجعل آخر شريحة عروض مضافة تظهر أولاً أحياناً بدل شريحة اسم الصيدلية. الحل:
  // تصفير موضع التمرير صراحة على الشريحة الأولى (فهرس 0) فور بناء الشرائح، بلا انتظار أي
  // سلوك تلقائي من المتصفح قد يختلف.
  requestAnimationFrame(() => { track.scrollLeft = 0; });
  currentHeroSlideIndex = 0;

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

function goToHeroSlide(index) {
  const track = document.getElementById('heroCarouselTrack');
  if (!track) return;
  const w = track.clientWidth;
  track.scrollTo({ left: index * w * (document.dir === 'rtl' ? -1 : 1), behavior: 'smooth' });
  updateHeroCarouselDots(index);
}
function renderHomeProductGrid() {
  const title = document.getElementById('homeGridTitle');
  if (!title) return;
  
  let list = products.filter(p => p.isDeleted !== true);
  if (homeActiveBrand === 'all') {
    // 🔄 (تحديث بطلب صريح) استُبدل قسم "الأكثر مبيعاً 🔥" بـ"المنتجات المتوفرة" — يعرض
    // المنتجات المتوفرة بالمخزون حالياً بدل ترتيبها حسب عدد المبيعات.
    title.textContent = 'المنتجات المتوفرة';
    list = list.filter(p => p.inStock !== false);
  } else {
    title.textContent = 'منتجات ' + homeActiveBrand;
    list = list.filter(p => p.brand === homeActiveBrand);
  }

  renderProductGrid('bestSellersGrid', list);
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
  const discounted = getDiscountedProducts();
  const countEl = document.getElementById('offersCount');
  if (countEl) countEl.textContent = discounted.length + ' عرض';
  renderProductGrid('offersGrid', discounted, 'لا توجد عروض على المنتجات حالياً — تابعونا قريباً 🌸');
}

// 🏷️ كل منتج عليه خصم فعلي (السعر الحالي أقل من السعر قبل الخصم) يظهر تلقائياً بتبويب العروض مرتباً من الأعلى
// خصماً للأقل، دون أي إجراء إضافي من الأدمن. يُستدعى أيضاً لتحديث عدّاد التبويب العلوي.
function getDiscountedProducts() {
  const pct = (p) => (1 - Number(p.price) / Number(p.oldPrice));
  return products
    .filter(p => p.isDeleted !== true && Number(p.oldPrice) > 0 && Number(p.price) > 0 && Number(p.oldPrice) > Number(p.price))
    .sort((a, b) => pct(b) - pct(a));
}

function updateOffersTabCount() {
  const el = document.getElementById('offersTabCount');
  if (!el) return;
  const n = getDiscountedProducts().length;
  el.textContent = n > 0 ? n : '';
  el.style.display = n > 0 ? 'inline-flex' : 'none';
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

function renderProductDetailDOM(p) {
  const color = getBrandColor(p.brand);
  const pdImgEl = document.getElementById('pdImage');
  if (!pdImgEl) return;
  pdImgEl.style.background = color + '18';
  const cleanImg = sanitizeUrl(p.imageUrl);
  pdImgEl.innerHTML = cleanImg ? `<img src="${cleanImg}">` : (icons[p.type] || icons.bottle)(color);

  document.getElementById('pdBrand').textContent = p.brand || '';
  document.getElementById('pdName').textContent = p.name + (p.size ? ' — ' + p.size : '');

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
  document.querySelectorAll('.pd-tab').forEach((el,i) => el.classList.toggle('active', ['desc','ing','use'][i] === tab));
  const dTab = document.getElementById('pdTabDesc');
  const iTab = document.getElementById('pdTabIng');
  const uTab = document.getElementById('pdTabUse');
  if (dTab) dTab.classList.toggle('active', tab === 'desc');
  if (iTab) iTab.classList.toggle('active', tab === 'ing');
  if (uTab) uTab.classList.toggle('active', tab === 'use');
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
