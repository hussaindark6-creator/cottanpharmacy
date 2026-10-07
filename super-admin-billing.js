/* ==========================================================
   super-admin-billing.js — معلومات الدفع وباقات الاشتراك
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    async function loadSuperAdminPaymentInfo() {
      if (!db) return;
      try {
        const snap = await db.collection('system').doc('payment_info').get();
        if (snap.exists) {
          const d = snap.data();
          if (document.getElementById('payCardHolder')) document.getElementById('payCardHolder').value = d.cardHolder || '';
          if (document.getElementById('payQiCard')) document.getElementById('payQiCard').value = d.qiCardNumber || '';
          if (document.getElementById('payZainCash')) document.getElementById('payZainCash').value = d.zainCashNumber || '';
          if (document.getElementById('payNotes')) document.getElementById('payNotes').value = d.notes || '';
        }
      } catch (e) {
        console.warn(e);
      }
    }

    async function handleSaveSuperPaymentInfo(e) {
      e.preventDefault();
      if (!db) return;
      try {
        await db.collection('system').doc('payment_info').set({
          cardHolder: document.getElementById('payCardHolder').value.trim(),
          qiCardNumber: document.getElementById('payQiCard').value.trim(),
          zainCashNumber: document.getElementById('payZainCash').value.trim(),
          notes: document.getElementById('payNotes').value.trim(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast('تم حفظ وتعميم بيانات الدفع الإلكتروني (كي كارد وزين كاش)! 💳');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function fetchSubscriptionPackages() {
      if (!db) return;
      try {
        const snap = await db.collection('system').doc('subscription_packages').collection('packages').orderBy('price', 'asc').get();
        const packages = [];
        snap.forEach(d => packages.push({ id: d.id, ...d.data() }));
        window.cachedPackagesList = packages;
        renderPackagesList(packages);
        populatePackageDropdowns(packages);
      } catch (e) { console.warn(e); }
    }

    function renderPackagesList(packages) {
      const grid = document.getElementById('packagesListGrid');
      if (!grid) return;
      if (packages.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-500 text-xs py-6">لا توجد باقات مسجّلة بعد — أضيفي أول باقة بالأسفل.</div>`;
        return;
      }
      grid.innerHTML = packages.map(p => `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h4 class="font-black text-white text-sm">${p.name || p.id}</h4>
            ${p.customDomainAllowed ? '<span class="text-[10px] bg-blue-950/60 text-blue-400 border border-blue-800/50 px-2 py-0.5 rounded-full font-bold">🌐 دومين مخصص</span>' : ''}
          </div>
          <div class="text-2xl font-black text-amber-400 font-mono">${Number(p.price || 0).toLocaleString()} <span class="text-xs text-slate-500 font-bold">د.ع / شهرياً</span></div>
          <ul class="text-xs text-slate-400 space-y-1 flex-1">
            ${(p.features || []).map(f => `<li>✓ ${f}</li>`).join('') || '<li class="text-slate-600">لا توجد ميزات مضافة</li>'}
          </ul>
          <div class="flex gap-2 pt-2 border-t border-slate-800">
            <button onclick='editPackage(${JSON.stringify(p).replace(/'/g, "&#39;")})' class="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg transition">تعديل ✏️</button>
            <button onclick="deletePackage('${p.id}')" class="flex-1 bg-red-950/50 hover:bg-red-900/50 text-red-400 text-xs font-bold py-2 rounded-lg transition">حذف 🗑️</button>
          </div>
        </div>
      `).join('');
    }

    function editPackage(pkg) {
      document.getElementById('pkgDocId').value = pkg.id;
      document.getElementById('pkgName').value = pkg.name || '';
      document.getElementById('pkgPrice').value = pkg.price || '';
      document.getElementById('pkgMaxPriceCap').value = pkg.maxPriceCap || '';
      document.getElementById('pkgCustomDomainAllowed').checked = !!pkg.customDomainAllowed;
      document.getElementById('pkgFeatures').value = (pkg.features || []).join('\n');
      document.getElementById('packageFormTitle').textContent = '✏️ تعديل الباقة: ' + (pkg.name || pkg.id);
      document.getElementById('packageFormTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function resetPackageForm() {
      document.getElementById('pkgDocId').value = '';
      document.getElementById('pkgName').value = '';
      document.getElementById('pkgPrice').value = '';
      document.getElementById('pkgMaxPriceCap').value = '';
      document.getElementById('pkgCustomDomainAllowed').checked = false;
      document.getElementById('pkgFeatures').value = '';
      document.getElementById('packageFormTitle').textContent = '➕ إضافة باقة جديدة';
    }

    async function handleSavePackage(e) {
      e.preventDefault();
      if (!db) return;
      const existingId = document.getElementById('pkgDocId').value.trim();
      const name = document.getElementById('pkgName').value.trim();
      const price = Number(document.getElementById('pkgPrice').value || 0);
      const maxPriceCap = Number(document.getElementById('pkgMaxPriceCap').value || 0) || null;
      const customDomainAllowed = document.getElementById('pkgCustomDomainAllowed').checked;
      const features = document.getElementById('pkgFeatures').value.split('\n').map(f => f.trim()).filter(Boolean);

      const docId = existingId || name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('pkg_' + Date.now());

      try {
        await db.collection('system').doc('subscription_packages').collection('packages').doc(docId).set({
          name, price, maxPriceCap, customDomainAllowed, features,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(existingId ? 'تم تحديث الباقة بنجاح ✓' : 'تمت إضافة الباقة الجديدة! 💎');
        resetPackageForm();
        fetchSubscriptionPackages();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function deletePackage(id) {
      if (!confirm('هل أنتِ متأكدة من حذف هذه الباقة؟')) return;
      try {
        await db.collection('system').doc('subscription_packages').collection('packages').doc(id).delete();
        showToast('تم حذف الباقة');
        fetchSubscriptionPackages();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    function populatePackageDropdowns(packages) {
      const options = '<option value="">— بدون باقة (تسعير يدوي) —</option>' +
        packages.map(p => `<option value="${p.id}">${p.name} — ${Number(p.price || 0).toLocaleString()} د.ع</option>`).join('');
      ['newPharmacyPackageId', 'editPackageId'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
      });
    }

    function applyPackageToEditForm() {
      const pkgId = document.getElementById('editPackageId').value;
      const pkg = (window.cachedPackagesList || []).find(p => p.id === pkgId);
      if (pkg) {
        document.getElementById('editSubPrice').value = pkg.price || '';
        document.getElementById('editMaxPriceCap').value = pkg.maxPriceCap || 150000;
      }
    }

    function applyPackageToCreateForm() {
      const pkgId = document.getElementById('newPharmacyPackageId').value;
      const pkg = (window.cachedPackagesList || []).find(p => p.id === pkgId);
      if (pkg) {
        document.getElementById('inpSubscriptionPrice').value = pkg.price || '';
        document.getElementById('inpMaxPriceCap').value = pkg.maxPriceCap || 150000;
      }
    }
