/* ==========================================================
   admin-products.js — إدارة المنتجات: الشبكة، التعديل السريع، الحفظ، الأرشفة، الاستعادة
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

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
  if (!assertCan('products.edit')) return;
  const newPriceStr = prompt('تعديل السعر المباشر (د.ع):', currentPrice);
  if (newPriceStr === null) return;
  const newPrice = Number(newPriceStr.trim());
  const priceError = validateProductPrice(newPrice);
  if (priceError) { showToast(priceError); return; }
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
  if (!assertCan('products.edit')) return;
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
  if (!assertCan('products.edit')) return;

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
  if (!assertCan('products.edit')) return;

  const id = document.getElementById('quickEditProdId').value;
  const name = document.getElementById('quickEditProdName').value.trim();
  const brand = document.getElementById('quickEditProdBrand').value.trim();
  const price = Number(document.getElementById('quickEditProdPrice').value);
  const quickPriceError = validateProductPrice(price);
  if (quickPriceError) { showToast(quickPriceError); return; }
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
  if (!assertCan('products.edit') || !lockAction('saveProductAdmin', 1200)) return;

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
  const priceError = validateProductPrice(price);
  if (priceError) { showToast(priceError); return; }

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
  if (!assertCan('products.archive')) return;
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
  if (!assertCan('products.archive')) return;
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
  if (!assertCan('products.archive')) return;
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
