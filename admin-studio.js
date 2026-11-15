/* admin-studio.js — استوديو التصميم: واجهة مولَّدة من look-registry.js + معاينة حية بإطار + نشر آمن عبر الووركر
   (دوال عامة بتصريح function ليراها فاحص المشروع، وكل المتغيرات الداخلية بالبادئة stu لتجنب التعارض) */
const STU_R = window.LookRegistry;
const STU_DEV_W = { mobile: 390, tablet: 820, laptop: 1280 };
let stuLook = STU_R ? STU_R.normalizeLook({}) : {};
let stuSaved = STU_R ? STU_R.normalizeLook({}) : {};
let stuDevice = 'mobile', stuBuilt = false, stuFrameLoaded = false;
// كتل الرئيسية والنصوص والمواسم (تُحفظ مع التصميم). stuBlocksTouched: لا نرسل homeBlocks للنشر إلا إن لمستها المالكة أو كانت محفوظة أصلاً،
// فتبقى الصيدلية على ترتيب قالبها القديم حتى تقرر التغيير.
let stuBlocks = STU_R ? STU_R.defaultHomeBlocks() : [], stuSavedBlocks = JSON.stringify(stuBlocks), stuBlocksTouched = false, stuBlocksSaved = false;
let stuCopy = STU_R ? STU_R.normalizeCopy({}) : {}, stuSavedCopy = JSON.stringify(stuCopy);
let stuSeasons = [], stuSavedSeasons = '[]';
let stuOpenBlock = '';

function stuEl(id) { return document.getElementById(id); }
function stuPid() { return (typeof currentPharmacyId !== 'undefined' && currentPharmacyId) || (typeof getActivePharmacyId === 'function' ? getActivePharmacyId() : ''); }
function stuColors() { return (typeof readThemeInputs === 'function') ? readThemeInputs() : {}; }
function stuSame(a, b) { return Object.keys(STU_R.DEFAULTS).every(function (k) { return a[k] === b[k]; }); }
function stuEsc(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }

function stuMarkDirty() {
  const d = stuEl('studioDirty'); if (!d) return;
  const c = stuColors(), pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {};
  const colorsChanged = ['primaryColor', 'pageBgColor', 'cardColor', 'secondaryColor', 'textColor'].some(function (k) { return (c[k] || '') !== (pp[k] || ''); });
  const extra = (stuBlocksTouched && JSON.stringify(stuBlocks) !== stuSavedBlocks) || JSON.stringify(stuCopy) !== stuSavedCopy || JSON.stringify(stuSeasons) !== stuSavedSeasons;
  d.style.display = (!stuSame(stuLook, stuSaved) || colorsChanged || extra) ? 'inline-block' : 'none';
}

// تُستدعى أيضاً من admin-page.js كلما تغيّر لون
function studioPush() {
  if (!STU_R) return;
  const f = stuEl('studioFrame');
  if (f && f.contentWindow && stuFrameLoaded) {
    try {
      const msg = { type: 'look-preview', look: stuLook, colors: stuColors(), copy: stuCopy, seasons: stuSeasons };
      if (stuBlocksTouched || stuBlocksSaved) msg.homeBlocks = stuBlocks;
      f.contentWindow.postMessage(msg, location.origin);
    } catch (e) { /* غير حرج */ }
  }
  stuMarkDirty();
  stuRenderHealth();
}

function stuFit() {
  const wrap = stuEl('studioFrameWrap'), f = stuEl('studioFrame');
  if (!wrap || !f || !wrap.clientWidth) return;
  const D = STU_DEV_W[stuDevice], W = wrap.clientWidth, H = wrap.clientHeight;
  const scale = Math.min(1, W / D);
  f.style.width = D + 'px';
  f.style.height = Math.ceil(H / scale) + 'px';
  f.style.transform = 'scale(' + scale + ')';
  f.style.left = Math.max(0, (W - D * scale) / 2) + 'px';
}

function stuRenderOptions() {
  const host = stuEl('studioControls');
  host.querySelectorAll('.st-group[data-gid]').forEach(function (n) { n.remove(); });
  STU_R.GROUPS.forEach(function (g) {
    const box = document.createElement('div');
    box.className = 'st-group closed'; box.setAttribute('data-gid', g.id);
    const opts = g.options.map(function (o) {
      const chips = o.values.map(function (v) {
        return '<button type="button" class="st-chip' + (stuLook[o.key] === v.v ? ' on' : '') + '" data-k="' + stuEsc(o.key) + '" data-v="' + stuEsc(v.v) + '">' + stuEsc(v.l) + (v.d ? '<small>' + stuEsc(v.d) + '</small>' : '') + '</button>';
      }).join('');
      return '<div class="st-opt"><div class="st-opt-label">' + stuEsc(o.label) + '</div><div class="st-chips">' + chips + '</div></div>';
    }).join('');
    box.innerHTML = '<div class="st-group-head"><span>' + g.icon + '</span><b>' + stuEsc(g.title) + '</b></div><div class="st-group-body">' + opts + '</div>';
    host.appendChild(box);
  });
}

function stuRefreshChips() {
  document.querySelectorAll('#studioControls .st-chip').forEach(function (b) {
    b.classList.toggle('on', stuLook[b.getAttribute('data-k')] === b.getAttribute('data-v'));
  });
}

function stuBuild() {
  stuRenderOptions();
  stuRenderExtras();
  const host = stuEl('studioColorsHost'), panel = document.querySelector('.tc-panel');
  if (host && panel && panel.parentNode !== host) host.appendChild(panel);
  stuEl('studioControls').addEventListener('click', stuExtrasClick);
  stuEl('studioControls').addEventListener('input', stuExtrasInput);
  stuEl('studioControls').addEventListener('change', stuExtrasInput);
  stuEl('studioControls').addEventListener('click', function (e) {
    const head = e.target.closest('.st-group-head');
    if (head) { head.parentNode.classList.toggle('closed'); return; }
    const chip = e.target.closest('.st-chip');
    if (!chip) return;
    stuLook[chip.getAttribute('data-k')] = chip.getAttribute('data-v');
    stuRefreshChips(); studioPush();
  });
  stuEl('studioDevices').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-dev]'); if (!b) return;
    stuDevice = b.getAttribute('data-dev');
    document.querySelectorAll('#studioDevices button').forEach(function (x) { x.classList.toggle('on', x === b); });
    stuFit();
  });
  window.addEventListener('resize', stuFit);
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'look-preview-ready') return;
    stuFrameLoaded = true; stuFit(); studioPush();
  });
  stuBuilt = true;
}

function studioOpen() {
  if (!STU_R) return;
  if (!stuBuilt) stuBuild();
  const pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {};
  stuSaved = STU_R.normalizeLook(pp.look);
  stuLook = Object.assign({}, stuSaved);
  stuBlocksSaved = Array.isArray(pp.homeBlocks);
  stuBlocks = stuBlocksSaved ? STU_R.normalizeHomeBlocks(pp.homeBlocks) : STU_R.migrateFromTemplate(pp).homeBlocks;
  stuSavedBlocks = JSON.stringify(stuBlocks); stuBlocksTouched = false;
  stuCopy = STU_R.normalizeCopy(pp.copy); stuSavedCopy = JSON.stringify(stuCopy);
  stuSeasons = STU_R.normalizeSeasons(pp.seasons); stuSavedSeasons = JSON.stringify(stuSeasons);
  stuRenderExtras();
  if (typeof loadThemeColorInputs === 'function') loadThemeColorInputs(pp);
  stuRefreshChips();
  const f = stuEl('studioFrame'), id = stuPid();
  if (f && id && !f.getAttribute('src')) {
    f.setAttribute('src', 'index.html?pharmacy=' + encodeURIComponent(id) + '&lookPreview=1');
    f.addEventListener('load', function () { setTimeout(function () { stuFrameLoaded = true; stuFit(); studioPush(); }, 600); });
  } else { stuFit(); studioPush(); }
  setTimeout(stuFit, 80);
}

function studioRevert() {
  const pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {};
  stuLook = Object.assign({}, stuSaved);
  stuBlocks = JSON.parse(stuSavedBlocks); stuBlocksTouched = false;
  stuCopy = JSON.parse(stuSavedCopy); stuSeasons = JSON.parse(stuSavedSeasons);
  if (typeof loadThemeColorInputs === 'function') loadThemeColorInputs(pp);
  stuRenderExtras(); stuRefreshChips(); studioPush();
}

function studioResetDefaults() {
  if (!confirm('إرجاع كل خيارات الشكل (بدون الألوان) إلى الإعدادات الافتراضية؟')) return;
  stuLook = STU_R.normalizeLook({}); stuRefreshChips(); studioPush();
  // (ترتيب الرئيسية والنصوص والمواسم لا تُصفَّر هنا؛ لها أزرارها الخاصة)
}

async function studioPublish() {
  const btn = stuEl('studioPublishBtn');
  try {
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!user) { showToast('⚠️ سجّلي الدخول أولاً'); return; }
    btn.disabled = true; btn.textContent = '⏳ جارٍ النشر…';
    const token = await user.getIdToken();
    const res = await fetch(WORKER_API_BASE + '/api/admin/look/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': stuPid(), 'Authorization': 'Bearer ' + token },
      body: JSON.stringify((function () {
        const b = { look: stuLook, colors: stuColors(), copy: stuCopy, seasons: stuSeasons };
        if (stuBlocksTouched || stuBlocksSaved) b.homeBlocks = stuBlocks;
        return b;
      })())
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) throw new Error(data.message || 'تعذر النشر');
    stuSaved = STU_R.normalizeLook(data.look || stuLook);
    pharmacyProfile = Object.assign({}, pharmacyProfile, data.colors || {}, { look: stuSaved });
    if (data.homeBlocks) { pharmacyProfile.homeBlocks = data.homeBlocks; stuBlocksSaved = true; stuBlocks = STU_R.normalizeHomeBlocks(data.homeBlocks); stuSavedBlocks = JSON.stringify(stuBlocks); stuBlocksTouched = false; }
    if (data.copy) { pharmacyProfile.copy = data.copy; stuCopy = STU_R.normalizeCopy(data.copy); stuSavedCopy = JSON.stringify(stuCopy); }
    if (data.seasons) { pharmacyProfile.seasons = data.seasons; stuSeasons = STU_R.normalizeSeasons(data.seasons); stuSavedSeasons = JSON.stringify(stuSeasons); }
    stuRenderExtras();
    if (typeof saveLocalState === 'function') saveLocalState();
    stuMarkDirty();
    showToast('🚀 تم نشر التصميم، يظهر لزبائنك خلال لحظات');
  } catch (err) {
    showToast('⚠️ ' + (err.message || 'تعذر النشر'));
  } finally {
    btn.disabled = false; btn.textContent = '🚀 نشر التصميم';
  }
}


// ================= كتل الرئيسية / النصوص / المواسم / صحة التصميم =================
const STU_STYLE_LABELS = { grid: 'شبكة', slider: 'شريط أفقي', side: 'صورة بجانب النص', center: 'بالمنتصف', card: 'بطاقة', bar: 'شريط ممتد', simple: 'بسيط', columns: 'أعمدة' };
const STU_LINK_LABELS = { categories: 'الأقسام', bundles: 'البكجات', offers: 'العروض', orders: 'طلباتي', account: 'حسابي', cart: 'السلة' };
const STU_SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', whatsapp: 'WhatsApp (wa.me)', telegram: 'Telegram (t.me)' };

function stuTouchBlocks() { stuBlocksTouched = true; }

function stuBlockFieldsHtml(b, i) {
  const def = STU_R.BLOCK_DEFS[b.id], f = def.fields, L = STU_R.LIMITS;
  let h = '';
  if (def.styles.length) h += '<label class="st-f">نمط العرض<select data-act="bstyle" data-i="' + i + '">' + def.styles.map(function (v) { return '<option value="' + v + '"' + (b.style === v ? ' selected' : '') + '>' + stuEsc(STU_STYLE_LABELS[v] || v) + '</option>'; }).join('') + '</select></label>';
  if (f.indexOf('title') !== -1) h += '<label class="st-f">العنوان (اتركيه فارغاً للافتراضي)<input type="text" maxlength="' + L.title + '" data-act="btitle" data-i="' + i + '" value="' + stuEsc(b.title || '') + '"></label>';
  if (f.indexOf('subtitle') !== -1) h += '<label class="st-f">العنوان الفرعي<input type="text" maxlength="' + L.subtitle + '" data-act="bsub" data-i="' + i + '" value="' + stuEsc(b.subtitle || '') + '"></label>';
  if (f.indexOf('text') !== -1) h += '<label class="st-f">النص (حتى ' + L.text + ' حرفاً)<textarea rows="4" maxlength="' + L.text + '" data-act="btext" data-i="' + i + '">' + stuEsc(b.text || '') + '</textarea></label>';
  if (f.indexOf('image') !== -1) h += '<label class="st-f">رابط صورة مرفوعة من متجركِ (من قسم رفع الصور فقط)<input type="url" dir="ltr" maxlength="' + L.imageUrl + '" data-act="bimage" data-i="' + i + '" value="' + stuEsc(b.image || '') + '" placeholder="https://.../api/images/pharmacy_..."></label>';
  if (f.indexOf('endAt') !== -1) h += '<label class="st-f">ينتهي العرض (بتوقيت العراق)<input type="datetime-local" data-act="bend" data-i="' + i + '" value="' + stuEsc(b.endAt || '') + '"></label>';
  if (f.indexOf('items') !== -1) h += '<div class="st-f">نصوص المميزات (يمكن تعديلها، ولا تكتبي ادعاءً غير صحيح)' + b.items.map(function (it, k) { return '<div class="st-row2"><input type="text" maxlength="' + L.itemT + '" data-act="bitem-t" data-i="' + i + '" data-k="' + k + '" value="' + stuEsc(it.t) + '"><input type="text" maxlength="' + L.itemS + '" data-act="bitem-s" data-i="' + i + '" data-k="' + k + '" value="' + stuEsc(it.s) + '"></div>'; }).join('') + '</div>';
  if (f.indexOf('links') !== -1) h += '<div class="st-f">روابط سريعة<div class="st-checks">' + STU_R.FOOTER_LINKS.map(function (k) { return '<label><input type="checkbox" data-act="blink" data-i="' + i + '" data-k="' + k + '"' + (b.links.indexOf(k) !== -1 ? ' checked' : '') + '> ' + STU_LINK_LABELS[k] + '</label>'; }).join('') + '</div></div>';
  if (f.indexOf('social') !== -1) h += '<div class="st-f">حسابات التواصل (https فقط، من المواقع المعروفة)' + Object.keys(STU_R.SOCIAL_HOSTS).map(function (k) { return '<input type="url" dir="ltr" maxlength="300" placeholder="' + stuEsc(STU_SOCIAL_LABELS[k]) + '" data-act="bsocial" data-i="' + i + '" data-k="' + k + '" value="' + stuEsc((b.social && b.social[k]) || '') + '">'; }).join('') + '</div>';
  return h;
}

function stuBlocksHtml() {
  return '<div class="st-note-s">فعّلي الأقسام التي تريدينها ورتّبيها بالأسهم. الكتل المطفأة لا تظهر لزبائنك.</div>' +
    '<button type="button" class="st-mini" data-act="import-tpl">↻ ابدئي من شكل قالبكِ الحالي</button>' +
    stuBlocks.map(function (b, i) {
      const def = STU_R.BLOCK_DEFS[b.id], open = stuOpenBlock === b.id, hasFields = def.styles.length || def.fields.length;
      return '<div class="st-blk' + (b.on ? '' : ' off') + '"><div class="st-blk-head">' +
        '<label class="st-sw"><input type="checkbox" data-act="bon" data-i="' + i + '"' + (b.on ? ' checked' : '') + '><span></span></label>' +
        '<b class="st-blk-name">' + stuEsc(def.label) + '</b>' +
        '<span class="st-blk-btns"><button type="button" class="st-mini" data-act="bup" data-i="' + i + '" aria-label="أعلى"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="st-mini" data-act="bdown" data-i="' + i + '" aria-label="أسفل"' + (i === stuBlocks.length - 1 ? ' disabled' : '') + '>▼</button>' +
        (hasFields ? '<button type="button" class="st-mini" data-act="bopen" data-id="' + b.id + '">' + (open ? 'إغلاق' : 'تعديل') + '</button>' : '') + '</span></div>' +
        (open && hasFields ? '<div class="st-blk-body">' + stuBlockFieldsHtml(b, i) + '</div>' : '') + '</div>';
    }).join('');
}

function stuCopyHtml() {
  let h = '<label class="st-f">صيغة المخاطبة<select data-act="cvoice">' + [['f', 'مؤنث (الحالي: تواصلي، اكتشفي)'], ['n', 'محايد'], ['m', 'مذكر']].map(function (v) { return '<option value="' + v[0] + '"' + (stuCopy.voice === v[0] ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select></label>';
  Object.keys(STU_R.COPY_DEFS).forEach(function (k) {
    const d = STU_R.COPY_DEFS[k];
    h += '<label class="st-f">' + stuEsc(d.label) + '<input type="text" maxlength="' + STU_R.LIMITS.copy + '" data-act="ctext" data-k="' + k + '" placeholder="' + stuEsc(STU_R.copyText({ voice: stuCopy.voice }, k)) + '" value="' + stuEsc(stuCopy[k] || '') + '"></label>';
  });
  return h + '<button type="button" class="st-mini" data-act="creset">إرجاع كل النصوص للافتراضي</button>';
}

function stuSeasonsHtml() {
  const P = STU_R.SEASON_PRESETS;
  return '<div class="st-note-s">اختاري مناسبة وفترتها؛ يتغيّر لون المتجر وزخرفته وشريط الترحيب خلال الفترة فقط ثم يعود تصميمكِ الأصلي تلقائياً (بتوقيت العراق).</div>' +
    stuSeasons.map(function (s, i) {
      return '<div class="st-row3"><select data-act="spreset" data-i="' + i + '">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (s.preset === k ? ' selected' : '') + '>' + stuEsc(P[k].label) + '</option>'; }).join('') + '</select>' +
        '<input type="date" data-act="sfrom" data-i="' + i + '" value="' + s.from + '"><input type="date" data-act="sto" data-i="' + i + '" value="' + s.to + '">' +
        '<label class="st-sw"><input type="checkbox" data-act="son" data-i="' + i + '"' + (s.on ? ' checked' : '') + '><span></span></label>' +
        '<button type="button" class="st-mini" data-act="sdel" data-i="' + i + '" aria-label="حذف">✕</button></div>';
    }).join('') +
    (stuSeasons.length < STU_R.LIMITS.seasons ? '<button type="button" class="st-mini" data-act="sadd">+ إضافة موسم</button>' : '');
}

function stuGroup(id, icon, title, inner, closed) {
  return '<div class="st-group' + (closed === false ? '' : ' closed') + '" data-gid="' + id + '"><div class="st-group-head"><span>' + icon + '</span><b>' + title + '</b></div><div class="st-group-body" id="stuBody-' + id + '">' + inner + '</div></div>';
}

function stuRenderExtras() {
  const host = stuEl('studioControls'); if (!host || !STU_R) return;
  const keepOpen = {};
  host.querySelectorAll('.st-group[data-gid^="x-"]').forEach(function (n) { keepOpen[n.getAttribute('data-gid')] = !n.classList.contains('closed'); n.remove(); });
  const html = stuGroup('x-blocks', '🧱', 'ترتيب أقسام الرئيسية', stuBlocksHtml(), keepOpen['x-blocks'] ? false : true) +
    stuGroup('x-copy', '✍️', 'النصوص وصيغة المخاطبة', stuCopyHtml(), keepOpen['x-copy'] ? false : true) +
    stuGroup('x-seasons', '🌙', 'المواسم والمناسبات', stuSeasonsHtml(), keepOpen['x-seasons'] ? false : true) +
    stuGroup('x-health', '✅', 'درجة صحة التصميم', '<div id="stuHealth"></div>', keepOpen['x-health'] ? false : true);
  host.insertAdjacentHTML('beforeend', html);
  stuRenderHealth();
}

function stuExtrasClick(e) {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
  const act = el.getAttribute('data-act'), i = +el.getAttribute('data-i');
  if (act === 'bup' && i > 0) { stuBlocks.splice(i - 1, 0, stuBlocks.splice(i, 1)[0]); stuTouchBlocks(); }
  else if (act === 'bdown' && i < stuBlocks.length - 1) { stuBlocks.splice(i + 1, 0, stuBlocks.splice(i, 1)[0]); stuTouchBlocks(); }
  else if (act === 'bopen') { const id = el.getAttribute('data-id'); stuOpenBlock = stuOpenBlock === id ? '' : id; }
  else if (act === 'import-tpl') {
    const pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {}, m = STU_R.migrateFromTemplate(pp);
    if (!confirm('سيُطبَّق على المعاينة ترتيب وشكل قريب من قالبكِ الحالي (لا يُنشر شيء قبل زر النشر). متابعة؟')) return;
    stuBlocks = m.homeBlocks; stuTouchBlocks(); stuLook = Object.assign({}, m.look);
    if (m.colors.primaryColor && stuEl('adminThemePrimary')) { /* لون القالب يُترك للوحة الألوان */ }
    stuRefreshChips();
  }
  else if (act === 'creset') { stuCopy = STU_R.normalizeCopy({}); }
  else if (act === 'sadd') { const d = new Date(Date.now() + 3 * 3600e3), a = d.toISOString().slice(0, 10), b = new Date(d.getTime() + 7 * 864e5).toISOString().slice(0, 10); stuSeasons.push({ preset: 'ramadan', from: a, to: b, on: true }); }
  else if (act === 'sdel') { stuSeasons.splice(i, 1); }
  else return;
  stuRenderExtras(); studioPush();
}

function stuExtrasInput(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.getAttribute('data-act'), i = +el.getAttribute('data-i'), k = el.getAttribute('data-k'), v = el.type === 'checkbox' ? el.checked : el.value;
  const b = stuBlocks[i];
  let rerender = false;
  switch (act) {
    case 'bon': b.on = v; stuTouchBlocks(); rerender = true; break;
    case 'bstyle': b.style = v; stuTouchBlocks(); break;
    case 'btitle': b.title = v; stuTouchBlocks(); break;
    case 'bsub': b.subtitle = v; stuTouchBlocks(); break;
    case 'btext': b.text = v; stuTouchBlocks(); break;
    case 'bimage': b.image = v; stuTouchBlocks(); break;
    case 'bend': b.endAt = v; stuTouchBlocks(); break;
    case 'bitem-t': b.items[+k].t = v; stuTouchBlocks(); break;
    case 'bitem-s': b.items[+k].s = v; stuTouchBlocks(); break;
    case 'blink': b.links = v ? b.links.concat(k).filter(function (x, n, a) { return a.indexOf(x) === n; }) : b.links.filter(function (x) { return x !== k; }); stuTouchBlocks(); break;
    case 'bsocial': b.social = Object.assign({}, b.social); if (v) b.social[k] = v; else delete b.social[k]; stuTouchBlocks(); break;
    case 'cvoice': stuCopy.voice = v; rerender = true; break;
    case 'ctext': if (v) stuCopy[k] = v; else delete stuCopy[k]; break;
    case 'spreset': stuSeasons[i].preset = v; break;
    case 'sfrom': stuSeasons[i].from = v; break;
    case 'sto': stuSeasons[i].to = v; break;
    case 'son': stuSeasons[i].on = v; break;
    default: return;
  }
  if (rerender) stuRenderExtras();
  studioPush();
}

// ---------- درجة صحة التصميم (غير مانعة) ----------
function stuHex(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function stuLum(c) { const a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function stuContrast(h1, h2) { const a = stuHex(h1), b = stuHex(h2); if (!a || !b) return null; const l1 = stuLum(a), l2 = stuLum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

function stuComputeHealth() {
  const items = [], c = stuColors(), pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {};
  const primary = c.primaryColor || pp.primaryColor || '#E85D8A';
  const on = stuBlocks.filter(function (b) { return b.on; });
  let score = 100;
  function add(level, text, fix, cost) { items.push({ level: level, text: text, fix: fix }); score -= cost || 0; }

  const cBtn = stuContrast('#FFFFFF', primary);
  if (cBtn !== null) {
    if (cBtn < 3) add('bad', 'نص الأزرار الأبيض على لونكِ الأساسي ضعيف التباين (' + cBtn.toFixed(1) + ':1)', 'اختاري لوناً أغمق قليلاً للّون الأساسي.', 18);
    else if (cBtn < 4.5) add('warn', 'تباين نص الأزرار مقبول للعناوين فقط (' + cBtn.toFixed(1) + ':1)', 'غمّقي اللون الأساسي قليلاً ليبلغ 4.5:1 (معيار AA).', 7);
    else add('ok', 'تباين الأزرار ممتاز (' + cBtn.toFixed(1) + ':1)', '', 0);
  }
  if (c.textColor && c.pageBgColor) {
    const ct = stuContrast(c.textColor, c.pageBgColor);
    if (ct !== null && ct < 4.5) add(ct < 3 ? 'bad' : 'warn', 'تباين لون النص على خلفية الصفحة ' + ct.toFixed(1) + ':1 (المطلوب 4.5:1)', 'قرّبي لون النص من الأسود أو الخلفية من الأبيض.', ct < 3 ? 18 : 9);
    else if (ct !== null) add('ok', 'تباين النص على الخلفية جيد (' + ct.toFixed(1) + ':1)', '', 0);
  }
  if (stuLook.density === 'compact' && stuLook.font_size === 's') add('warn', 'الكثافة المضغوطة مع الخط الصغير تُصعّب القراءة واللمس', 'اختاري خطاً متوسطاً أو كثافة عادية. (أزرار المتجر تبقى بحجم لمس 44px على الأقل).', 8);
  else add('ok', 'أهداف اللمس والقراءة ضمن الحدود المريحة', '', 0);

  const fonts = {}; fonts[stuLook.font_body] = 1; if (stuLook.font_head !== 'same') fonts[stuLook.font_head] = 1;
  const extra = Object.keys(fonts).filter(function (f) { return f !== 'cairo'; }).length;
  if (extra >= 2) add('warn', 'تُحمَّل ' + extra + ' خطوط خارجية (يبطئ أول ظهور)', 'استخدمي خطاً واحداً للنصوص وللعناوين نفس الخط.', 6);
  else add('ok', extra ? 'يُحمَّل خط خارجي واحد فقط' : 'لا خطوط خارجية (أسرع تحميل)', '', 0);

  const heavy = (stuLook.motion === 'full' ? 1 : 0) + (stuLook.bg_deco !== 'none' ? 1 : 0) + (stuLook.hero_size === 'immersive' ? 1 : 0);
  if (heavy >= 3) add('warn', 'حركة وزخرفة وبنر غامر معاً قد تُثقل الأجهزة الضعيفة', 'اجعلي الحركة «هادئة» أو أزيلي الزخرفة.', 6);
  else add('ok', 'ثقل الحركة معتدل', '', 0);

  if (on.length > 9) add('warn', 'عدد الأقسام الظاهرة بالرئيسية (' + on.length + ') كبير والزائر قد يتشتت', 'أطفئي ما لا تحتاجينه (يُنصح بـ 6–8).', 6);
  const offers = stuBlocks.filter(function (b) { return b.id === 'offers' && b.on; })[0];
  if (offers && !offers.endAt) add('warn', 'كتلة العروض بلا موعد انتهاء فلن يظهر عدّاد', 'حدّدي تاريخ ووقت انتهاء العرض.', 3);
  const story = stuBlocks.filter(function (b) { return b.id === 'story' && b.on; })[0];
  if (story && !story.text) add('warn', 'كتلة «قصة الصيدلية» مفعّلة بلا نص فلن تظهر', 'اكتبي نصاً قصيراً أو أطفئيها.', 3);
  const ov = stuSeasons.filter(function (s, i) { return s.on && stuSeasons.some(function (o, j) { return j !== i && o.on && s.from <= o.to && o.from <= s.to; }); });
  if (ov.length) add('warn', 'مواسم متداخلة بالتواريخ (يُطبَّق الأول فقط)', 'اجعلي فترات المواسم منفصلة.', 3);
  return { score: Math.max(0, Math.min(100, score)), items: items };
}

function stuRenderHealth() {
  const el = stuEl('stuHealth'); if (!el || !STU_R) return;
  const h = stuComputeHealth(), cls = h.score >= 85 ? 'good' : (h.score >= 65 ? 'mid' : 'low');
  el.innerHTML = '<div class="st-score ' + cls + '"><b>' + h.score + '</b><span>/ 100</span></div>' +
    h.items.map(function (it) { return '<div class="st-hi ' + it.level + '"><span>' + (it.level === 'ok' ? '✔' : '⚠') + '</span><div>' + stuEsc(it.text) + (it.fix ? '<small>' + stuEsc(it.fix) + '</small>' : '') + '</div></div>'; }).join('') +
    '<div class="st-note-s">المؤشر استرشادي ولا يمنع النشر.</div>';
}
