/* admin-studio.js — استوديو التصميم: واجهة مولَّدة من look-registry.js + معاينة حية بإطار + نشر آمن عبر الووركر
   (دوال عامة بتصريح function ليراها فاحص المشروع، وكل المتغيرات الداخلية بالبادئة stu لتجنب التعارض) */
const STU_R = window.LookRegistry;
const STU_DEV_W = { mobile: 390, tablet: 820, laptop: 1280 };
let stuLook = STU_R ? STU_R.normalizeLook({}) : {};
let stuSaved = STU_R ? STU_R.normalizeLook({}) : {};
let stuDevice = 'mobile', stuBuilt = false, stuFrameLoaded = false;

function stuEl(id) { return document.getElementById(id); }
function stuPid() { return (typeof currentPharmacyId !== 'undefined' && currentPharmacyId) || (typeof getActivePharmacyId === 'function' ? getActivePharmacyId() : ''); }
function stuColors() { return (typeof readThemeInputs === 'function') ? readThemeInputs() : {}; }
function stuSame(a, b) { return Object.keys(STU_R.DEFAULTS).every(function (k) { return a[k] === b[k]; }); }
function stuEsc(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }

function stuMarkDirty() {
  const d = stuEl('studioDirty'); if (!d) return;
  const c = stuColors(), pp = (typeof pharmacyProfile !== 'undefined') ? pharmacyProfile : {};
  const colorsChanged = ['primaryColor', 'pageBgColor', 'cardColor', 'secondaryColor', 'textColor'].some(function (k) { return (c[k] || '') !== (pp[k] || ''); });
  d.style.display = (!stuSame(stuLook, stuSaved) || colorsChanged) ? 'inline-block' : 'none';
}

// تُستدعى أيضاً من admin-page.js كلما تغيّر لون
function studioPush() {
  if (!STU_R) return;
  const f = stuEl('studioFrame');
  if (f && f.contentWindow && stuFrameLoaded) {
    try { f.contentWindow.postMessage({ type: 'look-preview', look: stuLook, colors: stuColors() }, location.origin); } catch (e) { /* غير حرج */ }
  }
  stuMarkDirty();
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
  const host = stuEl('studioColorsHost'), panel = document.querySelector('.tc-panel');
  if (host && panel && panel.parentNode !== host) host.appendChild(panel);
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
  if (typeof loadThemeColorInputs === 'function') loadThemeColorInputs(pp);
  stuRefreshChips(); studioPush();
}

function studioResetDefaults() {
  if (!confirm('إرجاع كل خيارات الشكل (بدون الألوان) إلى الإعدادات الافتراضية؟')) return;
  stuLook = STU_R.normalizeLook({}); stuRefreshChips(); studioPush();
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
      body: JSON.stringify({ look: stuLook, colors: stuColors() })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) throw new Error(data.message || 'تعذر النشر');
    stuSaved = STU_R.normalizeLook(data.look || stuLook);
    pharmacyProfile = Object.assign({}, pharmacyProfile, data.colors || {}, { look: stuSaved });
    if (typeof saveLocalState === 'function') saveLocalState();
    stuMarkDirty();
    showToast('🚀 تم نشر التصميم، يظهر لزبائنك خلال لحظات');
  } catch (err) {
    showToast('⚠️ ' + (err.message || 'تعذر النشر'));
  } finally {
    btn.disabled = false; btn.textContent = '🚀 نشر التصميم';
  }
}
