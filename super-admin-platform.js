/* ==========================================================
   super-admin-platform.js — تعديل الصيدلية، تيليجرام، استدعاءات الووركر، الدومينات، وتشغيل مستمع تسجيل الدخول (آخر ملف)
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    async function openFullEditModal(slug) {
      const data = window.cachedPharmaciesMap[slug] || {};
      document.getElementById('editOldSlugId').value = slug;
      document.getElementById('editSlugInp').value = slug;
      document.getElementById('editName').value = data.name || '';
      document.getElementById('editAdminEmail').value = data.adminEmail || '';
      document.getElementById('editSubPrice').value = data.subscriptionPrice || 50000;
      document.getElementById('editMaxPriceCap').value = data.maxPriceCap || 150000;
      document.getElementById('editSubExpiry').value = data.subscriptionExpiry || '';
      document.getElementById('editTemplateId').value = data.templateId || 'template_default';
      document.getElementById('editPackageId').value = data.packageId || '';
      document.getElementById('editWhatsapp').value = data.socialWhatsapp || '';
      document.getElementById('editTeleBotToken').value = (data.telegramConfig && data.telegramConfig.botToken) || '';
      document.getElementById('editTeleChatId').value = (data.telegramConfig && data.telegramConfig.chatId) || '';

      document.getElementById('editCustomDomain').value = '';
      document.getElementById('editOldCustomDomain').value = '';
      try {
        const domainSnap = await db.collection('system').doc('custom_domains').collection('domains').where('tenantId', '==', slug).limit(1).get();
        if (!domainSnap.empty) {
          const domainDoc = domainSnap.docs[0];
          document.getElementById('editCustomDomain').value = domainDoc.id;
          document.getElementById('editOldCustomDomain').value = domainDoc.id;
        }
      } catch (e) { console.warn('Custom domain lookup:', e); }

      document.getElementById('fullEditModal').classList.remove('hidden');
    }

    function closeFullEditModal() {
      document.getElementById('fullEditModal').classList.add('hidden');
    }

    async function handleSaveFullEdit(e) {
      e.preventDefault();
      const oldSlug = document.getElementById('editOldSlugId').value.trim().toLowerCase();
      const newSlug = document.getElementById('editSlugInp').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const name = document.getElementById('editName').value.trim();
      const adminEmail = document.getElementById('editAdminEmail').value.trim().toLowerCase();
      const price = Number(document.getElementById('editSubPrice').value);
      const maxCap = Number(document.getElementById('editMaxPriceCap').value || 150000);
      const expiry = document.getElementById('editSubExpiry').value;
      const templateId = document.getElementById('editTemplateId').value;
      const packageId = document.getElementById('editPackageId').value;
      const whatsapp = document.getElementById('editWhatsapp').value.trim();
      const botToken = document.getElementById('editTeleBotToken').value.trim();
      const chatId = document.getElementById('editTeleChatId').value.trim();
      const customDomain = document.getElementById('editCustomDomain').value.trim().toLowerCase();
      const oldCustomDomain = document.getElementById('editOldCustomDomain').value.trim().toLowerCase();

      try {
        const publicPayload = {
          id: newSlug,
          name,
          adminEmail,
          templateId,
          packageId,
          socialWhatsapp: whatsapp,
          subscriptionExpiry: expiry,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const privatePayload = {
          telegramConfig: {
            botToken,
            chatId,
            enabled: !!(botToken && chatId)
          },
          subscriptionPrice: price,
          maxPriceCap: maxCap,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (newSlug !== oldSlug) {
          const oldData = window.cachedPharmaciesMap[oldSlug] || {};
          await db.collection('pharmacies').doc(newSlug).set({ ...oldData, ...publicPayload });
          await db.collection('pharmacies').doc(newSlug).collection('private_settings').doc('config').set(privatePayload);
          await db.collection('pharmacies').doc(oldSlug).delete();
          showToast(`تم تغيير معرّف الصيدلية إلى (${newSlug}) بنجاح! 🚀`);
        } else {
          await db.collection('pharmacies').doc(oldSlug).set(publicPayload, { merge: true });
          await db.collection('pharmacies').doc(oldSlug).collection('private_settings').doc('config').set(privatePayload, { merge: true });
          showToast('تم حفظ التعديلات وعزل الأسرار بنجاح ✓');
        }

        closeFullEditModal();
        fetchPharmaciesList();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }

      try {
        const domainsRef = db.collection('system').doc('custom_domains').collection('domains');
        if (oldCustomDomain && oldCustomDomain !== customDomain) {
          await domainsRef.doc(oldCustomDomain).delete().catch(() => {});
        }
        if (customDomain) {
          await domainsRef.doc(customDomain).set({
            tenantId: newSlug,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (domErr) {
        showToast('⚠️ تعذر ربط الدومين المخصص: ' + domErr.message, true);
      }
    }

    function openSuperTeleSettingsModal() {
      document.getElementById('superTeleModal').classList.remove('hidden');
    }

    function closeSuperTeleSettingsModal() {
      document.getElementById('superTeleModal').classList.add('hidden');
    }

    function handleSaveSuperTeleSettings(e) {
      e.preventDefault();
      const botToken = document.getElementById('superBotTokenInp').value.trim();
      const chatId = document.getElementById('superChatIdInp').value.trim();

      localStorage.setItem('saas_super_bot_token', botToken);
      localStorage.setItem('saas_super_chat_id', chatId);

      showToast('تم حفظ إعدادات بوت السوبر أدمن بنجاح 🚀');
      closeSuperTeleSettingsModal();
    }

    // =========================================================================
    // 🌐 DOMAIN MANAGEMENT ENGINE (جديد بالكامل)
    // =========================================================================
    const WORKER_API_BASE_SUPER = typeof __WORKER_API_BASE__ !== 'undefined' && __WORKER_API_BASE__ ? __WORKER_API_BASE__ : "https://cottanbackend.hussaindark6.workers.dev";

    // 🆕 دالة موحّدة لاستدعاء مسارات /api/admin/* بالووركر — تجبر تحديث توكن الهوية دائماً
    // (getIdToken(true)) بدل نسخة مخزَّنة محلياً قد تكون قاربت الانتهاء، وهو بالضبط السبب
    // الجذري الذي كان يفشّل تحديثات مشابهة بلوحة تحكم الصيدليات سابقاً.
    async function superApiFetch(endpoint, options = {}) {
      try {
        const idToken = currentUser ? await currentUser.getIdToken(true) : null;
        const res = await fetch(`${WORKER_API_BASE_SUPER}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
            ...(options.headers || {})
          }
        });
        return await res.json();
      } catch (err) {
        return { success: false, message: err.message };
      }
    }

    // 🆕 مزامنة كاش بنك المنتجات بعد أي تعديل بـ Firestore. كانت الاستدعاءات تُرسل بلا انتظار ولا فحص
    // للنتيجة (fire-and-forget)، فإذا فشل الطلب لأي سبب (توكن منتهٍ، خطأ ووركر...) بقيت صفحات
    // أدمن الصيدليات تعرض نسخة قديمة بلا أي إشارة. الآن ننتظر النتيجة ونُظهر تحذيراً واضحاً عند الفشل.
    async function syncMasterCatalogCache(endpoint, payload) {
      const opts = { method: 'POST' };
      if (payload) opts.body = JSON.stringify(payload);
      const result = await superApiFetch(endpoint, opts);
      if (!result || result.success === false) {
        showToast('⚠️ تم الحفظ، لكن تعذّر تحديث كاش بنك المنتجات (' + ((result && result.message) || 'خطأ غير معروف') + '). اضغطي "إعادة بناء الكاش" لإظهار التعديل عند الصيدليات.', true);
        return false;
      }
      return true;
    }

    // 🆕 زر يدوي: يعيد بناء كاش بنك المنتجات من Firestore فوراً (للحالات التي فشلت فيها المزامنة التلقائية).
    async function rebuildMasterCatalogCacheNow(btn) {
      const original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جاري إعادة البناء...'; }
      try {
        const ok = await syncMasterCatalogCache('/api/admin/master-catalog/rebuild');
        if (ok) showToast('✅ تم تحديث كاش بنك المنتجات — ستظهر التعديلات عند الصيدليات فوراً');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      }
    }

    // 🌟 (جديد) يُستدعى مرة واحدة بعد تسجيل دخول السوبر أدمن. يجلب PLATFORM_ROOT_DOMAIN
    // الحقيقي من متغيرات بيئة الووركر بدل القيمة النائبة الثابتة القديمة، ويعرض تحذيراً
    // واضحاً بدل فشل صامت لاحق إن لم يكن مُعرَّفاً بعد على السيرفر.
    async function loadPlatformConfig() {
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`${WORKER_API_BASE_SUPER}/api/admin/platform-config`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await res.json();
        if (data.success) {
          PLATFORM_ROOT_DOMAIN = data.platformRootDomain || "";
          cloudflareAutoDnsReady = !!data.cloudflareAutoDnsReady;
          if (!PLATFORM_ROOT_DOMAIN) {
            showToast('⚠️ لم يُعرَّف دومين المنصة الجذري (PLATFORM_ROOT_DOMAIN) على الووركر بعد — خاصية "النطاق الفرعي المجاني" لن تعمل حتى تضيفيه من إعدادات Cloudflare Workers.', true);
          }
        }
      } catch (err) {
        console.warn('تعذر جلب إعدادات المنصة من الووركر:', err);
      }
    }

    function populateDomainLinkTenantSelect() {
      const sel = document.getElementById('domainLinkTenantSelect');
      if (!sel) return;
      const slugs = Object.keys(window.cachedPharmaciesMap);
      sel.innerHTML = slugs.map(slug => {
        const data = window.cachedPharmaciesMap[slug];
        return `<option value="${slug}">${data.name || slug} (${slug})</option>`;
      }).join('');
    }

    function openDomainLinkModal(type) {
      document.getElementById('domainLinkType').value = type;
      populateDomainLinkTenantSelect();

      const freeHint = document.getElementById('domainLinkFreeHint');
      const inputWrap = document.getElementById('domainLinkInputWrap');
      const inputLabel = document.getElementById('domainLinkInputLabel');
      const input = document.getElementById('domainLinkInput');
      const dnsGuide = document.getElementById('domainLinkDnsGuide');
      const title = document.getElementById('domainLinkModalTitle');
      const dnsResult = document.getElementById('domainLinkDnsResult');
      dnsResult.textContent = '';
      input.value = '';

      if (type === 'free_subdomain') {
        if (!PLATFORM_ROOT_DOMAIN) {
          showToast('⚠️ لا يمكن إنشاء نطاق فرعي مجاني: دومين المنصة الجذري غير مُفعَّل بعد على السيرفر. أضيفي PLATFORM_ROOT_DOMAIN من إعدادات الووركر أولاً.', true);
          return;
        }
        title.textContent = `🆓 تفعيل نطاق فرعي مجاني (على ${PLATFORM_ROOT_DOMAIN})`;
        freeHint.classList.remove('hidden');
        inputWrap.classList.add('hidden');
        dnsGuide.classList.add('hidden');
      } else if (type === 'platform_subdomain') {
        title.textContent = '🔗 إنشاء رابط فرعي من دومينك الخاص';
        freeHint.classList.add('hidden');
        inputWrap.classList.remove('hidden');
        inputLabel.textContent = 'الرابط الفرعي الكامل (مثال: pharmacy-name.mainbrand.com) *';
        input.placeholder = 'pharmacy-name.mainbrand.com';
        dnsGuide.classList.add('hidden');
        if (!cloudflareAutoDnsReady) {
          dnsResult.textContent = 'ℹ️ الربط التلقائي لسجل DNS غير مُفعَّل على السيرفر حالياً (CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID) — سيلزم إضافة السجل يدوياً بعد الحفظ.';
          dnsResult.className = 'text-xs font-bold text-amber-400';
        }
      } else {
        title.textContent = '👑 إنشاء / ربط دومين خاص مستقل';
        freeHint.classList.add('hidden');
        inputWrap.classList.remove('hidden');
        inputLabel.textContent = 'اسم الدومين الكامل *';
        input.placeholder = 'www.al-qutn-pharmacy.com';
        dnsGuide.classList.remove('hidden');
      }

      document.getElementById('domainLinkModal').classList.remove('hidden');
    }

    function closeDomainLinkModal() {
      document.getElementById('domainLinkModal').classList.add('hidden');
    }

    async function handleCheckDnsAlignment() {
      const domain = document.getElementById('domainLinkInput').value.trim().toLowerCase();
      const resultEl = document.getElementById('domainLinkDnsResult');
      if (!domain) { resultEl.textContent = '⚠️ يرجى كتابة الدومين أولاً'; resultEl.className = 'text-xs font-bold text-amber-400'; return; }

      resultEl.textContent = '⏳ جاري فحص سجلات DNS...';
      resultEl.className = 'text-xs font-bold text-slate-400';

      try {
        const res = await fetch(`${WORKER_API_BASE_SUPER}/api/domains/check-dns?domain=${encodeURIComponent(domain)}`);
        const data = await res.json();
        if (data.success) {
          resultEl.textContent = data.message;
          resultEl.className = `text-xs font-bold ${data.aligned ? 'text-emerald-400' : 'text-amber-400'}`;
        } else {
          resultEl.textContent = '❌ ' + (data.message || 'تعذر الفحص');
          resultEl.className = 'text-xs font-bold text-red-400';
        }
      } catch (err) {
        resultEl.textContent = '❌ خطأ في الاتصال بالسيرفر: ' + err.message;
        resultEl.className = 'text-xs font-bold text-red-400';
      }
    }

    async function handleLinkDomainSubmit(e) {
      e.preventDefault();
      const type = document.getElementById('domainLinkType').value;
      const tenantId = document.getElementById('domainLinkTenantSelect').value;
      if (!tenantId) { showToast('يرجى اختيار صيدلية أولاً', true); return; }

      let domain = '';
      if (type === 'free_subdomain') {
        domain = `${tenantId}.${PLATFORM_ROOT_DOMAIN}`;
      } else {
        domain = document.getElementById('domainLinkInput').value.trim().toLowerCase();
        if (!domain) { showToast('يرجى كتابة الدومين', true); return; }
      }

      showToast('جاري حفظ ربط الدومين...');
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`${WORKER_API_BASE_SUPER}/api/admin/domains/link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-Pharmacy-Id': tenantId
          },
          body: JSON.stringify({ domain, tenantId, domainType: type })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ تم ربط ${domain} بصيدلية ${tenantId} بنجاح!`);
          // 🌟 (إصلاح — "توقف" إنشاء CNAME تلقائياً) نعرض الآن dnsMessage الصريحة القادمة
          // من الووركر (نجاح، أو فشل مع السبب، أو "دومين خارجي لا يمكن ربطه تلقائياً")
          // بدل صمت تام كان يجعل الأمر يبدو متوقفاً بلا تفسير.
          if (data.dnsMessage) {
            const dnsResult = document.getElementById('domainLinkDnsResult');
            if (dnsResult) {
              dnsResult.textContent = data.dnsMessage;
              dnsResult.className = `text-xs font-bold ${data.dnsAutoLinked ? 'text-emerald-400' : 'text-amber-400'}`;
            }
          }
          fetchLinkedDomains();
          if (type !== 'platform_subdomain' || data.dnsAutoLinked) {
            closeDomainLinkModal();
          }
        } else {
          showToast('❌ ' + (data.message || 'فشل ربط الدومين'), true);
        }
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }

    async function fetchLinkedDomains() {
      if (!db) return;
      const tbody = document.getElementById('linkedDomainsTableBody');
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-500">جاري تحميل الدومينات...</td></tr>`;
      try {
        const snap = await db.collection('system').doc('custom_domains').collection('domains').get();
        if (snap.empty) {
          tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-500">لا توجد دومينات مربوطة بعد.</td></tr>`;
          return;
        }
        const typeLabels = {
          free_subdomain: '🆓 نطاق فرعي مجاني',
          platform_subdomain: '🔗 فرعي من دومينك',
          custom: '👑 دومين خاص مستقل'
        };
        tbody.innerHTML = snap.docs.map(doc => {
          const d = doc.data();
          const tenantName = (window.cachedPharmaciesMap[d.tenantId] && window.cachedPharmaciesMap[d.tenantId].name) || d.tenantId;
          return `
            <tr class="hover:bg-slate-800/40 transition text-xs">
              <td class="py-3 px-4 font-mono text-white">${doc.id}</td>
              <td class="py-3 px-4 text-slate-300">${typeLabels[d.domainType] || d.domainType || '—'}</td>
              <td class="py-3 px-4 font-bold text-emerald-400">${tenantName}</td>
              <td class="py-3 px-4 text-center">
                <button onclick="unlinkDomain('${doc.id}')" class="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg font-bold">فصل 🗑️</button>
              </td>
            </tr>`;
        }).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-400">خطأ: ${err.message}</td></tr>`;
      }
    }

    async function unlinkDomain(domain) {
      if (!confirm(`فصل ربط الدومين "${domain}"؟`)) return;
      try {
        await db.collection('system').doc('custom_domains').collection('domains').doc(domain).delete();
        showToast('تم فصل الدومين بنجاح');
        fetchLinkedDomains();
      } catch (err) {
        showToast('خطأ: ' + err.message, true);
      }
    }
  


    if (auth) {
      auth.onAuthStateChanged(user => {
        if (user) checkSuperAdminAccess(user);
        else {
          document.getElementById('superAuthGate').classList.remove('hidden');
          document.getElementById('superApp').classList.add('hidden');
        }
      });
    }
