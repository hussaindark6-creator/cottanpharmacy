/* ==========================================================
   templates/clinic.js — قالب Clinic (ثقة وصيدلة)
   الهوية: بحث بارز، أقسام على شكل شرائح (chips)، بطاقات منتج أفقية (صورة صغيرة + تفاصيل)،
   وزر «اسألي الصيدلاني» ظاهر بالأعلى وبصفحة المنتج والفوتر (يفتح نافذة الاستشارة الموجودة openConsultModal).
   القالب يرسم فقط: لا سلة ولا دفع ولا دخول هنا، وكل نص يمر بـ helpers.sanitizeText/sanitizeUrl.
   لا ادعاءات ثابتة (ترخيص/أصالة/مجانية): كل نص ظاهر إما عبارة عامة أو من بيانات الصيدلية نفسها.
   ========================================================== */
(function () {
  window.PharmacyTemplates = window.PharmacyTemplates || {};

  function esc(h, v) { return h.sanitizeText(v == null ? '' : v); }

  function heartSvg(filled) {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.9">' +
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

  window.PharmacyTemplates.clinic = {
    id: 'clinic',
    name: 'Clinic',
    version: '1.0.0',
    tokens: {
      colors: { primary: '#0284C7' },
      fonts: { body: 'cairo', heading: 'cairo' },
      shapes: { radius: 'md' }
    },
    homeSections: ['hero', 'promo-cards', 'best-sellers', 'brands'],

    applyStyles: function () { /* data-template وملف CSS يطبّقهما المحرك */ },

    // شريط علوي صغير قبل الهيدر: سؤال عام + زر الاستشارة (يُخفى تلقائياً إن أُوقفت ميزة الاستشارة من التصميم)
    renderHeader: function () {
      return '<div class="cl-topbar"><span>عندك سؤال عن دواء أو منتج؟</span>' +
        '<button type="button" onclick="openConsultModal()">اسألي الصيدلاني</button></div>';
    },

    // بطاقة أفقية: صورة صغيرة يميناً، التفاصيل بالوسط، السعر وزر الإضافة تحتها
    renderProductCard: function (p, h) {
      var id = esc(h, p.id);
      var color = h.getBrandColor(p.brand);
      var discountPct = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : null;
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
        '<div class="product-card cl-card" id="prod-card-' + id + '" onclick="openProduct(\'' + id + '\', true)">' +
          '<div class="cl-media" style="background:' + color + '14;">' + media + '</div>' +
          '<div class="cl-body">' +
            ((discountPct || !inStock || low) ? '<div class="cl-badges">' +
              (discountPct ? '<span class="cl-pill cl-pill-sale">خصم ' + discountPct + '%</span>' : '') +
              (!inStock ? '<span class="cl-pill cl-pill-out">نفذت الكمية</span>' : '') +
              (low ? '<span class="cl-pill cl-pill-low">بقي ' + Number(p.stockQuantity) + ' فقط</span>' : '') +
            '</div>' : '') +
            '<div class="cl-name">' + esc(h, p.name) + '</div>' +
            (meta ? '<div class="cl-meta">' + meta + '</div>' : '') +
            '<div class="cl-price-row">' +
              '<span class="cl-price mono" id="price-val-' + id + '">' + h.fmtPrice(p.price) + '</span>' +
              (p.oldPrice ? '<span class="cl-old mono" id="oldprice-val-' + id + '">' + h.fmtPrice(p.oldPrice) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="cl-act"><button class="cl-add ' + (inStock ? '' : 'cl-add-alert') + '" onclick="event.stopPropagation(); ' + action + '">' +
            (inStock ? 'إضافة للسلة' : '🔔 أبلغيني عند التوفر') + '</button></div>' +
          '<button class="wish-btn cl-wish ' + (isWished ? 'active' : '') + '" onclick="event.stopPropagation(); toggleWishlist(\'' + id + '\')" aria-label="المفضلة">' + heartSvg(isWished) + '</button>' +
        '</div>';
    },

    // قسم على شكل شريحة: أيقونة/صورة صغيرة + الاسم + عدد المنتجات
    renderCategoryCard: function (c, count, h) {
      var img = h.sanitizeUrl(c.imageUrl);
      var media = img
        ? '<img src="' + img + '" alt="' + esc(h, c.label) + '" loading="lazy">'
        : (h.catIcons[c.icon] || h.catIcons.jar)('var(--accent, #0284C7)');
      return '' +
        '<div class="modern-cat-card cl-cat" onclick="openCategory(\'' + esc(h, c.id) + '\')">' +
          '<span class="cl-cat-ico">' + media + '</span>' +
          '<h3 class="cl-cat-title">' + esc(h, c.label) + '</h3>' +
          '<span class="cl-cat-count mono">' + Number(count) + '</span>' +
        '</div>';
    },

    // بكج مدمج أفقي
    renderBundleCard: function (b, h) {
      var img = h.sanitizeUrl(b.imageUrl);
      var id = esc(h, b.id);
      return '' +
        '<div class="cl-bundle" onclick="openBundleDetail(\'' + id + '\')">' +
          '<div class="cl-bundle-media">' + (img ? '<img src="' + img + '" alt="' + esc(h, b.title) + '" loading="lazy">' : '<span>🎁</span>') + '</div>' +
          '<div class="cl-body">' +
            (b.savingsBadge ? '<div class="cl-badges"><span class="cl-pill cl-pill-sale">' + esc(h, b.savingsBadge) + '</span></div>' : '') +
            '<div class="cl-name">' + esc(h, b.title) + '</div>' +
            '<div class="cl-price-row"><span class="cl-price mono">' + h.fmtPrice(b.price) + '</span>' +
              (b.oldPrice ? '<span class="cl-old mono">' + h.fmtPrice(b.oldPrice) + '</span>' : '') + '</div>' +
          '</div>' +
          '<div class="cl-act"><button class="cl-add" onclick="event.stopPropagation(); addBundleToCart(\'' + id + '\')">إضافة البكج للسلة</button></div>' +
        '</div>';
    },

    // بصفحة المنتج: صندوق «اسألي الصيدلاني»
    renderProductPage: function () {
      return '<div class="cl-ask"><div class="cl-ask-text"><strong>عندك سؤال عن هذا المنتج؟</strong>' +
        '<span>اسألي الصيدلاني قبل الشراء.</span></div>' +
        '<button type="button" onclick="openConsultModal()">اسألي الصيدلاني</button></div>';
    },

    renderFooter: function (profile, h) {
      var links = [
        ['واتساب', socialHref('whatsapp', profile.socialWhatsapp, h)],
        ['إنستغرام', socialHref('instagram', profile.socialInstagram, h)],
        ['تيليجرام', socialHref('telegram', profile.socialTelegram, h)],
        ['اتصال', socialHref('phone', profile.socialPhone, h)]
      ].filter(function (l) { return !!l[1]; });
      return '<footer class="cl-footer">' +
        '<div class="cl-footer-name">' + esc(h, profile.name || 'الصيدلية') + '</div>' +
        '<button type="button" class="cl-footer-ask" onclick="openConsultModal()">اسألي الصيدلاني</button>' +
        (links.length ? '<div class="cl-footer-links">' + links.map(function (l) {
          return '<a href="' + l[1] + '" target="_blank" rel="noopener noreferrer">' + l[0] + '</a>';
        }).join('') + '</div>' : '') +
        '</footer>';
    }
  };
})();
