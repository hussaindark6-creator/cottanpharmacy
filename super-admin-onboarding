/* ==========================================================
   super-admin-onboarding.js — قوالب الأقسام الجاهزة + قائمة التفعيل الثابتة (المرحلة 5)
   • قوالب الأقسام: public/presets/category-presets.json (تجميل / أدوية / أطفال / مكملات). تُنسخ عند إنشاء الصيدلية
     (أو لاحقاً من نافذة التفعيل). تُضاف الأقسام الناقصة فقط ولا تُعدَّل أقسام موجودة بنفس المعرّف.
   • قائمة التفعيل: public/presets/onboarding-checklist.json (12 بنداً ثابتاً). البنود التلقائية تُحسب من بيانات الصيدلية
     عند فتح النافذة (≈ 7 قراءات لمرة واحدة بيد السوبر أدمن)، واليدوية تُحفظ بـ pharmacies/{id}/private_settings/onboarding
     (خاص بالسوبر أدمن؛ لا يدخل لقطة المتجر العامة).
   يعتمد على: db, showToast, escSA (super-admin-core.js) وعلى superApiFetch (super-admin-platform.js) وقت التنفيذ فقط.
   ========================================================== */
let onbPresets = null;
let onbChecklist = null;
let onbSlug = '';
let onbState = null;   // { auto:{key:boolean}, manual:{key:boolean} }

async function onbLoadJson(path) {
  const r = await fetch(path + '?v=' + Date.now());
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

async function onbEnsureData() {
  if (!onbPresets) onbPresets = (await onbLoadJson('presets/category-presets.json')).presets || [];
  if (!onbChecklist) onbChecklist = (await onbLoadJson('presets/onboarding-checklist.json')).items || [];
}

// يملأ قائمة «نوع النشاط» بنموذج إنشاء الصيدلية (وبنافذة التفعيل)
async function onbFillPresetSelect(selectId, withNone) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    await onbEnsureData();
    sel.innerHTML = (withNone ? '<option value="">بدون (أضيف الأقسام يدوياً)</option>' : '') +
      onbPresets.map(p => `<option value="${escSA(p.id)}">${escSA(p.name)} — ${p.categories.length} أقسام</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">تعذر تحميل القوالب</option>';
  }
}

// ينسخ أقسام القالب لصيدلية: يضيف الناقص فقط (يحفظ صور/ترتيب الأقسام الموجودة). يرجع عدد الأقسام المضافة.
async function applyCategoryPreset(slug, presetId) {
  await onbEnsureData();
  const preset = onbPresets.find(p => p.id === presetId);
  if (!preset) throw new Error('قالب أقسام غير معروف');
  const col = db.collection('pharmacies').doc(slug).collection('categories');
  const existing = await col.get();
  const have = new Set(existing.docs.map(d => d.id));
  let maxOrder = 0;
  existing.docs.forEach(d => { maxOrder = Math.max(maxOrder, Number(d.data().order) || 0); });
  const batch = db.batch();
  let added = 0;
  preset.categories.forEach(c => {
    if (have.has(c.id)) return;
    added++;
    batch.set(col.doc(c.id), { id: c.id, label: c.label, icon: c.icon, imageUrl: c.imageUrl || '', order: maxOrder + c.order });
  });
  if (added) await batch.commit();
  return added;
}

// تحديث لقطة المتجر العامة بعد تغيير الأقسام (الصيدلية الجديدة لا لقطة لها بعد فتُبنى عند أول زيارة)
async function onbRebuildStorefront(slug) {
  try {
    const r = await superApiFetch('/api/admin/storefront/rebuild', { method: 'POST', headers: { 'X-Pharmacy-Id': slug } });
    return !!(r && r.success);
  } catch (e) { return false; }
}

// ---------- قائمة التفعيل ----------
async function onbDetect(slug) {
  const ref = db.collection('pharmacies').doc(slug);
  const [pharmSnap, cfgSnap, manualSnap, catSnap, prodSnap, domSnap] = await Promise.all([
    ref.get(),
    ref.collection('private_settings').doc('config').get(),
    ref.collection('private_settings').doc('onboarding').get(),
    ref.collection('categories').limit(1).get(),
    ref.collection('products').limit(1).get(),
    db.collection('system').doc('custom_domains').collection('domains').where('tenantId', '==', slug).limit(1).get()
  ]);
  const p = pharmSnap.exists ? pharmSnap.data() : {};
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  const email = String(p.adminEmail || '').trim().toLowerCase();
  let staffOk = false;
  if (email) {
    const staffSnap = await ref.collection('staff').doc(email.replace(/[^a-z0-9]/g, '_')).get();
    staffOk = staffSnap.exists;
  }
  return {
    pharmacyName: p.name || slug,
    auto: {
      owner_staff: !!(email && staffOk),
      identity: !!(p.name && p.logoUrl),
      whatsapp: !!String(p.socialWhatsapp || '').trim(),
      design: !!(p.design && typeof p.design === 'object' && p.design.template),
      categories: !catSnap.empty,
      products: !prodSnap.empty,
      telegram: !!(cfg.telegramConfig && cfg.telegramConfig.enabled === true),
      domain: !domSnap.empty
    },
    manual: (manualSnap.exists && manualSnap.data().done) || {}
  };
}

async function openOnboardingModal(slug) {
  onbSlug = slug;
  const modal = document.getElementById('onboardingModal');
  const body = document.getElementById('onbBody');
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="text-slate-400 text-sm py-6 text-center">⏳ جارٍ فحص الصيدلية...</div>';
  try {
    await onbEnsureData();
    onbState = await onbDetect(slug);
    document.getElementById('onbTitle').textContent = '✅ قائمة التفعيل: ' + onbState.pharmacyName;
    await onbFillPresetSelect('onbPresetSelect', false);
    onbRender();
  } catch (err) {
    body.innerHTML = '<div class="text-rose-400 text-sm py-6 text-center">❌ تعذر التحميل: ' + escSA(err.message) + '</div>';
  }
}

function onbIsDone(item) {
  return item.auto ? !!onbState.auto[item.key] : !!onbState.manual[item.key];
}

function onbRender() {
  const done = onbChecklist.filter(onbIsDone).length;
  const total = onbChecklist.length;
  document.getElementById('onbProgress').textContent = `${done} / ${total}`;
  document.getElementById('onbBar').style.width = Math.round((done / total) * 100) + '%';
  document.getElementById('onbBody').innerHTML = onbChecklist.map(item => {
    const ok = onbIsDone(item);
    const tag = item.auto
      ? '<span class="text-[10px] text-slate-500 font-bold">تلقائي</span>'
      : '<span class="text-[10px] text-amber-400 font-bold">يدوي — اضغطي للتأشير</span>';
    return `<div ${item.auto ? '' : `onclick="onbToggle('${escSA(item.key)}')"`} class="flex items-start gap-3 p-3 rounded-xl border ${ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 bg-slate-950'} ${item.auto ? '' : 'cursor-pointer'}">
      <span class="text-lg leading-none mt-0.5">${ok ? '✅' : '⬜'}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-bold text-white">${escSA(item.title)}</span>
        <span class="block text-[11px] text-slate-400">${escSA(item.hint || '')}</span>
      </span>${tag}</div>`;
  }).join('');
}

async function onbToggle(key) {
  const item = onbChecklist.find(i => i.key === key);
  if (!item || item.auto) return;
  const next = !onbState.manual[key];
  onbState.manual[key] = next;
  onbRender();
  try {
    await db.collection('pharmacies').doc(onbSlug).collection('private_settings').doc('onboarding').set({
      done: { [key]: next },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    onbState.manual[key] = !next;
    onbRender();
    showToast('تعذر الحفظ: ' + err.message, true);
  }
}

async function onbApplyPreset() {
  const presetId = document.getElementById('onbPresetSelect').value;
  if (!presetId || !onbSlug) return;
  const btn = document.getElementById('onbApplyBtn');
  btn.disabled = true;
  try {
    const added = await applyCategoryPreset(onbSlug, presetId);
    if (added > 0) await onbRebuildStorefront(onbSlug);
    showToast(added > 0 ? `✅ أُضيف ${added} قسماً` : 'كل أقسام هذا القالب موجودة مسبقاً');
    onbState = await onbDetect(onbSlug);
    onbRender();
  } catch (err) {
    showToast('تعذر نسخ الأقسام: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function closeOnboardingModal() {
  document.getElementById('onboardingModal').classList.add('hidden');
}

// تعبئة قائمة «نوع النشاط» بنموذج الإنشاء عند جاهزية الصفحة
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => onbFillPresetSelect('newPharmacyPreset', true));
else onbFillPresetSelect('newPharmacyPreset', true);
