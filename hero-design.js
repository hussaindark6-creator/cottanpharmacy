/* hero-design.js — يرسم «منطقة التعريف» المبنية من العناصر (Hero Builder) داخل المتجر.
   يعمل فوق النظام الحالي: إن لم يوجد heroDesign أو كان mode = classic يبقى الهيرو القديم (السلايدر) كما هو بلا أي تغيير.
   كل مدخل يمر عبر LookRegistry.normalizeHeroDesign (قوائم مسموحة + ألوان HEX + نصوص منقّاة + صور مرفوعة للصيدلية فقط)،
   ثم تُهرَّب النصوص عند البناء: لا يُدرَج أي HTML خام من بيانات الصيدلية. */
(function () {
  'use strict';
  var R = window.LookRegistry;
  if (!R || typeof R.normalizeHeroDesign !== 'function') return;

  var lastKey = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; });
  }
  function prof() { return (typeof pharmacyProfile !== 'undefined' && pharmacyProfile) ? pharmacyProfile : {}; }
  function safeUrl(u) { return (typeof sanitizeUrl === 'function') ? sanitizeUrl(u || '') : ''; }
  function withName(t, p) { return (p.name && t.indexOf('اسم المتجر') !== -1) ? t.split('اسم المتجر').join(p.name) : t; }
  function accent(t) { return esc(t).replace(/\*([^*]{1,40})\*/g, '<em class="hd-accent">$1</em>'); }
  function fallback(type, p) {
    if (type === 'title') return p.heroMainTitle || p.name || '';
    if (type === 'subtitle') return p.heroSubTitle || '';
    if (type === 'text') return p.heroDescTitle || '';
    if (type === 'button') return 'تسوّقي الآن ←';
    return '';
  }
  function initial(p) { return (String(p.name || '').replace(/^صيدلية\s*/, '').charAt(0)) || '+'; }

  function go(target) {
    try {
      if (target === 'offers') showView('offers');
      else if (target === 'bundles') showView('bundles');
      else if (target === 'categories') showView('categories');
      else if (target === 'new' && typeof openNewArrivals === 'function') openNewArrivals();
      else if (target === 'listing') { showView('listing'); if (typeof openBestSellers === 'function') openBestSellers(); }
    } catch (e) { /* غير حرج */ }
  }
  function clickAttr(target) { return (target && target !== 'none') ? ' onclick="HeroDesign.go(\'' + target + '\')"' : ''; }

  // ---------- عناصر ----------
  function cls(el, extra) {
    return 'hd-el hd-t-' + el.t + ' hd-s-' + el.s + (el.a ? ' hd-a-' + el.a : '') + ' hd-sp-' + el.sp +
      (el.v === 'm' ? ' hd-v-m' : (el.v === 'd' ? ' hd-v-d' : '')) + (extra ? ' ' + extra : '');
  }
  function cv(el) { return el.c ? ' style="--hd-c:' + el.c + '"' : ''; }
  function elHtml(el, p) {
    var txt;
    switch (el.t) {
      case 'logo': {
        var u = el.u || safeUrl(p.logoUrl);
        return '<div class="' + cls(el) + '">' + (u ? '<img src="' + esc(u) + '" alt="' + esc(p.name || '') + '">' : '<span class="hd-logo-mark">' + esc(initial(p)) + '</span>') + '</div>';
      }
      case 'image':
        return el.u ? '<div class="' + cls(el) + '"><img loading="lazy" decoding="async" src="' + esc(el.u) + '" alt=""></div>' : '';
      case 'title':
        txt = withName(el.x || fallback('title', p), p);
        return txt ? '<h2 class="' + cls(el) + '"' + cv(el) + '>' + accent(txt) + '</h2>' : '';
      case 'subtitle':
        txt = withName(el.x || fallback('subtitle', p), p);
        return txt ? '<p class="' + cls(el) + '"' + cv(el) + '>' + accent(txt) + '</p>' : '';
      case 'text':
        txt = withName(el.x || fallback('text', p), p);
        return txt ? '<p class="' + cls(el) + '"' + cv(el) + '>' + accent(txt) + '</p>' : '';
      case 'button':
        return '<button type="button" class="' + cls(el, 'hd-btn hd-btn-' + el.st) + '"' + cv(el) + clickAttr(el.go) + '>' + esc(el.x || fallback('button', p)) + '</button>';
      case 'badge':
        return el.x ? '<span class="' + cls(el, 'hd-badge hd-badge-' + el.st) + '"' + cv(el) + '>' + esc(el.x) + '</span>' : '';
      case 'icon':
        return '<span class="' + cls(el) + '"' + cv(el) + '>' + esc(el.x) + '</span>';
      case 'divider':
        return '<div class="' + cls(el, 'hd-div hd-div-' + el.st) + '"' + cv(el) + '></div>';
      case 'spacer':
        return '<div class="' + cls(el) + '" aria-hidden="true"></div>';
      default: return '';
    }
  }
  function elsHtml(list, p) { return list.map(function (e) { return elHtml(e, p); }).join(''); }

  // ---------- أدوات مشتركة ----------
  function rootVars(h) {
    var v = [];
    if (h.bg) v.push('--hd-bg:' + h.bg);
    if (h.bg2) v.push('--hd-bg2:' + h.bg2);
    if (h.ink) v.push('--hd-ink:' + h.ink);
    if (h.accent) v.push('--hd-ac:' + h.accent);
    v.push('--hd-ovl:' + (h.ovl / 100));
    return ' style="' + v.join(';') + '"';
  }
  function rootCls(h, extra) {
    return 'hd hd-' + h.mode + ' hd-size-' + h.size + ' hd-rad-' + h.radius + ' hd-gap-' + h.gap + ' hd-sh-' + h.shadow + ' hd-pos-' + h.pos +
      (h.ink ? ' hd-has-ink' : '') + (h.bg ? ' hd-has-bg' : '') + (extra ? ' ' + extra : '');
  }
  function mediaImg(src, fit) { return src ? '<img class="hd-fit-' + h2fit(fit) + '" src="' + esc(src) + '" alt="" decoding="async">' : ''; }
  function h2fit(f) { return f === 'contain' ? 'contain' : 'cover'; }
  function listOrDefault(h) { return Array.isArray(h.els) ? h.els : R.heroDefaultEls(h.mode); }

  // ---------- التكوينات ----------
  function buildOverlay(h, p) {
    var img = h.img || safeUrl(p.bannerImgUrl);
    return '<section class="' + rootCls(h) + '"' + rootVars(h) + '>' +
      (img ? '<div class="hd-media">' + mediaImg(img, h.fit) + '</div>' : '') +
      '<div class="hd-shade hd-ovl-' + h.overlay + '"></div>' +
      '<div class="hd-body">' + elsHtml(listOrDefault(h), p) + '</div></section>';
  }
  function buildSplit(h, p) {
    var img = h.img || safeUrl(p.bannerImgUrl);
    return '<section class="' + rootCls(h, 'hd-side-' + h.side) + '"' + rootVars(h) + '>' +
      (img ? '<div class="hd-media hd-ratio-' + h.ratio + '">' + mediaImg(img, h.fit) + '</div>' : '') +
      '<div class="hd-panel">' + elsHtml(listOrDefault(h), p) + '</div></section>';
  }
  function buildBrand(h, p) {
    var stage = [], copy = [];
    listOrDefault(h).forEach(function (e) { (e.t === 'logo' || e.t === 'image' || e.t === 'icon' ? stage : copy).push(e); });
    return '<section class="' + rootCls(h) + '"' + rootVars(h) + '>' +
      (stage.length ? '<div class="hd-stage hd-stage-' + h.stage + '"><div class="hd-stage-in' + (h.card === 'on' ? ' hd-stage-card' : '') + '">' + elsHtml(stage, p) + '</div></div>' : '') +
      '<div class="hd-copy">' + elsHtml(copy, p) + '</div></section>';
  }
  function buildEditorial(h, p) {
    var imgs = [h.img || safeUrl(p.bannerImgUrl), h.img2, h.img3].filter(Boolean);
    var html = imgs.map(function (u, i) { return '<div class="hd-ed-img hd-ed-' + (i + 1) + (imgs.length === 1 ? ' hd-ed-solo' : '') + '"><img loading="lazy" decoding="async" class="hd-fit-' + h2fit(h.fit) + '" src="' + esc(u) + '" alt=""></div>'; }).join('');
    return '<section class="' + rootCls(h, imgs.length ? '' : 'hd-ed-noimg') + '"' + rootVars(h) + '>' +
      '<div class="hd-ed-copy">' + elsHtml(listOrDefault(h), p) + '</div>' +
      (imgs.length ? '<div class="hd-ed-imgs">' + html + '</div>' : '') + '</section>';
  }
  function defaultCards() {
    return [
      { img: '', t: 'عروض خاصة', x: 'على أفضل المنتجات', b: 'تسوّقي الآن', go: 'offers', bg: '', big: true },
      { img: '', t: 'بكجات مميزة', x: 'توفير أكثر', b: 'اكتشفي', go: 'bundles', bg: '', big: false },
      { img: '', t: 'وصل حديثاً', x: '', b: 'شاهدي', go: 'new', bg: '', big: false }
    ];
  }
  function buildCards(h, p) {
    var cards = (Array.isArray(h.cards) && h.cards.length) ? h.cards : defaultCards();
    var intro = Array.isArray(h.els) ? elsHtml(h.els, p) : '';
    var html = cards.map(function (c) {
      var bg = c.bg ? ' style="--hd-cbg:' + c.bg + '"' : '';
      return '<div class="hd-card' + (c.big ? ' hd-card-big' : '') + (c.img ? ' hd-card-img' : '') + '"' + bg + clickAttr(c.go) + ' role="button" tabindex="0">' +
        (c.img ? '<img loading="lazy" decoding="async" src="' + esc(c.img) + '" alt="">' : '') +
        '<div class="hd-card-body">' + (c.t ? '<h3>' + accent(c.t) + '</h3>' : '') + (c.x ? '<p>' + esc(c.x) + '</p>' : '') + (c.b ? '<span class="hd-card-btn">' + esc(c.b) + '</span>' : '') + '</div></div>';
    }).join('');
    return '<section class="' + rootCls(h) + '"' + rootVars(h) + '>' + (intro ? '<div class="hd-cards-intro">' + intro + '</div>' : '') + '<div class="hd-cardgrid">' + html + '</div></section>';
  }
  function classicSlides(p) {
    var out = [{ img: safeUrl(p.bannerImgUrl), t: p.heroMainTitle || p.name || '', x: p.heroDescTitle || p.heroSubTitle || '', b: 'تسوّقي الآن', go: 'listing', bg: '', ink: '', logo: false }];
    (p.promoCards || []).slice(0, 5).forEach(function (c) {
      out.push({ img: safeUrl(c.img), t: String(c.title || '').slice(0, 60), x: String(c.desc || '').slice(0, 160), b: 'تسوّقي الآن', go: 'offers', bg: '', ink: '', logo: false });
    });
    return out;
  }
  function buildSlides(h, p) {
    var slides = (Array.isArray(h.slides) && h.slides.length) ? h.slides : classicSlides(p);
    var track = slides.map(function (s, i) {
      var st = (s.bg ? '--hd-sbg:' + s.bg + ';' : '') + (s.ink ? '--hd-sink:' + s.ink + ';' : '');
      var logo = s.logo ? '<div class="hd-el hd-t-logo hd-s-l hd-sp-m">' + (safeUrl(p.logoUrl) ? '<img src="' + esc(safeUrl(p.logoUrl)) + '" alt="">' : '<span class="hd-logo-mark">' + esc(initial(p)) + '</span>') + '</div>' : '';
      return '<div class="hd-slide' + (s.img ? ' hd-slide-img' : '') + '"' + (st ? ' style="' + st + '"' : '') + ' data-i="' + i + '">' +
        (s.img ? '<div class="hd-media"><img class="hd-fit-' + h2fit(h.fit) + '" src="' + esc(s.img) + '" alt="" decoding="async"' + (i ? ' loading="lazy"' : '') + '></div><div class="hd-shade hd-ovl-' + h.overlay + '"></div>' : '') +
        '<div class="hd-body">' + logo + (s.t ? '<h2 class="hd-el hd-t-title hd-s-l hd-sp-m">' + accent(withName(s.t, p)) + '</h2>' : '') +
        (s.x ? '<p class="hd-el hd-t-text hd-s-m hd-sp-m">' + esc(s.x) + '</p>' : '') +
        (s.b ? '<button type="button" class="hd-el hd-t-button hd-s-m hd-sp-m hd-btn hd-btn-fill"' + clickAttr(s.go) + '>' + esc(s.b) + '</button>' : '') + '</div></div>';
    }).join('');
    var dots = slides.length > 1 ? '<div class="hd-dots">' + slides.map(function (_, i) { return '<button type="button" class="hd-dot' + (i === 0 ? ' on' : '') + '" data-go="' + i + '" aria-label="شريحة ' + (i + 1) + '"></button>'; }).join('') + '</div>' : '';
    return '<section class="' + rootCls(h) + '"' + rootVars(h) + '><div class="hd-track">' + track + '</div>' + dots + '</section>';
  }
  function buildMinimal(h, p) {
    return '<section class="' + rootCls(h) + '"' + rootVars(h) + '><div class="hd-min-in">' + elsHtml(listOrDefault(h), p) + '</div></section>';
  }
  var BUILDERS = { overlay: buildOverlay, split: buildSplit, brand: buildBrand, editorial: buildEditorial, cards: buildCards, slides: buildSlides, minimal: buildMinimal };

  function wireSlides(host) {
    var track = host.querySelector('.hd-track'); if (!track) return;
    var dots = host.querySelectorAll('.hd-dot');
    function idx() { return Math.round(Math.abs(track.scrollLeft) / Math.max(1, track.clientWidth)); }
    track.addEventListener('scroll', function () { var i = idx(); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); }, { passive: true });
    dots.forEach(function (d) {
      d.addEventListener('click', function () {
        var i = +d.getAttribute('data-go') || 0, rtl = getComputedStyle(track).direction === 'rtl';
        track.scrollTo({ left: (rtl ? -1 : 1) * i * track.clientWidth, behavior: 'smooth' });
      });
    });
  }

  function apply(profile) {
    var wrap = document.querySelector('.hero-wrap[data-home-section="hero"]');
    if (!wrap) return;
    var p = profile || prof();
    var h = R.normalizeHeroDesign(p.heroDesign);
    var host = document.getElementById('heroDesignHost');
    if (!h || h.mode === 'classic' || !BUILDERS[h.mode]) {
      if (host) host.remove();
      wrap.removeAttribute('data-hd');
      lastKey = '';
      return;
    }
    var key = JSON.stringify([h, p.name, p.logoUrl, p.bannerImgUrl, p.heroMainTitle, p.heroSubTitle, p.heroDescTitle, p.promoCards && p.promoCards.length]);
    if (host && key === lastKey) return;
    if (!host) { host = document.createElement('div'); host.id = 'heroDesignHost'; wrap.appendChild(host); }
    wrap.setAttribute('data-hd', h.mode);
    host.innerHTML = BUILDERS[h.mode](h, p);
    if (h.mode === 'slides') wireSlides(host);
    lastKey = key;
  }

  window.HeroDesign = { apply: apply, go: go };
})();
