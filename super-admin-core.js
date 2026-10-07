/* ==========================================================
   super-admin-core.js — الإعدادات، تهيئة Firebase، التنقل بين التبويبات، الإشعارات، تسجيل الدخول
   جزء من لوحة السوبر أدمن (كان سكربتاً واحداً بـ1480 سطراً داخل الصفحة). سكربت كلاسيكي بلا تغيير بالمنطق،
   يُحمَّل بالترتيب مع بقية ملفات super-admin-*.js؛ الترتيب مهم لأن super-admin-core.js يعرّف الثوابت وآخر ملف يشغّل مستمع الدخول.
   ========================================================== */
    const SUPER_ADMIN_EMAIL = typeof __SUPER_ADMIN_EMAIL__ !== 'undefined' && __SUPER_ADMIN_EMAIL__ ? __SUPER_ADMIN_EMAIL__ : "hussaindark6@gmail.com";
    // 🌟 (إصلاح — PLATFORM_ROOT_DOMAIN لم يكن يُفعَّل أبداً) كانت هذه قيمة نائبة ثابتة
    // ("yourplatform.com") مكتوبة يدوياً هنا، لا تعكس دومين المنصة الحقيقي أبداً ما لم
    // يُعدِّلها أحد يدوياً بكل نشر جديد لهذا الملف. المصدر الوحيد للحقيقة الآن هو متغير
    // البيئة PLATFORM_ROOT_DOMAIN المُعرَّف فعلياً على الووركر (worker.js)، ويُجلب تلقائياً
    // من نقطة النهاية /api/admin/platform-config فور تسجيل دخول السوبر أدمن (انظر
    // loadPlatformConfig() أدناه واستدعاءها داخل checkSuperAdminAccess).
    let PLATFORM_ROOT_DOMAIN = "";
    let cloudflareAutoDnsReady = false;

    const firebaseConfig = {
      apiKey: typeof __FIREBASE_API_KEY__ !== 'undefined' && __FIREBASE_API_KEY__ ? __FIREBASE_API_KEY__ : "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
      authDomain: typeof __FIREBASE_AUTH_DOMAIN__ !== 'undefined' && __FIREBASE_AUTH_DOMAIN__ ? __FIREBASE_AUTH_DOMAIN__ : "cottanpharmacy.firebaseapp.com",
      projectId: typeof __FIREBASE_PROJECT_ID__ !== 'undefined' && __FIREBASE_PROJECT_ID__ ? __FIREBASE_PROJECT_ID__ : "cottanpharmacy",
      storageBucket: typeof __FIREBASE_STORAGE_BUCKET__ !== 'undefined' && __FIREBASE_STORAGE_BUCKET__ ? __FIREBASE_STORAGE_BUCKET__ : "cottanpharmacy.firebasestorage.app",
      messagingSenderId: typeof __FIREBASE_MESSAGING_SENDER_ID__ !== 'undefined' && __FIREBASE_MESSAGING_SENDER_ID__ ? __FIREBASE_MESSAGING_SENDER_ID__ : "163407198551",
      appId: typeof __FIREBASE_APP_ID__ !== 'undefined' && __FIREBASE_APP_ID__ ? __FIREBASE_APP_ID__ : "1:163407198551:web:1c397d23733101456a6612",
      measurementId: typeof __FIREBASE_MEASUREMENT_ID__ !== 'undefined' && __FIREBASE_MEASUREMENT_ID__ ? __FIREBASE_MEASUREMENT_ID__ : "G-QC29GK2MDW"
    };

    let auth = null, db = null, currentUser = null;
    window.cachedPharmaciesMap = {};
    window.cachedMasterCatalog = [];
    window.filteredMasterCatalog = [];
    window.masterCurrentPage = 1;
    window.selectedMasterItemIds = new Set();
    const MASTER_PAGE_SIZE = 25;

    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) {
      console.error("Firebase init error:", e);
    }

    window.addEventListener('DOMContentLoaded', () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const expiryInp = document.getElementById('inpExpiryDate');
      if (expiryInp) expiryInp.value = nextYear.toISOString().split('T')[0];

      const savedSuperBot = localStorage.getItem('saas_super_bot_token') || '';
      const savedSuperChat = localStorage.getItem('saas_super_chat_id') || '';
      if (document.getElementById('superBotTokenInp')) document.getElementById('superBotTokenInp').value = savedSuperBot;
      if (document.getElementById('superChatIdInp')) document.getElementById('superChatIdInp').value = savedSuperChat;

      const savedCfg = JSON.parse(localStorage.getItem('saas_billing_config') || '{}');
      if (savedCfg.freeOrders) document.getElementById('cfgFreeOrders').value = savedCfg.freeOrders;
      if (savedCfg.orderUnitPrice) document.getElementById('cfgOrderUnitPrice').value = savedCfg.orderUnitPrice;
      if (savedCfg.freeProducts) document.getElementById('cfgFreeProducts').value = savedCfg.freeProducts;
      if (savedCfg.productUnitPrice) document.getElementById('cfgProductUnitPrice').value = savedCfg.productUnitPrice;

      loadSuperAdminPaymentInfo();
    });

    function toggleSuperSidebar(forceOpen) {
      const sidebar = document.getElementById('superSidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!sidebar) return;
      const shouldOpen = forceOpen !== undefined ? forceOpen : sidebar.classList.contains('translate-x-full');
      sidebar.classList.toggle('translate-x-full', !shouldOpen);
      sidebar.classList.toggle('translate-x-0', shouldOpen);
      if (overlay) overlay.classList.toggle('hidden', !shouldOpen);
    }

    function switchSuperTab(tabKey) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = 'tab-btn w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-2.5';
      });
      document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));

      const tabMap = {
        overview: ['tabBtnOverview', 'secSuperOverview'],
        tenants: ['tabBtnTenants', 'secSuperTenants'],
        domains: ['tabBtnDomains', 'secSuperDomains'],
        billing: ['tabBtnBilling', 'secSuperBilling'],
        catalog: ['tabBtnCatalog', 'secSuperCatalog'],
        crowdsource: ['tabBtnCrowdsource', 'secSuperCrowdsource'],
        infra: ['tabBtnInfra', 'secSuperInfra'],
        paymentInfo: ['tabBtnPaymentInfo', 'secSuperPaymentInfo'],
        packages: ['tabBtnPackages', 'secSuperPackages'],
        reports: ['tabBtnReports', 'secSuperReports']
      };

      if (tabMap[tabKey]) {
        document.getElementById(tabMap[tabKey][0]).className = 'tab-btn active w-full text-right px-3 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-2.5 bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20';
        document.getElementById(tabMap[tabKey][1]).classList.remove('hidden');
      }

      const sidebar = document.getElementById('superSidebar');
      if (sidebar && window.innerWidth < 1024) toggleSuperSidebar(false);

      if (tabKey === 'billing') calculateLiveConsumptionBilling();
      if (tabKey === 'catalog') fetchMasterCatalog();
      if (tabKey === 'crowdsource') fetchCrowdsourcedSubmissions();
      if (tabKey === 'reports') renderIndividualReportsList();
      if (tabKey === 'packages') fetchSubscriptionPackages();
      if (tabKey === 'domains') fetchLinkedDomains();
    }

    let toastTimer = null;
    function showToast(msg, isError = false) {
      const t = document.getElementById('superToast');
      if (!t) return;
      t.textContent = msg;
      t.className = `fixed bottom-6 left-1/2 -translate-x-1/2 font-black px-6 py-3 rounded-full shadow-2xl transition-all duration-300 z-50 text-sm opacity-100 ${isError ? 'bg-red-500 text-white' : 'bg-emerald-400 text-slate-950'}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        t.className = t.className.replace('opacity-100', 'opacity-0 pointer-events-none');
      }, 3500);
    }

    function handleSuperAdminSignIn() {
      if (!auth) return;
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      auth.signInWithPopup(provider).catch(err => {
        console.error('Super Admin Sign-In error:', err);
        const errBox = document.getElementById('authGateError');
        if (errBox) {
          errBox.textContent = `⚠️ تعذر تسجيل الدخول: ${err && err.message ? err.message : 'خطأ غير معروف'}`;
          errBox.classList.remove('hidden');
        }
      });
    }

    function checkSuperAdminAccess(user) {
      const gate = document.getElementById('superAuthGate');
      const app = document.getElementById('superApp');
      const errBox = document.getElementById('authGateError');

      if (user && user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
        currentUser = user;
        gate.classList.add('hidden');
        app.classList.remove('hidden');
        fetchPharmaciesList();
        fetchSubscriptionPackages();
        loadPlatformConfig();
      } else {
        if (auth) auth.signOut();
        gate.classList.remove('hidden');
        app.classList.add('hidden');
        errBox.textContent = `⚠️ غير مصرح: البريد ليس المشرف العام المعتمد.`;
        errBox.classList.remove('hidden');
      }
    }

    function handleSuperAdminSignOut() {
      if (auth) auth.signOut();
      window.location.reload();
    }
