/* ==========================================================
   Template: Modern Soft Rose (Aesthetic Theme)
   File: /templates/template_a.js
   ========================================================== */

const TemplateA = {
  id: 'template_a',
  name: 'القالب العصري الناعم (Modern Soft)',
  version: '1.0.0',

  // 1. تطبيق السمات البصرية والألوان الخاصة بالقالب A
  applyStyles(profile) {
    const root = document.documentElement;
    root.setAttribute('data-template', 'template_a');

    const primaryColor = profile.primaryColor || '#E85D8A';
    root.style.setProperty('--accent', primaryColor);
    root.style.setProperty('--rose-deep', primaryColor);
    root.style.setProperty('--radius-lg', '24px');
    root.style.setProperty('--radius-md', '18px');
    root.style.setProperty('--radius-sm', '12px');
    root.style.setProperty('--shadow-soft', '0 8px 25px rgba(232, 93, 138, 0.08)');
  },

  // 2. تصميم البانر الرئيسي العصري (Modern Hero Banner)
  renderHeroBanner(profile, helpers) {
    const title = helpers.sanitizeText(profile.heroMainTitle || profile.name || 'متجر الصيدلية');
    const subtitle = helpers.sanitizeText(profile.heroSubTitle || 'نحن هنا لتحسين بشرتك وجمالك');
    const desc = helpers.sanitizeText(profile.heroDescTitle || 'منتجات عناية وتجميل أصلية 100%');
    const imgUrl = helpers.sanitizeUrl(profile.bannerImgUrl || 'https://imgdb.io/i/EQ4D9ag.png');

    return `
      <div class="qutn-hybrid-banner" style="background: linear-gradient(135deg, var(--surface) 0%, #FFFFFF 50%, var(--surface-hover) 100%); border-radius: var(--radius-lg); border: 2px solid var(--line); box-shadow: var(--shadow-soft);" onclick="showView('categories')">
        <div class="banner-text-col">
          <span style="display:inline-block; font-size:11px; font-weight:900; background:#fff; color:var(--rose-deep); padding:3px 10px; border-radius:999px; width:fit-content; border:1px solid var(--line); box-shadow:0 2px 6px rgba(0,0,0,0.04); margin-bottom:4px;">✨ تشكيلة الموسم الحصرية</span>
          <h1 class="main-title" style="color:var(--rose-deep); font-weight:900;">${title}</h1>
          <p class="sub-title" style="font-weight:800; color:#374151;">${subtitle}</p>
          <p class="desc-title" style="color:var(--rose-deep); font-weight:700;"><span>${desc}</span> <span>🌸</span></p>
        </div>
        <div class="banner-model-col">
          <img src="${imgUrl}" alt="${title}" loading="lazy">
        </div>
      </div>
    `;
  },

  // 3. تصميم بطاقة المنتج الحديثة (Soft Product Card)
  renderProductCard(p, helpers) {
    const color = helpers.getBrandColor(p.brand);
    const discountPct = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
    const isWished = helpers.wishlist.has(p.id);
    const inStock = (p.inStock !== false);
    const cleanImg = helpers.sanitizeUrl(p.imageUrl);
    const isAdmin = helpers.isCurrentUserAdmin();

    return `
      <div class="product-card" style="border-radius:22px; background:#fff; border:1.5px solid var(--line); padding:14px; position:relative; display:flex; flex-direction:column; transition:transform .25s ease, box-shadow .25s ease;" onclick="openProduct('${helpers.sanitizeText(p.id)}', true)">
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${helpers.sanitizeText(p.id)}')" style="position:absolute; top:12px; right:12px; z-index:3; background:#fff; width:34px; height:34px; border-radius:50%; box-shadow:0 3px 10px rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
        </button>

        ${discountPct ? `<span class="discount-badge" style="position:absolute; top:12px; left:12px; z-index:3; background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%); color:#fff; font-size:10px; font-weight:900; padding:4px 8px; border-radius:999px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">وفر ${discountPct}%</span>` : ''}
        ${!inStock ? `<span class="badge-out-stock" style="position:absolute; top:12px; left:12px; z-index:3; background:#EF4444; color:#fff; font-size:10px; font-weight:900; padding:4px 8px; border-radius:999px;">نفذت الكمية</span>` : ''}

        <div class="product-thumb" style="aspect-ratio:1/1; width:100%; border-radius:18px; background:linear-gradient(135deg, ${color}14 0%, ${color}25 100%); display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:12px;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(p.name)}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : (helpers.icons[p.type] || helpers.icons.bottle)(color)}
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
          <span style="font-size:10.5px; font-weight:800; color:var(--text-soft); text-transform:uppercase;">${helpers.sanitizeText(p.brand || '')}</span>
          <div class="p-rating" style="font-size:11px; font-weight:800; color:#F59E0B; display:flex; align-items:center; gap:3px;">
            ${helpers.starIcon()} <span>${p.rating || 4.8}</span>
          </div>
        </div>

        <div class="p-name" style="font-weight:800; font-size:13.5px; color:var(--ink); line-height:1.4; min-height:38px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:4px;">
          ${helpers.sanitizeText(p.name)}
        </div>

        <div class="p-price-row" style="display:flex; align-items:baseline; gap:8px; margin-top:auto; margin-bottom:10px;">
          <span class="p-price mono" style="font-size:15px; font-weight:900; color:var(--rose-deep);">${helpers.fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono" style="font-size:11px; color:var(--text-soft); text-decoration:line-through;">${helpers.fmtPrice(p.oldPrice)}</span>` : ''}
        </div>

        <button class="add-cart-btn" style="width:100%; background:var(--accent); color:#fff; font-weight:800; font-size:12.5px; padding:10px; border-radius:999px; box-shadow:0 4px 12px rgba(232,93,138,0.25); ${!inStock ? 'opacity:0.5; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${helpers.sanitizeText(p.id)}')">
          ${inStock ? '🌸 أضف للسلة' : 'غير متوفر'}
        </button>

        ${isAdmin ? `
          <div class="admin-card-actions" onclick="event.stopPropagation()" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:4px; margin-top:8px; padding-top:6px; border-top:1px dashed var(--line);">
            <button class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${helpers.sanitizeText(p.id)}')">${inStock ? 'متوفر' : 'نافذ'}</button>
            <button class="btn-admin-price" onclick="quickEditPrice('${helpers.sanitizeText(p.id)}', ${p.price})">السعر</button>
            <button class="btn-admin-edit" onclick="openAdminQuickEditModal('${helpers.sanitizeText(p.id)}')">تعديل</button>
            <button class="btn-admin-del" onclick="deleteProductConfirm('${helpers.sanitizeText(p.id)}', '${helpers.sanitizeText(p.name)}')">🗑️</button>
          </div>` : ''}
      </div>
    `;
  },

  // 4. تصميم بطاقة البكج العصرية (Soft Bundle Card)
  renderBundleCard(b, helpers) {
    const includedProds = (b.productIds || []).map(pid => helpers.findProduct(pid)).filter(Boolean);
    const cleanImg = helpers.sanitizeUrl(b.imageUrl);

    return `
      <div class="bundle-card" style="background:#fff; border-radius:24px; border:2px solid var(--line); padding:18px; box-shadow:var(--shadow-soft); position:relative;">
        <span class="bundle-savings-badge" style="position:absolute; top:14px; left:14px; background:linear-gradient(135deg, #10B981 0%, #059669 100%); color:#fff; font-size:11px; font-weight:900; padding:5px 12px; border-radius:999px; box-shadow:0 4px 12px rgba(16,185,129,0.3);">
          ${helpers.sanitizeText(b.savingsBadge || 'توفير فوري 💸')}
        </span>

        <div class="bundle-thumb-row" style="background:var(--surface); border-radius:18px; padding:14px; margin-bottom:14px; display:flex; align-items:center; justify-content:center; gap:8px;">
          ${cleanImg ? `<img src="${cleanImg}" style="max-height:110px; object-fit:contain;">` : 
            includedProds.map((p, idx) => `
              <div class="bundle-thumb-item" style="width:64px; height:64px; border-radius:12px; background:#fff; border:1px solid var(--line); overflow:hidden; display:flex; align-items:center; justify-content:center;">
                ${p.imageUrl ? `<img src="${helpers.sanitizeUrl(p.imageUrl)}" style="width:100%; height:100%; object-fit:cover;">` : (helpers.icons[p.type || 'bottle'] || helpers.icons.bottle)(helpers.getBrandColor(p.brand))}
              </div>
              ${idx < includedProds.length - 1 ? '<span style="font-weight:900; color:var(--accent); font-size:16px;">+</span>' : ''}
            `).join('')
          }
        </div>

        <h3 class="bundle-title" style="font-size:16px; font-weight:900; color:var(--ink); margin:0 0 6px;">${helpers.sanitizeText(b.title)}</h3>
        <p class="bundle-desc" style="font-size:12.5px; color:var(--text-soft); line-height:1.5; margin-bottom:12px;">${helpers.sanitizeText(b.description)}</p>

        <div style="background:var(--surface); border-radius:14px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:var(--ink);">
          <b style="color:var(--rose-deep); display:block; margin-bottom:4px;">✨ يحتوي هذا البكج على:</b>
          ${includedProds.map(p => `<div style="margin-bottom:2px;">• ${helpers.sanitizeText(p.name)}</div>`).join('')}
        </div>

        <div class="bundle-price-box" style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:12px;">
          <div>
            <span class="p-price mono" style="font-size:18px; font-weight:900; color:var(--rose-deep);">${helpers.fmtPrice(b.price)}</span>
            ${b.oldPrice ? `<span class="p-oldprice mono" style="font-size:12.5px; color:var(--text-soft); text-decoration:line-through; margin-inline-start:6px;">${helpers.fmtPrice(b.oldPrice)}</span>` : ''}
          </div>
        </div>

        <button class="add-cart-btn" style="width:100%; background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%); color:#fff; font-weight:900; font-size:13.5px; padding:12px; border-radius:999px; box-shadow:0 4px 14px rgba(232,93,138,0.3);" onclick="addBundleToCart('${helpers.sanitizeText(b.id)}')">
          🎁 أضف البكج كاملاً للسلة
        </button>
      </div>
    `;
  },

  // 5. تصميم بطاقات الأقسام العصرية
  renderCategoryCard(c, count, helpers) {
    const cleanImg = helpers.sanitizeUrl(c.imageUrl);
    return `
      <div class="modern-cat-card" style="border-radius:20px; overflow:hidden; border:1.5px solid var(--line); box-shadow:var(--shadow-soft); cursor:pointer; background:#fff;" onclick="openCategory('${helpers.sanitizeText(c.id)}')">
        <div class="modern-cat-img-wrap" style="aspect-ratio:16/11; background:var(--surface); display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(c.label)}" style="width:100%; height:100%; object-fit:cover;">` : (helpers.catIcons[c.icon] || helpers.catIcons.jar)('var(--accent, #E85D8A)')}
        </div>
        <div class="modern-cat-info" style="padding:12px; display:flex; align-items:center; justify-content:space-between;">
          <h3 class="modern-cat-title" style="font-size:13.5px; font-weight:800; color:var(--ink); margin:0;">${helpers.sanitizeText(c.label)}</h3>
          <span class="modern-cat-count mono" style="font-size:11px; font-weight:900; background:var(--surface); color:var(--rose-deep); padding:2px 8px; border-radius:999px; border:1px solid var(--line);">${count}</span>
        </div>
      </div>
    `;
  }
};

if (typeof window !== 'undefined') {
  window.TemplateA = TemplateA;
}
export default TemplateA;
