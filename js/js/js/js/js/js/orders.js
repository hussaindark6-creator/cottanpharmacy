/* ==========================================================
   SaaS Multi-Tenant Engine — js/orders.js
   Version: 4.1.0 (Atomic Concurrency Protection & 80mm Receipts)
   ========================================================== */

import { db, dbPaths, currentPharmacyId, WORKER_API_BASE } from './config.js';
import { 
  cart, findProduct, findBundle, pharmacyProfile, 
  appliedPromo, deliveryMethod, myOrders, fmtPrice, 
  saveLocalState 
} from './state.js';
import { lockAction, sanitizeText } from './security.js';

// تأكيد الطلب مع خصم المخزون الذري في Firestore
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

  let calculatedSubtotal = 0;
  const itemsPayload = ids.map(id => {
    const isBundle = id.startsWith('bundle_');
    const item = isBundle ? findBundle(id.replace('bundle_', '')) : findProduct(id);
    const unitPrice = item ? Number(item.price || 0) : 0;
    const qty = Number(cart[id] || 1);
    const lineTotal = unitPrice * qty;
    calculatedSubtotal += lineTotal;

    return {
      id: id,
      name: item ? (item.name || item.title) : 'منتج',
      unitPrice: unitPrice,
      price: unitPrice,
      quantity: qty,
      lineTotal: lineTotal,
      isBundle: isBundle
    };
  });

  const deliveryFee = (deliveryMethod === 'express') 
    ? (Number(pharmacyProfile.deliveryFeeExpress) || 8000) 
    : (Number(pharmacyProfile.deliveryFeeStandard) || 4000);

  const discountAmount = appliedPromo ? Number(appliedPromo.discountAmount || 0) : 0;
  const grandTotal = Math.max(0, calculatedSubtotal - discountAmount) + deliveryFee;
  const orderPrefix = (pharmacyProfile.name || 'ORD').substring(0, 4).toUpperCase();
  const orderId = `${orderPrefix}-${Math.floor(100000 + Math.random() * 900000)}`;

  const newOrderObj = {
    id: orderId,
    pharmacyId: currentPharmacyId,
    date: new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    name,
    phone,
    address,
    deliveryMethod,
    items: itemsPayload,
    subtotal: calculatedSubtotal,
    deliveryFee: deliveryFee,
    discountAmount: discountAmount,
    promoCode: appliedPromo ? appliedPromo.code : null,
    total: grandTotal,
    status: 'قيد المعالجة والتجهيز 🚚'
  };

  // 🛡️ معالجة المخزون بحركة ذرية Transaction لمنع البيع الزائد (Anti-Overselling)
  if (db) {
    try {
      await db.runTransaction(async (transaction) => {
        // 1. قراءة المخزون الحالي والتأكد من توفره
        const productReads = [];
        for (const it of itemsPayload) {
          if (!it.isBundle) {
            const pRef = dbPaths.productsCol().doc(String(it.id));
            productReads.push({ ref: pRef, item: it });
          }
        }

        const readSnapshots = await Promise.all(productReads.map(p => transaction.get(p.ref)));

        for (let i = 0; i < readSnapshots.length; i++) {
          const snap = readSnapshots[i];
          const it = productReads[i].item;
          if (snap.exists) {
            const pData = snap.data();
            const currentStock = pData.stockQuantity !== undefined ? Number(pData.stockQuantity) : 999;
            if (currentStock < it.quantity) {
              throw new Error(`عذراً، نفدت كمية المنتج (${pData.name})، المتوفر بالمخزن (${currentStock}) قطعة فقط.`);
            }
          }
        }

        // 2. كتابة الطلب وخصم المخزون داخل نفس الحركة الذرية
        const orderRef = dbPaths.ordersCol().doc(orderId);
        transaction.set(orderRef, {
          ...newOrderObj,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        for (let i = 0; i < readSnapshots.length; i++) {
          const snap = readSnapshots[i];
          const it = productReads[i].item;
          if (snap.exists) {
            const pData = snap.data();
            const currentStock = pData.stockQuantity !== undefined ? Number(pData.stockQuantity) : 999;
            const newStock = Math.max(0, currentStock - it.quantity);
            transaction.update(productReads[i].ref, {
              stockQuantity: newStock,
              inStock: newStock > 0,
              orderCount: firebase.firestore.FieldValue.increment(it.quantity)
            });
          }
        }
      });
    } catch (err) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'تأكيد الطلب';
      }
      showToastFn(`⚠️ ${err.message}`);
      return;
    }
  }

  myOrders.unshift(newOrderObj);
  saveLocalState();

  // إرسال الفاتورة لتليجرام الصيدلية
  dispatchOrderToTelegram(newOrderObj);

  // إعداد رسالة الواتساب الرسمية بدون روابط GPS
  const lines = itemsPayload.map(item => `• ${item.isBundle ? '🎁 [بكج توفير] ' : ''}${item.name} (${fmtPrice(item.unitPrice)} × ${item.quantity} قطع) = ${fmtPrice(item.lineTotal)}`);
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

// إرسال الطلب لتيليجرام الصيدلية عبر الووركر
async function dispatchOrderToTelegram(orderObj) {
  try {
    await fetch(`${WORKER_API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pharmacy-Id': currentPharmacyId
      },
      body: JSON.stringify({
        customerName: orderObj.name,
        customerPhone: orderObj.phone,
        customerAddress: orderObj.address,
        deliveryMethod: orderObj.deliveryMethod,
        items: orderObj.items,
        promoCode: orderObj.promoCode,
        discountAmount: orderObj.discountAmount
      })
    });
  } catch (err) {
    console.warn("Direct Telegram dispatch warning:", err);
  }
}

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
