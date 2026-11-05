/* ==========================================================
   super-admin-templates.js — شاشة اختيار قالب/تصميم المتجر للسوبر أدمن مع معاينة حيّة (المرحلة 1)
   • المعاينة: إطار iframe لنفس المتجر (?__tplpreview=1) يستقبل التصميم عبر postMessage فوراً دون حفظ ودون أي قراءة إضافية.
   • الحفظ: يكتب حقل design بمستند الصيدلية (Firestore، صلاحية السوبر أدمن) ثم يحدّث لقطة المتجر عبر الووركر.
   يعتمد على: db, showToast, escSA (super-admin-core.js) وعلى superApiFetch (super-admin-platform.js) وقت التنفيذ فقط.
   ========================================================== */
let designRegistry = null;
let designSlug = '';
let designDraft = null;
let designPreviewTimer = null;
const DESIGN_SECTION_LABELS = { 'hero': 'البنر الرئيسي', 'promo-cards': 'بطاقتا البكجات والعروض', 'brands': 'أشهر الماركات', 'best-sellers': 'المنتجات والأكثر مبيعاً' };
const DESIGN_FEATURE_LABELS = { bundles: 'البكجات', offers: 'العروض', consult: 'استشارة الصيدلي' };

function designFindEntry(key) {
  const k = String(key || '').toLowerCase().trim();
  return (designRegistry.templates || []).find(t => t.id === k || (t.aliases || []).includes(k)) || null;
}

function designNormalizeDraft(design, data) {
  const d = design && typeof design === 'object' ? design : {};
  const C = window.TemplateContract;
  const entry = designFindEntry(d.template) || designFindEntry(data.templateId) || designFindEntry(designRegistry.default) || designRegistry.templates[0];
  const order = [];
  ((d.home && d.home.order) || []).concat(C.homeSectionIds).forEach(id => { if (C.homeSectionIds.includes(id) && !order.includes(id)) order.push(id); });
  const features = {};
  C.featureKeys.forEach(k => { features[k] = !(d.features && d.features[k] === false); });
  return {
    template: entry.id,
    primary: (d.colors && /^#[0-9a-fA-F]{6}$/.test(d.colors.primary)) ? d.colors.primary : (/^#[0-9a-fA-F]{6}$/.test(data.primaryColor || '') ? data.primaryColor : '#E85D8A'),
    fontBody: (d.fonts && C.fonts[d.fonts.body]) ? d.fonts.body : 'cairo',
    fontHeading: (d.fonts && C.fonts[d.fonts.heading]) ? d.fonts.heading : 'cairo',
    radius: (d.shapes && C.radius[d.shapes.radius]) ? d.shapes.radius : 'md',
    order,
    hidden: ((d.home && d.home.hidden) || []).filter(id => C.homeSectionIds.includes(id)),
    features
  };
}

function designBuild() {
  const x = designDraft;
  return {
    template: x.template,
    colors: { primary: x.primary },
    fonts: { body: x.fontBody, heading: x.fontHeading },
    shapes: { radius: x.radius },
    home: { order: x.order.slice(), hidden: x.hidden.slice() },
    features: { ...x.features }
  };
}

async function openDesignModal(slug) {
  designSlug = slug;
  const modal = document.getElementById('designModal');
  const status = document.getElementById('dsgStatus');
  modal.classList.remove('hidden');
  status.textContent = '⏳ جارٍ التحميل...';
  try {
    const [reg, snap] = await Promise.all([
      fetch('templates/registry.json?v=' + Date.now()).then(r => { if (!r.ok) throw new Error('registry ' + r.status); return r.json(); }),
      db.collection('pharmacies').doc(slug).get()
    ]);
    designRegistry = reg;
    const data = snap.exists ? snap.data() : {};
    designDraft = designNormalizeDraft(data.design, data);
    document.getElementById('dsgTitle').textContent = '🎨 تصميم متجر: ' + (data.name || slug);
    designRenderControls();
    const frame = document.getElementById('dsgPreview');
    frame.src = 'index.html?pharmacy=' + encodeURIComponent(slug) + '&__tplpreview=1';
    status.textContent = 'عدّلي وشاهدي المعاينة، ولن يُطبَّق شيء على المتجر قبل الضغط على حفظ.';
  } catch (err) {
    status.textContent = '❌ تعذر التحميل: ' + err.message;
  }
}

function closeDesignModal() {
  document.getElementById('designModal').classList.add('hidden');
  document.getElementById('dsgPreview').src = 'about:blank';
}

function designRenderControls() {
  const C = window.TemplateContract;
  const x = designDraft;
  document.getElementById('dsgTemplates').innerHTML = designRegistry.templates.map(t => `
    <label class="flex items-start gap-2 p-3 rounded-xl border ${t.id === x.template ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-950'} cursor-pointer">
      <input type="radio" name="dsgTemplate" value="${escSA(t.id)}" ${t.id === x.template ? 'checked' : ''} onchange="designSet('template', this.value)" class="mt-1">
      <span><span class="block text-sm font-bold text-white">${escSA(t.name)}</span><span class="block text-[11px] text-slate-400">${escSA(t.description || '')}</span></span>
    </label>`).join('');
  document.getElementById('dsgPrimary').value = x.primary;
  const fontOpts = Object.keys(C.fonts).map(k => `<option value="${k}">${escSA(C.fonts[k].label)}</option>`).join('');
  const fb = document.getElementById('dsgFontBody'), fh = document.getElementById('dsgFontHeading');
  fb.innerHTML = fontOpts; fh.innerHTML = fontOpts;
  fb.value = x.fontBody; fh.value = x.fontHeading;
  const rd = document.getElementById('dsgRadius');
  rd.innerHTML = Object.keys(C.radius).map(k => `<option value="${k}">${escSA(C.radius[k].label)}</option>`).join('');
  rd.value = x.radius;
  designRenderSections();
  document.getElementById('dsgFeatures').innerHTML = C.featureKeys.map(k => `
    <label class="flex items-center gap-2 text-sm text-slate-200 font-bold"><input type="checkbox" ${x.features[k] ? 'checked' : ''} onchange="designSetFeature('${k}', this.checked)"> ${escSA(DESIGN_FEATURE_LABELS[k] || k)}</label>`).join('');
}

function designRenderSections() {
  const x = designDraft;
  document.getElementById('dsgSections').innerHTML = x.order.map((id, i) => {
    const hidden = x.hidden.includes(id);
    return `<div class="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-700 bg-slate-950 ${hidden ? 'opacity-50' : ''}">
      <span class="text-sm font-bold text-white">${escSA(DESIGN_SECTION_LABELS[id] || id)}</span>
      <span class="flex gap-1">
        <button type="button" onclick="designMoveSection(${i}, -1)" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" onclick="designMoveSection(${i}, 1)" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs" ${i === x.order.length - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" onclick="designToggleSection('${id}')" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs">${hidden ? '👁️‍🗨️ إظهار' : '🙈 إخفاء'}</button>
      </span></div>`;
  }).join('');
}

function designSet(key, value) {
  if (!designDraft) return;
  designDraft[key] = value;
  if (key === 'template') {
    const entry = designFindEntry(value);
    if (entry && Array.isArray(entry.homeOrder)) {
      const order = [];
      entry.homeOrder.concat(window.TemplateContract.homeSectionIds).forEach(id => { if (window.TemplateContract.homeSectionIds.includes(id) && !order.includes(id)) order.push(id); });
      designDraft.order = order; // الترتيب الافتراضي للقالب الجديد (يمكن تعديله بعدها)
    }
    designRenderControls();
  }
  designSchedulePreview();
}

function designSetFeature(key, on) {
  designDraft.features[key] = !!on;
  designSchedulePreview();
}

function designMoveSection(index, delta) {
  const o = designDraft.order;
  const j = index + delta;
  if (j < 0 || j >= o.length) return;
  [o[index], o[j]] = [o[j], o[index]];
  designRenderSections();
  designSchedulePreview();
}

function designToggleSection(id) {
  const h = designDraft.hidden;
  const i = h.indexOf(id);
  if (i === -1) h.push(id); else h.splice(i, 1);
  designRenderSections();
  designSchedulePreview();
}

function designSchedulePreview() {
  clearTimeout(designPreviewTimer);
  designPreviewTimer = setTimeout(designPostPreview, 150);
}

function designPostPreview() {
  const frame = document.getElementById('dsgPreview');
  if (!frame || !frame.contentWindow || !designDraft) return;
  try { frame.contentWindow.postMessage({ type: 'tpl-preview', design: designBuild() }, location.origin); } catch (e) { /* غير حرج */ }
}

// المتجر داخل الإطار يرسل tpl-preview-ready عند جاهزيته (أو عند تحميل الإطار نرسل التصميم الحالي)
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  if (ev.data && ev.data.type === 'tpl-preview-ready') designPostPreview();
});

function designReset() {
  if (!designRegistry) return;
  designDraft = designNormalizeDraft(null, { primaryColor: designDraft ? designDraft.primary : '' });
  designDraft.template = designRegistry.default;
  designRenderControls();
  designSchedulePreview();
}

async function saveDesign() {
  if (!designDraft || !designSlug) return;
  const btn = document.getElementById('dsgSaveBtn');
  const status = document.getElementById('dsgStatus');
  btn.disabled = true;
  status.textContent = '⏳ جارٍ الحفظ...';
  try {
    const design = designBuild();
    const entry = designFindEntry(design.template);
    await db.collection('pharmacies').doc(designSlug).update({
      design,
      templateId: entry ? entry.dataTemplate : 'template_default',
      primaryColor: design.colors.primary
    });
    const r = await superApiFetch('/api/admin/storefront/rebuild', { method: 'POST', headers: { 'X-Pharmacy-Id': designSlug } });
    if (r && r.success) {
      status.textContent = '✅ تم الحفظ وتحديث لقطة المتجر.';
      showToast('✅ تم حفظ تصميم المتجر');
    } else {
      status.textContent = '⚠️ حُفظ التصميم لكن تحديث لقطة المتجر فشل (' + ((r && r.message) || 'خطأ') + ')؛ سيظهر للزبائن بعد التجديد الليلي أو عند إعادة المحاولة.';
    }
  } catch (err) {
    status.textContent = '❌ فشل الحفظ: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}
