/* ==========================================================
   template-engine.js — محرك القوالب (المرحلة 1)
   • يقرأ templates/registry.json، ويحمّل سكربت قالب هذه الصيدلية فقط (لا غيره)، ويتحقق منه بعقد template-contract.js.
   • أي فشل (ملف مفقود/عقد ناقص/خطأ) → يستخدم القالب الافتراضي المدمج مع تسجيل الخطأ بـconsole وlocalStorage.
   • يطبّق حقل design (ألوان/خطوط/أشكال/ترتيب الرئيسية/ميزات) بعد التحقق من كل قيمة بقوائم مسموحة (لا CSS حر).
   • وضع المعاينة: داخل إطار السوبر أدمن (?__tplpreview=1) يستقبل design عبر postMessage ويطبّقه فوراً دون حفظ.
   لا قراءات Firestore إضافية: design جزء من مستند الصيدلية الذي يصل أصلاً داخل لقطة المتجر /api/storefront.
   ========================================================== */
(function (root) {
  var ENGINE_VERSION = '1';
  var CONTRACT = root.TemplateContract;
  var validate = root.validateTemplate;
  var registryPromise = null;
  var scriptPromises = {};
  var activeEntryId = null;
  var lastProfile = null;
  var lastHelpers = null;
  var lastTemplate = null;
  var previewDesign = null; // بوضع المعاينة: التصميم المؤقت الأخير (يتفوق على المحفوظ حتى لو وصلت بيانات المتجر بعده)

  root.PharmacyTemplates = root.PharmacyTemplates || {};

  // قالب احتياطي مدمج: كل دواله ترجع null ⇒ الرسم المدمج (تصميم classic الحالي). يضمن ألا يكون activeThemeModule فارغاً أبداً.
  var BUILTIN_FALLBACK = {
    id: 'classic', name: 'Classic', version: 'builtin', tokens: {}, homeSections: CONTRACT ? CONTRACT.homeSectionIds.slice() : [],
    applyStyles: function () {}, renderHeader: function () { return null; }, renderProductCard: function () { return null; },
    renderCategoryCard: function () { return null; }, renderBundleCard: function () { return null; },
    renderProductPage: function () { return null; }, renderFooter: function () { return null; }
  };
  var FALLBACK_REGISTRY = {
    default: 'classic',
    templates: [{ id: 'classic', name: 'Classic', script: 'classic', dataTemplate: 'template_default', aliases: ['template_default', 'default'] }]
  };

  function reportError(where, err) {
    var msg = (err && err.message) ? err.message : String(err);
    console.error('[Theme Engine] ' + where + ':', err);
    try { localStorage.setItem('saas_template_error', JSON.stringify({ where: where, message: msg, at: new Date().toISOString() })); } catch (e) { /* غير حرج */ }
  }

  function loadRegistry() {
    if (!registryPromise) {
      registryPromise = fetch('templates/registry.json?v=' + ENGINE_VERSION)
        .then(function (r) { if (!r.ok) throw new Error('registry HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (!j || !Array.isArray(j.templates) || !j.templates.length) throw new Error('registry فارغ'); return j; })
        .catch(function (e) { reportError('تعذر قراءة registry.json (نستخدم الافتراضي)', e); return FALLBACK_REGISTRY; });
    }
    return registryPromise;
  }

  function findEntry(registry, key) {
    var k = String(key || '').toLowerCase().trim();
    var list = registry.templates;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === k || (list[i].aliases || []).indexOf(k) !== -1) return list[i];
    }
    return null;
  }

  function resolveEntry(registry, profile, overrideKey) {
    var design = profile && profile.design && typeof profile.design === 'object' ? profile.design : {};
    var entry = findEntry(registry, overrideKey) || findEntry(registry, design.template) || findEntry(registry, profile && profile.templateId) || findEntry(registry, registry.default);
    return entry || registry.templates[0];
  }

  function loadScriptOnce(name) {
    if (root.PharmacyTemplates[name]) return Promise.resolve();
    if (!scriptPromises[name]) {
      scriptPromises[name] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'templates/' + encodeURIComponent(name) + '.js?v=' + ENGINE_VERSION;
        s.async = true;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('تعذر تحميل templates/' + name + '.js')); };
        document.head.appendChild(s);
      });
    }
    return scriptPromises[name];
  }

  // ملف CSS الخاص بالقالب (registry: css). يُنتظر تحميله (حتى 2.5 ثانية) كي لا يظهر المتجر بتصميم آخر لحظياً؛ أي فشل لا يمنع المتجر.
  function applyTemplateCss(entry) {
    var el = document.getElementById('tpl-template-css');
    if (!entry.css) { if (el && el.parentNode) el.parentNode.removeChild(el); return Promise.resolve(); }
    var href = 'templates/' + encodeURIComponent(entry.css) + '?v=' + ENGINE_VERSION;
    if (el && el.getAttribute('href') === href) return Promise.resolve();
    return new Promise(function (resolve) {
      if (!el) { el = document.createElement('link'); el.id = 'tpl-template-css'; el.rel = 'stylesheet'; document.head.appendChild(el); }
      var done = false;
      function finish(err) { if (done) return; done = true; if (err) reportError('تعذر تحميل CSS القالب ' + entry.css, err); resolve(); }
      el.onload = function () { finish(null); };
      el.onerror = function () { finish(new Error('css load error')); };
      setTimeout(function () { finish(new Error('css timeout')); }, 2500);
      el.setAttribute('href', href);
    });
  }

  // ---------- تنظيف design: كل قيمة تمر بقائمة مسموحة ----------
  // preferDesignColor=true (وضع المعاينة فقط): لون design يتفوق على لون الصيدلية. بالوضع العادي مصدر اللون الوحيد هو profile.primaryColor
  // (الذي يعدّله مالك الصيدلية من إعداداته ويحفظه السوبر أدمن من شاشة التصميم) كي لا يتعارض مع لون قديم مخزّن داخل design.
  function cleanDesign(profile, entry, template, preferDesignColor) {
    var d = (profile && profile.design && typeof profile.design === 'object') ? profile.design : {};
    var out = { template: entry.id, colors: {}, fonts: {}, shapes: {}, home: { order: [], hidden: [] }, features: {} };

    var hexRe = /^#[0-9a-fA-F]{6}$/;
    var fromDesign = (d.colors && hexRe.test(d.colors.primary || '')) ? d.colors.primary : '';
    var fromProfile = (profile && hexRe.test(profile.primaryColor || '')) ? profile.primaryColor : '';
    var primary = preferDesignColor ? (fromDesign || fromProfile) : (fromProfile || fromDesign);
    if (primary) out.colors.primary = primary;

    ['body', 'heading'].forEach(function (k) {
      var f = d.fonts && d.fonts[k];
      if (f && CONTRACT.fonts[f] && f !== 'cairo') out.fonts[k] = f;
    });

    var r = d.shapes && d.shapes.radius;
    if (r && CONTRACT.radius[r] && r !== 'md') out.shapes.radius = r;

    var ids = CONTRACT.homeSectionIds;
    var base = (template && Array.isArray(template.homeSections) && template.homeSections.length) ? template.homeSections : ids;
    var wanted = (d.home && Array.isArray(d.home.order)) ? d.home.order : [];
    var seen = {};
    wanted.concat(base, ids).forEach(function (id) { if (ids.indexOf(id) !== -1 && !seen[id]) { seen[id] = true; out.home.order.push(id); } });
    ((d.home && Array.isArray(d.home.hidden)) ? d.home.hidden : []).forEach(function (id) { if (ids.indexOf(id) !== -1 && out.home.hidden.indexOf(id) === -1) out.home.hidden.push(id); });

    CONTRACT.featureKeys.forEach(function (k) {
      out.features[k] = !(d.features && d.features[k] === false);
    });
    return out;
  }

  // ---------- التطبيق على الصفحة ----------
  function ensureStyleEl() {
    var el = document.getElementById('tpl-design-style');
    if (!el) { el = document.createElement('style'); el.id = 'tpl-design-style'; document.head.appendChild(el); }
    return el;
  }

  function ensureFontLink(fontKey) {
    var f = CONTRACT.fonts[fontKey];
    if (!f || !f.google) return;
    var id = 'tpl-font-' + fontKey;
    if (document.getElementById(id)) return;
    var l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(l);
  }

  function applyDesign(design) {
    var htmlRoot = document.getElementById('htmlRoot') || document.documentElement;
    var css = [];

    if (design.colors.primary) {
      if (typeof root.applyDynamicThemeColor === 'function') root.applyDynamicThemeColor(design.colors.primary);
      else htmlRoot.style.setProperty('--accent', design.colors.primary);
    }

    var body = design.fonts.body, heading = design.fonts.heading;
    if (body) { ensureFontLink(body); css.push('body{font-family:' + CONTRACT.fonts[body].family + ' !important}'); }
    if (heading) { ensureFontLink(heading); css.push('h1,h2,h3,h4,.section-head h2{font-family:' + CONTRACT.fonts[heading].family + ' !important}'); }

    if (design.shapes.radius) {
      var rv = CONTRACT.radius[design.shapes.radius].value;
      if (rv) css.push('.product-card,.bundle-card,.modern-cat-card,.double-banner-card{border-radius:' + rv + ' !important}');
    }

    if (design.features.bundles === false) css.push("[onclick*=\"showView('bundles')\"]{display:none !important}");
    if (design.features.offers === false) css.push("[onclick*=\"showView('offers')\"]{display:none !important}");
    if (design.features.consult === false) css.push("[onclick*=\"openConsultModal\"]{display:none !important}");

    ensureStyleEl().textContent = css.join('\n');
    applyHomeLayout(design.home);
  }

  // ترتيب/إخفاء أجزاء الرئيسية: لا يلمس شيئاً إن كان الترتيب الافتراضي ولا إخفاء (فلا تغيير ظاهر للزبائن الحاليين)
  function applyHomeLayout(home) {
    var view = document.getElementById('view-home');
    if (!view) return;
    var nodes = {};
    CONTRACT.homeSectionIds.forEach(function (id) { nodes[id] = view.querySelector('[data-home-section="' + id + '"]'); });
    var domOrder = Array.prototype.slice.call(view.children).map(function (n) { return n.getAttribute('data-home-section'); }).filter(Boolean);
    var same = domOrder.length === home.order.length && domOrder.every(function (id, i) { return id === home.order[i]; });
    if (!same) home.order.forEach(function (id) { if (nodes[id]) view.appendChild(nodes[id]); });
    CONTRACT.homeSectionIds.forEach(function (id) {
      if (!nodes[id]) return;
      if (home.hidden.indexOf(id) !== -1) nodes[id].style.display = 'none';
      else if (nodes[id].style.display === 'none') nodes[id].style.display = '';
    });
  }

  function applySlots(template, profile, helpers) {
    var htmlRoot = document.documentElement;
    try {
      var header = template.renderHeader(profile, helpers);
      var hSlot = document.getElementById('tplHeaderSlot');
      // موضع الفتحة: قبل الهيدر (الافتراضي) أو بعده إن كان template.headerSlotPosition === 'after' (مثل شريط أقسام Market الثابت)
      var wantPos = template.headerSlotPosition === 'after' ? 'after' : 'before';
      if (hSlot && hSlot.getAttribute('data-pos') !== wantPos) { if (hSlot.parentNode) hSlot.parentNode.removeChild(hSlot); hSlot = null; }
      if (header) {
        if (!hSlot) {
          hSlot = document.createElement('div'); hSlot.id = 'tplHeaderSlot'; hSlot.setAttribute('data-pos', wantPos);
          var hd = document.querySelector('header');
          if (hd && hd.parentNode) hd.parentNode.insertBefore(hSlot, wantPos === 'after' ? hd.nextSibling : hd);
        }
        if (hSlot) hSlot.innerHTML = header;
        htmlRoot.classList.toggle('tpl-hide-default-header', template.hideDefaultHeader === true);
      } else if (hSlot) { hSlot.innerHTML = ''; htmlRoot.classList.remove('tpl-hide-default-header'); }
    } catch (e) { reportError('renderHeader', e); }
    try {
      var footer = template.renderFooter(profile, helpers);
      var fSlot = document.getElementById('tplFooterSlot');
      if (footer) {
        if (!fSlot) { fSlot = document.createElement('div'); fSlot.id = 'tplFooterSlot'; var main = document.querySelector('main'); if (main && main.parentNode) main.parentNode.insertBefore(fSlot, main.nextSibling); }
        if (fSlot) fSlot.innerHTML = footer;
      } else if (fSlot) { fSlot.innerHTML = ''; }
    } catch (e) { reportError('renderFooter', e); }
    var hideStyle = document.getElementById('tpl-hide-header-style');
    if (!hideStyle) { hideStyle = document.createElement('style'); hideStyle.id = 'tpl-hide-header-style'; hideStyle.textContent = 'html.tpl-hide-default-header body > header{display:none !important}'; document.head.appendChild(hideStyle); }
  }

  // ---------- الواجهة العامة ----------
  // load: يحمّل القالب ويطبّق التصميم. يُستدعى أكثر من مرة (idempotent) ويرجع كائن القالب النشط دائماً.
  function load(profile, opts) {
    opts = opts || {};
    if (previewDesign) { opts.designOverride = opts.designOverride || previewDesign; opts.overrideTemplate = opts.overrideTemplate || previewDesign.template; }
    lastProfile = profile; lastHelpers = opts.helpers || lastHelpers || {};
    return loadRegistry().then(function (registry) {
      var entry = resolveEntry(registry, profile, opts.overrideTemplate);
      return loadScriptOnce(entry.script).then(function () {
        var tpl = root.PharmacyTemplates[entry.script];
        var check = validate(tpl);
        if (!check.ok) throw new Error('القالب «' + entry.id + '» لا يطابق العقد: ' + check.errors.join('، '));
        return { entry: entry, tpl: tpl };
      }).catch(function (err) {
        reportError('فشل تحميل القالب «' + entry.id + '» — نرجع للافتراضي', err);
        var fb = findEntry(registry, registry.default) || registry.templates[0];
        var tpl = root.PharmacyTemplates[fb.script];
        return { entry: fb, tpl: (tpl && validate(tpl).ok) ? tpl : BUILTIN_FALLBACK };
      }).then(function (res) {
        var htmlRoot = document.getElementById('htmlRoot') || document.documentElement;
        htmlRoot.setAttribute('data-template', res.entry.dataTemplate || res.entry.id);
        return applyTemplateCss(res.entry).then(function () { return res; });
      }).then(function (res) {
        var htmlRoot = document.getElementById('htmlRoot') || document.documentElement;
        var design = opts.designOverride ? cleanDesign({ design: opts.designOverride, primaryColor: profile && profile.primaryColor }, res.entry, res.tpl, true) : cleanDesign(profile, res.entry, res.tpl, false);
        applyDesign(design);
        try { res.tpl.applyStyles(profile, design, lastHelpers); } catch (e) { reportError('applyStyles', e); }
        applySlots(res.tpl, profile, lastHelpers);
        activeEntryId = res.entry.id;
        lastTemplate = res.tpl;
        if (typeof root.__setActiveTemplate === 'function') root.__setActiveTemplate(res.tpl);
        return res.tpl;
      });
    });
  }

  // ---------- وضع المعاينة داخل إطار السوبر أدمن ----------
  function startPreviewListener() {
    var inFrame = false;
    try { inFrame = window.self !== window.top && /[?&]__tplpreview=1(&|$)/.test(location.search); } catch (e) { inFrame = false; }
    if (!inFrame) return;
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin) return;
      var m = ev.data;
      if (!m || m.type !== 'tpl-preview' || !m.design || typeof m.design !== 'object') return;
      previewDesign = m.design;
      var tplKey = typeof m.design.template === 'string' ? m.design.template : undefined;
      load(lastProfile || {}, { overrideTemplate: tplKey, designOverride: m.design, helpers: lastHelpers }).then(function () {
        if (typeof root.renderCurrentActiveView === 'function') { try { root.renderCurrentActiveView(); } catch (e) { /* غير حرج */ } }
      }).catch(function (e) { reportError('preview', e); });
    });
    try { window.parent.postMessage({ type: 'tpl-preview-ready' }, location.origin); } catch (e) { /* غير حرج */ }
  }

  // إعادة رسم فتحات الهيدر/الفوتر (تُستدعى بعد تحديث بيانات تعتمد عليها، مثل الأقسام)
  function refreshSlots() { if (lastTemplate && lastProfile) applySlots(lastTemplate, lastProfile, lastHelpers || {}); }

  root.TemplateEngine = { refreshSlots: refreshSlots, load: load, loadRegistry: loadRegistry, cleanDesign: cleanDesign, getActiveId: function () { return activeEntryId; } };
  startPreviewListener();
})(window);
