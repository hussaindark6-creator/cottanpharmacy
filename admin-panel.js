/* ==========================================================
   admin-panel.js — كود لوحة التحكم (يُحمَّل لحساب الأدمن فقط)
   مقتطع حرفياً من script.js (الإصدار 6.x) بلا أي تغيير بالمنطق.
   سكربت كلاسيكي (ليس module) ويعتمد على النطاق العام المشترك مع script.js:
   كل ما يلزمه من متغيرات ودوال عامة (products, dbPaths, showToast ...) يُقرأ وقت الاستدعاء.
   ملاحظة ترتيب التحميل:
     • admin.html : admin-panel.js ثم script.js (مباشرة)
     • index.html : admin-stubs.js ثم script.js، ويُحمَّل هذا الملف عند أول استدعاء من أدمن.
   ========================================================== */

function escapeHtml(str) {
  return sanitizeText(str);
}

async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Pharmacy-Id": currentPharmacyId,
    ...(options.headers || {})
  };

  // 🛡️🐛 (إصلاح جذري — السبب الحقيقي وراء "غير مصرح: يرجى تسجيل الدخول أولاً") كان الكود
  // يستخدم user.getIdToken() بلا إجبار على التحديث — وهذا أحياناً يرجع توكن مخزَّن محلياً
  // بمتصفح قد يكون قارب على الانتهاء أو غير صالح لأي سبب (مثلاً التبويب بقي خاملاً لفترة).
  // getIdToken(true) يجبر Firebase على جلب توكن جديد فعلياً من سيرفراته في كل استدعاء،
  // فيضمن أن كل طلب لمسارات /api/admin/* يصل بتوكن صالح دائماً — هذا بالضبط ما كان يفشل
  // بصمت ويمنع تحديث كاش R2 (وبالتالي السعر) للزبائن رغم نجاح الحفظ بفايرستور نفسه.
  const user = auth ? auth.currentUser : currentUser;
  if (user) {
    try {
      const token = await user.getIdToken(true);
      headers["Authorization"] = `Bearer ${token}`;
    } catch (e) {
      console.warn("Could not get ID token:", e);
      // 🛡️ (إصلاح) هذا الفشل كان صامتاً تماماً — الطلب كان يكمل بلا Authorization header
      // إطلاقاً، فيرفضه السيرفر لاحقاً بخطأ "غير مصرح" بلا أي تفسير مفهوم للأدمن. الآن
      // نوقف الطلب فوراً برسالة واضحة بدل إرساله للفشل لاحقاً بصمت.
      return { success: false, message: '⚠️ تعذّر التحقق من هويتك — يرجى تسجيل الخروج والدخول مجدداً ثم إعادة المحاولة.' };
    }
  } else {
    console.warn('apiFetch: لا يوجد مستخدم مسجَّل دخول حالياً (auth.currentUser فارغ) — سيُرسَل الطلب بلا توثيق.');
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
      if (res && res.success) {
        console.log("R2 catalog rebuilt successfully:", res.totalProducts);
      } else {
        // 🛡️ (إصلاح — كانت هذي الحالة صامتة تماماً) لو فشل إعادة البناء الاحتياطي نفسه
        // (مثلاً سلة R2 غير مربوطة إطلاقاً)، يجب أن يظهر هذا للأدمن صراحة، لا أن يختفي.
        showToast('⚠️ فشلت إعادة بناء كتالوج المتجر: ' + ((res && res.message) || 'خطأ غير معروف'));
      }
    })
    .catch(err => showToast('⚠️ تعذر الاتصال بالووركر لإعادة بناء الكتالوج: ' + err.message));
}

// 🩺 (جديد) أداة تشخيص فورية — تستدعي /api/admin/catalog/diagnose وتعرض النتيجة بوضوح،
// بدل الحاجة لفتح رابط بالمتصفح يدوياً أو استخدام أدوات المطوّر.
async function runCatalogDiagnosis() {
  const idInput = document.getElementById('diagnoseProductIdInput');
  const box = document.getElementById('diagnoseResultBox');
  if (!idInput || !box) return;
  const productId = idInput.value.trim();

  box.style.display = 'block';
  box.innerHTML = '⏳ جاري الفحص...';

  try {
    const res = await apiFetch(`/api/admin/catalog/diagnose?productId=${encodeURIComponent(productId)}`, { method: 'GET' });
    if (!res || !res.success) {
      box.innerHTML = `⚠️ فشل الفحص: ${sanitizeText((res && res.message) || 'خطأ غير معروف')}`;
      return;
    }

    const rows = [
      ['سلة R2 (MY_BUCKET) مربوطة؟', res.myBucketBound ? '✅ نعم' : '❌ لا — هذا سبب المشكلة إن كان لا'],
      ['بيانات اعتماد Admin SDK مضبوطة؟', res.firebaseServiceAccountConfigured ? '✅ نعم' : '❌ لا'],
    ];
    if (productId) {
      rows.push(
        ['السعر الحقيقي بفايرستور', sanitizeText(String(res.priceInFirestore))],
        ['السعر المخزَّن بملف R2', sanitizeText(String(res.priceInR2Catalog))],
        ['السعر بالنسخة المخزَّنة حالياً على حافة Cloudflare', sanitizeText(String(res.priceInEdgeCacheRightNow))],
        ['آخر طابع تحديث كاش مسجَّل', sanitizeText(String(res.catalogUpdatedAtSignal))]
      );
    } else {
      rows.push(['ملاحظة', 'أدخلي معرّف منتج بالحقل أعلاه لفحص قيمة سعره بكل طبقة على حدة']);
    }

    box.innerHTML = rows.map(([label, val]) => `<div><b>${label}:</b> <span class="mono">${val}</span></div>`).join('');
  } catch (err) {
    box.innerHTML = `⚠️ خطأ بالاتصال: ${sanitizeText(err.message)}`;
  }
}

// ⚡ تحديث سريع بـ 0 قراءات من Firestore: يعدّل صنفاً واحداً مباشرة داخل ملف الكتالوج المخزّن في
// R2 (بدل إعادة مسح كل المنتجات)، ويُستخدم في التعديلات الفردية السريعة (السعر، المخزون، التعديل الشامل)
function updateR2CatalogItem(productId, updates, upsert = false) {
  apiFetch('/api/admin/catalog/update-item', {
    method: 'POST',
    body: JSON.stringify({ productId: String(productId), updates, upsert })
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

// 🗑️ إزالة منتج/منتجات من كتالوج R2 فوراً بلا أي قراءة من Firestore (أرشفة / حذف نهائي)
function removeFromR2Catalog(productIds) {
  const ids = (Array.isArray(productIds) ? productIds : [productIds]).map(String);
  apiFetch('/api/admin/catalog/remove-items', {
    method: 'POST',
    body: JSON.stringify({ productIds: ids })
  }).then(res => {
    if (!res || !res.success) {
      showToast('⚠️ تم الحفظ، لكن تعذّر تحديث كاش المتجر فوراً — سيُعاد بناؤه تلقائياً الآن.');
      triggerR2CatalogRebuild();
    }
  }).catch(() => triggerR2CatalogRebuild());
}

// بيانات المنتج كما تُحفظ بـ Firestore لكن بلا حقول لا تُسلسَل (طوابع الخادم) — للكتالوج المخزَّن بـ R2
function toCatalogSafeObject(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === undefined || typeof v === 'function') return;
    if (v && typeof v === 'object' && v._methodName) return; // FieldValue (طابع خادم لم يُحسَم بعد)
    if (v && typeof v === 'object' && typeof v.toDate === 'function') { try { out[k] = v.toDate().toISOString(); } catch (e) {} return; } // Timestamp → نص ISO كما يبنيه الووركر
    out[k] = v;
  });
  return out;
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

// دالة رفع الصور المباشرة من الاستوديو أو الكاميرا إلى Cloudflare R2
async function uploadDirectImageFile(fileInput, targetHiddenUrlId, previewImgId, previewBoxId) {
  const file = fileInput.files[0];
  if (!file) return;

  showToast('جاري رفع ومعالجة الصورة سحابياً... ⏳');

  try {
    const formData = new FormData();
    formData.append('file', file);

    // 🛡️ الرفع صار يتطلب توثيق المشرف (الووركر يرفض الرفع المجهول)
    const uploadHeaders = { 'X-Pharmacy-Id': currentPharmacyId };
    const uploadUser = auth ? auth.currentUser : currentUser;
    if (uploadUser) uploadHeaders['Authorization'] = `Bearer ${await uploadUser.getIdToken()}`;
    const res = await fetch(`${WORKER_API_BASE}/api/upload`, {
      method: 'POST',
      headers: uploadHeaders,
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
    // 🛡️ (توفير قراءات — أكبر مصدر استنزاف) كان يقرأ كل الطلبات بكل استدعاء، والاستدعاء يتكرر مع كل
    // تغيير بالطلبات/المنتجات. الآن: (1) نستخدم قائمة الطلبات المحمّلة أصلاً بالمستمع بلا أي قراءة إن كانت
    // تغطي "الشهر الماضي حتى اليوم"، وإلا (2) استعلام واحد محدود بهذه الفترة فقط ومخزَّن 60 ثانية.
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 1);
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - 2); // هامش أمان لفروق المناطق الزمنية
    const orderMs = (o) => (o.createdAt && o.createdAt.toMillis) ? o.createdAt.toMillis() : (o.date ? new Date(o.date).getTime() : 0);

    let windowOrders = null;
    const listed = window.adminLastOrdersList;
    if (Array.isArray(listed) && listed.length) {
      const oldestMs = Math.min(...listed.map(orderMs).filter(Boolean));
      if (!adminOrdersWindowCapped || (oldestMs && oldestMs <= windowStart.getTime())) windowOrders = listed;
    }
    if (!windowOrders) {
      if (window.__analyticsWindowCache && Date.now() - window.__analyticsWindowCache.at < 60000) {
        windowOrders = window.__analyticsWindowCache.orders;
      } else {
        const wsnap = await dbPaths.ordersCol().where('createdAt', '>=', windowStart).get();
        windowOrders = [];
        wsnap.forEach(d => windowOrders.push({ id: d.id, ...d.data() }));
        window.__analyticsWindowCache = { at: Date.now(), orders: windowOrders };
      }
    }
    const ordersSnap = { size: windowOrders.length, forEach: (fn) => windowOrders.forEach(o => fn({ data: () => o })) };
    totalOrdersCount = Math.max(windowOrders.length, (window.adminLastOrdersList || []).length, myOrders.length);

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
    
    // (تم إلغاء قراءة analytics_daily — لا يوجد عدّاد زيارات بعد الآن)
    todayVisitsCount = 0;
    weeklyVisitsData = [];

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

const ADMIN_ORDERS_LIMIT = 400;
let adminOrdersWindowCapped = false;

function listenToAdminOrdersRealtime() {
  if (!isFirebaseConfigured || !db) return;

  if (adminOrdersUnsubscribe) {
    adminOrdersUnsubscribe();
  }

  // 🛡️ (توفير قراءات) كان يقرأ كل الطلبات التاريخية بكل فتح للوحة (وكل تغيير يعيد قراءة كل شيء). الآن آخر
  // ADMIN_ORDERS_LIMIT طلب فقط (الأحدث أولاً)، وأي تغيير لاحق يقرأ المستند المتغير وحده.
  adminOrdersUnsubscribe = dbPaths.ordersCol().orderBy('createdAt', 'desc').limit(ADMIN_ORDERS_LIMIT).onSnapshot(snap => {
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
    adminOrdersWindowCapped = snap.size >= ADMIN_ORDERS_LIMIT;
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
    // 🛡️ حد أقصى 1000 طلب (كان يقرأ كل الطلبات التاريخية)
    const snap = await dbPaths.ordersCol().orderBy('createdAt', 'desc').limit(1000).get();
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
  // 🔄 (إصلاح — بعد نقل كل التعديل حصراً لشبكة الأدمن الجديدة) هذا الفلتر يتحكم الآن
  // بحقل التصفية بالشبكة الجديدة مباشرة بدل الشبكة القديمة المزالة من واجهة الزبون.
  const gridStockFilter = document.getElementById('adminProductGridStockFilter');
  if (gridStockFilter) {
    gridStockFilter.value = isLowStockFilterActive ? 'out' : 'all';
    if (typeof renderAdminProductManagementGrid === 'function') renderAdminProductManagementGrid();
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
    const p = findProduct(id);
    if (p) p.price = newPrice; // 🔄 تحديث فوري بالشبكة المعروضة بلوحة التحكم
    renderAdminProductManagementGrid();
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
    p.inStock = newStock; // 🔄 تحديث فوري بالشبكة المعروضة بلوحة التحكم
    renderAdminProductManagementGrid();
    showToast(newStock ? 'تم التعيين: متوفر 🟢' : 'تم التعيين: نفذت الكمية 🔴');
  } catch (err) {
    console.error('quickToggleStock failed:', err);
    showToast('⚠️ تعذر تحديث حالة المخزون: ' + err.message);
  }
}

function renderAdminProductCategoryTabs() {
  const wrap = document.getElementById('adminProductGridCatTabs');
  if (!wrap) return;
  const tabs = [{ id: 'all', label: '🌟 الكل' }, ...categories.map(c => ({ id: c.id, label: sanitizeText(c.label) }))];
  wrap.innerHTML = tabs.map(t => `
    <button type="button" class="admin-prod-cat-tab ${adminProductGridActiveCat === t.id ? 'active' : ''}" onclick="adminProductGridActiveCat='${sanitizeText(t.id)}'; renderAdminProductCategoryTabs(); renderAdminProductManagementGrid();">${t.label}</button>
  `).join('');
}

function renderAdminProductManagementGrid() {
  const grid = document.getElementById('adminProductManagementGrid');
  const countEl = document.getElementById('adminProductGridCount');
  if (!grid) return;

  const q = (document.getElementById('adminProductGridSearch')?.value || '').trim().toLowerCase();
  const stockFilter = document.getElementById('adminProductGridStockFilter')?.value || 'all';

  let list = products.filter(p => p.isDeleted !== true);
  if (adminProductGridActiveCat !== 'all') list = list.filter(p => p.category === adminProductGridActiveCat);
  if (stockFilter === 'in') list = list.filter(p => p.inStock !== false);
  if (stockFilter === 'out') list = list.filter(p => p.inStock === false);
  if (q) {
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }

  if (countEl) countEl.textContent = list.length;

  if (list.length === 0) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:24px 0;">لا توجد منتجات مطابقة.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const img = sanitizeUrl(p.imageUrl);
    const inStock = p.inStock !== false;
    return `
      <div class="admin-prod-card">
        <span class="admin-prod-stock-badge" style="background:${inStock ? '#22C55E' : '#EF4444'};" title="${inStock ? 'متوفر' : 'غير متوفر'}"></span>
        <div class="admin-prod-card-img">
          ${img ? `<img src="${img}" alt="${sanitizeText(p.name)}" loading="lazy">` : '📦'}
        </div>
        <div class="admin-prod-card-name">${sanitizeText(p.name)}</div>
        <div class="admin-prod-card-brand">${sanitizeText(p.brand || '')}${p.size ? ' · ' + sanitizeText(p.size) : ''}</div>
        <div class="admin-prod-card-price mono">${fmtPrice(p.price)}</div>
        <div class="admin-prod-card-actions">
          <button type="button" onclick="quickEditPrice('${sanitizeText(p.id)}', ${Number(p.price) || 0})" style="background:#FEF3C7; color:#92400E;">💰 سعر</button>
          <button type="button" onclick="quickToggleStock('${sanitizeText(p.id)}')" style="background:${inStock ? '#FEE2E2' : '#DCFCE7'}; color:${inStock ? '#991B1B' : '#15803D'};">${inStock ? '🔴 إخفاء' : '🟢 توفير'}</button>
          <button type="button" onclick="openAdminQuickEditModal('${sanitizeText(p.id)}')" style="background:var(--surface); color:var(--ink);">✏️ تعديل</button>
        </div>
      </div>`;
  }).join('');
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
    isSpecialOffer
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
    if (typeof renderAdminProductManagementGrid === 'function') renderAdminProductManagementGrid();
  } catch (err) {
    console.error('saveAdminQuickEdit failed:', err);
    showToast('⚠️ تعذر حفظ التعديل: ' + (err.message || 'خطأ غير معروف') + ' — يرجى إعادة المحاولة.');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ التعديلات سحابياً'; }
  }
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
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    let savedProductId = docId;
    if (docId) {
      payload.id = docId;
      if (db) await dbPaths.productsCol().doc(docId).set(payload, { merge: true });
      showToast('تم حفظ تعديلات المنتج بنجاح ✓');
    } else {
      payload.isDeleted = false;
      payload.orderCount = 0;
      if (db) {
        const newRef = await dbPaths.productsCol().add(payload);
        savedProductId = newRef.id;
        
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
    // ⚡ (توفير قراءات) تحديث/إضافة صنف واحد مباشرة بملف R2 بدل مسح كل المنتجات من Firestore
    if (savedProductId) updateR2CatalogItem(savedProductId, toCatalogSafeObject({ ...payload, id: savedProductId, updatedAt: undefined }), true);
    else triggerR2CatalogRebuild();
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
      removeFromR2Catalog(id);
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
    // ⚡ إعادة الصنف لكتالوج R2 مباشرة من بياناته المحمّلة بسلة المحذوفات (0 قراءات إضافية)
    const restoredSrc = archivedProducts.find(x => String(x.id) === String(id));
    if (restoredSrc) updateR2CatalogItem(id, toCatalogSafeObject({ ...restoredSrc, id: String(id), isDeleted: false, deletedAt: undefined, restoredAt: undefined }), true);
    else triggerR2CatalogRebuild();
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
      removeFromR2Catalog(id);
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
      removeFromR2Catalog([...cleanupSelectedIds]);
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
      removeFromR2Catalog([...cleanupSelectedIds]);
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
  if (sec === 'products') {
    populateCategoryDropdowns();
    renderAdminProductCategoryTabs();
    renderAdminProductManagementGrid();
  }
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
    refreshStorefrontCache();
    showToast('تم حفظ القسم بنجاح في قاعدة البيانات ✓');
    resetAdminCatForm();
    populateCategoryDropdowns();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ القسم');
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
    refreshStorefrontCache();
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
      refreshStorefrontCache();
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
    refreshStorefrontCache();
  } catch (err) { console.warn(err); }
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
    refreshStorefrontCache();
    }
    document.getElementById('notifTitleInput').value = '';
    document.getElementById('notifBodyInput').value = '';
    showToast('🚀 تم إرسال الإشعار لجميع المستخدمين بنجاح!');
  } catch (err) {
    showToast('حدث خطأ أثناء إرسال الإشعار');
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

// 🌟 يبقى هذا كخط دفاع ثانوي فقط: لو نجح المتصفح فعلاً بإكمال تدفّق Redirect في حالات
// نادرة (بعض المتصفحات لا تعاني من مشكلة storage-partitioning)، تُستقبل نتيجته هنا أيضاً.
function announceCacheStatusToAdminIfNeeded() {
  if (!lastCatalogCacheStatus) return;
  if (!isCurrentUserAdmin()) return;
  setTimeout(() => {
    showToast(`⚡ كاش Cloudflare R2: [${lastCatalogCacheStatus}] (كاش ساعة كاملة)`);
  }, 1000);
}
