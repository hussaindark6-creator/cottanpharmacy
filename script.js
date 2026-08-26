/* ==========================================================
   صيدلية القطن | Cottanpharmacy — Script Engine
   ========================================================== */

const WORKER_API_BASE = "https://cottanbackend.hussaindark6.workers.dev";
const ADMIN_EMAIL = "hussaindark6@gmail.com";
let WHATSAPP_NUMBER = "9647813703288";

const firebaseConfig = {
  apiKey: "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
  authDomain: "cottanpharmacy.firebaseapp.com",
  projectId: "cottanpharmacy",
  storageBucket: "cottanpharmacy.firebasestorage.app",
  messagingSenderId: "163407198551",
  appId: "1:163407198551:web:1c397d23733101456a6612",
  measurementId: "G-QC29GK2MDW"
};

let auth = null, db = null, currentUser = null, isFirebaseConfigured = false;

try {
  if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    isFirebaseConfigured = true;
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.warn(e));
  }
} catch (err) {
  console.warn("Firebase init:", err);
}

function sanitizeText(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (/^https?:\/\//i.test(clean) || clean.startsWith('/') || clean.startsWith('./') || clean.startsWith('data:image/')) {
    return encodeURI(clean).replace(/"/g, '%22').replace(/'/g, '%27');
  }
  return '';
}

function isCurrentUserAdmin() {
  const user = auth ? auth.currentUser : currentUser;
  return !!(user && user.email && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase());
}

let brandsData = {
  'Cerave': { name: 'Cerave', color: '#5FAE6E', logoUrl: '' },
  'Simple': { name: 'Simple', color: '#C97F79', logoUrl: '' },
  'REVUELE': { name: 'REVUELE', color: '#D9A441', logoUrl: '' },
  'COSMO': { name: 'COSMO', color: '#B7A233', logoUrl: '' },
  'DIADERM': { name: 'DIADERM', color: '#b01e4a', logoUrl: '' },
  'Photoblock': { name: 'Photoblock', color: '#4C8CAE', logoUrl: '' },
  'ISIS Pharma': { name: 'ISIS Pharma', color: '#4C6FAE', logoUrl: '' },
  'ACM': { name: 'ACM', color: '#6B7078', logoUrl: '' }
};

let categories = [
  { id: 'face', label: 'العناية بالوجه', icon: 'face', imageUrl: '' },
  { id: 'moisturizer', label: 'مرطبات', icon: 'jar', imageUrl: '' },
  { id: 'serum', label: 'سيرومات', icon: 'bottle', imageUrl: '' },
  { id: 'sunscreen', label: 'واقي شمس', icon: 'sunscreen', imageUrl: '' }
];

const initialDefaultProducts = [
  { id: '1', name: 'كريم سيرافي مرطب للبشرة الجافة', brand: 'Cerave', category: 'moisturizer', size: '236 مل', price: 25000, inStock: true, rating: 4.8 },
  { id: '2', name: 'رفيول حل نياسيناميد 10% + زنك', brand: 'REVUELE', category: 'serum', size: '30 مل', price: 18000, inStock: true, rating: 4.7 },
  { id: '3', name: 'غسول سيمبل للبشرة الحساسة', brand: 'Simple', category: 'face', size: '150 مل', price: 12000, inStock: true, rating: 4.6 },
  { id: '4', name: 'كوزمو واقي شمس SPF50 PA+++', brand: 'COSMO', category: 'sunscreen', size: '50 مل', price: 19000, inStock: true, rating: 4.8 }
];

let products = [...initialDefaultProducts];
let cart = JSON.parse(localStorage.getItem('qutn_cart') || '{}');
let wishlist = new Set(JSON.parse(localStorage.getItem('qutn_wishlist') || '[]'));
let myOrders = JSON.parse(localStorage.getItem('qutn_my_orders') || '[]');
let currentView = 'home';
let homeActiveBrand = 'all';

function fmtPrice(n) { return (Number(n) || 0).toLocaleString('en-US') + ' د.ع'; }
function findProduct(id) { return products.find(p => String(p.id) === String(id)); }
function saveLocalState() {
  localStorage.setItem('qutn_cart', JSON.stringify(cart));
  localStorage.setItem('qutn_wishlist', JSON.stringify([...wishlist]));
  localStorage.setItem('qutn_my_orders', JSON.stringify(myOrders));
}

// ================= RENDER PRODUCTS (CLEAN FOR CUSTOMERS) =================
function renderProductGrid(targetId, list) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#6B7280;">لا توجد منتجات مطابقة حالياً.</div>`;
    return;
  }

  el.innerHTML = list.map(p => {
    const isWished = wishlist.has(p.id);
    const inStock = (p.inStock !== false);
    const cleanImg = sanitizeUrl(p.imageUrl);

    return `
      <div class="product-card">
        <button class="wish-btn" onclick="toggleWishlist('${sanitizeText(p.id)}')">
          ${isWished ? '❤️' : '🤍'}
        </button>
        ${!inStock ? `<span class="discount-badge" style="background:#EF4444;">نفذت الكمية</span>` : ''}
        
        <div class="product-thumb">
          ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(p.name)}">` : `<span style="font-size:32px;">🧴</span>`}
        </div>
        <div class="p-rating">★ ${p.rating || 4.8}</div>
        <div class="p-name">${sanitizeText(p.name)}</div>
        <div class="p-size">${sanitizeText(p.size || '')}</div>
        <div class="p-price-row">
          <span class="p-price mono">${fmtPrice(p.price)}</span>
        </div>
        <button class="add-cart-btn" style="${!inStock ? 'opacity:0.5; pointer-events:none;' : ''}" onclick="addToCart('${sanitizeText(p.id)}')">
          ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
        </button>
      </div>`;
  }).join('');
}

function renderBrandStrip() {
  const strip = document.getElementById('brandStrip');
  if (!strip) return;
  const brandKeys = Object.keys(brandsData);
  
  strip.innerHTML = `
    <div class="brand-chip all-chip ${homeActiveBrand === 'all' ? 'active' : ''}" onclick="selectHomeBrand('all')">
      <span>الكل</span>
    </div>` + brandKeys.map(k => `
      <div class="brand-chip ${homeActiveBrand === k ? 'active' : ''}" onclick="selectHomeBrand('${sanitizeText(k)}')">
        <span>${sanitizeText(k)}</span>
      </div>`).join('');
}

function selectHomeBrand(brand) {
  homeActiveBrand = brand;
  renderBrandStrip();
  const list = (brand === 'all') ? products : products.filter(p => p.brand === brand);
  renderProductGrid('bestSellersGrid', list);
}

function renderModernCategories() {
  const container = document.getElementById('catRowFull');
  if (!container) return;
  container.innerHTML = categories.map(c => `
    <div class="modern-cat-card" onclick="showView('home')">
      <div class="modern-cat-img-wrap"><span style="font-size:36px;">🌸</span></div>
      <div class="modern-cat-info">
        <h3 class="modern-cat-title">${sanitizeText(c.label)}</h3>
      </div>
    </div>`).join('');
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  updateCartBadge();
  saveLocalState();
  showToast('تمت الإضافة للسلة ✓');
}

function toggleWishlist(id) {
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  saveLocalState();
  renderProductGrid('bestSellersGrid', products);
}

function updateCartBadge() {
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const b1 = document.getElementById('cartBadge');
  if (b1) { b1.style.display = count > 0 ? 'flex' : 'none'; b1.textContent = count; }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  closeMenu();
  window.scrollTo({top: 0, behavior: 'instant'});
}

function openMenu() { document.getElementById('menuDrawer').classList.add('open'); document.getElementById('menuOverlay').classList.add('open'); }
function closeMenu() { document.getElementById('menuDrawer').classList.remove('open'); document.getElementById('menuOverlay').classList.remove('open'); }

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function renderAccountView() {
  const container = document.getElementById('accountAuthContainer');
  if (!container) return;
  const isAdmin = isCurrentUserAdmin();

  if (currentUser) {
    container.innerHTML = `
      <div style="background:#fff; padding:20px; border-radius:16px; border:1px solid #FFE4E8; text-align:center;">
        <h3>${sanitizeText(currentUser.displayName || currentUser.email)}</h3>
        <p style="font-size:12px; color:#6B7280;">${sanitizeText(currentUser.email)}</p>
        ${isAdmin ? `<a href="admin.html" style="display:inline-block; background:#F59E0B; color:#111827; padding:10px 20px; border-radius:999px; font-weight:900; margin:10px 0;">⚙️ فتح لوحة تحكم المشرف</a>` : ''}
        <button onclick="handleSignOut()" style="display:block; width:100%; background:#FEE2E2; color:#DC2626; padding:10px; border-radius:999px; font-weight:800; margin-top:10px;">تسجيل الخروج</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:16px; border:1px solid #FFE4E8; text-align:center;">
        <button onclick="signInWithGoogle()" style="width:100%; background:#111827; color:#fff; padding:14px; border-radius:12px; font-weight:800;">دخول عبر Google</button>
      </div>`;
  }
}

function signInWithGoogle() {
  if (!auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then(res => {
    currentUser = res.user;
    updateAdminState();
    renderAccountView();
  }).catch(e => console.warn(e));
}

function handleSignOut() {
  if (auth) auth.signOut();
  currentUser = null;
  updateAdminState();
  renderAccountView();
}

function updateAdminState() {
  const isAdmin = isCurrentUserAdmin();
  const topBar = document.getElementById('adminTopBar');
  const menuLink = document.getElementById('adminMenuLink');
  if (topBar) topBar.style.display = isAdmin ? 'flex' : 'none';
  if (menuLink) menuLink.style.display = isAdmin ? 'flex' : 'none';
}

if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    updateAdminState();
    renderAccountView();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderBrandStrip();
  renderProductGrid('bestSellersGrid', products);
  renderModernCategories();
  updateCartBadge();
  renderAccountView();
});
