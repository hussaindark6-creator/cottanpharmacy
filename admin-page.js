/* ==========================================================
   admin-page.js — منطق صفحة admin.html الخاص (كان سكربتاً داخل الصفحة)
   يحتوي: بنك المنتجات المركزي لدى الصيدلية (استيراد/إدارة)، ألوان الثيم، حفظ تخصيص المتجر.
   سكربت كلاسيكي؛ لا ينفّذ شيئاً عند التحميل سوى تسجيل مستمعي DOMContentLoaded وتعريف متغيرات الحالة،
   لذلك يُحمَّل قبل script.js بعد ملفات admin-*.js.
   ========================================================== */
    let activeMainCategory = 'all';
    let cachedMasterCatalog = [];

    const MASTER_CATEGORIES_CONFIG = {
      cosmetics: {
        labelAr: "كوزمتك / عناية",
        icon: "💄",
        subCategories: ["Cleanser", "Moisturizer", "Sunscreen", "Eye Care", "Serum/Treatment", "Skincare", "Lip Care", "Exfoliant/Peeling", "Toner", "Body Oil", "Mask", "Makeup", "Bar Soap", "Deodorant", "Cleanser - Micellar Water", "Intimate Care"]
      },
      hair: {
        labelAr: "عناية بالشعر",
        icon: "💇‍♀️",
        subCategories: ["Hair Care - Shampoo", "Hair Care - Conditioner", "Hair Care - Styling", "Hair Care"]
      },
      dental: {
        labelAr: "عناية بالأسنان",
        icon: "🪥",
        subCategories: ["Toothpaste", "Toothbrush", "Mouthwash"]
      },
      hygiene: {
        labelAr: "نظافة عامة",
        icon: "🧼",
        subCategories: ["Hand Wash"]
      },
      baby_milk: {
        labelAr: "حليب أطفال",
        icon: "🍼",
        subCategories: ["Stage 1 (0-6M)", "Stage 2 (6-12M)", "Stage 3 (1-3Y)", "Stage 4 (3Y+)", "Full Cream Milk Powder", "Nutritional Supplement", "Special Care - Colic", "Special Care - Reflux", "Special Care - Allergy", "Special Care - Lactose Free"]
      },
      baby_care: {
        labelAr: "عناية بالطفل",
        icon: "👶",
        subCategories: ["Baby Diaper", "Baby Wipes", "Baby Wash/Shampoo", "Baby Skincare", "Baby Care Accessory"]
      },
      supplements: {
        labelAr: "المكملات الغذائية",
        icon: "💊",
        subCategories: ["Supplement", "Vitamin", "Multivitamin", "Mineral", "Omega-3", "Probiotic", "Protein"]
      }
    };

    function getSavedCustomCategories() {
      try {
        return JSON.parse(localStorage.getItem('saas_custom_categories_' + currentPharmacyId) || '[]');
      } catch (e) {
        return [];
      }
    }

    function saveCustomCategoriesList(list) {
      localStorage.setItem('saas_custom_categories_' + currentPharmacyId, JSON.stringify(list));
    }

    function renderTenantMainCategoryButtons() {
      const container = document.getElementById('tenantMainCatButtonsContainer');
      if (!container) return;

      const builtInList = [
        { key: 'all', label: '🌟 الكل (All)' },
        { key: 'cosmetics', label: '💄 كوزمتك/عناية' },
        { key: 'hair', label: '💇‍♀️ عناية بالشعر' },
        { key: 'dental', label: '🪥 عناية بالأسنان' },
        { key: 'baby_milk', label: '🍼 حليب أطفال' },
        { key: 'baby_care', label: '👶 عناية بالطفل' },
        { key: 'hygiene', label: '🧼 نظافة عامة' },
        { key: 'supplements', label: '💊 المكملات الغذائية' }
      ];

      const customList = getSavedCustomCategories();

      let html = builtInList.map(item => `
        <button type="button" onclick="selectTenantMainCategory('${item.key}')" class="consult-toggle-btn ${activeMainCategory === item.key ? 'active' : ''}" style="flex:1; min-width:110px; font-weight:900; border-radius:10px; padding:8px 6px; font-size:12px;">
          ${item.label}
        </button>
      `).join('');

      html += customList.map(c => `
        <div style="position:relative; display:inline-flex; flex:1; min-width:130px;">
          <button type="button" onclick="selectTenantMainCategory('${c.id}')" class="consult-toggle-btn ${activeMainCategory === c.id ? 'active' : ''}" style="width:100%; font-weight:900; border-radius:10px; padding:8px 24px 8px 6px; font-size:12px; background:#ECFDF5; color:#047857; border-color:#6EE7B7;">
            ${escapeHtml(c.name)}
          </button>
          <span onclick="event.stopPropagation(); deleteCustomCategory('${c.id}')" style="position:absolute; top:8px; right:8px; font-size:10px; color:#DC2626; font-weight:900; cursor:pointer; background:#FEE2E2; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center;">✕</span>
        </div>
      `).join('');

      html += `
        <button type="button" onclick="openAddCustomCategoryModal()" class="consult-toggle-btn" style="background:#F0FDF4; color:#059669; border:1.5px dashed #059669; font-weight:900; border-radius:10px; padding:8px 14px; font-size:12px; cursor:pointer;">
          ➕ إضافة قسم مخصص
        </button>
      `;

      container.innerHTML = html;
    }

    function openAddCustomCategoryModal() {
      document.getElementById('addCustomCategoryModal').classList.add('open');
    }

    function closeAddCustomCategoryModal() {
      document.getElementById('addCustomCategoryModal').classList.remove('open');
    }

    function handleSaveCustomCategory(e) {
      e.preventDefault();
      const name = document.getElementById('customCatNameInput').value.trim();
      const rawKeywords = document.getElementById('customCatKeywordsInput').value.trim();
      if (!name) return;

      const keywords = rawKeywords ? rawKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [name.toLowerCase()];
      const customList = getSavedCustomCategories();
      const newId = 'custom_' + Date.now();

      customList.push({ id: newId, name, keywords });
      saveCustomCategoriesList(customList);
      showToast(`🎉 تم إنشاء قسم "${name}" وتفعيل الأرشفة التلقائية له!`);
      closeAddCustomCategoryModal();
      document.getElementById('customCatNameInput').value = '';
      
      renderTenantMainCategoryButtons();
      selectTenantMainCategory(newId);
    }

    function deleteCustomCategory(id) {
      if (!confirm('هل تريد إزالة هذا القسم المخصص؟')) return;
      let customList = getSavedCustomCategories().filter(c => c.id !== id);
      saveCustomCategoriesList(customList);
      if (activeMainCategory === id) activeMainCategory = 'all';
      renderTenantMainCategoryButtons();
      selectTenantMainCategory(activeMainCategory);
    }

    // كلمات مفتاحية لحقل category (عربي/إنجليزي) → القسم الرئيسي. الترتيب مهم: الأكثر تحديداً أولاً.
    const CATEGORY_FIELD_RULES = [
      ['dental', ['dental', 'أسنان', 'اسنان']],
      ['baby_care', ['baby_care', 'baby care', 'بالطفل', 'حفاض', 'مناديل أطفال']],
      ['baby_milk', ['baby_milk', 'milk', 'حليب']],
      ['supplements', ['supplement', 'vitamin', 'multivitamin', 'mineral', 'probiotic', 'مكمل', 'فيتامين']],
      ['hair', ['hair', 'شعر']],
      ['hygiene', ['hygiene', 'نظافة']],
      ['cosmetics', ['cosmetic', 'skincare', 'كوزمتك', 'تجميل', 'بشرة', 'face']]
    ];
    function classifyByCategoryField(cat) {
      if (!cat) return null;
      for (const [main, words] of CATEGORY_FIELD_RULES) {
        if (words.some(w => cat.includes(w))) return main;
      }
      return null;
    }
    function defaultSubFor(main, item) {
      const t = String(item.type || '').toLowerCase();
      if (main === 'dental') return /mouth|rinse/.test(t) ? 'Mouthwash' : (/brush/.test(t) ? 'Toothbrush' : 'Toothpaste');
      if (main === 'baby_milk') return 'Stage 1 (0-6M)';
      if (main === 'baby_care') return 'Baby Skincare';
      if (main === 'hair') return 'Hair Care - Shampoo';
      if (main === 'hygiene') return 'Hand Wash';
      if (main === 'supplements') return 'Supplement';
      return 'Skincare';
    }

    function getItemClassification(item) {
      const cat = (item.category || '').toLowerCase().trim();
      const subCat = (item.subCategory || '').toLowerCase().trim();
      const name = (item.name || '').toLowerCase().trim();
      const desc = (item.description || item.medicalIndications || '').toLowerCase().trim();

      const customList = getSavedCustomCategories();
      for (const customCat of customList) {
        if ((customCat.keywords || []).some(kw => name.includes(kw) || cat.includes(kw) || subCat.includes(kw) || desc.includes(kw))) {
          return { main: customCat.id, sub: customCat.name, isCustom: true };
        }
      }

      // 🆕 التصنيف الصريح بحقل category أولاً (إنجليزي أو عربي) — كان يفهم الإنجليزي فقط، فتُصنَّف أصناف ملفات
      // البنك العربية ("العناية بالأسنان"، "حليب الأطفال"، "المكملات الغذائية") بالقسم الخطأ (كوزمتك غالباً).
      const explicitMain = classifyByCategoryField(cat);
      if (explicitMain) return { main: explicitMain, sub: item.subCategory || defaultSubFor(explicitMain, item) };

      if (/mouth ?wash|mouth ?rinse|oral rinse|toothbrush|tooth ?paste|dental floss/.test(name)) {
        return { main: 'dental', sub: item.subCategory || defaultSubFor('dental', item) };
      }

      if (cat === 'baby_milk' || cat === 'milk' || name.includes('حليب') || name.includes('milk') || name.includes('aptamil') || name.includes('bebelac') || name.includes('similac') || name.includes('nan') || name.includes('novalac')) {
        return { main: 'baby_milk', sub: item.subCategory || "Stage 1 (0-6M)" };
      }
      if (cat === 'baby_care' || cat === 'baby' || name.includes('diaper') || name.includes('حفاض') || name.includes('wipes')) {
        return { main: 'baby_care', sub: item.subCategory || "Baby Skincare" };
      }
      if (cat === 'dental' || name.includes('toothpaste') || name.includes('معجون') || name.includes('فرشاة')) {
        return { main: 'dental', sub: "Toothpaste" };
      }
      if (cat === 'hair' || name.includes('shampoo') || name.includes('شامبو') || name.includes('conditioner')) {
        return { main: 'hair', sub: "Hair Care - Shampoo" };
      }
      if (cat === 'hygiene' || name.includes('hand wash')) {
        return { main: 'hygiene', sub: "Hand Wash" };
      }
      if (cat === 'supplement' || cat === 'vitamin' || cat === 'multivitamin' || cat === 'mineral' || cat === 'probiotic' ||
          name.includes('vitamin') || name.includes('supplement') || name.includes('multivitamin') ||
          name.includes('omega') || name.includes('فيتامين') || name.includes('مكمل')) {
        return { main: 'supplements', sub: item.subCategory || item.category || "Supplement" };
      }
      return { main: 'cosmetics', sub: item.subCategory || "Skincare" };
    }

    function selectTenantMainCategory(catKey) {
      activeMainCategory = catKey;
      renderTenantMainCategoryButtons();
      updateTenantSubCategoryDropdown();
      updateTenantBrandDropdown();
      filterTenantMasterCatalog();
    }

    function updateTenantSubCategoryDropdown() {
      const subSelect = document.getElementById('tenantImportSubCatFilter');
      if (!subSelect) return;

      if (activeMainCategory === 'all' || activeMainCategory.startsWith('custom_')) {
        subSelect.innerHTML = `<option value="all">📂 جميع التصنيفات الفرعية (All)</option>`;
        return;
      }

      const conf = MASTER_CATEGORIES_CONFIG[activeMainCategory];
      if (conf && conf.subCategories) {
        // 🆕 نضيف التصنيفات الفرعية الفعلية الموجودة بأصناف البنك (مثل "غسول الفم" و"معجون أسنان") إلى القائمة الثابتة
        const actualSubs = new Set();
        cachedMasterCatalog.forEach(item => {
          const cl = getItemClassification(item);
          if (cl.main === activeMainCategory && cl.sub) actualSubs.add(cl.sub);
        });
        const allSubs = [...new Set([...conf.subCategories, ...actualSubs])];
        subSelect.innerHTML = `<option value="all">📂 جميع أقسام ${conf.labelAr} (All)</option>` + 
          allSubs.map(sub => `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`).join('');
      }
    }

    function updateTenantBrandDropdown() {
      const brandSelect = document.getElementById('tenantImportBrandFilter');
      const selectedSub = document.getElementById('tenantImportSubCatFilter')?.value || 'all';
      if (!brandSelect) return;

      const brandsSet = new Set();
      cachedMasterCatalog.forEach(item => {
        const cl = getItemClassification(item);
        if (activeMainCategory !== 'all' && cl.main !== activeMainCategory) return;
        if (selectedSub !== 'all' && cl.sub !== selectedSub) return;
        const b = (item.brand || '').trim();
        if (b && b !== 'عام') brandsSet.add(b);
      });

      const sorted = Array.from(brandsSet).sort();
      brandSelect.innerHTML = `<option value="all">🏢 جميع الشركات والماركات (${sorted.length})</option>` + 
        sorted.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    }

    function onTenantSubCategoryChanged() {
      updateTenantBrandDropdown();
      filterTenantMasterCatalog();
    }


    // ================= 🗂️ إدارة بنك المنتجات من لوحة الأدمن (حساب مشرف المنصة فقط) =================
    // كل العمليات تمر عبر الووركر (صلاحيات Admin على Firestore + تحديث كاش R2 فوراً)، فيظهر التعديل لكل
    // الصيدليات مباشرة. الووركر هو من يقرر الصلاحية (/can-manage) وليس الواجهة فقط.
    let masterManageEnabled = false;
    let masterManageChecked = false;
    let masterSelectedIds = new Set();
    let masterVisibleIds = [];

    async function detectMasterManageAccess() {
      if (masterManageChecked) return;
      try {
        const r = await apiFetch('/api/admin/master-catalog/can-manage');
        masterManageEnabled = !!(r && r.success && r.canManage);
      } catch (e) { masterManageEnabled = false; }
      masterManageChecked = true;
      const bar = document.getElementById('masterManageBar');
      if (bar) bar.style.display = masterManageEnabled ? 'block' : 'none';
      if (masterManageEnabled) filterTenantMasterCatalog(); // لإظهار مربعات التحديد
    }

    function setMasterStatus(msg) {
      const el = document.getElementById('masterManageStatus');
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
    }

    function updateMasterSelCount() {
      const el = document.getElementById('masterSelCount');
      if (el) el.textContent = `${masterSelectedIds.size} محدد`;
      const cb = document.getElementById('masterSelectAllCb');
      if (cb) cb.checked = masterVisibleIds.length > 0 && masterVisibleIds.every(id => masterSelectedIds.has(id));
    }

    function toggleMasterSel(id, checked) {
      if (checked) masterSelectedIds.add(String(id)); else masterSelectedIds.delete(String(id));
      updateMasterSelCount();
    }

    function toggleMasterSelectAllVisible(checked) {
      masterVisibleIds.forEach(id => { if (checked) masterSelectedIds.add(id); else masterSelectedIds.delete(id); });
      filterTenantMasterCatalog();
    }

    async function masterDeleteSelected() {
      const ids = [...masterSelectedIds];
      if (!ids.length) { showToast('حددي أصنافاً أولاً'); return; }
      if (!confirm(`سيتم حذف ${ids.length} صنف من بنك المنتجات المشترك لكل الصيدليات. متأكدة؟`)) return;
      let deleted = 0;
      try {
        for (let i = 0; i < ids.length; i += 1000) {
          setMasterStatus(`جاري الحذف... ${Math.min(i + 1000, ids.length)} / ${ids.length}`);
          const r = await apiFetch('/api/admin/master-catalog/bulk-delete', { method: 'POST', body: JSON.stringify({ productIds: ids.slice(i, i + 1000) }) });
          if (!r || !r.success) throw new Error((r && r.message) || 'فشل الحذف');
          deleted += r.deleted || 0;
        }
        masterSelectedIds.clear();
        showToast(`🗑️ تم حذف ${deleted} صنف من البنك`);
      } catch (e) { showToast('⚠️ ' + e.message); }
      setMasterStatus('');
      fetchTenantMasterCatalog();
    }

    async function masterDeleteAll() {
      if (!cachedMasterCatalog.length) { showToast('البنك فارغ أصلاً'); return; }
      if (!confirm(`⚠️ سيتم حذف كل بنك المنتجات (${cachedMasterCatalog.length} صنف) من كل الصيدليات. هذا لا يمكن التراجع عنه (صدّري نسخة JSON قبل ذلك). متابعة؟`)) return;
      const typed = prompt('للتأكيد النهائي اكتبي كلمة: حذف');
      if (typed === null || typed.trim() !== 'حذف') { showToast('تم الإلغاء'); return; }
      let total = 0;
      try {
        for (let round = 0; round < 10; round++) {
          setMasterStatus(`جاري حذف كل البنك... (${total} حتى الآن)`);
          const r = await apiFetch('/api/admin/master-catalog/bulk-delete', { method: 'POST', body: JSON.stringify({ all: true }) });
          if (!r || !r.success) throw new Error((r && r.message) || 'فشل الحذف');
          total += r.deleted || 0;
          if (!r.more) break;
        }
        masterSelectedIds.clear();
        showToast(`🗑️ تم حذف كل البنك (${total} صنف)`);
      } catch (e) { showToast('⚠️ ' + e.message); }
      setMasterStatus('');
      fetchTenantMasterCatalog();
    }

    function parseMasterCSV(text) {
      const rows = []; let row = [], cur = '', inQ = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
          if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
        else cur += c;
      }
      row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
      if (rows.length < 2) return [];
      const headers = rows[0].map(h => h.trim().replace(/^\uFEFF/, ''));
      return rows.slice(1).map(r => { const o = {}; headers.forEach((h, i) => { if (h) o[h] = (r[i] || '').trim(); }); return o; }).filter(o => o.name);
    }

    async function masterUploadFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let items = [];
        if (/\.csv$/i.test(file.name)) items = parseMasterCSV(text);
        else {
          const parsed = JSON.parse(text);
          items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
        }
        items = items.filter(x => x && typeof x === 'object' && x.name);
        if (!items.length) throw new Error('الملف فارغ أو لا يحتوي أصنافاً بحقل name');
        if (!confirm(`سيتم رفع/تحديث ${items.length} صنف في بنك المنتجات المشترك (الأصناف ذات نفس المعرّف id تُحدَّث، والبقية تُضاف). متابعة؟`)) return;
        let saved = 0;
        for (let i = 0; i < items.length; i += 400) {
          setMasterStatus(`جاري الرفع... ${Math.min(i + 400, items.length)} / ${items.length}`);
          const r = await apiFetch('/api/admin/master-catalog/bulk-upsert', { method: 'POST', body: JSON.stringify({ items: items.slice(i, i + 400) }) });
          if (!r || !r.success) throw new Error((r && r.message) || 'فشل الرفع');
          saved += r.saved || 0;
        }
        showToast(`🎉 تم رفع ${saved} صنف إلى البنك`);
      } catch (e) { showToast('⚠️ ' + e.message); }
      event.target.value = '';
      setMasterStatus('');
      fetchTenantMasterCatalog();
    }

    function masterExportJSON() {
      if (!cachedMasterCatalog.length) { showToast('البنك فارغ'); return; }
      const blob = new Blob([JSON.stringify(cachedMasterCatalog, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Master_Catalog_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast('تم تصدير نسخة JSON 💾');
    }

    async function fetchTenantMasterCatalog() {
      const grid = document.getElementById('tenantMasterCatalogGrid');
      const badge = document.getElementById('masterCatalogCountBadge');
      if (!grid) return;

      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#047857; font-weight:800;">جاري جلب بيانات بنك المنتجات المركزي...</div>`;
      detectMasterManageAccess();

      // 🆕 (إصلاح — تقليل القراءات) بدل قراءة كل مجموعة بنك المنتجات من Firestore مباشرة
      // (تكلفة قراءات عالية تتكرر بكل مرة تفتح فيها أي صيدلية هذا التبويب)، نقرأ الآن من
      // نسخة مخزَّنة على كاش Cloudflare عبر الووركر (/api/master-catalog) — صفر قراءات
      // فايرستور هنا إطلاقاً، وتتحدث النسخة المخزَّنة فقط لما يضيف السوبر أدمن شيئاً فعلياً.
      try {
        // cache:'no-cache' = يعيد التحقق دائماً بالـETag (304 بلا جسم إن لم يتغيّر) → أي تعديل للسوبر أدمن يظهر فوراً
        const res = await fetch(`${WORKER_API_BASE}/api/master-catalog`, { cache: 'no-cache' });
        cachedMasterCatalog = res.ok ? await res.json() : [];
        if (!Array.isArray(cachedMasterCatalog)) cachedMasterCatalog = [];

        if (badge) badge.textContent = `${cachedMasterCatalog.length} صنف متاح`;

        renderTenantMainCategoryButtons();
        updateTenantSubCategoryDropdown();
        updateTenantBrandDropdown();
        filterTenantMasterCatalog();
      } catch (e) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#DC2626; font-weight:800;">خطأ بالتحميل: ${e.message}</div>`;
      }
    }

    function filterTenantMasterCatalog() {
      const q = (document.getElementById('tenantImportSearchInput')?.value || '').trim().toLowerCase();
      const selectedSub = document.getElementById('tenantImportSubCatFilter')?.value || 'all';
      const selectedBrand = document.getElementById('tenantImportBrandFilter')?.value || 'all';
      const grid = document.getElementById('tenantMasterCatalogGrid');
      if (!grid) return;

      const filtered = cachedMasterCatalog.filter(item => {
        const cl = getItemClassification(item);
        if (activeMainCategory !== 'all' && cl.main !== activeMainCategory) return false;
        if (selectedSub !== 'all' && cl.sub !== selectedSub) return false;
        const itemBrand = (item.brand || 'عام').trim();
        if (selectedBrand !== 'all' && itemBrand !== selectedBrand) return false;

        const nameStr = (item.name || '').toLowerCase();
        const brandStr = itemBrand.toLowerCase();
        const barcodeStr = (item.barcode || '').toLowerCase();
        return !q || nameStr.includes(q) || brandStr.includes(q) || barcodeStr.includes(q);
      });

      masterVisibleIds = filtered.map(i => String(i.id));
      updateMasterSelCount();
      if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#6B7280; font-weight:800;">لا توجد أصناف مطابقة.</div>`;
        return;
      }

      const existingIds = new Set((products || []).map(p => String(p.masterCatalogId || p.id)));

      grid.innerHTML = filtered.map(item => {
        const isImported = existingIds.has(String(item.id));
        const defaultPrice = Number(item.price || item.suggestedPrice || 15000);
        const cl = getItemClassification(item);

        return `
          <div style="background:#fff; border:1.5px solid ${isImported ? '#BBF7D0' : '#E2E8F0'}; border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 2px 8px rgba(0,0,0,0.04); position:relative;">
            ${masterManageEnabled ? `<input type="checkbox" ${masterSelectedIds.has(String(item.id)) ? 'checked' : ''} onchange="toggleMasterSel('${String(item.id).replace(/'/g, '')}', this.checked)" style="position:absolute; top:10px; right:10px; width:18px; height:18px; cursor:pointer;">` : ''}
            ${isImported ? `<span style="position:absolute; top:10px; left:10px; background:#DCFCE7; color:#15803D; font-size:10px; font-weight:900; padding:2px 8px; border-radius:999px;">✅ مستورد</span>` : ''}
            <div>
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <span style="font-size:11px; font-weight:900; color:var(--accent); text-transform:uppercase;">${escapeHtml(item.brand || 'عام')}</span>
                <span style="background:#E0F2FE; color:#0369A1; font-size:10.5px; font-weight:900; padding:2px 7px; border-radius:6px;">${escapeHtml(cl.sub)}</span>
              </div>
              <h4 style="margin:0 0 6px; font-size:13.5px; font-weight:800; color:#111827;">${escapeHtml(item.name)}</h4>
              <div style="font-size:11px; color:#64748B; margin-bottom:10px;">السعر المقترح: <b class="mono" style="color:#047857;">${defaultPrice.toLocaleString()} د.ع</b></div>
            </div>

            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:10px; margin-top:8px;">
              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <div style="flex:1.5;">
                  <label style="font-size:10.5px; font-weight:800; display:block; margin-bottom:2px;">سعر البيع (د.ع) *</label>
                  <input type="number" id="inpImpPrice_${item.id}" value="${defaultPrice}" min="500" step="500" style="width:100%; padding:6px 8px; border:1px solid #CBD5E1; border-radius:8px; font-size:12px; font-family:monospace; font-weight:900; color:#047857; background:#fff;">
                </div>
                <div style="flex:1;">
                  <label style="font-size:10.5px; font-weight:800; display:block; margin-bottom:2px;">الكمية *</label>
                  <input type="number" id="inpImpQty_${item.id}" value="10" min="1" style="width:100%; padding:6px 8px; border:1px solid #CBD5E1; border-radius:8px; font-size:12px; font-family:monospace; font-weight:800; text-align:center; background:#fff;">
                </div>
              </div>
              <button type="button" onclick="handleTenantImportSingle('${item.id}')" style="width:100%; background:${isImported ? '#059669' : 'var(--accent)'}; color:#fff; font-weight:900; font-size:12px; padding:9px; border-radius:8px; cursor:pointer;">
                <span>${isImported ? '🔄 تحديث السعر والكمية' : '⚡ استيراد لمخزن الصيدلية'}</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // المنتجات تُعرض بالمتجر حسب p.category === معرّف قسم المتجر. أصناف البنك قد تحمل اسم القسم بالعربي
    // ("العناية بالأسنان")، فنطابقه مع قسم المتجر الموجود فعلاً (بالمعرّف، أو بالاسم، أو بالتصنيف الرئيسي)
    // وإلا نُبقي قيمة البنك كما هي.
    function resolveStoreCategoryId(masterItem) {
      const raw = String(masterItem.category || '').trim();
      const storeCats = Array.isArray(categories) ? categories : [];
      if (!storeCats.length) return raw;
      if (storeCats.some(c => c.id === raw)) return raw;
      const norm = (t) => String(t || '').replace(/[\u064B-\u0652ـ]/g, '').replace(/ال/g, '').replace(/\s+/g, '').toLowerCase();
      const byLabel = storeCats.find(c => norm(c.label) && (norm(c.label) === norm(raw) || norm(c.label).includes(norm(raw)) || (norm(raw) && norm(raw).includes(norm(c.label)))));
      if (byLabel) return byLabel.id;
      const main = getItemClassification(masterItem).main;
      const byMainId = storeCats.find(c => c.id === main);
      if (byMainId) return byMainId.id;
      const mainLabel = (MASTER_CATEGORIES_CONFIG[main] || {}).labelAr;
      const byMainLabel = mainLabel ? storeCats.find(c => norm(c.label) && (norm(c.label).includes(norm(mainLabel)) || norm(mainLabel).includes(norm(c.label)))) : null;
      return byMainLabel ? byMainLabel.id : raw;
    }

    async function handleTenantImportSingle(masterId) {
      if (!isFirebaseConfigured || !db) return;
      const masterItem = cachedMasterCatalog.find(x => String(x.id) === String(masterId));
      if (!masterItem) return;

      const priceInp = document.getElementById(`inpImpPrice_${masterId}`);
      const qtyInp = document.getElementById(`inpImpQty_${masterId}`);

      const sellingPrice = Number(priceInp ? priceInp.value : masterItem.price || masterItem.suggestedPrice || 15000);
      const stockQty = Number(qtyInp ? qtyInp.value : 10);

      showToast(`جاري الحفظ...`);

      try {
        const existingSnap = await dbPaths.productsCol().doc(String(masterId)).get();

        if (existingSnap.exists) {
          await dbPaths.productsCol().doc(String(masterId)).set({
            price: sellingPrice,
            stockQuantity: stockQty,
            inStock: stockQty > 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          showToast(`✅ تم تحديث السعر والكمية لـ "${masterItem.name}"`);
        } else {
          const payload = {
            ...masterItem,
            category: resolveStoreCategoryId(masterItem),
            masterCategoryLabel: masterItem.category || '',
            masterCatalogId: masterId,
            price: sellingPrice,
            oldPrice: null,
            stockQuantity: stockQty,
            inStock: stockQty > 0,
            isDeleted: false,
            isSpecialOffer: false,
            orderCount: 0,
            importedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          await dbPaths.productsCol().doc(String(masterId)).set(payload, { merge: true });
          showToast(`🎉 تم استيراد "${masterItem.name}" بنجاح إلى متجرك!`);
        }
        filterTenantMasterCatalog();
      } catch (err) {
        showToast(`فشل الاستيراد: ${err.message}`);
      }
    }

    const COLOR_SWATCH_PRESETS = [
      '#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C',
      '#FDBA74', '#FB923C', '#F97316', '#EA580C', '#C2410C',
      '#FDE047', '#FACC15', '#EAB308', '#CA8A04', '#A16207',
      '#BEF264', '#A3E635', '#84CC16', '#65A30D', '#4D7C0F',
      '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857',
      '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490',
      '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8',
      '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9',
      '#F5D0FE', '#E879F9', '#D946EF', '#C026D3', '#A21CAF',
      '#FBCFE8', '#F9A8D4', '#EC4899', '#DB2777', '#BE185D',
      '#E85D8A', '#F43F5E', '#94A3B8', '#64748B', '#334155', '#0F172A'
    ];

    function renderColorSwatchGrid() {
      const grid = document.getElementById('colorSwatchGrid');
      if (!grid) return;
      const currentColor = (document.getElementById('adminPrimaryColorPicker').value || '#E85D8A').toUpperCase();
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(9, 1fr)';
      grid.style.gap = '5px';
      grid.innerHTML = COLOR_SWATCH_PRESETS.map(c => `
        <button type="button" onclick="selectColorSwatch('${c}')"
          style="aspect-ratio:1/1; width:100%; border-radius:7px; background:${c}; cursor:pointer; padding:0;
          border:${c.toUpperCase() === currentColor ? '3px solid #111827' : '1px solid rgba(0,0,0,0.06)'};
          box-shadow:${c.toUpperCase() === currentColor ? '0 0 0 2px #fff inset' : 'none'};
          transform:${c.toUpperCase() === currentColor ? 'scale(1.12)' : 'scale(1)'}; transition:transform .12s;"
          title="${c}"></button>
      `).join('');
    }

    function selectColorSwatch(hex) {
      document.getElementById('adminPrimaryColorPicker').value = hex;
      renderColorSwatchGrid();
    }

    function onColorPickerChange() {
      renderColorSwatchGrid();
    }

    document.addEventListener('DOMContentLoaded', renderColorSwatchGrid);

    // 🌸 قراءة إعدادات الصيدلية وشاشة التحميل المخصصة
    async function loadPharmacyDesignAndSecrets() {
      if (!db) return;
      try {
        const pubSnap = await dbPaths.pharmacyDoc().get();
        if (pubSnap.exists) {
          const p = pubSnap.data();
          if (document.getElementById('adminPharmacyNameInput')) document.getElementById('adminPharmacyNameInput').value = p.name || '';
          if (document.getElementById('adminPrimaryColorPicker')) document.getElementById('adminPrimaryColorPicker').value = p.primaryColor || '#E85D8A';
          renderColorSwatchGrid();
          if (document.getElementById('adminSocialWhatsappInput')) document.getElementById('adminSocialWhatsappInput').value = p.socialWhatsapp || '';
          if (document.getElementById('adminSocialPhoneInput')) document.getElementById('adminSocialPhoneInput').value = p.socialPhone || '';
          if (document.getElementById('adminDeliveryStandard')) document.getElementById('adminDeliveryStandard').value = p.deliveryFeeStandard || 4000;
          if (document.getElementById('adminDeliveryExpress')) document.getElementById('adminDeliveryExpress').value = p.deliveryFeeExpress || 8000;
          if (document.getElementById('adminHeroMainTitle')) document.getElementById('adminHeroMainTitle').value = p.heroMainTitle || '';
          if (document.getElementById('adminHeroSubTitle')) document.getElementById('adminHeroSubTitle').value = p.heroSubTitle || '';
          if (document.getElementById('adminHeroDescTitle')) document.getElementById('adminHeroDescTitle').value = p.heroDescTitle || '';
          if (document.getElementById('adminShowAnnouncement')) document.getElementById('adminShowAnnouncement').checked = (p.showAnnouncement !== false);
          if (document.getElementById('adminAnnouncementText')) document.getElementById('adminAnnouncementText').value = p.announcementText || '';
          if (document.getElementById('adminShowPharmacistBanner')) document.getElementById('adminShowPharmacistBanner').checked = (p.showPharmacistBanner !== false);
          if (document.getElementById('adminPharmacistTitleInput')) document.getElementById('adminPharmacistTitleInput').value = p.pharmacistCtaTitle || '';
          if (document.getElementById('adminPharmacistDescInput')) document.getElementById('adminPharmacistDescInput').value = p.pharmacistCtaDesc || '';
          
          // 🌸 (بُسِّط) ملء إعدادات واجهة شاشة التحميل الأولية — صورة ونصوص فقط
          if (document.getElementById('adminLoaderTitleInput')) document.getElementById('adminLoaderTitleInput').value = p.loaderTitle || 'جاري تحميل الموقع';
          if (document.getElementById('adminLoaderSubInput')) document.getElementById('adminLoaderSubInput').value = p.loaderSubText || 'انتظر لحظة من فضلك ..';
          if (p.loaderImgUrl) {
            document.getElementById('adminLoaderImgInput').value = p.loaderImgUrl;
            document.getElementById('adminLoaderImgPreviewEl').src = p.loaderImgUrl;
            document.getElementById('adminLoaderImgPreviewBox').style.display = 'flex';
          }

          if (p.logoUrl) {
            document.getElementById('adminPharmacyLogoInput').value = p.logoUrl;
            document.getElementById('adminPharmacyLogoPreviewEl').src = p.logoUrl;
            document.getElementById('adminPharmacyLogoPreviewBox').style.display = 'flex';
          }
          if (p.bannerImgUrl) {
            document.getElementById('adminBannerImgInput').value = p.bannerImgUrl;
            document.getElementById('adminBannerImgPreviewEl').src = p.bannerImgUrl;
            document.getElementById('adminBannerImgPreviewBox').style.display = 'flex';
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }

    async function handleSaveCustomization(e) {
      e.preventDefault();
      if (!assertAdmin(showToast)) return;

      const name = document.getElementById('adminPharmacyNameInput').value.trim();
      const logoUrl = sanitizeUrl(document.getElementById('adminPharmacyLogoInput').value.trim());
      const primaryColor = document.getElementById('adminPrimaryColorPicker').value;
      const socialWhatsapp = document.getElementById('adminSocialWhatsappInput').value.trim();
      const socialPhone = document.getElementById('adminSocialPhoneInput').value.trim();
      const deliveryFeeStandard = Number(document.getElementById('adminDeliveryStandard').value || 4000);
      const deliveryFeeExpress = Number(document.getElementById('adminDeliveryExpress').value || 8000);

      const bannerImgUrl = sanitizeUrl(document.getElementById('adminBannerImgInput').value.trim());
      const heroMainTitle = document.getElementById('adminHeroMainTitle').value.trim();
      const heroSubTitle = document.getElementById('adminHeroSubTitle').value.trim();
      const heroDescTitle = document.getElementById('adminHeroDescTitle').value.trim();
      const showAnnouncement = document.getElementById('adminShowAnnouncement').checked;
      const announcementText = document.getElementById('adminAnnouncementText').value.trim();
      const showPharmacistBanner = document.getElementById('adminShowPharmacistBanner').checked;
      const pharmacistCtaTitle = document.getElementById('adminPharmacistTitleInput').value.trim();
      const pharmacistCtaDesc = document.getElementById('adminPharmacistDescInput').value.trim();

      // إعدادات شاشة التحميل المخصصة — (بُسِّطت) صورة وعنوان ونص فقط الآن
      const loaderImgUrl = sanitizeUrl(document.getElementById('adminLoaderImgInput')?.value.trim() || '');
      const loaderTitle = document.getElementById('adminLoaderTitleInput')?.value.trim() || 'جاري تحميل الموقع';
      const loaderSubText = document.getElementById('adminLoaderSubInput')?.value.trim() || 'انتظر لحظة من فضلك ..';

      // 🗑️ (بطلبك — "احذف الصورة القديمة حتى ما تظهر بالخطأ") نأخذ الصورة القديمة من
      // النسخة المتزامنة بالذاكرة (pharmacyProfile، محدَّثة أصلاً عبر onSnapshot — صفر
      // قراءات إضافية)، ونحذفها فعلياً من R2 بعد نجاح الحفظ إن اختلفت عن الصورة الجديدة.
      const oldLoaderImgUrl = pharmacyProfile ? pharmacyProfile.loaderImgUrl : null;

      try {
        await dbPaths.pharmacyDoc().set({
          name: sanitizeText(name),
          logoUrl,
          primaryColor,
          socialWhatsapp: sanitizeText(socialWhatsapp),
          socialPhone: sanitizeText(socialPhone),
          deliveryFeeStandard,
          deliveryFeeExpress,
          bannerImgUrl,
          heroMainTitle: sanitizeText(heroMainTitle),
          heroSubTitle: sanitizeText(heroSubTitle),
          heroDescTitle: sanitizeText(heroDescTitle),
          showAnnouncement,
          announcementText: sanitizeText(announcementText),
          showPharmacistBanner,
          pharmacistCtaTitle: sanitizeText(pharmacistCtaTitle),
          pharmacistCtaDesc: sanitizeText(pharmacistCtaDesc),
          loaderImgUrl,
          loaderTitle: sanitizeText(loaderTitle),
          loaderSubText: sanitizeText(loaderSubText),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        refreshStorefrontCache(); // 🛍️ لقطة المتجر للزوار (الاسم، الشعار، التوصيل، البنر...)

        // 🗑️ حذف صورة شاشة التحميل القديمة فعلياً من R2 إن استُبدلت بأخرى جديدة، حتى لا
        // تبقى محفوظة (وقد تظهر بالخطأ لاحقاً لو أُعيد استخدام رابطها بأي شكل).
        if (oldLoaderImgUrl && loaderImgUrl && oldLoaderImgUrl !== loaderImgUrl) {
          deleteOrphanImageFromR2(oldLoaderImgUrl);
        }

        showToast('تم حفظ وتطبيق الهوية وشاشة التحميل سحابياً! ✨');
      } catch (err) {
        showToast(`خطأ: ${err.message}`);
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      loadPharmacyDesignAndSecrets();
      fetchTenantMasterCatalog();
    });
  
