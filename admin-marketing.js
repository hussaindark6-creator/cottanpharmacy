/* ==========================================================
   admin-marketing.js — التسويق: الكوبونات، البكجات، العروض الخاصة، بطاقات الترويج
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

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
    refreshStorefrontCache();
    showToast('تم حفظ بكج التوفير وتحديث السيرفر بنجاح! 🎁');
    resetAdminBundleForm();
  }
}

async function deleteAdminBundle(id) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا البكج؟')) {
    if (db) {
      await dbPaths.bundlesCol().doc(String(id)).delete();
      refreshStorefrontCache();
    }
    showToast('تم حذف البكج بنجاح ✓');
  }
}

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
      refreshStorefrontCache();
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
      refreshStorefrontCache();
    }
    showToast('تم حذف الشريحة من السلايدر بنجاح ✓');
  }
}
