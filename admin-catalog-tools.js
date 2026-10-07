/* ==========================================================
   admin-catalog-tools.js — أدوات الكتالوج: التنظيف، الخصم الجماعي، مضاعف الأسعار
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

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
