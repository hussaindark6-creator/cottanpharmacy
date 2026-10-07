/* ==========================================================
   super-admin-pharmacies.js — الصيدليات: القائمة، الإنشاء، الإيقاف/الحذف، فوترة الاستهلاك
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    async function fetchPharmaciesList() {
      if (!db) return;
      const tbody = document.getElementById('pharmaciesTableBody');
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">جاري تحديث البيانات...</td></tr>`;

      try {
        const snap = await db.collection('pharmacies').get();
        let total = 0, active = 0, totalRevenue = 0;
        const rows = [];
        const todayStr = new Date().toISOString().split('T')[0];

        window.cachedPharmaciesMap = {};

        for (const doc of snap.docs) {
          total++;
          const data = doc.data();
          const slug = doc.id;
          window.cachedPharmaciesMap[slug] = data;

          const isSuspended = data.isActive === false;
          const expiryDate = data.subscriptionExpiry || '2099-12-31';
          const isExpired = expiryDate < todayStr;
          const subPrice = Number(data.subscriptionPrice || 50000);

          totalRevenue += subPrice;
          if (!isSuspended && !isExpired) active++;

          rows.push(`
            <tr class="hover:bg-slate-800/40 transition text-xs">
              <td class="py-3.5 px-4 font-bold text-white">${data.name || slug}</td>
              <td class="py-3.5 px-4 font-mono text-emerald-400">${slug}</td>
              <td class="py-3.5 px-4 font-mono text-slate-300">${data.adminEmail || 'غير محدد'}</td>
              <td class="py-3.5 px-4 font-mono text-amber-400 font-bold">${subPrice.toLocaleString()} د.ع</td>
              <td class="py-3.5 px-4 font-mono text-slate-300">${data.templateId || 'template_default'}</td>
              <td class="py-3.5 px-4">
                <span class="px-2.5 py-1 rounded-full font-bold ${isSuspended ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}">
                  ${isSuspended ? '⛔ موقوف' : '● نشط'}
                </span>
              </td>
              <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <a href="index.html?pharmacy=${encodeURIComponent(slug)}" target="_blank" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg font-bold transition">
                    🛍️ المتجر
                  </a>
                  <a href="admin.html?pharmacy=${encodeURIComponent(slug)}" target="_blank" class="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg font-bold transition">
                    ⚙️ الإدارة
                  </a>
                  <button onclick="openFullEditModal('${slug}')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-1 rounded-lg font-bold transition">
                    ✏️ تعديل
                  </button>
                  <button onclick="togglePharmacyStatus('${slug}', ${!isSuspended})" class="${isSuspended ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'} border px-2 py-1 rounded-lg font-bold">
                    ${isSuspended ? 'تفعيل 🟢' : 'حظر 🔴'}
                  </button>
                  <button onclick="handleDeletePharmacy('${slug}', '${data.name || slug}')" class="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg font-bold">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          `);
        }

        document.getElementById('statTotalPharmacies').textContent = total;
        document.getElementById('statActivePharmacies').textContent = active;
        document.getElementById('statTotalRevenue').textContent = totalRevenue.toLocaleString() + ' د.ع';

        tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="7" class="text-center py-10 text-slate-500">لا توجد صيدليات مسجلة.</td></tr>`;
        populateDomainLinkTenantSelect();
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-400">خطأ: ${err.message}</td></tr>`;
      }
    }

    async function handleCreatePharmacy(e) {
      e.preventDefault();
      if (!db) return;

      const slug = document.getElementById('inpPharmacySlug').value.trim().toLowerCase();
      const name = document.getElementById('inpPharmacyName').value.trim();
      const adminEmail = document.getElementById('inpAdminEmail').value.trim().toLowerCase();
      const whatsapp = document.getElementById('inpWhatsapp').value.trim().replace(/\+/g, '');
      const packageId = document.getElementById('newPharmacyPackageId').value;
      const subPrice = Number(document.getElementById('inpSubscriptionPrice').value || 50000);
      const maxCap = Number(document.getElementById('inpMaxPriceCap').value || 150000);
      const expiryDate = document.getElementById('inpExpiryDate').value;
      const templateId = document.getElementById('inpTemplateId').value;
      const color = document.getElementById('inpPrimaryColor').value.trim();
      const botToken = document.getElementById('inpTeleBotToken').value.trim();
      const chatId = document.getElementById('inpTeleChatId').value.trim();

      try {
        await db.collection('pharmacies').doc(slug).set({
          id: slug,
          name,
          adminEmail,
          socialWhatsapp: whatsapp,
          templateId,
          packageId,
          primaryColor: color,
          isActive: true,
          subscriptionExpiry: expiryDate,
          showAnnouncement: true,
          announcementText: `✨ أهلاً بكم في ${name} 🌸`,
          deliveryFeeStandard: 4000,
          deliveryFeeExpress: 8000,
          heroMainTitle: name,
          bannerImgUrl: "https://imgdb.io/i/EQ4D9ag.png",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('pharmacies').doc(slug).collection('private_settings').doc('config').set({
          telegramConfig: {
            botToken,
            chatId,
            enabled: !!(botToken && chatId)
          },
          subscriptionPrice: subPrice,
          maxPriceCap: maxCap,
          rateLimits: { maxOrdersPerHour: 15, maxReqsPerMin: 80 },
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`🎉 تم إنشاء صيدلية "${name}" وفصل أسرارها بنجاح!`);
        document.getElementById('addPharmacyForm').reset();
        fetchPharmaciesList();
      } catch (err) {
        showToast(`خطأ: ${err.message}`, true);
      }
    }

    async function togglePharmacyStatus(slug, suspend) {
      try {
        await db.collection('pharmacies').doc(slug).set({ isActive: !suspend }, { merge: true });
        showToast(suspend ? 'تم إيقاف الصيدلية' : 'تم تفعيل الصيدلية بنجاح');
        fetchPharmaciesList();
      } catch (e) {
        showToast('خطأ: ' + e.message, true);
      }
    }

    async function handleDeletePharmacy(slug, name) {
      if (!confirm(`تحذير نهائي: هل أنت متأكد من حذف صيدلية "${name}" (${slug}) نهائياً؟`)) return;
      try {
        await db.collection('pharmacies').doc(slug).delete();
        showToast(`تم حذف الصيدلية`);
        fetchPharmaciesList();
      } catch (err) {
        showToast(`خطأ: ${err.message}`, true);
      }
    }

    function saveBillingMultiplierSettings() {
      const config = {
        freeOrders: Number(document.getElementById('cfgFreeOrders').value || 100),
        orderUnitPrice: Number(document.getElementById('cfgOrderUnitPrice').value || 250),
        freeProducts: Number(document.getElementById('cfgFreeProducts').value || 50),
        productUnitPrice: Number(document.getElementById('cfgProductUnitPrice').value || 500)
      };
      localStorage.setItem('saas_billing_config', JSON.stringify(config));
      showToast('تم حفظ إعدادات تسعير الاستهلاك بنجاح ✓');
      calculateLiveConsumptionBilling();
    }

    // ⚡ (خفض قراءات ~98%) نستخدم استعلام count() المجمّع بدل جلب كل مستندات الطلبات/المنتجات لكل صيدلية
    async function calculateLiveConsumptionBilling() {
      if (!db) return;
      const tbody = document.getElementById('billingTableBody');
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">جاري احتساب استهلاك الصيدليات (بقراءات مخفّضة)...</td></tr>`;

      const cfg = JSON.parse(localStorage.getItem('saas_billing_config') || '{}');
      const freeOrders = Number(cfg.freeOrders || 100);
      const orderUnitPrice = Number(cfg.orderUnitPrice || 250);
      const freeProducts = Number(cfg.freeProducts || 50);
      const productUnitPrice = Number(cfg.productUnitPrice || 500);

      try {
        const snap = await db.collection('pharmacies').get();
        const rows = [];

        for (const doc of snap.docs) {
          const slug = doc.id;
          const data = doc.data();
          const basePrice = Number(data.subscriptionPrice || 50000);
          const maxCap = Number(data.maxPriceCap || 150000);

          let ordersCount = 0, productsCount = 0;
          try {
            const ordersCountSnap = await db.collection('pharmacies').doc(slug).collection('orders').count().get();
            ordersCount = ordersCountSnap.data().count;
            const productsCountSnap = await db.collection('pharmacies').doc(slug).collection('products').count().get();
            productsCount = productsCountSnap.data().count;
          } catch (countErr) {
            // احتياط لمتصفحات/إصدارات لا تدعم count() بعد — نادراً ما يحدث مع SDK 9.22.1
            console.warn('count() fallback for', slug, countErr);
          }

          const extraOrdersCost = Math.max(0, ordersCount - freeOrders) * orderUnitPrice;
          const extraProductsCost = Math.max(0, productsCount - freeProducts) * productUnitPrice;
          const totalUsageFee = extraOrdersCost + extraProductsCost;
          
          const finalCalculatedPrice = Math.min(basePrice + totalUsageFee, maxCap);

          rows.push(`
            <tr class="hover:bg-slate-800/40 transition text-xs">
              <td class="py-3.5 px-4 font-bold text-white">${data.name || slug}</td>
              <td class="py-3.5 px-4 font-mono">${ordersCount} طلب</td>
              <td class="py-3.5 px-4 font-mono">${productsCount} مادة</td>
              <td class="py-3.5 px-4 font-mono text-slate-300">${basePrice.toLocaleString()} د.ع</td>
              <td class="py-3.5 px-4 font-mono ${totalUsageFee > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}">+${totalUsageFee.toLocaleString()} د.ع</td>
              <td class="py-3.5 px-4 font-mono text-emerald-400 font-black text-sm">${finalCalculatedPrice.toLocaleString()} د.ع</td>
              <td class="py-3.5 px-4 font-mono text-amber-400 font-bold">${maxCap.toLocaleString()} د.ع</td>
              <td class="py-3.5 px-4 text-center">
                <button onclick="applyDynamicPriceToPharmacy('${slug}', ${finalCalculatedPrice})" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-bold">
                  اعتماد 💰
                </button>
              </td>
            </tr>
          `);
        }

        tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="8" class="text-center py-6 text-slate-500">لا توجد بيانات.</td></tr>`;
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-400">خطأ: ${err.message}</td></tr>`;
      }
    }

    async function applyDynamicPriceToPharmacy(slug, newPrice) {
      try {
        await db.collection('pharmacies').doc(slug).set({ subscriptionPrice: newPrice }, { merge: true });
        showToast('تم تحديث سعر اشتراك الصيدلية بنجاح ✓');
        fetchPharmaciesList();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }
