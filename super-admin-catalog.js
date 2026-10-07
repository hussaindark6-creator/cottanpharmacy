/* ==========================================================
   super-admin-catalog.js — بنك المنتجات المركزي: العرض، الحذف، الرفع الجماعي، المساهمات
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    async function fetchMasterCatalog() {
      if (!db) return;
      try {
        // 🛡️ (توفير قراءات) القراءة من كاش R2 عبر الووركر (0 قراءة Firestore) بدل قراءة كل البنك بكل فتح للوحة.
        // إن كان الكاش فارغاً/غير متاح (قبل أول إعادة بناء) نرجع لـ Firestore مرة واحدة.
        window.cachedMasterCatalog = [];
        try {
          const r = await fetch(`${WORKER_API_BASE_SUPER}/api/master-catalog`, { cache: 'no-cache' });
          if (r.ok) { const arr = await r.json(); if (Array.isArray(arr)) window.cachedMasterCatalog = arr; }
        } catch (e) { console.warn('master catalog via worker failed:', e); }
        if (!window.cachedMasterCatalog.length) {
          const snap = await db.collection('system').doc('master_catalog').collection('products').get();
          snap.forEach(d => window.cachedMasterCatalog.push({ id: d.id, ...d.data() }));
        }

        document.getElementById('statMasterItemsCount').textContent = window.cachedMasterCatalog.length;
        document.getElementById('catTotalCountBadge').textContent = window.cachedMasterCatalog.length;
        filterMasterCatalog();
      } catch (e) {
        console.warn(e);
      }
    }

    function filterMasterCatalog() {
      const q = (document.getElementById('masterSearchInput')?.value || '').trim().toLowerCase();

      window.filteredMasterCatalog = window.cachedMasterCatalog.filter(item => {
        const name = (item.name || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        const barcode = (item.barcode || '').toLowerCase();
        return !q || name.includes(q) || brand.includes(q) || barcode.includes(q);
      });

      document.getElementById('masterFilteredCountText').textContent = `عرض ${window.filteredMasterCatalog.length} من أصل ${window.cachedMasterCatalog.length} صنف`;
      window.masterCurrentPage = 1;
      renderMasterCatalogPage();
    }

    function renderMasterCatalogPage() {
      const tbody = document.getElementById('masterCatalogTableBody');
      const totalItems = window.filteredMasterCatalog.length;
      const totalPages = Math.ceil(totalItems / MASTER_PAGE_SIZE) || 1;

      if (window.masterCurrentPage > totalPages) window.masterCurrentPage = totalPages;
      if (window.masterCurrentPage < 1) window.masterCurrentPage = 1;

      const startIndex = (window.masterCurrentPage - 1) * MASTER_PAGE_SIZE;
      const pageItems = window.filteredMasterCatalog.slice(startIndex, startIndex + MASTER_PAGE_SIZE);

      if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-500">لا توجد أصناف مطابقة للبحث.</td></tr>`;
      } else {
        tbody.innerHTML = pageItems.map(item => {
          const isChecked = window.selectedMasterItemIds.has(item.id);
          return `
            <tr class="hover:bg-slate-800/40 transition text-xs">
              <td class="py-3 px-4 text-center">
                <input type="checkbox" value="${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleMasterItemSelection(this, '${item.id}')" class="master-row-cb w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 cursor-pointer">
              </td>
              <td class="py-3 px-4">
                <div class="font-bold text-white">${item.name || ''}</div>
                <div class="text-[11px] text-slate-400">${item.size || ''} ${item.barcode ? `· باركود: ${item.barcode}` : ''}</div>
              </td>
              <td class="py-3 px-4 font-bold text-emerald-400">${item.brand || ''}</td>
              <td class="py-3 px-4 text-slate-300">${item.category || 'عام'}</td>
              <td class="py-3 px-4 font-mono text-amber-400 font-bold">${Number(item.price || item.suggestedPrice || 0).toLocaleString()} د.ع</td>
              <td class="py-3 px-4 text-center">
                <button onclick="deleteFromMasterCatalog('${item.id}')" class="text-red-400 hover:text-red-300 font-bold p-1">🗑️</button>
              </td>
            </tr>
          `;
        }).join('');
      }

      document.getElementById('masterPaginationInfo').textContent = `صفحة ${window.masterCurrentPage} من ${totalPages}`;
      document.getElementById('btnPrevMasterPage').disabled = (window.masterCurrentPage <= 1);
      document.getElementById('btnNextMasterPage').disabled = (window.masterCurrentPage >= totalPages);
      updateSelectedMasterCount();
    }

    function changeMasterPage(delta) {
      window.masterCurrentPage += delta;
      renderMasterCatalogPage();
    }

    function toggleSelectAllMaster(mainCheckbox) {
      const isChecked = mainCheckbox.checked;
      const checkboxes = document.querySelectorAll('.master-row-cb');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) window.selectedMasterItemIds.add(cb.value);
        else window.selectedMasterItemIds.delete(cb.value);
      });
      updateSelectedMasterCount();
    }

    function toggleMasterItemSelection(cb, id) {
      if (cb.checked) window.selectedMasterItemIds.add(id);
      else window.selectedMasterItemIds.delete(id);
      updateSelectedMasterCount();
    }

    function updateSelectedMasterCount() {
      const count = window.selectedMasterItemIds.size;
      const badge = document.getElementById('selectedMasterCount');
      const bulkDelBtn = document.getElementById('btnBulkDeleteMaster');
      if (badge) badge.textContent = count;
      if (bulkDelBtn) {
        if (count > 0) bulkDelBtn.classList.remove('hidden');
        else bulkDelBtn.classList.add('hidden');
      }
    }

    async function handleBulkDeleteMasterProducts() {
      const ids = Array.from(window.selectedMasterItemIds);
      if (!confirm(`تحذير: هل أنت متأكد من حذف (${ids.length}) صنف دفعة واحدة من الكتالوج المركزي؟`)) return;

      showToast(`جاري حذف ${ids.length} صنف...`);
      const CHUNK_SIZE = 400;
      const totalBatches = Math.ceil(ids.length / CHUNK_SIZE);

      try {
        for (let i = 0; i < totalBatches; i++) {
          const chunk = ids.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const batch = db.batch();
          chunk.forEach(id => {
            const docRef = db.collection('system').doc('master_catalog').collection('products').doc(id);
            batch.delete(docRef);
          });
          await batch.commit();
        }

        showToast(`🎉 تم حذف ${ids.length} صنف بنجاح!`);
        window.selectedMasterItemIds.clear();
        updateSelectedMasterCount();
        fetchMasterCatalog();
        // 🆕 حذف جماعي = يبني الكاش بالكامل مرة واحدة فقط بعد اكتمال كل الدفعات (أسرع
        // وأبسط من محاولة إزالة كل صنف من ملف R2 على حدة لعدد كبير كهذا).
        await syncMasterCatalogCache('/api/admin/master-catalog/rebuild');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function deleteFromMasterCatalog(id) {
      if (!confirm('حذف هذا الصنف من الكتالوج المركزي؟')) return;
      try {
        await db.collection('system').doc('master_catalog').collection('products').doc(id).delete();
        showToast('تم حذف الصنف');
        fetchMasterCatalog();
        // 🆕 حذف صنف واحد = إزالته مباشرة من ملف R2 المخزَّن (قراءة واحدة + كتابة واحدة)
        // بلا أي قراءة لكامل المجموعة — أرخص بكثير من إعادة بناء الملف كاملاً.
        await syncMasterCatalogCache('/api/admin/master-catalog/delete-item', { productId: id });
      } catch (e) {
        showToast('خطأ: ' + e.message, true);
      }
    }

    async function handleMasterBulkUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const progressBox = document.getElementById('bulkUploadProgressBar');
      const progressFill = document.getElementById('bulkUploadProgressFill');
      const percentText = document.getElementById('bulkUploadPercentText');
      const statusText = document.getElementById('bulkUploadStatusText');

      progressBox.classList.remove('hidden');
      progressFill.style.width = '5%';
      percentText.textContent = '5%';
      statusText.textContent = 'جاري قراءة الملف...';

      try {
        const text = await file.text();
        let items = [];

        if (file.name.endsWith('.json')) {
          items = JSON.parse(text);
        } else {
          items = parseCSVToMasterArray(text);
        }

        if (!Array.isArray(items) || items.length === 0) {
          throw new Error('الملف فارغ أو لا يحتوي على مصفوفة بيانات صالحة.');
        }

        statusText.textContent = `تم قراءة ${items.length} صنف. جاري الحفظ السحابي...`;
        const CHUNK_SIZE = 400;
        const totalBatches = Math.ceil(items.length / CHUNK_SIZE);

        for (let i = 0; i < totalBatches; i++) {
          const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const batch = db.batch();

          chunk.forEach(rawItem => {
            const docId = rawItem.id ? String(rawItem.id).trim() : ('item_' + Math.random().toString(36).substring(2, 9));
            const docRef = db.collection('system').doc('master_catalog').collection('products').doc(docId);
            
            batch.set(docRef, {
              id: docId,
              name: rawItem.name || 'بدون اسم',
              brand: rawItem.brand || 'عام',
              category: rawItem.category || 'face',
              size: rawItem.size || 'عبوة قياسية',
              price: Number(rawItem.price || rawItem.suggestedPrice || 0),
              suggestedPrice: Number(rawItem.suggestedPrice || rawItem.price || 0),
              stockQuantity: Number(rawItem.stockQuantity || 10),
              inStock: rawItem.inStock !== false,
              description: rawItem.description || '',
              ingredients: rawItem.ingredients || '',
              barcode: rawItem.barcode || '',
              imageUrl: rawItem.imageUrl || '',
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          });

          await batch.commit();
          const pct = Math.round(((i + 1) / totalBatches) * 100);
          progressFill.style.width = pct + '%';
          percentText.textContent = pct + '%';
        }

        showToast(`🎉 تم استيراد (${items.length}) صنف بنجاح!`);
        setTimeout(() => progressBox.classList.add('hidden'), 2000);
        fetchMasterCatalog();
        // 🆕 رفع جماعي = إعادة بناء الكاش بالكامل مرة واحدة بعد اكتمال كل الدفعات (أسرع
        // من تحديث ملف R2 لكل صنف من مئات الأصناف على حدة).
        statusText.textContent = 'جاري تحديث كاش المتجر...';
        await syncMasterCatalogCache('/api/admin/master-catalog/rebuild');
      } catch (err) {
        showToast('خطأ بالرفع: ' + err.message, true);
        progressBox.classList.add('hidden');
      } finally {
        event.target.value = '';
      }
    }

    function parseCSVToMasterArray(csvText) {
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) return [];
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const list = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx] || ''; });
        if (obj.name) list.push(obj);
      }
      return list;
    }

    async function exportMasterCatalogJSON() {
      if (!window.cachedMasterCatalog.length) return;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.cachedMasterCatalog, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = `Master_Catalog_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      showToast('تم تصدير نسخة JSON بنجاح 💾');
    }

    async function fetchCrowdsourcedSubmissions() {
      if (!db) return;
      const tbody = document.getElementById('crowdsourceTableBody');
      const badge = document.getElementById('crowdsourceBadge');
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">جاري فحص المساهمات...</td></tr>`;

      try {
        const snap = await db.collection('system').doc('master_catalog_submissions').collection('submissions').where('status', '==', 'pending_review').get();
        badge.textContent = snap.size;

        if (snap.empty) {
          tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">لا توجد مساهمات معلقة حالياً 🌸</td></tr>`;
          return;
        }

        tbody.innerHTML = snap.docs.map(doc => {
          const s = doc.data();
          const p = s.productData || {};
          return `
            <tr class="hover:bg-slate-800/40 transition text-xs">
              <td class="py-3 px-4 font-bold text-white">${s.sourcePharmacyName || s.sourcePharmacyId || 'صيدلية'}</td>
              <td class="py-3 px-4 font-bold text-white">${p.name || 'منتج'}</td>
              <td class="py-3 px-4 font-bold text-emerald-400">${p.brand || ''}</td>
              <td class="py-3 px-4 font-mono text-amber-400 font-bold">${Number(p.price || p.suggestedPrice || 0).toLocaleString()} د.ع</td>
              <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button onclick="approveCrowdsourcedItem('${doc.id}')" class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-bold">اعتماد ✅</button>
                  <button onclick="rejectCrowdsourcedItem('${doc.id}')" class="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg font-bold">رفض ❌</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-red-400">خطأ: ${err.message}</td></tr>`;
      }
    }

    async function approveCrowdsourcedItem(subId) {
      try {
        const subDoc = await db.collection('system').doc('master_catalog_submissions').collection('submissions').doc(subId).get();
        if (!subDoc.exists) return;
        const subData = subDoc.data();
        const p = subData.productData || {};

        const docId = 'item_' + (p.barcode || Math.random().toString(36).substring(2, 9));
        await db.collection('system').doc('master_catalog').collection('products').doc(docId).set({
          ...p,
          id: docId,
          crowdsourcedBy: subData.sourcePharmacyId || 'pharmacy',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await db.collection('system').doc('master_catalog_submissions').collection('submissions').doc(subId).set({
          status: 'approved',
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('🎉 تم اعتماد الصنف في الكتالوج المركزي!');
        fetchCrowdsourcedSubmissions();
        fetchMasterCatalog();
        // 🆕 اعتماد صنف واحد = إضافته مباشرة لملف R2 المخزَّن (قراءة واحدة + كتابة واحدة)
        // بلا أي قراءة لكامل مجموعة البنك — هذا بالضبط "الإضافة الجديدة فقط" المطلوبة.
        await syncMasterCatalogCache('/api/admin/master-catalog/upsert-item', { productId: docId, data: { ...p, id: docId, crowdsourcedBy: subData.sourcePharmacyId || 'pharmacy' } });
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function rejectCrowdsourcedItem(subId) {
      try {
        await db.collection('system').doc('master_catalog_submissions').collection('submissions').doc(subId).set({
          status: 'rejected',
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast('تم رفض الصنف المقترح');
        fetchCrowdsourcedSubmissions();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }
