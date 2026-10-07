/* ==========================================================
   admin-orders.js — الطلبات: القائمة اللحظية، تغيير الحالة، التنبيه الصوتي، الإيصال الحراري
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

// ================= 14. 80mm THERMAL RECEIPTS =================
function openReceiptModal(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId)) || (window.adminLastOrdersList && window.adminLastOrdersList.find(o => String(o.id) === String(orderId)));
  if (!ord) {
    showToast('تعذر العثور على بيانات الطلب');
    return;
  }

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

  document.getElementById('recOrderId').textContent = '#' + ord.id;
  document.getElementById('recOrderDate').textContent = ord.date || '';
  document.getElementById('recCustName').textContent = ord.name || '';
  document.getElementById('recCustPhone').textContent = ord.phone || '';
  document.getElementById('recCustAddress').textContent = ord.address || '';
  document.getElementById('recDeliveryType').textContent = (ord.deliveryMethod === 'express') ? 'توصيل سريع 🛵' : 'توصيل عادي 🚚';
  document.getElementById('recStorePhone').textContent = pharmacyProfile.socialPhone || '07813703288';

  const recStoreTitle = document.querySelector('.receipt-header h3');
  if (recStoreTitle) recStoreTitle.textContent = `${pharmacyProfile.name || 'الصيدلية'} 🌸`;

  document.getElementById('recDeliveryFee').textContent = fmtPrice(delFee);
  document.getElementById('recGrandTotal').textContent = fmtPrice(exactGrandTotal);

  const discRow = document.getElementById('recDiscountRow');
  if (discRow) {
    if (discountVal > 0) {
      discRow.style.display = 'flex';
      document.getElementById('recDiscountVal').textContent = '-' + fmtPrice(discountVal);
    } else {
      discRow.style.display = 'none';
    }
  }

  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.add('open');

  // 🖨️📤 (إصلاح — "الطباعة تفتح نافذة الطباعة مباشرة بدل المشاركة") نحفظ بيانات الطلب
  // الحالي هنا كي تستخدمها shareOrPrintReceipt() لبناء نص الوصل ومشاركته عبر واجهة
  // المشاركة الأصلية للجهاز (تحتوي خيار "طباعة" ضمنها على iOS، وتطبيقات المشاركة على
  // أندرويد) بدل فتح نافذة طباعة المتصفح مباشرة.
  window.__currentReceiptOrder = { order: ord, itemsSubtotal, delFee, discountVal, exactGrandTotal };
}

function closeReceiptModal() {
  const modal = document.getElementById('thermalReceiptModal');
  if (modal) modal.classList.remove('open');
}

// 🖨️📤 (إصلاح جذري) السبب الحقيقي لعدم ظهور خيار "طباعة" بواجهة المشاركة: مشاركة نص عادي
// (text) عبر Web Share API لا تُفعِّل خيار الطباعة إطلاقاً على iOS — خيار الطباعة يظهر فقط
// عند مشاركة صورة أو ملف PDF/مستند حقيقي. الحل: نرسم الوصل كصورة PNG فعلية عبر Canvas
// (بلا أي مكتبة خارجية)، ثم نشاركها كملف — فتظهر "طباعة" ضمن واجهة المشاركة تلقائياً لأنها
// صورة قابلة للطباعة فعلياً، مع بقاء فتح واجهة المشاركة فورياً كما هو مطلوب.
async function shareOrPrintReceipt() {
  const data = window.__currentReceiptOrder;
  if (!data) { window.print(); return; }

  const { order, delFee, discountVal, exactGrandTotal } = data;

  try {
    const blob = await buildReceiptImageBlob(order, delFee, discountVal, exactGrandTotal);
    const file = new File([blob], `receipt-${order.id}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `وصل الطلب #${order.id}` });
      return;
    }
    if (navigator.share) {
      // بعض المتصفحات تدعم navigator.share لكن بلا ملفات — نشارك رابط الصورة كحل وسيط
      const imgUrl = URL.createObjectURL(blob);
      await navigator.share({ title: `وصل الطلب #${order.id}`, text: `وصل الطلب #${order.id}`, url: imgUrl });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // المستخدم ألغى المشاركة بنفسه
    console.warn('Receipt share failed, falling back to print:', err);
  }
  // احتياط وحيد: متصفح لا يدعم المشاركة أو فشلت الصورة (غالباً حاسوب مكتبي)
  window.print();
}

// 🖼️ يبني صورة PNG للوصل عبر Canvas مباشرة (بلا مكتبات خارجية) بترتيب RTL صحيح
function buildReceiptImageBlob(order, delFee, discountVal, exactGrandTotal) {
  return new Promise((resolve, reject) => {
    try {
      const scale = 2;
      const width = 380;
      const padX = 20;
      const lineH = 26;
      const items = order.items || [];

      let y = 0;
      y += 40; // اسم الصيدلية
      y += 20; // خط فاصل
      y += lineH * 5; // رقم الوصل + التاريخ + العميل + الهاتف + العنوان
      y += 20; // خط فاصل
      y += lineH * Math.max(items.length, 1);
      y += 20; // خط فاصل
      y += lineH * (2 + (discountVal > 0 ? 1 : 0));
      y += 50; // تذييل
      const height = y + 30;

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1a1a1a';

      let cy = 30;
      ctx.font = '900 18px Tahoma, Arial';
      ctx.fillText(pharmacyProfile.name || 'الصيدلية', width - padX, cy);
      cy += 20;

      const dashedLine = () => {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(padX, cy);
        ctx.lineTo(width - padX, cy);
        ctx.stroke();
        ctx.restore();
        cy += 20;
      };
      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      const infoLines = [
        `رقم الوصل: #${order.id}`,
        `التاريخ: ${order.date || ''}`,
        `العميل: ${order.name || ''}`,
        `الهاتف: ${order.phone || ''}`,
        `العنوان: ${order.address || ''}`
      ];
      infoLines.forEach(line => { ctx.fillText(line, width - padX, cy); cy += lineH; });

      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      if (items.length === 0) {
        ctx.fillText('لا توجد عناصر', width - padX, cy); cy += lineH;
      } else {
        items.forEach(it => {
          const unitPrice = Number(it.price || it.unitPrice || 0);
          const qty = Number(it.quantity || 1);
          const itemTotal = Number(it.lineTotal) || (unitPrice * qty);
          const line = `${it.isBundle ? '🎁 ' : ''}${it.name} × ${qty} = ${fmtPrice(itemTotal)}`;
          ctx.fillText(line, width - padX, cy);
          cy += lineH;
        });
      }

      dashedLine();

      ctx.font = '700 13px Tahoma, Arial';
      ctx.fillText(`أجرة التوصيل: ${fmtPrice(delFee)}`, width - padX, cy); cy += lineH;
      if (discountVal > 0) {
        ctx.fillStyle = '#B91C1C';
        ctx.fillText(`الخصم: -${fmtPrice(discountVal)}`, width - padX, cy); cy += lineH;
        ctx.fillStyle = '#1a1a1a';
      }
      ctx.font = '900 16px Tahoma, Arial';
      ctx.fillText(`المجموع الكلي: ${fmtPrice(exactGrandTotal)}`, width - padX, cy); cy += 30;

      ctx.font = '700 12px Tahoma, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('شكراً لتسوقكم معنا 🌸', width / 2, cy);

      canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error('تعذر إنشاء صورة الوصل'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

function getAudioMuteStorageKey() {
  return `saas_${currentPharmacyId}_admin_alert_muted`;
}

function initAdminAudioAlertPreference() {
  adminAlertMuted = localStorage.getItem(getAudioMuteStorageKey()) === '1';
  updateAudioMuteButtonUI();
}

function toggleAdminAudioAlertMute() {
  adminAlertMuted = !adminAlertMuted;
  localStorage.setItem(getAudioMuteStorageKey(), adminAlertMuted ? '1' : '0');
  if (adminAlertMuted && audioAlertRepeatTimer) {
    clearInterval(audioAlertRepeatTimer);
    audioAlertRepeatTimer = null;
  }
  updateAudioMuteButtonUI();
  showToast(adminAlertMuted ? '🔇 تم كتم تنبيه الطلبات الجديدة' : '🔊 تم تفعيل تنبيه الطلبات الجديدة');
}

function updateAudioMuteButtonUI() {
  const btn = document.getElementById('adminAlertMuteBtn');
  if (!btn) return;
  btn.textContent = adminAlertMuted ? '🔇' : '🔊';
  btn.title = adminAlertMuted ? 'تفعيل صوت تنبيه الطلبات' : 'كتم صوت تنبيه الطلبات';
  btn.style.background = adminAlertMuted ? '#374151' : '#F59E0B';
}

// نغمة تنبيه مُولّدة برمجياً عبر Web Audio API (بدون أي ملف صوتي خارجي)
function playNewOrderBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.18);
    playTone(1108, now + 0.22, 0.22);
  } catch (e) {
    console.warn('Audio alert error:', e);
  }
}

function triggerRepeatingNewOrderAlert() {
  if (adminAlertMuted) return;
  if (audioAlertRepeatTimer) clearInterval(audioAlertRepeatTimer);
  let repeats = 0;
  playNewOrderBeep();
  audioAlertRepeatTimer = setInterval(() => {
    repeats++;
    if (repeats >= 4) {
      clearInterval(audioAlertRepeatTimer);
      audioAlertRepeatTimer = null;
      return;
    }
    playNewOrderBeep();
  }, 1600);
}

const ADMIN_ORDERS_LIMIT = 400;
let adminOrdersWindowCapped = false;

function listenToAdminOrdersRealtime() {
  if (!isFirebaseConfigured || !db) return;

  if (adminOrdersUnsubscribe) {
    adminOrdersUnsubscribe();
  }

  // 🛡️ (توفير قراءات) كان يقرأ كل الطلبات التاريخية بكل فتح للوحة (وكل تغيير يعيد قراءة كل شيء). الآن آخر
  // ADMIN_ORDERS_LIMIT طلب فقط (الأحدث أولاً)، وأي تغيير لاحق يقرأ المستند المتغير وحده.
  adminOrdersUnsubscribe = dbPaths.ordersCol().orderBy('createdAt', 'desc').limit(ADMIN_ORDERS_LIMIT).onSnapshot(snap => {
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    orders.sort((a, b) => {
      const timeA = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : new Date(a.date || 0).getTime();
      const timeB = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : new Date(b.date || 0).getTime();
      return timeB - timeA;
    });

    // 🔔 التنبيه الصوتي: نقارن معرّفات الطلبات الحالية بآخر لقطة معروفة لاكتشاف أي طلب جديد فعلاً
    const currentIds = new Set(orders.map(o => o.id));
    if (knownOrderIdsForAlert !== null) {
      const hasNewOrder = orders.some(o => !knownOrderIdsForAlert.has(o.id));
      if (hasNewOrder) {
        triggerRepeatingNewOrderAlert();
        showToast('🛎️ لديك طلب جديد وارد الآن!');
      }
    }
    knownOrderIdsForAlert = currentIds;

    window.adminLastOrdersList = orders;
    adminOrdersWindowCapped = snap.size >= ADMIN_ORDERS_LIMIT;
    totalOrdersCount = orders.length;

    renderAdminOrdersList(orders);
    fetchRealAnalytics();
  }, err => console.warn("Orders Snapshot Warning:", err));
}

async function fetchAdminOrdersList() {
  listenToAdminOrdersRealtime();
}

function renderAdminOrdersList(orders) {
  const container = document.getElementById('adminOrdersManageContainer');
  if (!container) return;

  const timeFilter = document.getElementById('reportTimeRange') ? document.getElementById('reportTimeRange').value : 'all';
  const statusFilter = document.getElementById('reportStatusFilter') ? document.getElementById('reportStatusFilter').value : 'all';

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7);

  let displayOrders = (orders || []).filter(o => {
    const oDate = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.date || '');
    if (timeFilter === 'today' && !oDate.startsWith(todayStr)) return false;
    if (timeFilter === 'yesterday' && !oDate.startsWith(yesterdayStr)) return false;
    if (timeFilter === 'month' && !oDate.startsWith(monthStr)) return false;

    if (statusFilter === 'delivered' && !(o.status && o.status.includes('التسليم'))) return false;
    if (statusFilter === 'shipping' && !(o.status && o.status.includes('الشحن'))) return false;
    if (statusFilter === 'processing' && !(o.status && o.status.includes('المعالجة'))) return false;
    if (statusFilter === 'customer_cancelled' && !(o.status && o.status.includes('الزبون'))) return false;
    if (statusFilter === 'cancelled' && !(o.status && o.status.includes('ملغي'))) return false;

    return true;
  });

  if (displayOrders.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:24px 0;">لا توجد طلبات مسجلة حالياً.</div>`;
    return;
  }

  container.innerHTML = displayOrders.map(ord => {
    const items = ord.items || [];
    let itemsCalcSubtotal = 0;
    
    const itemsHtml = items.map(it => {
      const unitPrice = Number(it.price || it.unitPrice || 0);
      const qty = Number(it.quantity || 1);
      const lineTotal = Number(it.lineTotal) || (unitPrice * qty);
      itemsCalcSubtotal += lineTotal;
      return `• ${it.isBundle ? '🎁 [بكج] ' : ''}${sanitizeText(it.name || 'منتج')} (${fmtPrice(unitPrice)} × ${qty} قطع) = <b>${fmtPrice(lineTotal)}</b>`;
    }).join('<br>');

    const delFee = (ord.deliveryFee !== undefined) 
      ? Number(ord.deliveryFee) 
      : ((ord.deliveryMethod === 'express') ? (pharmacyProfile.deliveryFeeExpress || 8000) : (pharmacyProfile.deliveryFeeStandard || 4000));
      
    const discountVal = Number(ord.discountAmount || 0);
    const subtotalVal = Number(ord.subtotal) || itemsCalcSubtotal;
    const grandTotal = Number(ord.total) || Math.max(0, subtotalVal - discountVal) + delFee;
    const isCancelled = ord.status && ord.status.includes('ملغي');

    return `
      <div class="admin-order-manage-card">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--line); padding-bottom:8px; margin-bottom:8px;">
          <span class="order-card-id mono">#${sanitizeText(ord.id)}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" onclick="openReceiptModal('${sanitizeText(ord.id)}')" style="background:#10B981; color:#fff; font-size:11px; font-weight:800; padding:6px 12px; border-radius:8px; cursor:pointer;">🖨️ طباعة وصل</button>
            <select class="admin-order-status-select" onchange="updateOrderStatus('${sanitizeText(ord.id)}', this.value)">
              <option value="قيد المعالجة والتجهيز 🚚" ${ord.status === 'قيد المعالجة والتجهيز 🚚' ? 'selected' : ''}>قيد التجهيز 🚚</option>
              <option value="تم الشحن مع المندوب 🛵" ${ord.status === 'تم الشحن مع المندوب 🛵' ? 'selected' : ''}>تم الشحن 🛵</option>
              <option value="تم التسليم بنجاح ✅" ${ord.status === 'تم التسليم بنجاح ✅' ? 'selected' : ''}>تم التسليم ✅</option>
              <option value="طلب ملغي من قبل الزبون ❌" ${ord.status === 'طلب ملغي من قبل الزبون ❌' ? 'selected' : ''}>ملغي من الزبون ❌</option>
              <option value="طلب ملغي ❌" ${ord.status === 'طلب ملغي ❌' ? 'selected' : ''}>طلب ملغي ❌</option>
            </select>
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px;">
          التاريخ: <span class="mono">${sanitizeText(ord.date || '')}</span> · الزبون: <b>${sanitizeText(ord.name || '')}</b> (${sanitizeText(ord.phone || '')})
        </div>
        <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px;">
          العنوان: ${sanitizeText(ord.address || '')} (${ord.deliveryMethod === 'express' ? 'توصيل سريع' : 'توصيل عادي'})
        </div>
        <div style="font-size:12px; color:var(--ink); margin-bottom:6px; background:#F9FAFB; padding:8px 10px; border-radius:8px;">
          ${itemsHtml}
        </div>
        <div class="order-pricing-box" style="margin:6px 0; background:#FFF; border:1px dashed var(--line);">
          <div class="order-pricing-row"><span>المجموع الفرعي للمنتجات:</span><span class="mono">${fmtPrice(subtotalVal)}</span></div>
          ${discountVal > 0 ? `<div class="order-pricing-row discount-row"><span>🎟️ خصم الكوبون (${ord.promoCode || 'كود'}):</span><span class="mono">-${fmtPrice(discountVal)}</span></div>` : ''}
          <div class="order-pricing-row"><span>أجرة التوصيل:</span><span class="mono">+${fmtPrice(delFee)}</span></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--line); padding-top:6px; margin-top:6px;">
          <span style="font-size:12px; font-weight:700; color:${isCancelled ? '#DC2626' : 'var(--text-soft)'};">الحالة: ${sanitizeText(ord.status || 'قيد التجهيز')}</span>
          <span style="font-weight:900; font-size:15px; color:var(--rose-deep);">المجموع الكلي: ${fmtPrice(grandTotal)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 🔐 تغيير الحالة عبر الووركر: عند الإلغاء يُرجع المخزون تلقائياً بمعاملة ذرية، ولا يسمح بإعادة تفعيل
// طلب ملغي (كان إلغاء الأدمن يُبقي المنتجات محجوزة من المخزون للأبد).
async function updateOrderStatus(orderId, newStatus) {
  if (!assertAdmin()) return;
  const refreshList = () => renderAdminOrdersList(window.adminLastOrdersList || []);
  if (newStatus.includes('ملغي') && !confirm('سيتم إلغاء الطلب وإرجاع منتجاته للمخزون، ولا يمكن التراجع. متابعة؟')) {
    refreshList();
    return;
  }
  try {
    const res = await apiFetch('/api/admin/orders/status', { method: 'POST', body: JSON.stringify({ orderId: String(orderId), status: newStatus }) });
    if (!res || !res.success) {
      showToast('⚠️ ' + ((res && res.message) || 'تعذر تحديث حالة الطلب'));
      refreshList();
      return;
    }
    showToast(`تم تحديث حالة الطلب #${orderId} إلى: ${newStatus}`);
    if (newStatus.includes('ملغي')) fetchCatalogFromR2(true);
  } catch (e) {
    console.warn(e);
    showToast('⚠️ تعذر الاتصال بالسيرفر');
    refreshList();
  }
}

// ================= 20. EXCEL/CSV EXPORT =================
// ================= 20b. FINANCIAL REPORT: GROUPED BY 3 CATEGORIES + ENGLISH DATES =================
// ⚠️ ملاحظة تقنية مهمة: لا يحتوي نظام المنتجات على حقل "سعر التكلفة" (Cost Price)، لذا يُحتسب هنا
// "صافي المبيعات" (Total Sales) لكل قسم كمؤشر مالي دقيق بدل "الربح الصافي" الذي يتطلب تسجيل تكلفة
// شراء كل صنف أولاً. يمكن إضافة حقل costPrice لاحقاً لمنتج لاحتساب ربح حقيقي دقيق.
function classifyCategoryGroup(categoryIdOrLabel) {
  const s = (categoryIdOrLabel || '').toString().toLowerCase();
  if (s.includes('milk') || s.includes('حليب')) return 'baby_milk';
  if (s.includes('dental') || s.includes('tooth') || s.includes('paste') || s.includes('اسنان') || s.includes('سنان') || s.includes('oral')) return 'oral_care';
  return 'cosmetics';
}

function getOrderItemGroup(item) {
  if (item.isBundle) return 'cosmetics';
  const prod = findProduct(item.id) || archivedProducts.find(p => String(p.id) === String(item.id));
  const catId = prod ? prod.category : '';
  const catObj = categories.find(c => c.id === catId);
  return classifyCategoryGroup((catObj && catObj.label) || catId);
}

// تنسيق تاريخ الطلب بالإنجليزية الكاملة (مثال: September 16, 2026, 02:30 PM) بدل الأشهر العربية
function formatOrderDateEnglish(o) {
  try {
    if (o.createdAt && typeof o.createdAt.toDate === 'function') {
      return o.createdAt.toDate().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
  } catch (e) {}
  // احتياط: إن لم يوجد createdAt (طلبات قديمة محلية)، نعرض التاريخ المخزن كما هو
  return o.date || '';
}
