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

// ================= 🗂️ صفحة المنتجات (تصميم جديد): بطاقات إحصاء + أدوات + جدول/شبكة + لوحة تفاصيل =================
// كلها من قائمة products المحمّلة أصلاً بالذاكرة: صفر قراءات إضافية من Firestore.
let apView = 'list', apPage = 1, apSelectedId = null, apPendingQty = null;
const AP_PAGE_SIZE = 10;

function apThreshold() { const t = (typeof pharmacyProfile !== 'undefined' && pharmacyProfile) ? pharmacyProfile.lowStockThreshold : undefined; return t === undefined ? 5 : (Number(t) || 0); }
function apQty(p) { return (p.stockQuantity !== undefined && p.stockQuantity !== null && p.stockQuantity !== '') ? Number(p.stockQuantity) : null; }
function apStatus(p) {
  const q = apQty(p);
  if (p.inStock === false || (q !== null && q <= 0)) return { k: 'out', t: 'نفذ' };
  if (q !== null && apThreshold() > 0 && q <= apThreshold()) return { k: 'low', t: 'منخفض' };
  return { k: 'ok', t: 'متوفر' };
}
function apCatLabel(id) { const c = (typeof categories !== 'undefined' ? categories : []).find(x => String(x.id) === String(id)); return c ? c.label : (id || ''); }
function apMoney(n) { return (Number(n) || 0).toLocaleString('en-US'); }
function apProfit(p) {
  const cost = (p.costPrice !== undefined && p.costPrice !== null && p.costPrice !== '') ? Number(p.costPrice) : null;
  const price = Number(p.price) || 0;
  if (cost === null || !Number.isFinite(cost) || price <= 0) return null;
  return { cost, profit: price - cost, pct: Math.round(((price - cost) / price) * 100) };
}

function apRenderKpis(all) {
  const host = document.getElementById('apKpis'); if (!host) return;
  const out = all.filter(p => apStatus(p).k === 'out').length, low = all.filter(p => apStatus(p).k === 'low').length;
  const value = all.reduce((sum, p) => { const q = apQty(p); return sum + ((q !== null && q > 0) ? q * (Number(p.price) || 0) : 0); }, 0);
  const card = (cls, ico, label, val, sub) => `<div class="ap-kpi ${cls}"><span class="ap-kpi-ico">${ico}</span><div><small>${label}</small><b class="mono">${val}</b><em>${sub}</em></div></div>`;
  host.innerHTML =
    card('', '📦', 'عدد الأصناف', apMoney(all.length), 'منتج بالصيدلية') +
    card('warn', '⚠️', 'منخفضة المخزون', apMoney(low), low ? 'بحاجة لإعادة طلب' : 'لا شيء ينقص') +
    card('bad', '⛔', 'نافدة', apMoney(out), out ? 'مخفية عن الزبائن' : 'كلها متوفرة') +
    card('good', '💰', 'قيمة المخزون (بسعر البيع)', apMoney(value) + ' <span>د.ع</span>', 'للأصناف المتتبَّع مخزونها');
}

function apRenderFilters(all) {
  const bSel = document.getElementById('apBrand'), cSel = document.getElementById('apCat'); if (!bSel || !cSel) return;
  const brand = bSel.value || 'all', cat = adminProductGridActiveCat || 'all';
  const brands = [...new Set(all.map(p => (p.brand || '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  bSel.innerHTML = '<option value="all">كل الماركات</option>' + brands.map(b => `<option value="${sanitizeText(b)}"${b === brand ? ' selected' : ''}>${sanitizeText(b)}</option>`).join('');
  cSel.innerHTML = '<option value="all">كل الأقسام</option>' + (typeof categories !== 'undefined' ? categories : []).map(c => `<option value="${sanitizeText(c.id)}"${String(c.id) === String(cat) ? ' selected' : ''}>${sanitizeText(c.label)}</option>`).join('');
}

function apSetView(v) { apView = v; apPage = 1; renderAdminProductManagementGrid(); }
function apGoPage(n) { apPage = n; renderAdminProductManagementGrid(); const t = document.getElementById('apTop'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
function apFilterChanged() { apPage = 1; const c = document.getElementById('apCat'); if (c) adminProductGridActiveCat = c.value || 'all'; renderAdminProductManagementGrid(); }

function apRowHtml(p) {
  const img = sanitizeUrl(p.imageUrl), st = apStatus(p), pr = apProfit(p), q = apQty(p), id = sanitizeText(p.id);
  return `<div class="ap-row${String(apSelectedId) === String(p.id) ? ' sel' : ''}" onclick="apSelect('${id}')">
    <div class="ap-c ap-prod"><div class="ap-thumb">${img ? `<img src="${img}" alt="" loading="lazy">` : '📦'}</div><div class="ap-pn"><b>${sanitizeText(p.name)}</b><small>${sanitizeText(apCatLabel(p.category))}${p.brand ? ' · ' + sanitizeText(p.brand) : ''}</small></div></div>
    <div class="ap-c ap-hide-m mono dim">${sanitizeText(p.barcode || '—')}</div>
    <div class="ap-c mono ${st.k === 'out' ? 'neg' : (st.k === 'low' ? 'warn' : '')}">${q === null ? '∞' : apMoney(q)}</div>
    <div class="ap-c ap-hide-m mono">${pr ? apMoney(pr.cost) : '—'}</div>
    <div class="ap-c mono"><b>${apMoney(p.price)}</b></div>
    <div class="ap-c ap-hide-m mono">${pr ? `<span class="${pr.profit >= 0 ? 'pos' : 'neg'}">${apMoney(pr.profit)}</span><small> (${pr.pct}%)</small>` : '—'}</div>
    <div class="ap-c"><span class="ap-chip ${st.k}">${st.t}</span></div>
    <div class="ap-c ap-acts" onclick="event.stopPropagation()">
      <button type="button" class="ap-ic" onclick="openAdminQuickEditModal('${id}')" aria-label="تعديل">✏️</button>
      ${can('products.archive') ? `<button type="button" class="ap-ic danger" data-name="${sanitizeText(p.name)}" onclick="archiveProductConfirm('${id}', this.dataset.name)" aria-label="حذف">🗑️</button>` : ''}
    </div></div>`;
}
function apCardHtml(p) {
  const img = sanitizeUrl(p.imageUrl), st = apStatus(p), id = sanitizeText(p.id), q = apQty(p);
  return `<div class="ap-card${String(apSelectedId) === String(p.id) ? ' sel' : ''}" onclick="apSelect('${id}')">
    <div class="ap-card-img">${img ? `<img src="${img}" alt="" loading="lazy">` : '📦'}<span class="ap-chip ${st.k}">${st.t}</span></div>
    <b class="ap-card-name">${sanitizeText(p.name)}</b>
    <small class="dim">${sanitizeText(p.size || p.brand || '')}</small>
    <div class="ap-card-foot"><span class="mono"><b>${apMoney(p.price)}</b> <small>د.ع</small></span><span class="ap-qty mono">${q === null ? '∞' : apMoney(q)}</span></div></div>`;
}

function renderAdminProductManagementGrid() {
  const grid = document.getElementById('adminProductManagementGrid');
  const countEl = document.getElementById('adminProductGridCount');
  if (!grid) return;
  const all = products.filter(p => p.isDeleted !== true);
  apRenderKpis(all); apRenderFilters(all);

  const q = (document.getElementById('adminProductGridSearch')?.value || '').trim().toLowerCase();
  const stockFilter = document.getElementById('adminProductGridStockFilter')?.value || 'all';
  const brand = document.getElementById('apBrand')?.value || 'all';
  let list = all.slice();
  if (adminProductGridActiveCat !== 'all') list = list.filter(p => String(p.category) === String(adminProductGridActiveCat));
  if (brand !== 'all') list = list.filter(p => (p.brand || '').trim() === brand);
  if (stockFilter === 'in') list = list.filter(p => apStatus(p).k !== 'out');
  if (stockFilter === 'out') list = list.filter(p => apStatus(p).k === 'out');
  if (stockFilter === 'low') list = list.filter(p => apStatus(p).k === 'low');
  if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q));
  if (countEl) countEl.textContent = list.length;

  document.querySelectorAll('.ap-view button').forEach(b => b.classList.toggle('on', b.getAttribute('data-v') === apView));
  const pages = Math.max(1, Math.ceil(list.length / AP_PAGE_SIZE)); if (apPage > pages) apPage = pages;
  const slice = list.slice((apPage - 1) * AP_PAGE_SIZE, apPage * AP_PAGE_SIZE);

  if (!list.length) { grid.className = 'ap-list'; grid.innerHTML = '<div class="no-results" style="padding:30px 0;">لا توجد منتجات مطابقة.</div>'; }
  else if (apView === 'grid') { grid.className = 'ap-grid'; grid.innerHTML = slice.map(apCardHtml).join(''); }
  else {
    grid.className = 'ap-list';
    grid.innerHTML = '<div class="ap-row ap-headrow"><div class="ap-c">المنتج</div><div class="ap-c ap-hide-m">الباركود</div><div class="ap-c">الكمية</div><div class="ap-c ap-hide-m">سعر الشراء</div><div class="ap-c">سعر البيع</div><div class="ap-c ap-hide-m">صافي الربح</div><div class="ap-c">الحالة</div><div class="ap-c">إجراءات</div></div>' + slice.map(apRowHtml).join('');
  }

  const pager = document.getElementById('apPager');
  if (pager) {
    const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - apPage) <= 1) nums.push(i);
    let html = '', prev = 0;
    nums.forEach(n => { if (prev && n - prev > 1) html += '<span class="dim">…</span>'; html += `<button type="button" class="${n === apPage ? 'on' : ''}" onclick="apGoPage(${n})">${n}</button>`; prev = n; });
    pager.innerHTML = `<span class="dim">${list.length ? ((apPage - 1) * AP_PAGE_SIZE + 1) + '–' + Math.min(list.length, apPage * AP_PAGE_SIZE) : 0} من ${list.length} منتج</span><div>${pages > 1 ? html : ''}</div>`;
  }
  apRenderDetail();
}

// ---------- لوحة التفاصيل ----------
function apSelect(id) {
  apSelectedId = id; apPendingQty = null;
  const d = document.getElementById('apDetail'); if (d) d.classList.add('open');
  renderAdminProductManagementGrid();
}
function apCloseDetail() { const d = document.getElementById('apDetail'); if (d) d.classList.remove('open'); apSelectedId = null; renderAdminProductManagementGrid(); }
function apStep(delta) {
  const p = findProduct(apSelectedId); if (!p) return;
  const base = apPendingQty === null ? (apQty(p) === null ? 0 : apQty(p)) : apPendingQty;
  apPendingQty = Math.max(0, base + delta); apRenderDetail();
}
function apQtyInput(v) { const n = parseInt(v, 10); apPendingQty = Number.isFinite(n) && n >= 0 ? n : 0; const b = document.getElementById('apSaveQty'); if (b) b.style.display = ''; }
async function apSaveQty() {
  if (!assertCan('products.edit')) return;
  const p = findProduct(apSelectedId); if (!p || apPendingQty === null) return;
  const n = apPendingQty;
  try {
    if (!db) throw new Error('لا يوجد اتصال بقاعدة البيانات');
    await dbPaths.productsCol().doc(String(p.id)).set({ stockQuantity: n, inStock: n > 0 }, { merge: true });
    updateR2CatalogItem(p.id, { stockQuantity: n, inStock: n > 0 });
    p.stockQuantity = n; p.inStock = n > 0; apPendingQty = null;
    renderAdminProductManagementGrid(); showToast('تم تحديث الكمية ✓');
  } catch (err) { showToast('⚠️ تعذر تحديث الكمية: ' + err.message); }
}
function apRenderDetail() {
  const d = document.getElementById('apDetail'); if (!d) return;
  const p = apSelectedId ? findProduct(apSelectedId) : null;
  if (!p) { d.innerHTML = '<div class="ap-empty">📦<p>اختاري منتجاً من القائمة لعرض تفاصيله وتعديل كميته وسعره من هنا</p></div>'; return; }
  const img = sanitizeUrl(p.imageUrl), st = apStatus(p), pr = apProfit(p), id = sanitizeText(p.id);
  const qty = apPendingQty === null ? (apQty(p) === null ? '' : apQty(p)) : apPendingQty;
  const row = (k, v) => v ? `<div class="ap-kv"><span>${k}</span><b>${v}</b></div>` : '';
  d.innerHTML = `
    <div class="ap-d-top"><button type="button" class="ap-ic ap-d-close" onclick="apCloseDetail()" aria-label="إغلاق">✕</button>
      <button type="button" class="ap-ic" onclick="openAdminQuickEditModal('${id}')" aria-label="تعديل">✏️</button></div>
    <div class="ap-d-img">${img ? `<img src="${img}" alt="">` : '📦'}</div>
    <h3 class="ap-d-name">${sanitizeText(p.name)}</h3>
    <p class="ap-d-sub">${sanitizeText(apCatLabel(p.category))}</p>
    <div class="ap-d-box">${row('الباركود', `<span class="mono">${sanitizeText(p.barcode || '')}</span>`)}${row('الماركة', sanitizeText(p.brand || ''))}${row('القسم', sanitizeText(apCatLabel(p.category)))}${row('الحجم', sanitizeText(p.size || ''))}</div>
    <div class="ap-d-prices">
      <div><small>سعر الشراء</small><b class="mono">${pr ? apMoney(pr.cost) : '—'}</b></div>
      <div><small>سعر البيع</small><b class="mono">${apMoney(p.price)}</b></div>
      <div class="${pr && pr.profit < 0 ? 'neg' : 'pos'}"><small>صافي الربح</small><b class="mono">${pr ? apMoney(pr.profit) : '—'}</b>${pr ? `<em>(${pr.pct}%)</em>` : ''}</div>
    </div>
    <div class="ap-d-qty"><small>الكمية المتوفرة</small>
      <div class="ap-stepper"><button type="button" onclick="apStep(-1)" aria-label="إنقاص">−</button><input type="number" min="0" inputmode="numeric" value="${qty}" placeholder="غير متتبَّعة" oninput="apQtyInput(this.value)"><button type="button" onclick="apStep(1)" aria-label="زيادة">+</button></div>
      <div class="ap-d-qrow"><span class="ap-chip ${st.k}">${st.t}</span><button type="button" id="apSaveQty" class="ap-save" style="${apPendingQty === null ? 'display:none;' : ''}" onclick="apSaveQty()">حفظ الكمية</button></div></div>
    <div class="ap-d-box"><b class="ap-d-h">معلومات إضافية</b>${row('تاريخ الانتهاء', sanitizeText(p.expiryDate ? String(p.expiryDate).slice(0, 10) : ''))}${row('رقم التشغيلة', sanitizeText(p.batchNumber || p.batch || ''))}${row('النوع', sanitizeText(p.type || ''))}${p.oldPrice ? row('السعر قبل الخصم', `<span class="mono">${apMoney(p.oldPrice)}</span>`) : ''}</div>
    <div class="ap-d-btns">
      <button type="button" class="ap-primary" onclick="openAdminQuickEditModal('${id}')">✏️ تعديل المنتج</button>
      <button type="button" class="ap-soft" onclick="quickEditPrice('${id}', ${Number(p.price) || 0})">💰 تعديل السعر</button>
      <button type="button" class="ap-soft" onclick="quickToggleStock('${id}')">${p.inStock === false ? '🟢 إعادة التوفير' : '🔴 إخفاء مؤقتاً'}</button>
      ${can('products.archive') ? `<button type="button" class="ap-danger" data-name="${sanitizeText(p.name)}" onclick="archiveProductConfirm('${id}', this.dataset.name)">🗑️ حذف المنتج</button>` : ''}
    </div>`;
}

// ---------- درج «إضافة منتج جديد» ----------
function apOpenAdd() {
  if (typeof resetAdminProductForm === 'function') resetAdminProductForm();
  const dr = document.getElementById('apAddDrawer'); if (dr) { dr.classList.add('open'); dr.scrollTop = 0; }
  document.body.classList.add('ap-lock');
}
function apCloseAdd() { const dr = document.getElementById('apAddDrawer'); if (dr) dr.classList.remove('open'); document.body.classList.remove('ap-lock'); }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') apCloseAdd(); });

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
            <label class="ds-photo-opt"><input type="checkbox" class="ds-bgclean-chk" onchange="dsSavePhotoPref(this)"> 🧼 اعرض المنتج فقط على خلفية بيضاء</label>
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

          <div style="display:flex; gap:10px;">
            <div class="form-field" style="flex:1;">
              <label>📅 تاريخ انتهاء الصلاحية (اختياري)</label>
              <input type="date" id="quickEditProdExpiry">
            </div>
            <div class="form-field" style="flex:1;">
              <label>🏷️ رقم الدفعة (اختياري)</label>
              <input type="text" id="quickEditProdBatch" placeholder="LOT-2026-01" maxlength="40">
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
<button class="admin-btn-save" id="quickEditDeleteBtn" onclick="deleteProductFromQuickEdit()" style="background:#FEE2E2; color:#991B1B; margin-top:8px; display:none;">🗑️ حذف المنتج (نقله لسلة المحذوفات)</button>
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
    const delBtn = document.getElementById('quickEditDeleteBtn');
    if (delBtn) delBtn.style.display = can('products.archive') ? 'block' : 'none';
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
    if (document.getElementById('quickEditProdWarnings')) document.getElementById('quickEditProdWarnings').value = p.warnings || '';
    if (document.getElementById('quickEditProdAge')) document.getElementById('quickEditProdAge').value = p.ageRange || '';
    if (document.getElementById('quickEditProdExpiry')) document.getElementById('quickEditProdExpiry').value = p.expiryDate ? String(p.expiryDate).slice(0, 10) : '';
    if (document.getElementById('quickEditProdBatch')) document.getElementById('quickEditProdBatch').value = p.batchNo || '';
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
  const warnings = document.getElementById('quickEditProdWarnings') ? sanitizeText(document.getElementById('quickEditProdWarnings').value.trim()).slice(0, 300) : '';
  const ageRange = document.getElementById('quickEditProdAge') ? sanitizeText(document.getElementById('quickEditProdAge').value.trim()).slice(0, 40) : '';
  const inStock = document.getElementById('quickEditProdInStock') ? document.getElementById('quickEditProdInStock').checked : true;
  const isSpecialOffer = document.getElementById('quickEditProdIsOffer') ? document.getElementById('quickEditProdIsOffer').checked : false;
  const expiryRaw = document.getElementById('quickEditProdExpiry') ? document.getElementById('quickEditProdExpiry').value : '';
  const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : '';
  const batchNo = document.getElementById('quickEditProdBatch') ? sanitizeText(document.getElementById('quickEditProdBatch').value.trim()).slice(0, 40) : '';

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
    warnings,
    ageRange,
    inStock: inStock && stockQty > 0,
    isSpecialOffer,
    expiryDate,
    batchNo
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
  if (document.getElementById('adminProdWarnings')) document.getElementById('adminProdWarnings').value = '';
  if (document.getElementById('adminProdAge')) document.getElementById('adminProdAge').value = '';
  if (document.getElementById('adminProdStockQty')) document.getElementById('adminProdStockQty').value = '10';
  if (document.getElementById('adminProdExpiry')) document.getElementById('adminProdExpiry').value = '';
  if (document.getElementById('adminProdBatch')) document.getElementById('adminProdBatch').value = '';
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
    warnings: document.getElementById('adminProdWarnings') ? sanitizeText(document.getElementById('adminProdWarnings').value.trim()).slice(0, 300) : '',
    ageRange: document.getElementById('adminProdAge') ? sanitizeText(document.getElementById('adminProdAge').value.trim()).slice(0, 40) : '',
    inStock: document.getElementById('adminProdInStock').checked && stockQty > 0,
    isSpecialOffer: document.getElementById('adminProdIsOffer').checked,
    expiryDate: (() => { const v = document.getElementById('adminProdExpiry') ? document.getElementById('adminProdExpiry').value : ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; })(),
    batchNo: document.getElementById('adminProdBatch') ? sanitizeText(document.getElementById('adminProdBatch').value.trim()).slice(0, 40) : '',
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
            productData: (() => { const pd = { ...payload, suggestedPrice: payload.price }; delete pd.expiryDate; delete pd.batchNo; delete pd.costPrice; return pd; })(),
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
    if (typeof apCloseAdd === 'function') apCloseAdd();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ المنتج');
  }
}

// ----------------- سلة المحذوفات والأرشفة (SOFT DELETE) -----------------
async function archiveProductConfirm(id, name) {
  if (!assertCan('products.archive')) return;
  if (confirm(`🗑️ حذف المنتج "${name}"؟\n\nسيختفي من المتجر فوراً وينتقل لسلة المحذوفات، ويمكنكِ استرجاعه أو حذفه نهائياً من هناك.`)) {
    if (db) {
      try {
        await dbPaths.productsCol().doc(String(id)).set({
          isDeleted: true,
          deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        removeFromR2Catalog(id);
        // يختفي من القوائم المحلية فوراً بلا انتظار إعادة تحميل الكتالوج
        const idx = products.findIndex(p => String(p.id) === String(id));
        if (idx > -1) products.splice(idx, 1);
        saveLocalState();
        renderAdminProductManagementGrid();
        renderCurrentActiveView();
        closeAdminQuickEditModal();
        showToast(`تم حذف "${name}" ونقله لسلة المحذوفات 🗑️`);
      } catch (err) {
        console.warn(err);
        showToast('⚠️ تعذر حذف المنتج، حاولي مجدداً.');
      }
    }
  }
}

// زر "حذف المنتج" داخل نافذة التعديل الكامل
function deleteProductFromQuickEdit() {
  const id = document.getElementById('quickEditProdId') ? document.getElementById('quickEditProdId').value : '';
  const p = products.find(x => String(x.id) === String(id));
  if (!id || !p) { showToast('تعذر تحديد المنتج'); return; }
  archiveProductConfirm(id, p.name || id);
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
    const snap = await dbPaths.productsCol().where('isDeleted', '==', true).limit(100).get(); // 🛡️ سقف 100 (كان بلا سقف)
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
