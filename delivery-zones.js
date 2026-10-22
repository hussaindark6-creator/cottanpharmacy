// 🚚 مناطق التوصيل + التوصيل المجاني (واجهة الزبون)
// (ملف مستقل: يُحمَّل في index.html بعد script.js)

// ================= 🚚 مناطق التوصيل + التوصيل المجاني (نفس منطق الووركر؛ الحساب النهائي المعتمد من الووركر) =================
let deliveryZone = '';
let _deliveryZoneLoaded = false;
// تحميل المنطقة المحفوظة عند أول استخدام (هذا الملف يُحمَّل قبل أن يصبح currentPharmacyId جاهزاً)
function ensureDeliveryZoneLoaded() {
  if (_deliveryZoneLoaded) return;
  _deliveryZoneLoaded = true;
  try { deliveryZone = localStorage.getItem('saas_delivery_zone_' + currentPharmacyId) || ''; } catch (e) { /* غير حرج */ }
}
function getSelectedDeliveryZone() { ensureDeliveryZoneLoaded(); return deliveryZone; }

function getDeliveryZones() {
  return Array.isArray(pharmacyProfile.deliveryZones) ? pharmacyProfile.deliveryZones.filter(z => z && z.name) : [];
}

function calcDeliveryFee(netSubtotal) {
  ensureDeliveryZoneLoaded();
  const std = Number(pharmacyProfile.deliveryFeeStandard) || 4000;
  const exp = Number(pharmacyProfile.deliveryFeeExpress) || 8000;
  const express = deliveryMethod === 'express';
  const zones = getDeliveryZones();
  const threshold = Number(pharmacyProfile.freeDeliveryThreshold) || 0;
  if (!zones.length && !(threshold > 0)) return { fee: express ? exp : std, free: false, zoneMissing: false };
  const surcharge = Math.max(0, exp - std);
  let base = std;
  let zoneMissing = false;
  if (zones.length) {
    const z = zones.find(x => String(x.name) === String(deliveryZone));
    if (z) base = Math.max(0, Number(z.fee) || 0); else zoneMissing = true;
  }
  const free = threshold > 0 && netSubtotal >= threshold;
  return { fee: (free ? 0 : base) + (express ? surcharge : 0), free, zoneMissing };
}

function selectDeliveryZone(name) {
  _deliveryZoneLoaded = true;
  deliveryZone = String(name || '');
  try { localStorage.setItem('saas_delivery_zone_' + currentPharmacyId, deliveryZone); } catch (e) { /* غير حرج */ }
  renderCheckoutSummary();
  if (typeof renderCart === 'function') renderCart();
}

function renderDeliveryZoneField() {
  ensureDeliveryZoneLoaded();
  const field = document.getElementById('deliveryZoneField');
  const sel = document.getElementById('deliveryZoneSelect');
  if (!field || !sel) return;
  const zones = getDeliveryZones();
  if (!zones.length) { field.style.display = 'none'; return; }
  if (!zones.some(z => String(z.name) === deliveryZone)) deliveryZone = '';
  field.style.display = '';
  sel.innerHTML = `<option value="">— اختاري منطقتكِ —</option>` + zones.map(z =>
    `<option value="${sanitizeText(z.name)}" ${String(z.name) === deliveryZone ? 'selected' : ''}>${sanitizeText(z.name)} — ${fmtPrice(Number(z.fee) || 0)}</option>`).join('');
}

// شريط التقدم نحو التوصيل المجاني (يظهر فقط إن فعّلته الصيدلية)
function freeDeliveryBarHtml(net) {
  const th = Number(pharmacyProfile.freeDeliveryThreshold) || 0;
  if (!(th > 0)) return '';
  if (net >= th) return `<div class="free-del-bar done">🎉 توصيلكِ مجاني!</div>`;
  const pct = Math.max(4, Math.min(100, Math.round((net / th) * 100)));
  return `<div class="free-del-bar"><div class="free-del-text">أضيفي <b>${fmtPrice(th - net)}</b> للحصول على <b>توصيل مجاني</b> 🚚</div><div class="free-del-track"><div class="free-del-fill" style="width:${pct}%"></div></div></div>`;
}
