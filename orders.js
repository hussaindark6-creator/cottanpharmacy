/* ==========================================================
   SaaS Multi-Tenant Engine — js/orders.js
   Version: 5.0.0 (Security Fix: Server-Authoritative Order Creation —
                    No More Direct Client Writes to Firestore)
   ========================================================== */

import { currentPharmacyId, WORKER_API_BASE } from './config.js';
import { 
  cart, findProduct, findBundle, pharmacyProfile, 
  appliedPromo, deliveryMethod, myOrders, fmtPrice, 
  saveLocalState, currentUser
} from './state.js';
import { lockAction, sanitizeText } from './security.js';

// 🛡️🔒 (إصلاح أمني جذري — تلاعب بالسعر) الكود القديم كان يكتب الطلب مباشرة من متصفح
// الزبون إلى Firestore بالسعر الذي يحسبه المتصفح نفسه محلياً — أي زبون بخبرة تقنية بسيطة
// (أدوات المطوّر) يستطيع تعديل القيمة الإجمالية المُرسَلة قبل الكتابة وقبولها دون رفض،
// لأن قاعدة الحماية كانت تتحقق فقط أن total رقم موجب، لا أنه يطابق السعر الحقيقي.
// الحل الجذري: توقّف الكتابة المباشرة لـ Firestore هنا نهائياً. الطلب الآن يُنشأ حصراً عبر
// مسار /api/orders بالووركر، الذي يُعيد احتساب كل الأسعار من مصدرها الحقيقي (Firestore عبر
// Admin SDK) ويكتب الطلب ويخصم المخزون ضمن معاملة ذرية واحدة لا يمكن للعميل رؤيتها أو
// التلاعب بها إطلاقاً. (يتطلب هذا أيضاً تحديث firestore.rules لمنع كتابة العميل المباشرة).
export async function executeAtomicOrderCheckout(showToastFn) {
  if (!lockAction('confirmOrder', 2500, showToastFn)) return;

  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');

  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';
  
  if (!name || !phone || !address) {
    showToastFn('يرجى تعبئة الاسم والهاتف والعنوان بالتفصيل أولاً');
    return;
  }
  if (phone.length < 8) {
    showToastFn('يرجى كتابة رقم هاتف صحيح');
    return;
  }

  const ids = Object.keys(cart);
  if (ids.length === 0) {
    showToastFn('سلتك فارغة!');
    return;
  }

  const confirmBtn = document.getElementById('confirmOrderBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'جاري التحقق من المخزون وتأكيد الطلب... ⏳';
  }

  localStorage.setItem('saas_customer_saved_profile', JSON.stringify({ name, phone, address }));

  // هذه القيم "تقديرية" فقط لعرضها فوراً أثناء الانتظار — القيم الحقيقية النهائية تأتي من
  // استجابة الووركر أدناه بعد إعادة الاحتساب من المصدر الحقيقي، وهي وحدها ما يُحفظ فعلياً.
  const itemsPayloadForServer = ids.map(id => {
    const isBundle = id.startsWith('bundle_');
    const item = isBundle ? findBundle(id.replace('bundle_', '')) : findProduct(id);
    return {
      id: id,
      name: item ? (item.name || item.title) : 'منتج',
      price: item ? Number(item.price || 0) : 0,
      quantity: Number(cart[id] || 1),
      isBundle: isBundle
    };
  });

  let serverResult;
  try {
    const res = await fetch(`${WORKER_API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pharmacy-Id': currentPharmacyId
      },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        deliveryMethod: deliveryMethod,
        items: itemsPayloadForServer,
        promoCode: appliedPromo ? appliedPromo.code : null,
        userId: currentUser ? currentUser.uid : null
      })
    });
    serverResult = await res.json();
  } catch (err) {
    console.error('Order network error:', err);
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'تأكيد الطلب'; }
    showToastFn('⚠️ تعذر الاتصال بالسيرفر لتأكيد الطلب. تحققي من اتصال الإنترنت وحاولي مجدداً.');
    return;
  }

  if (!serverResult || !serverResult.success) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'تأكيد الطلب'; }
    showToastFn((serverResult && serverResult.message) || '⚠️ تعذر إتمام الطلب. حاولي مجدداً.');
    return;
  }

  // ✅ الطلب مُثبَّت فعلياً بفايرستور من طرف السيرفر بنجاح — نبني الآن الكائن المحلي حصراً
  // من بيانات السيرفر الموثوقة (لا من حسابات المتصفح المحلية) لعرضه وإرساله للواتساب.
  const order = serverResult.order;
  const orderId = serverResult.orderId;
  const grandTotal = serverResult.verifiedTotal;
  const verifiedItems = serverResult.verifiedItems || [];
  const calculatedSubtotal = order ? Number(order.subtotal || 0) : 0;
  const deliveryFee = order ? Number(order.deliveryFee || 0) : 0;
  const discountAmount = order ? Number(order.discountAmount || 0) : 0;

  const newOrderObj = order ? { ...order } : {
    id: orderId, pharmacyId: currentPharmacyId, userId: currentUser ? currentUser.uid : null,
    date: new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    name, phone, address, deliveryMethod, items: verifiedItems, subtotal: calculatedSubtotal,
    deliveryFee, discountAmount, promoCode: appliedPromo ? appliedPromo.code : null, total: grandTotal,
    status: 'قيد المعالجة والتجهيز 🚚'
  };

  myOrders.unshift(newOrderObj);
  saveLocalState();

  // إعداد رسالة الواتساب الرسمية بدون روابط GPS — بالأسعار الموثوقة القادمة من السيرفر
  const lines = verifiedItems.map(item => `• ${item.isBundle ? '🎁 [بكج توفير] ' : ''}${item.name} (${fmtPrice(item.unitPrice)} × ${item.quantity} قطع) = ${fmtPrice(item.lineTotal)}`);
  const deliveryLabel = deliveryMethod === 'express' ? `سريع (${fmtPrice(deliveryFee)})` : `عادي (${fmtPrice(deliveryFee)})`;
  const promoInfo = appliedPromo ? `🎟️ *كود الخصم:* ${appliedPromo.code} (-${fmtPrice(discountAmount)})\n` : '';

  const whatsappInvoiceMsg = 
    `🌸 *طلب جديد - ${pharmacyProfile.name || 'الصيدلية'}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *رقم الفاتورة:* #${orderId}\n` +
    `📅 *التاريخ:* ${newOrderObj.date}\n\n` +
    `👤 *اسم الزبون:* ${name}\n` +
    `📞 *رقم الهاتف:* ${phone}\n` +
    `📍 *العنوان بالتفصيل:* ${address}\n` +
    `🚚 *نوع التوصيل:* ${deliveryLabel}\n\n` +
    `📦 *المنتجات المطلوبة:*\n${lines.join('\n')}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *المجموع الفرعي:* ${fmtPrice(calculatedSubtotal)}\n` +
    `${promoInfo}` +
    `🚚 *أجرة التوصيل:* ${fmtPrice(deliveryFee)}\n` +
    `💰 *المجموع الإجمالي للدفع:* *${fmtPrice(grandTotal)}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `✨ يرجى تأكيد الطلب من قبل الصيدلي 🌸`;

  // تفريغ السلة وتحديث الواجهة
  for (const k in cart) delete cart[k];
  saveLocalState();

  const targetPhone = (pharmacyProfile.socialWhatsapp || "9647813703288").replace(/\+/g, '').trim();
  const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(whatsappInvoiceMsg)}`;

  const modalMsg = document.getElementById('successModalMsg');
  if (modalMsg) {
    modalMsg.textContent = `تم تسجيل طلبكِ رقم (#${orderId}) بنجاح بقيمة ${fmtPrice(grandTotal)}. جاري التوجيه للواتساب لتأكيد الشحن فوراً.`;
  }
  const successModal = document.getElementById('orderSuccessModal');
  if (successModal) successModal.classList.add('open');

  window.location.href = whatsappUrl;

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'تأكيد الطلب';
  }
}

// 🗑️ (حُذفت) دالة dispatchOrderToTelegram المنفصلة لم تعد لازمة — الووركر يرسل إشعار
// تيليجرام الآن ضمن نفس استدعاء /api/orders الآمن الوحيد أعلاه مباشرة بعد تثبيت الطلب.

// فتح نافذة الوصل الحراري 80mm للطباعة
export function openReceiptModal(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId)) || (window.adminLastOrdersList && window.adminLastOrdersList.find(o => String(o.id) === String(orderId)));
  if (!ord) return;

  let itemsSubtotal = 0;
  const tbody = document.getElementById('recItemsTbody');
  if (tbody) {
    tbody.innerHTML = (ord.items || []).map(it => {
      const unitPrice = Number(it.price || it.unitPrice || 0);
      const qty = Number(it.quantity || 1);
      const itemTotal = Number(it.lineTotal) || (unitPrice * qty);
      itemsSubtotal += itemTotal;

      return `
        <tr>
          <td>${sanitizeText(it.name)} ${it.isBundle ? '🎁' : ''} (${fmtPrice(unitPrice)})</td>
          <td style="text-align:center;">${qty}</td>
          <td class="mono" style="text-align:left;">${fmtPrice(itemTotal)}</td>
        </tr>
      `;
    }).join('');
  }

  const delFee = (ord.deliveryFee !== undefined) 
    ? Number(ord.deliveryFee) 
    : ((ord.deliveryMethod === 'express') ? (pharmacyProfile.deliveryFeeExpress || 8000) : (pharmacyProfile.deliveryFeeStandard || 4000));

  const discountVal = Number(ord.discountAmount || 0);
  const exactGrandTotal = Number(ord.total) || Math.max(0, itemsSubtotal - discountVal) + delFee;

  if (document.getElementById('recOrderId')) document.getElementById('recOrderId').textContent = '#' + ord.id;
  if (document.getElementById('recOrderDate')) document.getElementById('recOrderDate').textContent = ord.date || '';
  if (document.getElementById('recCustName')) document.getElementById('recCustName').textContent = ord.name || '';
  if (document.getElementById('recCustPhone')) document.getElementById('recCustPhone').textContent = ord.phone || '';
  if (document.getElementById('recCustAddress')) document.getElementById('recCustAddress').textContent = ord.address || '';
  if (document.getElementById('recDeliveryType')) document.getElementById('recDeliveryType').textContent = (ord.deliveryMethod === 'express') ? 'توصيل سريع 🛵' : 'توصيل عادي 🚚';
  if (document.getElementById('recStorePhone')) document.getElementById('recStorePhone').textContent = pharmacyProfile.socialPhone || '07813703288';

  const recStoreTitle = document.getElementById('recStoreHeaderTitle') || document.querySelector('.receipt-header h3');
  if (recStoreTitle) recStoreTitle.textContent = `${pharmacyProfile.name || 'الصيدلية'} 🌸`;

  if (document.getElementById('recDeliveryFee')) document.getElementById('recDeliveryFee').textContent = fmtPrice(delFee);
  if (document.getElementById('recGrandTotal')) document.getElementById('recGrandTotal').textContent = fmtPrice(exactGrandTotal);

  const discRow = document.getElementById('recDiscountRow');
  if (discRow) {
    if (discountVal > 0) {
      discRow.style.display = 'flex';
      if (document.getElementById('recDiscountVal')) document.getElementById('recDiscountVal').textContent = '-' + fmtPrice(discountVal);
    } else {
      discRow.style.display = 'none';
    }
  }

  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.add('open');
}

export function closeReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.remove('open');
}
