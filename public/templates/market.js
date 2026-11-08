/* ==========================================================
   templates/market.js — قالب Market (كتالوج كبير)
   الهوية: شبكة مضغوطة (2 إلى 5 أعمدة)، شريط أقسام ثابت أعلى الشاشة أثناء التمرير، وتركيز على السعر ونسبة الخصم والتوفير.
   القالب يرسم فقط: لا سلة ولا دفع ولا دخول هنا، وكل نص يمر بـ helpers.sanitizeText/sanitizeUrl.
   كل رقم ظاهر مشتق من بيانات المنتج نفسها (السعر والسعر القديم)؛ لا ادعاءات ثابتة.
   ========================================================== */
(function () {
  window.PharmacyTemplates = window.PharmacyTemplates || {};

  function esc(h, v) { return h.sanitizeText(v == null ? '' : v); }

  function heartSvg(filled) {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 21s-7.5-4.9-10-9.5C.5 7.8 2.7 4 6.5 4 9 4 11 5.5 12 7c1-1.5 3-3 5.5-3 3.8 0 6 3.8 4.5 7.5C19.5 16.1 12 21 12 21z"/></svg>';
  }

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

  window.PharmacyTemplates.market = {
    id: 'market',
    name: 'Market',
    version: '1.0.0',
    tokens: {
      colors: { primary: '#E11D48' },
      fonts: { body: 'cairo', heading: 'cairo' },
      shapes: { radius: 'sm' }
    },
    homeSections: ['hero', 'promo-cards', 'best-sellers', 'brands'],

    // شريط الأقسام يوضع بعد الهيدر ويلتصق بأعلى الشاشة عند التمرير (sticky عبر market.css)
    headerSlotPosition: 'after',

    applyStyles: function () { /* data-template وملف CSS يطبّقهما المحرك */ },

    // شريط أقسام أفقي قابل للتمرير. لا يظهر إن لم تتوفر أقسام بعد (يُعاد رسمه عند تحميلها عبر TemplateEngine.refreshSlots)
    renderHeader: function (profile, h) {
      var cats = (typeof h.getCategories === 'function') ? h.getCategories() : [];
      if (!cats || !cats.length) return null;
      return '<nav class="mk-catbar" aria-label="الأقسام"><div class="mk-catbar-scroll">' +
        '<button type="button" class="mk-chip mk-chip-all" onclick="showView(\'categories\')">كل الأقسام</button>' +
        cats.map(function (c) {
          return '<button type="button" class="mk-chip" onclick="openCategory(\'' + esc(h, c.id) + '\')">' + esc(h, c.label) + '</button>';
        }).join('') +
        '</div></nav>';
    },

    // بطاقة مضغوطة: صورة مربعة، شارة خصم حمراء، السعر كبير، سطر «وفّري ...» محسوب من السعر القديم
    renderProductCard: function (p, h) {
      var id = esc(h, p.id);
      var color = h.getBrandColor(p.brand);
      var hasOld = p.oldPrice && p.oldPrice > p.price;
      var discountPct = hasOld ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
      var isWished = h.wishlist && h.wishlist.has(p.id);
      var inStock = (p.inStock !== false && (p.stockQuantity === undefined || p.stockQuantity > 0));
      var low = (inStock && p.stockQuantity !== undefined && p.stockQuantity > 0 && p.stockQuantity <= 5);
      var img = h.sanitizeUrl(p.imageUrl);
      var media = img
        ? '<img src="' + img + '" alt="' + esc(h, p.name) + '" loading="lazy">'
        : (h.icons[p.type] || h.icons.bottle)(color);
      var meta = [p.brand, p.size].filter(Boolean).map(function (x) { return esc(h, x); }).join(' · ');
      var action = inStock ? "addToCart('" + id + "')" : "openStockAlertModal('" + id + "')";
      return '' +
        '<div class="product-card mk-card" id="prod-card-' + id + '" onclick="openProduct(\'' + id + '\', true)">' +
          '<div class="mk-media" style="background:' + color + '12;">' + media +
            (discountPct ? '<span class="mk-off">−' + discountPct + '%</span>' : '') +
            '<button class="wish-btn mk-wish ' + (isWished ? 'active' : '') + '" onclick="event.stopPropagation(); toggleWishlist(\'' + id + '\')" aria-label="المفضلة">' + heartSvg(isWished) + '</button>' +
            (!inStock ? '<span class="mk-stock mk-stock-out">نفذت الكمية</span>' : (low ? '<span class="mk-stock mk-stock-low">بقي ' + Number(p.stockQuantity) + '</span>' : '')) +
          '</div>' +
          '<div class="mk-body">' +
            '<div class="mk-name">' + esc(h, p.name) + '</div>' +
            (meta ? '<div class="mk-sub">' + meta + '</div>' : '') +
            '<div class="mk-price-row">' +
              '<span class="mk-price mono" id="price-val-' + id + '">' + h.fmtPrice(p.price) + '</span>' +
              (hasOld ? '<span class="mk-old mono" id="oldprice-val-' + id + '">' + h.fmtPrice(p.oldPrice) + '</span>' : '') +
            '</div>' +
            (hasOld ? '<div class="mk-save">وفّري ' + h.fmtPrice(p.oldPrice - p.price) + '</div>' : '') +
          '</div>' +
          '<button class="mk-add ' + (inStock ? '' : 'mk-add-alert') + '" onclick="event.stopPropagation(); ' + action + '">' +
            (inStock ? '+ أضف' : '🔔 أبلغيني') + '</button>' +
        '</div>';
    },

    // بلاطة قسم صغيرة: صورة 44px + الاسم + العدد (بشبكة مضغوطة)
    renderCategoryCard: function (c, count, h) {
      var img = h.sanitizeUrl(c.imageUrl);
      var media = img
        ? '<img src="' + img + '" alt="' + esc(h, c.label) + '" loading="lazy">'
        : (h.catIcons[c.icon] || h.catIcons.jar)('var(--accent, #E11D48)');
      return '' +
        '<div class="modern-cat-card mk-cat" onclick="openCategory(\'' + esc(h, c.id) + '\')">' +
          '<span class="mk-cat-ico">' + media + '</span>' +
          '<span class="mk-cat-text"><h3 class="mk-cat-title">' + esc(h, c.label) + '</h3>' +
          '<span class="mk-cat-count mono">' + Number(count) + ' منتج</span></span>' +
        '</div>';
    },

    // بكج مضغوط عمودي مع نسبة التوفير
    renderBundleCard: function (b, h) {
      var img = h.sanitizeUrl(b.imageUrl);
      var id = esc(h, b.id);
      var hasOld = b.oldPrice && b.oldPrice > b.price;
      return '' +
        '<div class="mk-bundle" onclick="openBundleDetail(\'' + id + '\')">' +
          '<div class="mk-bundle-media">' + (img ? '<img src="' + img + '" alt="' + esc(h, b.title) + '" loading="lazy">' : '<span>🎁</span>') +
            (b.savingsBadge ? '<span class="mk-off">' + esc(h, b.savingsBadge) + '</span>' : '') +
          '</div>' +
          '<div class="mk-body">' +
            '<div class="mk-name">' + esc(h, b.title) + '</div>' +
            '<div class="mk-price-row"><span class="mk-price mono">' + h.fmtPrice(b.price) + '</span>' +
              (hasOld ? '<span class="mk-old mono">' + h.fmtPrice(b.oldPrice) + '</span>' : '') + '</div>' +
            (hasOld ? '<div class="mk-save">وفّري ' + h.fmtPrice(b.oldPrice - b.price) + '</div>' : '') +
          '</div>' +
          '<button class="mk-add" onclick="event.stopPropagation(); addBundleToCart(\'' + id + '\')">+ أضف البكج</button>' +
        '</div>';
    },

    renderProductPage: function () { return null; },

    renderFooter: function (profile, h) {
      var links = [
        ['واتساب', socialHref('whatsapp', profile.socialWhatsapp, h)],
        ['إنستغرام', socialHref('instagram', profile.socialInstagram, h)],
        ['تيليجرام', socialHref('telegram', profile.socialTelegram, h)],
        ['اتصال', socialHref('phone', profile.socialPhone, h)]
      ].filter(function (l) { return !!l[1]; });
      return '<footer class="mk-footer">' +
        '<div class="mk-footer-name">' + esc(h, profile.name || 'الصيدلية') + '</div>' +
        (links.length ? '<div class="mk-footer-links">' + links.map(function (l) {
          return '<a href="' + l[1] + '" target="_blank" rel="noopener noreferrer">' + l[0] + '</a>';
        }).join('') + '</div>' : '') +
        '</footer>';
    }
  };
})();
