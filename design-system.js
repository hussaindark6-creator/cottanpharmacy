/* ==========================================================
   design-system.js — محرّك «نظام التصميم» بواجهة المتجر
   ----------------------------------------------------------
   يطبّق على الصفحة ما يحدده مالك الصيدلية من استوديو التصميم، كله من لقطة المتجر (صفر قراءات إضافية):
     • كتل الرئيسية (homeBlocks): ترتيب/إظهار/إخفاء/نمط/عناوين + الكتل الجديدة (وصل حديثاً، عروض بعدّاد، بكجات، قصة، تواصل، تذييل).
     • النصوص القابلة للتحرير (copy) وصيغة المخاطبة.
     • هوية الترويسة (شعار بمستطيل + الاسم + العبارة).
     • أرقام الأسعار (لاتينية/عربية) ومعلومات صفحة المنتج (مكوّنات/استخدام/تحذيرات/عمر).
   كل قيمة تمر عبر LookRegistry (قوائم مسموحة وحدود طول) قبل أن تصل للصفحة، ولا يوجد innerHTML بنص خام.
   يجب تحميله بعد look-registry.js وقبل script.js.
   ========================================================== */
(function () {
  'use strict';
  var R = window.LookRegistry;
  if (!R) return;
  var LEGACY_IDS = ['hero', 'promo-cards', 'brands', 'best-sellers'];

  function prof() { return (typeof pharmacyProfile !== 'undefined' && pharmacyProfile) ? pharmacyProfile : {}; }
  function $(id) { return document.getElementById(id); }
  function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
  function eff(profile) { return R.effectiveDesign(profile || prof()); }

  // ---------- أرقام ----------
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function digits(str) {
    if (document.documentElement.getAttribute('data-lk-digits') !== 'arabic') return str;
    return String(str).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }

  // ---------- النصوص ----------
  var currentCopy = R.normalizeCopy({});
  function t(key) { return R.copyText(currentCopy, key); }
  function applyCopy(copy) {
    if (copy) currentCopy = copy;
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      var k = el.getAttribute('data-copy');
      if (R.COPY_DEFS[k]) el.textContent = t(k);
    });
    var si = $('mainSearchInput'); if (si) si.setAttribute('placeholder', t('search_ph'));
  }

  // ---------- الكتل ----------
  function homeNodes() {
    var view = $('view-home'), nodes = {};
    if (!view) return { view: null, nodes: nodes };
    Object.keys(R.BLOCK_DEFS).forEach(function (id) { nodes[id] = view.querySelector('[data-home-section="' + id + '"]'); });
    return { view: view, nodes: nodes };
  }
  function setBlockText(node, block) {
    if (!node) return;
    var title = node.querySelector('[data-block-title]');
    if (title && block.title !== undefined && block.title) title.textContent = block.title;
    else if (title && title.hasAttribute('data-copy')) title.textContent = t(title.getAttribute('data-copy'));
    var sub = node.querySelector('[data-block-sub]');
    if (sub) { sub.textContent = block.subtitle || ''; sub.style.display = block.subtitle ? '' : 'none'; }
  }
  var lastBlocks = null, legacyMode = true;
  function applyBlocks(profile) {
    var h = homeNodes(); if (!h.view) return;
    var p = profile || prof();
    legacyMode = !Array.isArray(p.homeBlocks);
    var blocks = legacyMode ? R.defaultHomeBlocks() : R.normalizeHomeBlocks(p.homeBlocks);
    lastBlocks = blocks;
    var nodes = h.nodes, view = h.view;

    if (legacyMode) {
      // صيدلية بلا homeBlocks محفوظة: نحترم ترتيب القالب القديم كما طبّقه المحرك، ونضع المميزات والأقسام بعد البنر (مكانها القديم).
      var hero = nodes['hero'];
      ['trust', 'categories'].forEach(function (id, i) {
        var n = nodes[id]; if (!n || !hero) return;
        var anchor = i === 0 ? hero : nodes['trust'];
        if (anchor && anchor.nextElementSibling !== n) anchor.parentNode.insertBefore(n, anchor.nextSibling);
        n.setAttribute('data-ds-on', '1');
      });
      Object.keys(nodes).forEach(function (id) { if (nodes[id] && LEGACY_IDS.concat(['trust', 'categories']).indexOf(id) === -1) nodes[id].setAttribute('data-ds-on', '0'); });
    } else {
      var cur = Array.prototype.slice.call(view.children).map(function (n) { return n.getAttribute('data-home-section'); }).filter(Boolean);
      var want = blocks.map(function (b) { return b.id; });
      if (cur.join() !== want.join()) {
        blocks.forEach(function (b) { if (nodes[b.id]) view.appendChild(nodes[b.id]); });
      }
      blocks.forEach(function (b) {
        var n = nodes[b.id]; if (!n) return;
        n.setAttribute('data-ds-on', b.on ? '1' : '0');
        if (LEGACY_IDS.concat(['trust', 'categories']).indexOf(b.id) !== -1 && n.style.display === 'none') n.style.display = ''; // المالك يقرر لا القالب القديم
        if (b.style) n.setAttribute('data-ds-style', b.style);
        setBlockText(n, b);
      });
    }
    var tb = blocks.filter(function (b) { return b.id === 'trust'; })[0];
    if (tb && nodes['trust'] && !legacyMode) {
      var items = nodes['trust'].querySelectorAll('.trust-item');
      tb.items.forEach(function (it, i) {
        if (!items[i]) return;
        var b = items[i].querySelector('b'), sm = items[i].querySelector('small');
        if (b) b.textContent = it.t; if (sm) sm.textContent = it.s;
      });
    }
    var cb = blocks.filter(function (b) { return b.id === 'categories'; })[0];
    if (cb && nodes['categories']) {
      var head = nodes['categories'].querySelector('.ds-cats-head');
      if (head) { head.style.display = (cb.title && !legacyMode) ? '' : 'none'; var h2 = head.querySelector('h2'); if (h2) h2.textContent = cb.title || ''; }
    }
    renderContentBlocks(blocks);
  }

  // ---------- محتوى الكتل الجديدة ----------
  function listAvailable() { return (typeof products !== 'undefined' ? products : []).filter(function (x) { return x && x.isDeleted !== true; }); }
  function inStock(x) { return x.inStock !== false && (x.stockQuantity === undefined || x.stockQuantity > 0); }
  function grid(id, list, style) {
    var el = $(id); if (!el) return;
    el.classList.toggle('ds-slider', style === 'slider');
    if (typeof renderProductGrid === 'function') renderProductGrid(id, list);
  }
  function show(node, on) { if (node) node.style.display = on ? '' : 'none'; }
  function iraqMs(endAt) { return Date.parse(endAt + ':00+03:00'); }

  var countdownTimer = null;
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
  function paintCountdown(box, ms) {
    var left = Math.max(0, ms - Date.now()), d = Math.floor(left / 864e5), h = Math.floor(left % 864e5 / 36e5), m = Math.floor(left % 36e5 / 6e4), s = Math.floor(left % 6e4 / 1e3);
    function cell(v, l) { return '<span class="ds-cd-cell"><b class="mono">' + digits(String(v).padStart(2, '0')) + '</b><small>' + l + '</small></span>'; }
    box.innerHTML = cell(d, 'يوم') + cell(h, 'ساعة') + cell(m, 'دقيقة') + cell(s, 'ثانية');
    return left > 0;
  }

  function renderContentBlocks(blocks) {
    var nodes = homeNodes().nodes, p = prof();
    stopCountdown();
    blocks.forEach(function (b) {
      var n = nodes[b.id]; if (!n || !b.on) return;
      if (b.id === 'new-arrivals') {
        var cutoff = Date.now() - 60 * 864e5;
        var list = listAvailable().filter(function (x) { var c = x.createdAt || x.addedAt; return c && inStock(x) && new Date(c).getTime() >= cutoff; })
          .sort(function (a, c) { return new Date(c.createdAt || c.addedAt) - new Date(a.createdAt || a.addedAt); }).slice(0, 8);
        show(n, list.length > 0); if (list.length) grid('dsNewGrid', list, b.style);
      } else if (b.id === 'offers') {
        var end = b.endAt ? iraqMs(b.endAt) : 0, ended = end && end <= Date.now();
        var offers = listAvailable().filter(function (x) { return x.oldPrice && x.oldPrice > x.price && inStock(x); })
          .sort(function (a, c) { return (c.oldPrice - c.price) / c.oldPrice - (a.oldPrice - a.price) / a.oldPrice; }).slice(0, 8);
        show(n, offers.length > 0 && !ended);
        var box = $('dsCountdown');
        if (box) { box.style.display = (end && !ended) ? '' : 'none'; }
        if (offers.length && !ended) {
          grid('dsOffersGrid', offers, b.style);
          if (end && box) { paintCountdown(box, end); countdownTimer = setInterval(function () { if (!paintCountdown(box, end)) { stopCountdown(); renderContentBlocks(lastBlocks || blocks); } }, 1000); }
        }
      } else if (b.id === 'bundles') {
        if (typeof renderHomeBundlesPreview === 'function') renderHomeBundlesPreview();
        var g = $('homeBundlesGrid'); if (g) g.classList.toggle('ds-slider', b.style === 'slider');
      } else if (b.id === 'story') {
        var img = $('dsStoryImg'), tx = $('dsStoryText');
        if (tx) tx.textContent = b.text || '';
        if (img) { img.innerHTML = b.image ? '<img alt="" loading="lazy" src="' + esc(b.image) + '">' : ''; img.style.display = b.image ? '' : 'none'; }
        show(n, !!(b.text || b.title));
      } else if (b.id === 'contact') {
        var box2 = $('dsContactActions'); if (!box2) return;
        var wa = String(p.socialWhatsapp || '').replace(/[^0-9]/g, ''), tg = R.safeHttpsHost(String(p.socialTelegram || ''), ['t.me']);
        var html = '';
        if (wa.length >= 8) html += '<a class="ds-btn ds-btn-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + esc(wa) + '">' + esc(t('contact_btn')) + ' · واتساب</a>';
        if (tg) html += '<a class="ds-btn ds-btn-tg" target="_blank" rel="noopener noreferrer" href="' + esc(tg) + '">تيليجرام</a>';
        box2.innerHTML = html; show(n, !!html);
      } else if (b.id === 'footer') {
        renderFooter(n, b, p);
      }
    });
  }

  var LINK_LABELS = { categories: 'الأقسام', bundles: 'البكجات', offers: 'العروض', orders: 'طلباتي', account: 'حسابي', cart: 'السلة' };
  var SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', whatsapp: 'WhatsApp', telegram: 'Telegram' };
  function renderFooter(n, b, p) {
    var about = $('dsFooterAbout'), links = $('dsFooterLinks'), soc = $('dsFooterSocial'), cp = $('dsFooterCopy');
    if (about) { about.textContent = b.text || ''; about.style.display = b.text ? '' : 'none'; }
    if (links) {
      links.innerHTML = (b.links || []).map(function (k) { return '<a href="#" data-go="' + esc(k) + '">' + esc(LINK_LABELS[k]) + '</a>'; }).join('');
      links.querySelectorAll('a[data-go]').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); if (typeof showView === 'function') showView(a.getAttribute('data-go')); }); });
    }
    if (soc) soc.innerHTML = Object.keys(b.social || {}).map(function (k) { return '<a target="_blank" rel="noopener noreferrer" href="' + esc(b.social[k]) + '">' + esc(SOCIAL_LABELS[k]) + '</a>'; }).join('');
    if (cp) cp.textContent = '© ' + digits(String(new Date().getFullYear())) + ' ' + (p.name || '');
    n.setAttribute('data-ds-style', b.style || 'simple');
    show(n, true);
  }

  // ---------- هوية الترويسة (مستطيل الشعار + الاسم + العبارة) ----------
  function applyBrand(profile) {
    var p = profile || prof(), tile = $('dsBrandTile'), nm = $('dsBrandName'), tg = $('dsBrandTag');
    if (!tile || !nm) return;
    var name = String(p.name || '').slice(0, 60);
    nm.textContent = name;
    if (tg) { var tag = t('tagline'); tg.textContent = tag; tg.style.display = tag ? '' : 'none'; }
    // شاشة التحميل تتعرف على اسم المتجر وشعاره حال وصول البيانات
    var ln = $('dsLoaderName'), lm = $('dsLoaderMark');
    if (ln && !ln.textContent) ln.textContent = name;
    if (lm && lm.textContent === '•') lm.textContent = (name.replace(/^صيدلية\s*/, '') || name).charAt(0) || '•';
    var logo = (typeof sanitizeUrl === 'function') ? sanitizeUrl(p.logoUrl || '') : '';
    if (logo && /^https?:\/\//.test(logo)) { tile.innerHTML = '<img alt="" src="' + esc(logo) + '">'; }
    else { tile.textContent = (name.replace(/^صيدلية\s*/, '') || name).charAt(0) || '•'; }
  }

  // ---------- إبراز ما تغيّر بالمعاينة الحية ----------
  var FLASH_SELECTORS = {
    header: 'header', header_brand: '.logo-block', header_logo: '.logo-block', header_sticky: 'header', header_tabs: '#dsTabs', search_style: '.search-bar',
    announce: '#announcementBar', hero_size: '[data-home-section="hero"]', hero_image: '[data-home-section="hero"]', hero_frame: '[data-home-section="hero"]',
    cats_home: '[data-home-section="categories"]', trust: '[data-home-section="trust"]', nav: '.bottom-nav',
    card: '.product-card', add_btn: '.p-bag-btn', thumb_ratio: '.product-thumb', thumb_fit: '.product-thumb', thumb_tone: '.product-thumb', badge: '.discount-badge',
    card_meta: '.product-card', card_align: '.product-card', card_shadow: '.product-card', price_style: '.p-price', grid_mobile: '.product-grid', grid_wide: '.product-grid',
    card_desc: '.product-card', card_oldprice: '.product-card', card_stock: '.product-card', card_wish: '.product-card', bg_deco: 'main',
    title: '.section-head'
  };
  function flash(key) {
    var sel = FLASH_SELECTORS[key]; if (!sel) return;
    var els = document.querySelectorAll(sel); if (!els.length) return;
    var list = Array.prototype.slice.call(els, 0, 3);
    list.forEach(function (el) { el.classList.remove('ds-flash'); void el.offsetWidth; el.classList.add('ds-flash'); });
    try { list[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* غير حرج */ }
    setTimeout(function () { list.forEach(function (el) { el.classList.remove('ds-flash'); }); }, 1500);
  }

  // ---------- معلومات صفحة المنتج ----------
  var PD_FIELDS = [['ingredients', 'المكوّنات'], ['usage', 'طريقة الاستخدام'], ['warnings', 'التحذيرات'], ['ageRange', 'العمر المناسب']];
  function productInfoItems(prod) {
    var out = [];
    PD_FIELDS.forEach(function (f) {
      var v = prod && prod[f[0]]; if (typeof v !== 'string') return;
      v = v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600); if (v) out.push({ k: f[0], title: f[1], text: v });
    });
    return out;
  }
  function renderProductInfo(prod) {
    var host = $('pdInfoBlocks'); if (!host) return;
    var items = productInfoItems(prod), mode = document.documentElement.getAttribute('data-lk-pd-info') || 'stack';
    if (!items.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
    host.style.display = ''; host.setAttribute('data-mode', mode);
    if (mode === 'accordion') {
      host.innerHTML = items.map(function (it, i) { return '<details class="pd-acc"' + (i === 0 ? ' open' : '') + '><summary>' + esc(it.title) + '</summary><div>' + esc(it.text) + '</div></details>'; }).join('');
    } else if (mode === 'tabs') {
      host.innerHTML = '<div class="pd-tabs-bar" role="tablist">' + items.map(function (it, i) { return '<button type="button" role="tab" class="' + (i === 0 ? 'active' : '') + '" onclick="dsPdTab(' + i + ')">' + esc(it.title) + '</button>'; }).join('') + '</div>' +
        items.map(function (it, i) { return '<div class="pd-tab-pane' + (i === 0 ? ' active' : '') + '">' + esc(it.text) + '</div>'; }).join('');
    } else {
      host.innerHTML = items.map(function (it) { return '<section class="pd-info-sec"><h4>' + esc(it.title) + '</h4><p>' + esc(it.text) + '</p></section>'; }).join('');
    }
  }

  // ---------- الواجهة العامة ----------
  function applyAll(profile) {
    var e = eff(profile);
    applyCopy(e.copy);
    // لون الزر المركزي بالشريط السفلي: اللون الثانوي إن حدّدته المالكة وإلا ذهبي
    var sec = (profile || prof()).secondaryColor;
    document.documentElement.style.setProperty('--fab-color', /^#[0-9A-Fa-f]{6}$/.test(sec || '') ? sec : '#F59E0B');
    applyBrand(profile);
    applyBlocks(profile);
  }
  window.DS = {
    effective: eff, applyAll: applyAll, applyBrand: applyBrand, flash: flash, applyBlocks: applyBlocks, applyCopy: applyCopy, digits: digits, t: t,
    renderProductInfo: renderProductInfo, productInfoItems: productInfoItems,
    productsTitle: function () { var b = (lastBlocks || []).filter(function (x) { return x.id === 'best-sellers'; })[0]; return (b && b.title) || t('products_title'); },
    isLegacy: function () { return legacyMode; }
  };
  window.dsPdTab = function (i) {
    var host = $('pdInfoBlocks'); if (!host) return;
    host.querySelectorAll('.pd-tabs-bar button').forEach(function (b, k) { b.classList.toggle('active', k === i); });
    host.querySelectorAll('.pd-tab-pane').forEach(function (b, k) { b.classList.toggle('active', k === i); });
  };
})();

// عرض الكل لـ«وصل حديثاً» (يستخدم قائمة الفرعية الموجودة)
function openNewArrivals() {
  var cutoff = Date.now() - 60 * 864e5;
  var ids = (typeof products !== 'undefined' ? products : []).filter(function (x) {
    var c = x && (x.createdAt || x.addedAt);
    return x && x.isDeleted !== true && c && x.inStock !== false && new Date(c).getTime() >= cutoff;
  }).map(function (x) { return String(x.id); });
  listingMode = 'promo_offer'; listingValue = ids; window.__currentPromoTitle = 'وصل حديثاً';
  renderListing(); showListingView();
  var t = document.getElementById('listingTitle'); if (t) t.textContent = (window.DS ? DS.t('newarr_title') : 'وصل حديثاً');
}
