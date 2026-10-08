/* ==========================================================
   admin-core.js — الأساسيات المشتركة للوحة الأدمن: استدعاء الووركر (apiFetch)، كاش R2، رفع الصور، قفل الاشتراك، التنقل بين الأقسام، سجل التدقيق
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

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
      showToast(`✅ تم توليد وحبس كتالوج R2 بنجاح (${res.totalProducts || 0} منتج) وتفعيل الكاش الجديد! ⚡`);
      if (res.warning) showToast('⚠️ ' + res.warning);
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

// ================= 22. ADMIN SECTIONS CONTROLLER =================
function switchAdminSection(sec) {
  // 🔑 حماية الأقسام حسب دور الموظف (الواجهة تخفي الأزرار، وهذه تمنع الدخول المباشر بالكود/الاستدعاء)
  const requiredPerm = ADMIN_SECTION_PERMS[String(sec).toLowerCase()];
  if (requiredPerm && !can(requiredPerm)) {
    showToast('⚠️ هذا القسم غير متاح لصلاحيات دورك.');
    sec = defaultAdminSection();
  }
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
