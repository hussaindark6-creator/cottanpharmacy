/* ==========================================================
   Template: Clinical Blue Pro (Medical & Professional Theme)
   File: /templates/template_b.js
   Version: 3.0.0 (Master Enterprise Edition)
   ========================================================== */

const TemplateB = {
  id: 'template_b',
  name: 'القالب الطبي الحديث (Clinical Blue Pro)',
  version: '3.0.0',

  // 1. تطبيق السمات البصرية والألوان الخاصة بالقالب B
  applyStyles(profile) {
    const root = document.documentElement;
    root.setAttribute('data-template', 'template_b');

    const primaryColor = profile.primaryColor || '#0284C7';
    root.style.setProperty('--accent', primaryColor);
    root.style.setProperty('--rose-deep', primaryColor);
    root.style.setProperty('--surface', '#F0F9FF');
    root.style.setProperty('--surface-hover', '#E0F2FE');
    root.style.setProperty('--line', '#BAE6FD');
    root.style.setProperty('--radius-lg', '14px');
    root.style.setProperty('--radius-md', '10px');
    root.style.setProperty('--radius-sm', '6px');
    root.style.setProperty('--shadow-soft', '0 4px 16px rgba(2, 132, 199, 0.08)');
  },

  // 2. تصميم البانر الرئيسي الطبي (Clinical Hero Banner)
  renderHeroBanner(profile, helpers) {
    const title = helpers.sanitizeText(profile.heroMainTitle || profile.name || 'المركز الصيدلاني المعتمد');
    const subtitle = helpers.sanitizeText(profile.heroSubTitle || 'استشارات طبية وأدوية مرخصة 100%');
    const desc = helpers.sanitizeText(profile.heroDescTitle || 'رعاية صحية شاملة تحت إشراف صيدلي مختص');
    const imgUrl = helpers.sanitizeUrl(profile.bannerImgUrl || 'https://imgdb.io/i/EQ4D9ag.png');

    return `
      <div class="qutn-hybrid-banner" style="background: linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 60%, #E0F2FE 100%); border-radius: var(--radius-lg); border: 1.5px solid #BAE6FD; box-shadow: var(--shadow-soft);" onclick="showView('categories')">
        <div class="banner-text-col">
          <span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:900; background:#E0F2FE; color:#0369A1; padding:3px 10px; border-radius:6px; width:fit-content; border:1px solid #BAE6FD; margin-bottom:4px;">
            🩺 صيدلية مرخصة ومنتجات أصلية
          </span>
          <h1 class="main-title" style="color:#0369A1; font-weight:900; letter-spacing:-0.5px;">${title}</h1>
          <p class="sub-title" style="font-weight:700; color:#1E293B;">${subtitle}</p>
          <p class="desc-title" style="color:#0284C7; font-weight:700;"><span>${desc}</span> <span>💊</span></p>
        </div>
        <div class="banner-model-col">
          <img src="${imgUrl}" alt="${title}" loading="lazy">
        </div>
      </div>
    `;
  },

  // 3. تصميم بطاقة المنتج الطبية مع التقييم الحقيقي وتعدد التراكيز وزر التعديل المباشر
  renderProductCard(p, helpers) {
    const color = helpers.getBrandColor(p.brand);
    const discountPct = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
    const isWished = helpers.wishlist.has(p.id);
    const inStock = (p.inStock !== false);
    const stockQty = Number(p.stockQuantity !== undefined ? p.stockQuantity : 10);
    const cleanImg = helpers.sanitizeUrl(p.imageUrl);
    const isAdmin = helpers.isCurrentUserAdmin();

    // 1. التقييم الحقيقي الموثق
    const reviewCount = Number(p.reviews || 0);
    const avgRating = reviewCount > 0 ? Number(p.rating || 5.0).toFixed(1) : null;
    const ratingHtml = reviewCount > 0
      ? `<div class="p-rating" style="font-size:11px; font-weight:700; color:#64748B; display:flex; align-items:center; gap:2px;">
          ${helpers.starIcon()} <span class="mono" style="font-weight:800; color:#0F172A;">${avgRating}</span> <span style="font-size:10px; color:#94A3B8;">(${reviewCount})</span>
        </div>`
      : `<span style="font-size:10px; font-weight:800; color:#0284C7; background:#F0F9FF; padding:1px 6px; border-radius:4px; border:1px solid #BAE6FD;">⭐ صنف جديد</span>`;

    // 2. توليد أزرار التراكيز والجرعات الطبية (Medical Variants)
    let variantsHtml = '';
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      variantsHtml = `
        <div class="p-variants-row" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;" onclick="event.stopPropagation()">
          ${p.variants.map((v, i) => `
            <button type="button" class="p-variant-chip ${i === 0 ? 'active' : ''}" 
              data-price="${v.price}" 
              data-oldprice="${v.oldPrice || ''}"
              onclick="selectProductVariantCard(this, '${helpers.sanitizeText(p.id)}')"
              style="font-size:10px; font-weight:800; padding:2px 7px; border-radius:4px; border:1px solid #BAE6FD; background:${i === 0 ? '#E0F2FE' : '#fff'}; color:${i === 0 ? '#0369A1' : '#334155'}; cursor:pointer; transition:all .15s;">
              ${helpers.sanitizeText(v.name || v.size)}
            </button>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="product-card" id="prod-card-${helpers.sanitizeText(p.id)}" style="border-radius:12px; background:#fff; border:1px solid #E2E8F0; padding:12px; position:relative; display:flex; flex-direction:column; box-shadow:0 2px 8px rgba(0,0,0,0.03);" onclick="openProduct('${helpers.sanitizeText(p.id)}', true)">
        <button class="wish-btn ${isWished ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${helpers.sanitizeText(p.id)}')" style="position:absolute; top:10px; right:10px; z-index:3; background:rgba(255,255,255,0.9); width:30px; height:30px; border-radius:6px; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21Z"/></svg>
        </button>

        ${discountPct ? `<span class="discount-badge" style="position:absolute; top:10px; left:10px; z-index:3; background:#0284C7; color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:4px;">خصم ${discountPct}%</span>` : ''}
        ${!inStock ? `<span class="badge-out-stock" style="position:absolute; top:10px; left:10px; z-index:3; background:#EF4444; color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:4px;">غير متوفر</span>` : ''}

        <div class="product-thumb" style="aspect-ratio:1/1; width:100%; border-radius:8px; background:#F8FAFC; border:1px solid #F1F5F9; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:10px;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(p.name)}" loading="lazy" style="width:100%; height:100%; object-fit:contain; padding:6px;">` : (helpers.icons[p.type] || helpers.icons.bottle)(color)}
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;">
          <span style="font-size:10px; font-weight:800; color:#0284C7; text-transform:uppercase; background:#F0F9FF; padding:1px 6px; border-radius:4px; border:1px solid #BAE6FD;">${helpers.sanitizeText(p.brand || 'معتمد')}</span>
          ${ratingHtml}
        </div>

        <div class="p-name" style="font-weight:700; font-size:13px; color:#0F172A; line-height:1.4; min-height:36px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:4px;">
          ${helpers.sanitizeText(p.name)}
        </div>

        <div class="p-size" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span>${helpers.sanitizeText(p.size || '')}</span>
          ${inStock && stockQty <= 5 && stockQty > 0 ? `<span style="color:#DC2626; font-size:10px; font-weight:800; background:#FEE2E2; padding:1px 6px; border-radius:4px;">باقي ${stockQty} فقط!</span>` : ''}
        </div>

        ${variantsHtml}

        <div class="p-price-row" style="display:flex; align-items:baseline; gap:6px; margin-top:auto; margin-bottom:8px;">
          <span class="p-price mono" id="price-val-${helpers.sanitizeText(p.id)}" style="font-size:15px; font-weight:900; color:#0369A1;">${helpers.fmtPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="p-oldprice mono" id="oldprice-val-${helpers.sanitizeText(p.id)}" style="font-size:11px; color:#94A3B8; text-decoration:line-through;">${helpers.fmtPrice(p.oldPrice)}</span>` : ''}
        </div>

        <button class="add-cart-btn" style="width:100%; background:#0284C7; color:#fff; font-weight:800; font-size:12px; padding:8px; border-radius:6px; transition:background .15s; ${!inStock ? 'opacity:0.5; pointer-events:none;' : ''}" onclick="event.stopPropagation(); addToCart('${helpers.sanitizeText(p.id)}')">
          ${inStock ? '🛒 إضافة للطلب' : 'نفذت الكمية'}
        </button>

        ${isAdmin ? `
          <div class="admin-card-actions" onclick="event.stopPropagation()" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:3px; margin-top:6px; padding-top:4px; border-top:1px dashed #CBD5E1;">
            <button type="button" class="btn-admin-stock ${inStock ? 'is-in' : 'is-out'}" onclick="quickToggleStock('${helpers.sanitizeText(p.id)}')">${inStock ? 'متوفر 🟢' : 'نافذ 🔴'}</button>
            <button type="button" class="btn-admin-price" onclick="quickEditPrice('${helpers.sanitizeText(p.id)}', ${p.price})">السعر 💰</button>
            <button type="button" class="btn-admin-edit" onclick="openAdminQuickEditModal('${helpers.sanitizeText(p.id)}')">تعديل ✏️</button>
            <button type="button" class="btn-admin-del" onclick="archiveProductConfirm('${helpers.sanitizeText(p.id)}', '${helpers.sanitizeText(p.name)}')">🗑️</button>
          </div>` : ''}
      </div>
    `;
  },

  // 4. تصميم بطاقة البكج الطبية (Clinical Bundle Card)
  renderBundleCard(b, helpers) {
    const includedProds = (b.productIds || []).map(pid => helpers.findProduct(pid)).filter(Boolean);
    const cleanImg = helpers.sanitizeUrl(b.imageUrl);

    return `
      <div class="bundle-card" style="background:#fff; border-radius:14px; border:1px solid #BAE6FD; padding:16px; box-shadow:var(--shadow-soft); position:relative;">
        <span class="bundle-savings-badge" style="position:absolute; top:12px; left:12px; background:#0284C7; color:#fff; font-size:11px; font-weight:800; padding:3px 10px; border-radius:6px;">
          ${helpers.sanitizeText(b.savingsBadge || 'حزمة علاجية مخصصة')}
        </span>

        <div class="bundle-thumb-row" style="background:#F0F9FF; border-radius:10px; padding:12px; margin-bottom:12px; display:flex; align-items:center; justify-content:center; gap:6px; border:1px dashed #BAE6FD;">
          ${cleanImg ? `<img src="${cleanImg}" style="max-height:100px; object-fit:contain;">` : 
            includedProds.map((p, idx) => `
              <div class="bundle-thumb-item" style="width:58px; height:58px; border-radius:6px; background:#fff; border:1px solid #E2E8F0; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                ${p.imageUrl ? `<img src="${helpers.sanitizeUrl(p.imageUrl)}" style="width:100%; height:100%; object-fit:contain; padding:3px;">` : (helpers.icons[p.type || 'bottle'] || helpers.icons.bottle)(helpers.getBrandColor(p.brand))}
              </div>
              ${idx < includedProds.length - 1 ? '<span style="font-weight:900; color:#0284C7; font-size:14px;">+</span>' : ''}
            `).join('')
          }
        </div>

        <h3 class="bundle-title" style="font-size:15px; font-weight:800; color:#0F172A; margin:0 0 4px;">${helpers.sanitizeText(b.title)}</h3>
        <p class="bundle-desc" style="font-size:12px; color:#64748B; line-height:1.4; margin-bottom:10px;">${helpers.sanitizeText(b.description)}</p>

        <div style="background:#F8FAFC; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:11.5px; color:#334155; border:1px solid #E2E8F0;">
          <b style="color:#0369A1; display:block; margin-bottom:3px;">📋 المكونات الطبية للبكج:</b>
          ${includedProds.map(p => `<div>• ${helpers.sanitizeText(p.name)}</div>`).join('')}
        </div>

        <div class="bundle-price-box" style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;">
          <div>
            <span class="p-price mono" style="font-size:17px; font-weight:900; color:#0369A1;">${helpers.fmtPrice(b.price)}</span>
            ${b.oldPrice ? `<span class="p-oldprice mono" style="font-size:12px; color:#94A3B8; text-decoration:line-through; margin-inline-start:6px;">${helpers.fmtPrice(b.oldPrice)}</span>` : ''}
          </div>
        </div>

        <button class="add-cart-btn" style="width:100%; background:#0284C7; color:#fff; font-weight:800; font-size:13px; padding:10px; border-radius:6px;" onclick="addBundleToCart('${helpers.sanitizeText(b.id)}')">
          📦 طلب البكج الطبي المتكامل
        </button>
      </div>
    `;
  },

  // 5. تصميم بطاقات الأقسام الطبية
  renderCategoryCard(c, count, helpers) {
    const cleanImg = helpers.sanitizeUrl(c.imageUrl);
    return `
      <div class="modern-cat-card" style="border-radius:10px; overflow:hidden; border:1px solid #BAE6FD; box-shadow:0 2px 6px rgba(0,0,0,0.02); cursor:pointer; background:#fff;" onclick="openCategory('${helpers.sanitizeText(c.id)}')">
        <div class="modern-cat-img-wrap" style="aspect-ratio:16/10; background:#F0F9FF; display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${cleanImg ? `<img src="${cleanImg}" alt="${helpers.sanitizeText(c.label)}" style="width:100%; height:100%; object-fit:cover;">` : (helpers.catIcons[c.icon] || helpers.catIcons.jar)('#0284C7')}
        </div>
        <div class="modern-cat-info" style="padding:10px; display:flex; align-items:center; justify-content:space-between;">
          <h3 class="modern-cat-title" style="font-size:13px; font-weight:700; color:#0F172A; margin:0;">${helpers.sanitizeText(c.label)}</h3>
          <span class="modern-cat-count mono" style="font-size:10.5px; font-weight:800; background:#E0F2FE; color:#0369A1; padding:1px 6px; border-radius:4px;">${count} صنف</span>
        </div>
      </div>
    `;
  }
};

if (typeof window !== 'undefined') {
  window.TemplateB = TemplateB;
}
export default TemplateB;
