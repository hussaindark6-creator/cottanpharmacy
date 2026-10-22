// 💬 واتساب حالة الطلب + 🧾 وصل حراري 80mm (لوحة الأدمن)
// (ملف مستقل: يُحمَّل في admin.html)

// ================= 💬 واتساب حالة الطلب + 🧾 وصل حراري =================
function toIntlPhoneAdmin(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (d.startsWith('964')) return d;
  if (d.startsWith('0')) return '964' + d.slice(1);
  return d;
}

function findAdminOrderById(orderId) {
  return (window.adminLastOrdersList || []).find(o => String(o.id) === String(orderId));
}

// يفتح واتساب برسالة جاهزة بحالة الطلب للزبون (بزر واحد)
function whatsappOrderStatus(orderId) {
  const ord = findAdminOrderById(orderId);
  if (!ord) { showToast('⚠️ تعذر العثور على الطلب'); return; }
  const st = String(ord.status || '').replace(/[🚚🛵✅❌]/g, '').trim();
  const msg = `مرحباً ${ord.name || ''} 🌸\nحالة طلبكِ #${ord.id} من ${pharmacyProfile.name || 'الصيدلية'}: ${st}.\nالمجموع: ${fmtPrice(Number(ord.total) || 0)}\nشكراً لثقتكِ 💖`;
  window.open(`https://wa.me/${toIntlPhoneAdmin(ord.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

// وصل حراري بعرض 80mm (يُطبع من أي طابعة حرارية أو عادية)
function printOrderThermal(orderId) {
  const ord = findAdminOrderById(orderId);
  if (!ord) { showToast('⚠️ تعذر العثور على الطلب'); return; }
  const esc = (v) => sanitizeText(String(v == null ? '' : v));
  const rows = (ord.items || []).map(it => {
    const qty = Number(it.quantity || 1);
    const line = Number(it.lineTotal) || (Number(it.unitPrice || it.price || 0) * qty);
    return `<tr><td>${it.isBundle ? '🎁 ' : ''}${esc(it.name)}<br><small>${qty} × ${fmtPrice(Number(it.unitPrice || it.price || 0))}</small></td><td class="n">${fmtPrice(line)}</td></tr>`;
  }).join('');
  const disc = Number(ord.discountAmount || 0);
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>وصل ${esc(ord.id)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; width: 74mm; margin: 0 auto; color: #000; }
  h2 { text-align: center; margin: 4px 0; font-size: 15px; }
  .c { text-align: center; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; } td { padding: 3px 0; vertical-align: top; } td.n { text-align: left; white-space: nowrap; font-weight: bold; }
  .t { font-size: 14px; font-weight: bold; } small { color: #333; }
</style></head><body>
  <h2>${esc(pharmacyProfile.name || 'الصيدلية')}</h2>
  <div class="c">وصل طلب #${esc(ord.id)}<br>${esc(ord.date || '')}</div><hr>
  <div>الزبون: <b>${esc(ord.name)}</b><br>الهاتف: ${esc(ord.phone)}<br>العنوان: ${esc(ord.address)}${ord.deliveryZone ? '<br>المنطقة: ' + esc(ord.deliveryZone) : ''}<br>التوصيل: ${ord.deliveryMethod === 'express' ? 'سريع' : 'عادي'}</div><hr>
  <table>${rows}</table><hr>
  <table>
    <tr><td>المجموع الفرعي</td><td class="n">${fmtPrice(Number(ord.subtotal) || 0)}</td></tr>
    ${disc > 0 ? `<tr><td>الخصم ${esc(ord.promoCode || '')}</td><td class="n">-${fmtPrice(disc)}</td></tr>` : ''}
    <tr><td>أجرة التوصيل</td><td class="n">${fmtPrice(Number(ord.deliveryFee) || 0)}</td></tr>
    <tr class="t"><td>الإجمالي</td><td class="n">${fmtPrice(Number(ord.total) || 0)}</td></tr>
  </table><hr>
  <div class="c">شكراً لثقتكِ 🌸</div>
</body></html>`;
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) { showToast('⚠️ اسمحي بالنوافذ المنبثقة للطباعة'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* المستخدم يطبع يدوياً */ } }, 350);
}
