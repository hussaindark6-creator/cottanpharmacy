/* ==========================================================
   SaaS Multi-Tenant Engine — js/theme-engine.js
   Version: 4.0.0 (Unified Token-Driven Component Renderer)
   ========================================================== */

import { THEME_PRESETS } from './theme-presets.js';
import { pharmacyProfile, wishlist, fmtPrice, starIcon, getBrandColor, icons, catIcons, findProduct } from './state.js';
import { sanitizeText, sanitizeUrl, isCurrentUserAdmin } from './security.js';

let currentThemeConfig = THEME_PRESETS.template_default;

export function applyTheme(templateId, hexColor) {
  currentThemeConfig = THEME_PRESETS[templateId] || THEME_PRESETS.template_default;
  const root = document.documentElement;
  
  root.setAttribute('data-template', currentThemeConfig.id);

  // تطبيق توكنات القالب
  for (const [prop, val] of Object.entries(currentThemeConfig.tokens)) {
    root.style.setProperty(prop, val);
  }

  // تطبيق اللون التمييزي
  const targetColor = hexColor || pharmacyProfile.primaryColor || '#E85D8A';
  if (/^#[0-9A-F]{6}$/i.test(targetColor)) {
    root.style.setProperty('--accent', targetColor);
    root.style.setProperty('--rose-deep', targetColor);
    
    const r = parseInt(targetColor.slice(1,3), 16);
    const g = parseInt(targetColor.slice(3,5), 16);
    const b = parseInt(targetColor.slice(5,7), 16);
    
    if (!currentThemeConfig.tokens['--surface']) {
      root.style.setProperty('--surface', `rgba(${r}, ${g}, ${b}, 0.08)`);
      root.style.setProperty('--surface-hover', `rgba(${r}, ${g}, ${b}, 0.14)`);
      root.style.setProperty('--line', `rgba(${r}, ${g}, ${b}, 0.18)`);
    }
  }
}

// رسم كرت المنتج الموحد بأسلوب التوكنات
export function renderProductCard(p) {
  const color = getBrandColor(p.brand);
  const discountPct = p.oldPrice ? Math.round((1 - p.price/p.oldPrice) * 100) : null;
  const isWished = wishlist.has(p.id);
  const inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
  const stockQty = Number(p.stockQuantity !== undefined ? p.stockQuantity : 10);
  const cleanImg = sanitizeUrl(p.imageUrl);
  const isAdmin = isCurrentUserAdmin();

  const reviewCount = Number(p.reviews || 0);
  const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
  const ratingHtml = reviewCount > 0
    ? `${starIcon()} <span class="mono" style="font-weight:800;">${avgRating}</span> <span style="font-size:10px; color:var(--text-soft);">(${reviewCount})</span>`
    : `<span style="font-size:10.5px; color:var(--text-soft); font-weight:700;">⭐ جديد (0 تقييم)</span>`;

  // دعم تراكيز المنتج
  let variantsHtml = '';
  if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
    variantsHtml = `
      <div class="p-variants-row" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;" onclick="event.stopPropagation()">
        ${p.variants.map((v, i) => `
          <button type="button" class="p-variant-chip ${i === 0 ? 'active' : ''}" 
            data-price="${v.price}" 
            data-oldprice="${v.oldPrice || ''}"
            onclick="selectProductVariantCard(this, '${sanitizeText(p.id)}')"
            style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:6px; border:1px solid var(--line); background:${i === 0 ? 'var(--surface)' : '#fff'}; color:${i === 0 ? 'var(--rose-deep)' : 'var(--ink)'}; cursor:pointer;">
            ${sanitizeText(v.name || v.size)}
          </button>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="product-card" id="prod-card-${sanitizeText(p.id)}" onclick="openProduct('${sanitizeText(p.id)}', true)">
      <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${sanitizeText(p.id)}')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
      </button>
      ${discountPct ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
      ${!inStock ? `<span class="badge-out-stock">نفذت الكمية</span>` : ''}
      
      <div class="product-thumb" style="background:${color}18;">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(p.name)}" loading="lazy">` : (icons[p.type] || icons.bottle)(color)}
      </div>
      <div class="p-rating" style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
        ${ratingHtml}
      </div>
      <div class="p-name">${sanitizeText(p.name)}</div>
      <div class="p-size" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${sanitizeText(p.size || '')}</span>
        ${inStock && stockQty <= 5 && stockQty > 0 ? `<span style="color:#DC2626; font-size:10px; font-weight:800;">باقي ${stockQty} فقط!</span>` : ''}
      </div>

      ${variantsHtml}

      <div class="p-price-row">
        <span class="p-price mono" id="price-val-${sanitizeText(p.id)}">${fmtPrice(p.price)}</span>
        ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${sanitizeText(p.id)}">${fmtPrice(p.oldPrice)}</span>` : ''}
      </div>
      <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${sanitizeText(p.id)}')">
        ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
      </button>

      ${isAdmin ? `
        <div class="admin-card-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${sanitizeText(p.id)}')">${inStock ? 'متوفر 🟢' : 'نافذ 🔴'}</button>
          <button type="button" class="btn-admin-price" onclick="quickEditPrice('${sanitizeText(p.id)}', ${p.price})">السعر 💰</button>
          <button type="button" class="btn-admin-edit" onclick="openAdminQuickEditModal('${sanitizeText(p.id)}')">تعديل ✏️</button>
          <button type="button" class="btn-admin-del" onclick="archiveProductConfirm('${sanitizeText(p.id)}', '${sanitizeText(p.name)}')">🗑️</button>
        </div>` : ''}
    </div>`;
}

// رسم كرت البكج الموحد
export function renderBundleCard(b) {
  const includedProds = (b.productIds || []).map(pid => findProduct(pid)).filter(Boolean);
  const cleanImg = sanitizeUrl(b.imageUrl);

  return `
    <div class="bundle-card">
      <span class="bundle-savings-badge">${sanitizeText(b.savingsBadge || 'توفير فوري 💸')}</span>
      <div class="bundle-thumb-row">
        ${cleanImg ? `<img src="${cleanImg}" style="max-height:100px; object-fit:contain;">` : 
          includedProds.map((p, idx) => `
            <div class="bundle-thumb-item">
              ${p.imageUrl ? `<img src="${sanitizeUrl(p.imageUrl)}">` : (icons[p.type || 'bottle'] || icons.bottle)(getBrandColor(p.brand))}
            </div>
            ${idx < includedProds.length - 1 ? '<span class="bundle-plus-icon">+</span>' : ''}
          `).join('')
        }
      </div>
      <h3 class="bundle-title">${sanitizeText(b.title)}</h3>
      <p class="bundle-desc">${sanitizeText(b.description)}</p>
      <div class="bundle-items-list">
        <b>مكونات البكج:</b>
        ${includedProds.map(p => `<span>• ${sanitizeText(p.name)} (${sanitizeText(p.brand)})</span>`).join('')}
      </div>
      <div class="bundle-price-box">
        <div>
          <span class="p-price mono" style="font-size:17px; color:var(--rose-deep);">${fmtPrice(b.price)}</span>
          ${b.oldPrice ? `<span class="p-oldprice mono" style="margin-inline-start:6px;">${fmtPrice(b.oldPrice)}</span>` : ''}
        </div>
      </div>
      <button class="add-cart-btn" onclick="addBundleToCart('${sanitizeText(b.id)}')">
        🎁 أضف البكج كاملاً للسلة
      </button>
    </div>
  `;
}

// رسم كرت القسم الموحد
export function renderCategoryCard(c, count) {
  const cleanImg = sanitizeUrl(c.imageUrl);
  return `
    <div class="modern-cat-card" onclick="openCategory('${sanitizeText(c.id)}')">
      <div class="modern-cat-img-wrap">
        ${cleanImg ? `<img src="${cleanImg}" alt="${sanitizeText(c.label)}">` : (catIcons[c.icon] || catIcons.jar)('var(--accent, #E85D8A)')}
      </div>
      <div class="modern-cat-info">
        <h3 class="modern-cat-title">${sanitizeText(c.label)}</h3>
        <span class="modern-cat-count mono">${count} منتج</span>
      </div>
    </div>
  `;
}
