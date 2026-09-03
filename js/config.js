/* ==========================================================
   SaaS Multi-Tenant Engine — js/config.js
   Version: 4.1.0 (Enterprise Subdomain & Cloud-Pages Resolver)
   ========================================================== */

export const DEFAULT_PHARMACY_ID = "cottanpharmacy";
export const SUPER_ADMIN_EMAIL = "hussaindark6@gmail.com";
export const WORKER_API_BASE = "https://cottanbackend.hussaindark6.workers.dev";

// استخراج معرّف الصيدلية مع تجاهل دومينات الاستضافة السحابية
export function getActivePharmacyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('pharmacy') || urlParams.get('p_id') || urlParams.get('p') || urlParams.get('id');
  
  if (paramId && paramId.trim()) {
    const cleanId = paramId.trim().toLowerCase();
    sessionStorage.setItem('saas_active_pharmacy_id', cleanId);
    return cleanId;
  }

  const cachedId = sessionStorage.getItem('saas_active_pharmacy_id');
  if (cachedId && cachedId.trim()) {
    return cachedId.trim().toLowerCase();
  }

  const hostname = window.location.hostname.toLowerCase();

  // دومينات الاستضافة السحابية التي يجب تجاهل تقسيمها كنطاق فرعي
  const ignoredHostingDomains = [
    'pages.dev',
    'workers.dev',
    'web.app',
    'firebaseapp.com',
    'github.io',
    'vercel.app',
    'netlify.app',
    'localhost',
    '127.0.0.1'
  ];

  const isPlatformHost = ignoredHostingDomains.some(d => hostname === d || hostname.endsWith('.' + d));

  // إذا كان دومين مخصص خاص بالصيدلية وليس استضافة عامة
  if (!isPlatformHost) {
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      const sub = parts[0].toLowerCase().trim();
      sessionStorage.setItem('saas_active_pharmacy_id', sub);
      return sub;
    }
  }

  return DEFAULT_PHARMACY_ID;
}

export const currentPharmacyId = getActivePharmacyId();

export function getTenantUrl(pagePath) {
  const cleanPath = pagePath.split('?')[0];
  return `${cleanPath}?pharmacy=${encodeURIComponent(currentPharmacyId)}`;
}

export function patchTenantLinks() {
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && (href.startsWith('index.html') || href.startsWith('admin.html') || href === './' || href === '/')) {
      const page = href.split('?')[0];
      a.setAttribute('href', getTenantUrl(page));
    }
  });
}

// إعدادات Firebase
export const firebaseConfig = {
  apiKey: "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
  authDomain: "cottanpharmacy.firebaseapp.com",
  projectId: "cottanpharmacy",
  storageBucket: "cottanpharmacy.firebasestorage.app",
  messagingSenderId: "163407198551",
  appId: "1:163407198551:web:1c397d23733101456a6612",
  measurementId: "G-QC29GK2MDW"
};

export let auth = null;
export let db = null;
export let isFirebaseConfigured = false;

try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    isFirebaseConfigured = true;

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
      console.warn("Auth Persistence fallback:", err);
    });
  }
} catch (err) {
  console.warn("Firebase Init Error:", err);
}

// مسارات Firestore المعزولة
export const dbPaths = {
  pharmacyDoc: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId),
  privateSettingsDoc: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('private_settings').doc('config'),
  productsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('products'),
  ordersCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('orders'),
  staffCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('staff'),
  categoriesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('categories'),
  bundlesCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('bundles'),
  couponsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('coupons'),
  notificationsCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('notifications'),
  analyticsDailyCol: (pId = currentPharmacyId) => db.collection('pharmacies').doc(pId).collection('analytics_daily'),
  systemPaymentDoc: () => db.collection('system').doc('payment_info'),
  masterCatalogCol: () => db.collection('system').doc('master_catalog').collection('products'),
  masterCatalogSubmissionsCol: () => db.collection('system').doc('master_catalog_submissions').collection('submissions'),
  userCartDoc: (uid, pId = currentPharmacyId) => db.collection('users').doc(uid).collection('pharmacies').doc(pId)
};
