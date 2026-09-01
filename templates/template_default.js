/* ==========================================================
   Template: Default Classic (Fail-Safe Baseline & Clinical Pro)
   File: /templates/template_default.js
   Version: 3.0.0 (Master Enterprise Edition)
   ========================================================== */

const TemplateDefault = {
  id: 'template_default',
  name: 'القالب الافتراضي الكلاسيكي',
  version: '3.0.0',

  // 1. تطبيق الألوان والسمات البصرية للقالب
  applyStyles(profile) {
    const root = document.documentElement;
    root.setAttribute('data-template', 'template_default');
    
    const primaryColor = profile.primaryColor || '#E85D8A';
    root.style.setProperty('--accent', primaryColor);
    root.style.setProperty('--rose-deep', primaryColor);
  },

  // 2. تصميم البانر الرئيسي (Hero Banner)
  renderHeroBanner(profile, helpers) {
    const title = helpers.sanitizeText(profile.heroMainTitle || profile.name || 'متجر الصيدلية');
    const subtitle = helpers.sanitizeText(profile.heroSubTitle || 'نحن هنا لتحسين صحتكم وجمالكم');
    const desc = helpers.sanitizeText(profile.heroDescTitle || 'منتجات أصلية ومعتمدة 100%');
    const imgUrl = helpers.sanitizeUrl(profile.bannerImgUrl || 'https://imgdb.io/i/EQ4D9ag.png');

    return `
      <div class="qutn-hybrid-banner" onclick="showView('categories')">
        <div class="banner-text-col">
          <h1 class="main-title">${title}</h1>
          <p class="sub-title">${subtitle}</p>
          <p class="desc-title"><span>${desc}</span> <span>🌸</span></p>
        </div>
        <div class="banner-model-col">
          <img src="${imgUrl}" alt="${title}" loading="lazy">
        </div>
      </div>
    `;
  },

  // 3. تصميم بطاقة المنتج مع التقييم الحقيقي 100% وتعدد التراكيز وزر التعديل المباشر
  renderProductCard(p, helpers) {
    const color = helpers.getBrandColor(p.brand);
    const discountPct = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
    const isWished = helpers.wishlist.has(p.id);
    const inStock = (p.inStock !== false);
    const stockQty = Number(p.stockQuantity !== undefined ? p.stockQuantity : 10);
    const cleanImg = helpers.sanitizeUrl(p.imageUrl);
    const isAdmin = helpers.isCurrentUserAdmin();

    // 1. التقييم الحقيقي 100% بدون أي أرقام وهمية
    const reviewCount = Number(p.reviews || 0);
    const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
    const ratingHtml = reviewCount > 0 
      ? `${helpers.starIcon()} <span class="mono" style="font-weight:800; color:var(--ink);">${avgRating}</span> <span style="font-size:10px; color:var(--text-soft);">(${reviewCount} ${reviewCount === 1 ? 'تقييم' : 'تقييمات'})</span>`
      : `<span style="font-size:10.5px; color:var(--text-soft); font-weight:700;">⭐ جديد (0 تقييم)</span>`;

    // 2. توليد شارات واختيارات التراكيز والأحجام (Product Variants) إن وجدت
    let variantsHtml = '';
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      variantsHtml = `
        <div class="p-variants-row" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;" onclick="event.stopPropagation()">
          ${p.variants.map((v, i) => `
            <button type="button" class="p-variant-chip ${i === 0 ? 'active' : ''}" 
              data-price="${v.price}" 
              data-oldprice="${v.oldPrice || ''}"
              onclick="selectProductVariantCard(this, '${helpers.sanitizeText(p.id)}')"
              style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:6px; border:1px solid var(--line); background:${i === 0 ? 'var(--surface)' : '#fff'}; color:${i === 0 ? 'var(--rose-deep)' : 'var(--ink)'}; cursor:pointer;">
              ${helpers.sanitizeText(v.name || v.size)}
            </button>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="product-card" id="prod-card-${helpers.sanitizeText(p.id)}" onclick="openProduct('${helpers.sanitizeText(p.id)}', true)">
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${helpers.sanitizeText(p.id)}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
        </button>
        
        ${discountPct ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
        ${!inStock ? `<span class="badge-out-stock">نفذت الكمية</span>` : ''}
        
        <div class="product-thumb" style="background:${color}18;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(p.name)}" loading="lazy">` : (helpers.icons[p.type] || helpers.icons.bottle)(color)}
        </div>

        <div class="p-rating" style="display:flex; align-items:center; gap:4px; margin-bottom:3px;">
          ${ratingHtml}
        </div>

        <div class="p-name">${helpers.sanitizeText(p.name)}</div>
        <div class="p-size" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${helpers.sanitizeText(p.size || '')}</span>
          ${inStock && stockQty <= 5 && stockQty > 0 ? `<span style="color:#DC2626; font-size:10px; font-weight:800;">باقي ${stockQty} فقط!</span>` : ''}
        </div>

        ${variantsHtml}

        <div class="p-price-row">
          <span class="p-price mono" id="price-val-${helpers.sanitizeText(p.id)}">${helpers.fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${helpers.sanitizeText(p.id)}">${helpers.fmtPrice(p.oldPrice)}</span>` : ''}
        </div>

        <button class="add-cart-btn" style="${!inStock ? 'opacity:0.6; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${helpers.sanitizeText(p.id)}')">
          ${inStock ? 'أضف إلى السلة' : 'غير متوفر'}
        </button>

        ${isAdmin ? `
          <div class="admin-card-actions" onclick="event.stopPropagation()">
            <button type="button" class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${helpers.sanitizeText(p.id)}')">${inStock ? 'متوفر 🟢' : 'نافذ 🔴'}</button>
            <button type="button" class="btn-admin-price" onclick="quickEditPrice('${helpers.sanitizeText(p.id)}', ${p.price})">السعر 💰</button>
            <button type="button" class="btn-admin-edit" onclick="openAdminQuickEditModal('${helpers.sanitizeText(p.id)}')">تعديل ✏️</button>
            <button type="button" class="btn-admin-del" onclick="archiveProductConfirm('${helpers.sanitizeText(p.id)}', '${helpers.sanitizeText(p.name)}')">🗑️</button>
          </div>` : ''}
      </div>
    `;
  },

  // 4. تصميم بطاقة البكج (Bundle Card)
  renderBundleCard(b, helpers) {
    const includedProds = (b.productIds || []).map(pid => helpers.findProduct(pid)).filter(Boolean);
    const cleanImg = helpers.sanitizeUrl(b.imageUrl);

    return `
      <div class="bundle-card">
        <span class="bundle-savings-badge">${helpers.sanitizeText(b.savingsBadge || 'توفير فوري 💸')}</span>
        <div class="bundle-thumb-row">
          ${cleanImg ? `<img src="${cleanImg}" style="max-height:100px; object-fit:contain;">` : 
            includedProds.map((p, idx) => `
              <div class="bundle-thumb-item">
                ${p.imageUrl ? `<img src="${helpers.sanitizeUrl(p.imageUrl)}">` : (helpers.icons[p.type || 'bottle'] || helpers.icons.bottle)(helpers.getBrandColor(p.brand))}
              </div>
              ${idx < includedProds.length - 1 ? '<span class="bundle-plus-icon">+</span>' : ''}
            `).join('')
          }
        </div>
        <h3 class="bundle-title">${helpers.sanitizeText(b.title)}</h3>
        <p class="bundle-desc">${helpers.sanitizeText(b.description)}</p>
        <div class="bundle-items-list">
          <b>مكونات البكج:</b>
          ${includedProds.map(p => `<span>• ${helpers.sanitizeText(p.name)} (${helpers.sanitizeText(p.brand)})</span>`).join('')}
        </div>
        <div class="bundle-price-box">
          <div>
            <span class="p-price mono" style="font-size:17px; color:var(--rose-deep);">${helpers.fmtPrice(b.price)}</span>
            ${b.oldPrice ? `<span class="p-oldprice mono" style="margin-inline-start:6px;">${helpers.fmtPrice(b.oldPrice)}</span>` : ''}
          </div>
        </div>
        <button class="add-cart-btn" onclick="addBundleToCart('${helpers.sanitizeText(b.id)}')">
          🎁 أضف البكج كاملاً للسلة
        </button>
      </div>
    `;
  },

  // 5. تصميم بطاقة القسم (Category Card)
  renderCategoryCard(c, count, helpers) {
    const cleanImg = helpers.sanitizeUrl(c.imageUrl);
    return `
      <div class="modern-cat-card" onclick="openCategory('${helpers.sanitizeText(c.id)}')">
        <div class="modern-cat-img-wrap">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(c.label)}">` : (helpers.catIcons[c.icon] || helpers.catIcons.jar)('var(--accent, #E85D8A)')}
        </div>
        <div class="modern-cat-info">
          <h3 class="modern-cat-title">${helpers.sanitizeText(c.label)}</h3>
          <span class="modern-cat-count mono">${count} منتج</span>
        </div>
      </div>
    `;
  }
};

if (typeof window !== 'undefined') {
  window.TemplateDefault = TemplateDefault;
}
export default TemplateDefault;
