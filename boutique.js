/* ==========================================================
   templates/boutique.js — قالب Boutique (تجميل فاخر)
   الهوية: صور كبيرة، فراغات واسعة، بطاقة منتج طويلة (صورة 3:4 ثم نص مركزي)، أقسام دوائر بصور، فوتر أنيق.
   الاختلاف هيكلي (HTML مختلف + تخطيط CSS بملف boutique.css) وليس ألواناً فقط.
   القالب "يرسم فقط": كل الأزرار تستدعي نفس دوال المتجر المشتركة (openProduct/addToCart/toggleWishlist/...)،
   ولا يحتوي أي منطق سلة أو دفع أو دخول. كل نص يمر بـ helpers.sanitizeText/sanitizeUrl.
   ========================================================== */
(function () {
  window.PharmacyTemplates = window.PharmacyTemplates || {};

  function esc(h, v) { return h.sanitizeText(v == null ? '' : v); }

  function heartSvg(filled) {
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21z"/></svg>';
  }

  // رابط اجتماعي آمن: يقبل رابطاً كاملاً أو معرّفاً، ويرجع '' إن لم يصلح
  function socialHref(kind, raw, h) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return '';
    if (kind === 'whatsapp') { var d = v.replace(/\D/g, ''); return d ? 'https://wa.me/' + d : ''; }
    if (kind === 'phone') { var p = v.replace(/[^\d+]/g, ''); return p ? 'tel:' + p : ''; }
    if (/^https?:\/\//i.test(v)) return h.sanitizeUrl(v) || '';
    var handle = v.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
    if (!handle) return '';
    return kind === 'instagram' ? 'https://instagram.com/' + handle : (kind === 'telegram' ? 'https://t.me/' + handle : '');
  }

  window.PharmacyTemplates.boutique = {
    id: 'boutique',
    name: 'Boutique',
    version: '1.0.0',
    tokens: {
      colors: { primary: '#B76E79' },
      fonts: { body: 'cairo', heading: 'amiri' },   // الخط الزخرفي يُحمَّل عبر boutique.css
      shapes: { radius: 'sm' }
    },
    homeSections: ['hero', 'brands', 'best-sellers', 'promo-cards'],

    applyStyles: function () { /* data-template وملف CSS يطبّقهما المحرك */ },

    // الهيدر: نفس هيكل المتجر (سلة/قائمة/بحث) بتنسيق Boutique عبر CSS، فنرجع null حفاظاً على كل الأزرار
    renderHeader: function () { return null; },

    // بطاقة منتج طويلة: صورة 3:4، العلامة فوق الاسم، سعر مركزي، زر إضافة بعرض كامل
    renderProductCard: function (p, h) {
      var id = esc(h, p.id);
      var color = h.getBrandColor(p.brand);
      var discountPct = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
      var isWished = h.wishlist && h.wishlist.has(p.id);
      var inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
      var img = h.sanitizeUrl(p.imageUrl);
      var low = (inStock && p.stockQuantity !== undefined && p.stockQuantity > 0 && p.stockQuantity <= 5);
      var media = img
        ? '<img src="' + img + '" alt="' + esc(h, p.name) + '" loading="lazy">'
        : (h.icons[p.type] || h.icons.bottle)(color);
      var action = inStock
        ? "addToCart('" + id + "')"
        : "openStockAlertModal('" + id + "')";
      return '' +
        '<div class="product-card bq-card" id="prod-card-' + id + '" onclick="openProduct(\'' + id + '\', true)">' +
          '<div class="bq-media" style="background:' + color + '14;">' + media +
            '<button class="wish-btn bq-wish ' + (isWished ? 'active' : '') + '" onclick="event.stopPropagation(); toggleWishlist(\'' + id + '\')" aria-label="المفضلة">' + heartSvg(isWished) + '</button>' +
            (discountPct ? '<span class="bq-badge">−' + discountPct + '%</span>' : '') +
            (!inStock ? '<span class="bq-badge bq-badge-out">نفذت الكمية</span>' : '') +
            (low ? '<span class="bq-badge bq-badge-low">بقي ' + Number(p.stockQuantity) + '</span>' : '') +
          '</div>' +
          '<div class="bq-body">' +
            (p.brand ? '<div class="bq-brand">' + esc(h, p.brand) + '</div>' : '') +
            '<div class="bq-name">' + esc(h, p.name) + '</div>' +
            (p.size ? '<div class="bq-size">' + esc(h, p.size) + '</div>' : '') +
            '<div class="bq-price-row">' +
              '<span class="bq-price mono" id="price-val-' + id + '">' + h.fmtPrice(p.price) + '</span>' +
              (p.oldPrice ? '<span class="bq-old mono" id="oldprice-val-' + id + '">' + h.fmtPrice(p.oldPrice) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<button class="bq-add ' + (inStock ? '' : 'bq-add-alert') + '" onclick="event.stopPropagation(); ' + action + '">' +
            (inStock ? 'إضافة إلى السلة' : 'أبلغيني عند التوفر') +
          '</button>' +
        '</div>';
    },

    // قسم بصورة دائرية كبيرة واسمه تحتها (العدد صغير ومنخفض الحضور)
    renderCategoryCard: function (c, count, h) {
      var img = h.sanitizeUrl(c.imageUrl);
      var media = img
        ? '<img src="' + img + '" alt="' + esc(h, c.label) + '" loading="lazy">'
        : (h.catIcons[c.icon] || h.catIcons.jar)('var(--accent, #B76E79)');
      return '' +
        '<div class="modern-cat-card bq-cat" onclick="openCategory(\'' + esc(h, c.id) + '\')">' +
          '<div class="bq-cat-circle">' + media + '</div>' +
          '<h3 class="bq-cat-title">' + esc(h, c.label) + '</h3>' +
          '<span class="bq-cat-count mono">' + Number(count) + ' منتج</span>' +
        '</div>';
    },

    // بطاقة بكج: صورة كبيرة بنسبة 4:5 ثم عنوان وسعر وزر، بدل الشريط الأفقي
    renderBundleCard: function (b, h) {
      var img = h.sanitizeUrl(b.imageUrl);
      var id = esc(h, b.id);
      return '' +
        '<div class="bq-bundle" onclick="openBundleDetail(\'' + id + '\')">' +
          '<div class="bq-bundle-media">' + (img ? '<img src="' + img + '" alt="' + esc(h, b.title) + '" loading="lazy">' : '<span class="bq-bundle-ph">🎁</span>') +
            (b.savingsBadge ? '<span class="bq-badge">' + esc(h, b.savingsBadge) + '</span>' : '') +
          '</div>' +
          '<div class="bq-body">' +
            '<div class="bq-name">' + esc(h, b.title) + '</div>' +
            '<div class="bq-price-row"><span class="bq-price mono">' + h.fmtPrice(b.price) + '</span>' +
              (b.oldPrice ? '<span class="bq-old mono">' + h.fmtPrice(b.oldPrice) + '</span>' : '') + '</div>' +
          '</div>' +
          '<button class="bq-add" onclick="event.stopPropagation(); addBundleToCart(\'' + id + '\')">إضافة البكج للسلة</button>' +
        '</div>';
    },

    // صفحة المنتج: لا إضافات (أزلنا شريط الثقة الثابت لأنه يدّعي خدمات قد لا تقدّمها الصيدلية)
    renderProductPage: function () { return null; },

    // فوتر أنيق: اسم الصيدلية وروابط التواصل المتوفرة فقط
    renderFooter: function (profile, h) {
      var links = [
        ['whatsapp', 'واتساب', socialHref('whatsapp', profile.socialWhatsapp, h)],
        ['instagram', 'إنستغرام', socialHref('instagram', profile.socialInstagram, h)],
        ['telegram', 'تيليجرام', socialHref('telegram', profile.socialTelegram, h)],
        ['phone', 'اتصال', socialHref('phone', profile.socialPhone, h)]
      ].filter(function (l) { return !!l[2]; });
      return '<footer class="bq-footer">' +
        '<div class="bq-footer-name">' + esc(h, profile.name || 'الصيدلية') + '</div>' +
        '<div class="bq-footer-line"></div>' +
        (links.length ? '<div class="bq-footer-links">' + links.map(function (l) {
          return '<a href="' + l[2] + '" target="_blank" rel="noopener noreferrer">' + l[1] + '</a>';
        }).join('') + '</div>' : '') +
        '</footer>';
    }
  };
})();
