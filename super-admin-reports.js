/* ==========================================================
   super-admin-reports.js — التقارير والتصدير والنسخ الاحتياطي الكامل
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    function renderIndividualReportsList() {
      const tbody = document.getElementById('individualReportsTableBody');
      const slugs = Object.keys(window.cachedPharmaciesMap);
      const dateStr = new Date().toISOString().split('T')[0];

      if (!slugs.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-500">لا توجد صيدليات مسجلة.</td></tr>`;
        return;
      }

      tbody.innerHTML = slugs.map(slug => {
        const data = window.cachedPharmaciesMap[slug];
        const fileName = `Sales_Report_${slug}_${dateStr}.csv`;
        return `
          <tr class="hover:bg-slate-800/40 transition text-xs">
            <td class="py-3 px-4 font-bold text-white">${data.name || slug}</td>
            <td class="py-3 px-4 font-mono text-emerald-400">${slug}</td>
            <td class="py-3 px-4 font-mono text-slate-300">${fileName}</td>
            <td class="py-3 px-4 text-center">
              <div class="flex items-center justify-center gap-2">
                <button onclick="exportSinglePharmacyCSV('${slug}')" class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-bold">
                  📊 تنزيل Excel
                </button>
                <button onclick="sendSinglePharmacyReportTelegram('${slug}')" class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg font-bold">
                  ✈️ إرسال لتلغرامي
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 🛡️ حماية صيغ Excel (CSV Injection): أي حقل يبدأ بـ = + - @ يُسبَق بفاصلة عليا حتى لا يُنفَّذ كصيغة
    function csvCell(v) {
      let t = String(v == null ? '' : v).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t}"`;
    }

    // 🛡️ (توفير قراءات) حد أقصى 3000 طلب لكل تصدير (كان يقرأ كل تاريخ الصيدلية بلا سقف)
    async function generateSinglePharmacyCSVData(slug) {
      const ordersSnap = await db.collection('pharmacies').doc(slug).collection('orders').orderBy('createdAt', 'desc').limit(3000).get();
      let csv = "Order ID,Date,Customer Name,Phone,Address,Method,Status,Items,Total (IQD)\n";
      let totalAmount = 0;

      ordersSnap.forEach(d => {
        const o = d.data();
        const isCancelled = String(o.status || '').includes('ملغي');
        if (!isCancelled) totalAmount += Number(o.total || 0);
        const itemsText = (o.items || []).map(it => `${it.name} (x${it.quantity})`).join(" + ");
        csv += [o.id || d.id, o.date || '', o.name || '', o.phone || '', o.address || '', o.deliveryMethod || 'standard', o.status || '', itemsText].map(csvCell).join(',') + `,${Number(o.total || 0)}\n`;
      });
      return { csv, totalAmount, count: ordersSnap.size };
    }

    // 💾 نسخة احتياطية كاملة (JSON واحد): الصيدليات + لكل صيدلية (الأقسام، البكجات، المنتجات، آخر 2000 طلب) + بنك المنتجات.
    // Firestore المجاني بلا تصدير تلقائي؛ شغّليها أسبوعياً واحفظي الملف خارج المنصة. تقرأ بيانات كثيرة (مرة واحدة يدوياً).
    async function downloadFullBackup(btn) {
      if (!confirm('سيتم قراءة بيانات كل الصيدليات لإنشاء نسخة احتياطية (قد تستهلك عدداً ملحوظاً من القراءات). تشغيلها مرة أسبوعياً يكفي. متابعة؟')) return;
      const original = btn ? btn.innerHTML : '';
      try {
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جاري إنشاء النسخة...'; }
        const dump = { createdAt: new Date().toISOString(), pharmacies: {}, masterCatalog: [] };
        const phSnap = await db.collection('pharmacies').get();
        for (const ph of phSnap.docs) {
          showToast(`نسخ صيدلية ${ph.id}...`);
          const base = db.collection('pharmacies').doc(ph.id);
          const grab = async (sub, lim) => {
            const q = lim ? base.collection(sub).limit(lim) : base.collection(sub);
            const sn = await q.get(); const arr = []; sn.forEach(d => arr.push({ _id: d.id, ...d.data() })); return arr;
          };
          dump.pharmacies[ph.id] = {
            profile: ph.data(),
            categories: await grab('categories'),
            bundles: await grab('bundles'),
            products: await grab('products'),
            coupons: await grab('coupons'),
            staff: await grab('staff'),
            orders: await grab('orders', 2000)
          };
        }
        const msSnap = await db.collection('system').doc('master_catalog').collection('products').get();
        msSnap.forEach(d => dump.masterCatalog.push({ _id: d.id, ...d.data() }));
        const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `FULL_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        showToast('✅ تم تنزيل النسخة الاحتياطية الكاملة — احفظيها خارج المنصة');
      } catch (err) {
        showToast('خطأ بالنسخ الاحتياطي: ' + err.message, true);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      }
    }

    async function exportSinglePharmacyCSV(slug) {
      showToast(`جاري إنشاء تقرير إكسل لصيدلية (${slug})...`);
      try {
        const { csv } = await generateSinglePharmacyCSVData(slug);
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Sales_Report_${slug}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast('تم تنزيل التقرير بنجاح! 📊');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function sendSinglePharmacyReportTelegram(slug) {
      const superBotToken = localStorage.getItem('saas_super_bot_token') || '';
      const superChatId = localStorage.getItem('saas_super_chat_id') || '';

      if (!superBotToken || !superChatId) {
        showToast('يرجى ضبط توكن وشات بوت السوبر أدمن أولاً', true);
        openSuperTeleSettingsModal();
        return;
      }

      showToast(`جاري إرسال تقرير (${slug}) للتليجرام...`);
      try {
        const data = window.cachedPharmaciesMap[slug] || {};
        const { totalAmount, count } = await generateSinglePharmacyCSVData(slug);

        const message = 
          `📊 *Sales Report: ${data.name || slug}*\n` +
          `🏢 *Tenant ID:* \`${slug}\`\n` +
          `📦 *Total Orders:* ${count}\n` +
          `💵 *Total Sales Revenue:* *${totalAmount.toLocaleString()} IQD*\n` +
          `👑 *Super Admin Platform*`;

        await fetch(`https://api.telegram.org/bot${superBotToken.trim()}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: superChatId.trim(), text: message, parse_mode: "Markdown" })
        });
        showToast('🚀 تم إرسال التقرير لتلغرامك بنجاح!');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function exportMasterConsolidatedCSV() {
      showToast('جاري إنشاء التقرير المحاسبي الشامل...');
      try {
        const snap = await db.collection('pharmacies').get();
        let csv = "Pharmacy Name,Slug,Admin Email,Status,Subscription Expiry,Base Price (IQD)\n";
        snap.forEach(d => {
          const data = d.data();
          csv += `"${data.name || d.id}","${d.id}","${data.adminEmail || ''}","${data.isActive !== false ? 'Active' : 'Suspended'}","${data.subscriptionExpiry || ''}"\n`;
        });

        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `SaaS_Master_Consolidated_Report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast('تم تنزيل التقرير الموحد بنجاح 📊');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function sendMasterReportToTelegram() {
      const superBotToken = localStorage.getItem('saas_super_bot_token') || '';
      const superChatId = localStorage.getItem('saas_super_chat_id') || '';

      if (!superBotToken || !superChatId) {
        showToast('يرجى ضبط توكن وشات بوت السوبر أدمن أولاً', true);
        openSuperTeleSettingsModal();
        return;
      }

      showToast('جاري إرسال التقرير الشامل لتلغرام...');
      try {
        const snap = await db.collection('pharmacies').get();
        let totalRevenue = 0;
        snap.forEach(d => { totalRevenue += Number(d.data().subscriptionPrice || 0); });

        const message = 
          `📊 *SaaS Master Consolidated Report*\n` +
          `🏥 *Total Registered Stores:* ${snap.size}\n` +
          `💰 *Total Subscription Revenue:* *${totalRevenue.toLocaleString()} IQD*\n` +
          `📅 *Date:* ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
          `👑 *Super Admin Executive Platform*`;

        await fetch(`https://api.telegram.org/bot${superBotToken.trim()}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: superChatId.trim(), text: message, parse_mode: "Markdown" })
        });
        showToast('🚀 تم إرسال التقرير الموحد لتلغرامك!');
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }
