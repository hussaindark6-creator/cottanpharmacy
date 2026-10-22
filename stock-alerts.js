// 🔔 أبلغيني عند توفر المنتج (واجهة الزبون)
// (ملف مستقل: يُحمَّل في index.html بعد script.js)

// ================= 🔔 أبلغيني عند توفر المنتج =================
function closeStockAlertModal() {
  const m = document.getElementById('stockAlertModal');
  if (m) m.remove();
}

function openStockAlertModal(productId) {
  const p = findProduct(productId);
  if (!p) return;
  closeStockAlertModal();
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('saas_customer_saved_profile') || '{}') || {}; } catch (e) { /* فارغ */ }
  const wrap = document.createElement('div');
  wrap.id = 'stockAlertModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:#fff;width:100%;max-width:480px;border-radius:22px 22px 0 0;padding:20px 18px 26px;">
      <div style="font-weight:900;font-size:16px;margin-bottom:6px;">🔔 أبلغيني عند التوفر</div>
      <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px;line-height:1.7;">${sanitizeText(p.name)}<br>اكتبي رقمكِ وستتواصل معكِ الصيدلية فور توفر المنتج.</div>
      <input type="tel" id="stockAlertPhone" inputmode="numeric" placeholder="07xxxxxxxxx" value="${sanitizeText(saved.phone || '')}" style="width:100%;padding:12px;border:1.5px solid var(--line);border-radius:12px;font-size:15px;margin-bottom:10px;box-sizing:border-box;">
      <div id="turnstileStockBox" style="display:flex;justify-content:center;margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;">
        <button type="button" id="stockAlertSubmit" style="flex:1;background:var(--accent);color:#fff;border:0;border-radius:12px;padding:12px;font-weight:900;font-size:14px;">تأكيد</button>
        <button type="button" onclick="closeStockAlertModal()" style="flex:0 0 auto;background:var(--surface);border:0;border-radius:12px;padding:12px 18px;font-weight:800;font-size:14px;">إغلاق</button>
      </div>
    </div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeStockAlertModal(); });
  document.body.appendChild(wrap);
  document.getElementById('stockAlertSubmit').onclick = () => submitStockAlert(productId);
}

async function submitStockAlert(productId) {
  const btn = document.getElementById('stockAlertSubmit');
  const phone = String((document.getElementById('stockAlertPhone') || {}).value || '').replace(/[^0-9]/g, '');
  if (!/^\d{8,15}$/.test(phone)) { showToast('⚠️ اكتبي رقم هاتف صحيح'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...'; }
  try {
    const cfToken = TURNSTILE_SITE_KEY ? await getTurnstileToken('turnstileStockBox') : '';
    if (TURNSTILE_SITE_KEY && !cfToken) { showToast('⚠️ تعذر التحقق الأمني، حدّثي الصفحة وحاولي مجدداً.'); return; }
    const res = await fetch(`${WORKER_API_BASE}/api/stock-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pharmacy-Id': currentPharmacyId },
      body: JSON.stringify({ productId: String(productId), phone, cfToken })
    });
    const data = await res.json();
    showToast(data && data.message ? data.message : (data && data.success ? '✅ تم تسجيل طلبكِ' : '⚠️ تعذر التسجيل'));
    if (data && data.success) closeStockAlertModal();
  } catch (e) {
    showToast('⚠️ تعذر الاتصال بالسيرفر، حاولي لاحقاً.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'تأكيد'; }
  }
}
