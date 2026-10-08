/* ==========================================================
   admin-reports.js — الإحصائيات والتقارير المالية (CSV / HTML)
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

async function fetchRealAnalytics() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);
    // 📊 (جديد — إعادة تعيين إحصائيات المبيعات) لا نحذف أي طلب فعلي من قاعدة البيانات؛
    // فقط نتجاهل أي طلب تم قبل لحظة "إعادة التعيين" عند حساب أرقام لوحة التحكم، بينما تبقى
    // كل الطلبات والتقارير التفصيلية سليمة كما هي. هذا أأمن بكثير من حذف بيانات حقيقية.
    const resetAtMs = pharmacyProfile.salesStatsResetAt ? new Date(pharmacyProfile.salesStatsResetAt).getTime() : 0;

    // 📊 (إعادة بناء الداشبورد — تقرير احترافي) نحسب أيضاً أمس والشهر الماضي للمقارنة
    // (نسبة التغيّر ▲▼)، ومتوسط قيمة الطلب، ومبيعات كل قسم هذا الشهر — كل هذا من نفس
    // مسح الطلبات الواحد، بلا أي قراءة إضافية من Firestore.
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    let dRev = 0, mRev = 0, dProfit = 0, mProfit = 0, dOrders = 0, mOrders = 0;
    let yRev = 0, lmRev = 0;
    const categoryRevMap = {};
    // 🛡️ (توفير قراءات — أكبر مصدر استنزاف) كان يقرأ كل الطلبات بكل استدعاء، والاستدعاء يتكرر مع كل
    // تغيير بالطلبات/المنتجات. الآن: (1) نستخدم قائمة الطلبات المحمّلة أصلاً بالمستمع بلا أي قراءة إن كانت
    // تغطي "الشهر الماضي حتى اليوم"، وإلا (2) استعلام واحد محدود بهذه الفترة فقط ومخزَّن 60 ثانية.
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 1);
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - 2); // هامش أمان لفروق المناطق الزمنية
    const orderMs = (o) => (o.createdAt && o.createdAt.toMillis) ? o.createdAt.toMillis() : (o.date ? new Date(o.date).getTime() : 0);

    let windowOrders = null;
    const listed = window.adminLastOrdersList;
    if (Array.isArray(listed) && listed.length) {
      const oldestMs = Math.min(...listed.map(orderMs).filter(Boolean));
      if (!adminOrdersWindowCapped || (oldestMs && oldestMs <= windowStart.getTime())) windowOrders = listed;
    }
    if (!windowOrders) {
      if (window.__analyticsWindowCache && Date.now() - window.__analyticsWindowCache.at < 60000) {
        windowOrders = window.__analyticsWindowCache.orders;
      } else {
        const wsnap = await dbPaths.ordersCol().where('createdAt', '>=', windowStart).get();
        windowOrders = [];
        wsnap.forEach(d => windowOrders.push({ id: d.id, ...d.data() }));
        window.__analyticsWindowCache = { at: Date.now(), orders: windowOrders };
      }
    }
    const ordersSnap = { size: windowOrders.length, forEach: (fn) => windowOrders.forEach(o => fn({ data: () => o })) };
    totalOrdersCount = Math.max(windowOrders.length, (window.adminLastOrdersList || []).length, myOrders.length);

    const productSalesMap = {};

    ordersSnap.forEach(doc => {
      const o = doc.data();
      const oTotal = Number(o.total || o.verifiedTotal || 0);
      const oDate = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.date || '');
      const oTimeMs = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : (oDate ? new Date(oDate).getTime() : 0);
      if (resetAtMs && oTimeMs && oTimeMs < resetAtMs) return; // 🔄 استُبعد لأنه قبل نقطة إعادة التعيين
      const isToday = oDate.startsWith(todayStr);
      const isThisMonth = oDate.startsWith(currentMonthStr);
      const isYesterday = oDate.startsWith(yesterdayStr);
      const isLastMonth = oDate.startsWith(lastMonthStr);
      if (isToday) { dRev += oTotal; dOrders++; }
      if (isThisMonth) {
        mRev += oTotal; mOrders++;
        (o.items || []).forEach(it => {
          const prod = it && it.id ? findProduct(it.id) : null;
          const catLabel = prod ? (categories.find(c => c.id === prod.category)?.label || prod.category || 'غير مصنف') : (it.isBundle ? '🎁 بكجات' : 'غير مصنف');
          const lineRev = Number(it.lineTotal) || (Number(it.unitPrice || 0) * Number(it.quantity || 1));
          categoryRevMap[catLabel] = (categoryRevMap[catLabel] || 0) + lineRev;
        });
      }
      if (isYesterday) yRev += oTotal;
      if (isLastMonth) lmRev += oTotal;

      // 📊 (البند 10) صافي الربح اليومي/الشهري — يُحتسب من unitCostPrice المحفوظة كلقطة
      // داخل كل عنصر طلب وقت الشراء الفعلي (وليس السعر الحالي بالمخزون، تفادياً لتحريف
      // الأرباح التاريخية عند تغيّر أسعار التكلفة لاحقاً). البنود بلا تكلفة مسجّلة لا تُحتسب.
      (o.items || []).forEach(it => {
        if (it && it.id) {
          productSalesMap[it.id] = (productSalesMap[it.id] || 0) + Number(it.quantity || 1);
        }
        if (it && it.unitCostPrice !== undefined && it.unitCostPrice !== null) {
          const lineProfit = (Number(it.unitPrice || 0) - Number(it.unitCostPrice || 0)) * Number(it.quantity || 1);
          if (isToday) dProfit += lineProfit;
          if (isThisMonth) mProfit += lineProfit;
        }
      });
    });

    todayRevenue = dRev;
    monthlyRevenue = mRev;
    todayProfit = dProfit;
    monthlyProfit = mProfit;
    todayOrdersCount = dOrders;
    monthlyOrdersCount = mOrders;
    yesterdayRevenue = yRev;
    lastMonthRevenue = lmRev;
    avgOrderValueToday = dOrders > 0 ? Math.round(dRev / dOrders) : 0;
    avgOrderValueMonth = mOrders > 0 ? Math.round(mRev / mOrders) : 0;
    topCategoriesThisMonth = Object.entries(categoryRevMap)
      .map(([label, rev]) => ({ label, rev }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 5);

    products.forEach(p => {
      if (productSalesMap[p.id]) {
        p.orderCount = Math.max(Number(p.orderCount || 0), productSalesMap[p.id]);
      }
    });

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }
    
    // (تم إلغاء قراءة analytics_daily — لا يوجد عدّاد زيارات بعد الآن)
    todayVisitsCount = 0;
    weeklyVisitsData = [];

    renderRealAnalyticsView();
  } catch (e) { console.warn(e); }
}

// 🔄 (جديد — إعادة تعيين إحصائيات المبيعات من لوحة التحكم) لا تحذف أي طلب فعلي؛ فقط تسجّل
// "نقطة بداية" جديدة (salesStatsResetAt) بمستند الصيدلية، وتستبعد fetchRealAnalytics أي طلب
// أقدم منها عند حساب أرقام اليوم/الشهر — بيانات الطلبات والتقارير المالية تبقى سليمة بالكامل.
async function resetSalesStats() {
  if (!isSuperAdmin() && !isCurrentUserAdmin()) { showToast('⚠️ هذه الميزة متاحة للمشرفين فقط'); return; }
  if (!confirm('سيتم تصفير أرقام المبيعات المعروضة بلوحة التحكم (اليوم/الشهر) والبدء من جديد اعتباراً من الآن. الطلبات الفعلية والتقارير المالية لن تتأثر أو تُحذف. هل تريدين المتابعة؟')) return;

  try {
    const nowIso = new Date().toISOString();
    if (db) await dbPaths.pharmacyDoc().set({ salesStatsResetAt: nowIso }, { merge: true });
    pharmacyProfile.salesStatsResetAt = nowIso;
    showToast('✅ تم تصفير إحصائيات المبيعات — البدء من جديد الآن.');
    fetchRealAnalytics();
  } catch (err) {
    showToast('⚠️ تعذر تصفير الإحصائيات: ' + err.message);
  }
}

function renderRealAnalyticsView() {
  const statDailyRev = document.getElementById('statDailyRevenue');
  const statMonthlyRev = document.getElementById('statMonthlyRevenue');
  const statVisits = document.getElementById('statDailyVisits');
  const statOrders = document.getElementById('statTotalOrdersV');
  const statDailyProfitEl = document.getElementById('statDailyProfit');
  const statMonthlyProfitEl = document.getElementById('statMonthlyProfit');
  const statDailyOrdersEl = document.getElementById('statDailyOrders');
  const statMonthlyOrdersEl = document.getElementById('statMonthlyOrders');
  const resetInfoEl = document.getElementById('salesResetInfo');
  if (resetInfoEl) {
    resetInfoEl.textContent = pharmacyProfile.salesStatsResetAt
      ? `آخر تصفير: ${new Date(pharmacyProfile.salesStatsResetAt).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' })}`
      : '';
  }

  if (statDailyRev) statDailyRev.textContent = fmtPrice(todayRevenue);
  if (statMonthlyRev) statMonthlyRev.textContent = fmtPrice(monthlyRevenue);
  if (statVisits) statVisits.textContent = todayVisitsCount;
  if (statOrders) statOrders.textContent = totalOrdersCount;
  if (statDailyProfitEl) statDailyProfitEl.textContent = fmtPrice(todayProfit);
  if (statMonthlyProfitEl) statMonthlyProfitEl.textContent = fmtPrice(monthlyProfit);
  if (statDailyOrdersEl) statDailyOrdersEl.textContent = todayOrdersCount;
  if (statMonthlyOrdersEl) statMonthlyOrdersEl.textContent = monthlyOrdersCount;

  // 📈📉 (إعادة بناء الداشبورد) شارات المقارنة — نسبة تغيّر مبيعات اليوم عن أمس، والشهر
  // الحالي عن الشهر الماضي، بلون أخضر للارتفاع وأحمر للانخفاض.
  const renderDeltaBadge = (elId, current, previous) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!previous || previous <= 0) { el.textContent = ''; el.style.display = 'none'; return; }
    const pct = Math.round(((current - previous) / previous) * 100);
    const isUp = pct >= 0;
    el.style.display = 'inline-flex';
    el.style.color = isUp ? '#059669' : '#DC2626';
    el.style.background = isUp ? '#ECFDF5' : '#FEF2F2';
    el.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(pct)}%`;
  };
  renderDeltaBadge('statDailyRevDelta', todayRevenue, yesterdayRevenue);
  renderDeltaBadge('statMonthlyRevDelta', monthlyRevenue, lastMonthRevenue);

  const aovDailyEl = document.getElementById('statAovDaily');
  const aovMonthlyEl = document.getElementById('statAovMonthly');
  if (aovDailyEl) aovDailyEl.textContent = fmtPrice(avgOrderValueToday);
  if (aovMonthlyEl) aovMonthlyEl.textContent = fmtPrice(avgOrderValueMonth);

  // 🗂️ (إعادة بناء الداشبورد) أداء الأقسام هذا الشهر — أي أقسام تحقق أعلى مبيعات فعلياً
  const catPerfEl = document.getElementById('adminCategoryPerfList');
  if (catPerfEl) {
    const maxCatRev = topCategoriesThisMonth.length ? Math.max(...topCategoriesThisMonth.map(c => c.rev), 1) : 1;
    catPerfEl.innerHTML = topCategoriesThisMonth.length === 0
      ? `<div class="no-results" style="padding:16px 0;">لا توجد مبيعات مصنّفة هذا الشهر بعد.</div>`
      : topCategoriesThisMonth.map(c => {
          const pct = Math.round((c.rev / maxCatRev) * 100);
          return `
            <div class="admin-rank-item-pro">
              <div class="admin-rank-item-top">
                <span style="font-weight:800;">${sanitizeText(c.label)}</span>
                <span class="mono" style="font-weight:900; color:var(--accent);">${fmtPrice(c.rev)}</span>
              </div>
              <div class="admin-rank-bar-track"><div class="admin-rank-bar-fill" style="width:${pct}%;"></div></div>
            </div>`;
        }).join('');
  }

  const chartContainer = document.getElementById('adminRealChartBars');
  if (chartContainer && weeklyVisitsData.length > 0) {
    const maxVisits = Math.max(...weeklyVisitsData.map(v => v.visits), 1);
    chartContainer.innerHTML = weeklyVisitsData.map(d => {
      const pct = (d.visits > 0) ? Math.round((d.visits / maxVisits) * 90) + 10 : 4;
      return `
        <div class="chart-bar-col">
          <span class="mono" style="font-size:10px; font-weight:800; color:var(--accent);">${d.visits > 0 ? d.visits : '0'}</span>
          <div class="chart-bar-fill" style="height: ${pct}%;"></div>
          <span class="chart-bar-lbl">${d.day}</span>
        </div>`;
    }).join('');
  }

  const topOrdersEl = document.getElementById('adminTopOrderedList');
  if (topOrdersEl) {
    const topOrdered = products.filter(p => (Number(p.orderCount) || 0) > 0 && p.isDeleted !== true)
      .sort((a, b) => (Number(b.orderCount) || 0) - (Number(a.orderCount) || 0))
      .slice(0, 5);

    // 🏆 (البند 10) قسم "الأكثر مبيعاً" بشكل احترافي أكثر — ميداليات ذهبية/فضية/برونزية
    // للمراكز الثلاثة الأولى، وشريط تقدّم نسبي يقارن كل منتج بأعلى مبيعات مسجّلة.
    const medalIcons = ['🥇', '🥈', '🥉'];
    const maxOrderCount = topOrdered.length ? Math.max(...topOrdered.map(p => Number(p.orderCount) || 0), 1) : 1;

    topOrdersEl.innerHTML = topOrdered.length === 0 ? `<div class="no-results" style="padding:20px 0;">لا توجد مبيعات مسجلة حتى الآن.</div>` : 
      topOrdered.map((p, idx) => {
        const pct = Math.round(((Number(p.orderCount) || 0) / maxOrderCount) * 100);
        return `
        <div class="admin-rank-item admin-rank-item-pro">
          <div class="admin-rank-item-top">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="admin-rank-badge admin-rank-badge-pro">${medalIcons[idx] || (idx + 1)}</span>
              <span style="font-weight:800;">${sanitizeText(p.name)} <span style="font-weight:600; color:var(--text-soft); font-size:11.5px;">(${sanitizeText(p.brand || '')})</span></span>
            </div>
            <span class="mono" style="font-weight:900; color:var(--accent);">${p.orderCount} مبيعة</span>
          </div>
          <div class="admin-rank-bar-track"><div class="admin-rank-bar-fill" style="width:${pct}%;"></div></div>
        </div>`;
      }).join('');
  }
}

// 🛡️🔒 (إصلاح أمني — CSV/Formula Injection) اسم الزبون ورقم هاتفه يُكتبان من قبل الزبون
// نفسه عند الطلب بلا أي قيد، ثم يُدرجان هنا مباشرة داخل ملف CSV يفتحه الأدمن لاحقاً ببرنامج
// جداول بيانات (Excel/Sheets). لو بدأ الاسم بأحد الرموز =+-@ أو بحرف تبويب، تفسّره أغلب
// برامج الجداول كصيغة (Formula) قابلة للتنفيذ بدل نص عادي — وهي ثغرة معروفة (CSV/Formula
// Injection) قد تُستخدم لفتح روابط خبيثة أو تسريب بيانات من ملف الأدمن. الحل القياسي:
// إضافة علامة اقتباس أحادية ' في بداية أي قيمة تبدأ بأحد هذه الرموز، فتُجبر البرامج على
// معاملتها كنص صرف بدل صيغة، مع مضاعفة أي علامات اقتباس مزدوجة داخل القيمة كما كان يحدث
// سابقاً لحقل itemsFormatted فقط (والآن يُطبَّق على كل حقل نصي قادم من الزبون بلا استثناء).
function csvSafeField(val) {
  let s = String(val == null ? '' : val).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

// ================= التقرير المالي (جدول واحد واضح) =================
// بدل التقسيم السابق إلى 3 أقسام (مستحضرات/حليب/أسنان) الذي كان يكرر الطلب الواحد ويصعّب قراءته،
// صار التقرير جدولاً واحداً: كل صف = طلب واحد بكل تفاصيله (الزبون، الهاتف، العنوان، المنتجات، المجموع،
// الخصم، التوصيل، الإجمالي، التكلفة، صافي الربح، الحالة) وفوقه ملخص بالأرقام الإجمالية.
// يلتزم بنفس فلاتر "الفترة" و"الحالة" المعروضة على شاشة الطلبات. الطلبات الملغاة تظهر بالجدول لكنها
// لا تدخل بمجاميع المبيعات والأرباح.
// طلب بإجمالي أعلى من هذا الرقم يُعلَّم "مبلغ غير معتاد" بالتقرير (غالباً خطأ إدخال سعر) ولا يُستبعد من المجاميع
const REPORT_SUSPICIOUS_ORDER_TOTAL = 5000000;

function reportOrderTimeMs(o) {
  if (o.createdAt && typeof o.createdAt.toMillis === 'function') return o.createdAt.toMillis();
  const t = o.date ? new Date(o.date).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

function reportFormatDate(o) {
  const ms = reportOrderTimeMs(o);
  if (!ms) return String(o.date || '');
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function reportIsCancelled(o) {
  return !!(o.status && String(o.status).includes('ملغي'));
}

function filterOrdersForReport(orders) {
  const timeFilter = document.getElementById('reportTimeRange') ? document.getElementById('reportTimeRange').value : 'all';
  const statusFilter = document.getElementById('reportStatusFilter') ? document.getElementById('reportStatusFilter').value : 'all';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;
  return (orders || []).filter(o => {
    const ms = reportOrderTimeMs(o);
    if (timeFilter === 'today' && !(ms >= startOfToday)) return false;
    if (timeFilter === 'yesterday' && !(ms >= startOfToday - DAY && ms < startOfToday)) return false;
    if (timeFilter === 'week' && !(ms >= startOfToday - 6 * DAY)) return false;
    if (timeFilter === 'month' && !(ms >= new Date(now.getFullYear(), now.getMonth(), 1).getTime())) return false;
    const st = String(o.status || '');
    if (statusFilter === 'delivered' && !st.includes('التسليم')) return false;
    if (statusFilter === 'shipping' && !st.includes('الشحن')) return false;
    if (statusFilter === 'processing' && !st.includes('المعالجة')) return false;
    if (statusFilter === 'customer_cancelled' && !st.includes('الزبون')) return false;
    if (statusFilter === 'cancelled' && !st.includes('ملغي')) return false;
    return true;
  }).sort((x, y) => reportOrderTimeMs(y) - reportOrderTimeMs(x));
}

function reportPeriodLabel() {
  const t = document.getElementById('reportTimeRange') ? document.getElementById('reportTimeRange').value : 'all';
  const labels = { all: 'كل الطلبات المسجلة', today: 'اليوم', yesterday: 'أمس', week: 'آخر 7 أيام', month: 'هذا الشهر' };
  return labels[t] || labels.all;
}

// يحسب صفاً لكل طلب + المجاميع
function computeReportRows(orders) {
  const rows = [];
  const totals = { orders: 0, cancelled: 0, itemsTotal: 0, discount: 0, delivery: 0, grand: 0, cost: 0, profit: 0, missingCostOrders: 0 };
  orders.forEach(o => {
    const cancelled = reportIsCancelled(o);
    const grand = Number(o.total || 0);
    const delivery = (o.deliveryFee !== undefined && o.deliveryFee !== null)
      ? Number(o.deliveryFee)
      : ((o.deliveryMethod === 'express') ? Number(pharmacyProfile.deliveryFeeExpress || 8000) : Number(pharmacyProfile.deliveryFeeStandard || 4000));
    const discount = Number(o.discountAmount || 0);
    const itemsTotal = (o.subtotal !== undefined && o.subtotal !== null)
      ? Number(o.subtotal)
      : (o.items || []).reduce((sum, it) => sum + (Number(it.lineTotal) || (Number(it.unitPrice || it.price || 0) * Number(it.quantity || 1))), 0);

    let cost = 0, missing = false;
    (o.items || []).forEach(it => {
      const qty = Number(it.quantity || 1);
      if (!it.isBundle && it.unitCostPrice !== undefined && it.unitCostPrice !== null) cost += Number(it.unitCostPrice) * qty;
      else missing = true;
    });
    const productsRevenue = Math.max(0, grand - delivery);   // المبلغ الذي يخص المنتجات بعد الخصم
    const profit = productsRevenue - cost;
    const itemsText = (o.items || []).map(it => `${it.name || 'منتج'} × ${Number(it.quantity || 1)}`).join(' + ');

    rows.push({
      id: o.id || '', date: reportFormatDate(o), name: o.name || '', phone: o.phone || '', address: o.address || '',
      items: itemsText, itemsTotal, discount, delivery, grand, cost, profit, missing, cancelled, status: String(o.status || '').replace(/[🚚🛵✅❌]/g, '').trim(),
      suspicious: grand > REPORT_SUSPICIOUS_ORDER_TOTAL,
      lines: (o.items || []).map(it => {
        const qty = Number(it.quantity || 1);
        const unit = Number(it.unitPrice || it.price || 0);
        const lineTotal = Number(it.lineTotal) || unit * qty;
        const unitCost = (!it.isBundle && it.unitCostPrice !== undefined && it.unitCostPrice !== null) ? Number(it.unitCostPrice) : null;
        return { name: it.name || 'منتج', qty, unit, lineTotal, unitCost, lineProfit: unitCost === null ? null : lineTotal - unitCost * qty };
      })
    });
    if (grand > REPORT_SUSPICIOUS_ORDER_TOTAL) totals.suspiciousOrders = (totals.suspiciousOrders || 0) + 1;
    if (cancelled) { totals.cancelled++; return; }
    totals.orders++;
    totals.itemsTotal += itemsTotal; totals.discount += discount; totals.delivery += delivery;
    totals.grand += grand; totals.cost += cost; totals.profit += profit;
    if (missing) totals.missingCostOrders++;
  });
  return { rows, totals };
}

async function getReportSourceOrders() {
  let orders = window.adminLastOrdersList || [];
  if (orders.length === 0 && db) {
    // 🛡️ حد أقصى 1000 طلب (كان يقرأ كل الطلبات التاريخية)
    const snap = await dbPaths.ordersCol().orderBy('createdAt', 'desc').limit(1000).get();
    snap.forEach(d => orders.push(d.data()));
  }
  if (orders.length === 0) orders = myOrders;
  return orders;
}

const fmtReportNum = (n) => Number(n || 0).toLocaleString('en-US');

async function buildDetailedOrdersCSV() {
  const source = await getReportSourceOrders();
  const orders = filterOrdersForReport(source);
  const { rows, totals } = computeReportRows(orders);
  const q = (v) => `"${csvSafeField(v)}"`;
  const lines = [];
  lines.push([q(`تقرير مبيعات ${pharmacyProfile.name || currentPharmacyId}`)].join(','));
  lines.push([q('الفترة'), q(reportPeriodLabel())].join(','));
  lines.push([q('تاريخ التقرير'), q(reportFormatDate({ date: new Date().toISOString() }))].join(','));
  lines.push('');
  lines.push([q('عدد الطلبات (بدون الملغاة)'), totals.orders].join(','));
  lines.push([q('مبيعات المنتجات (بعد الخصم، بدون توصيل)'), totals.grand - totals.delivery].join(','));
  lines.push([q('أجور التوصيل'), totals.delivery].join(','));
  lines.push([q('إجمالي المقبوض (مع التوصيل)'), totals.grand].join(','));
  lines.push([q('تكلفة البضاعة'), totals.cost].join(','));
  lines.push([q('صافي الربح (بدون التوصيل)'), totals.profit].join(','));
  if (totals.cancelled) lines.push([q('طلبات ملغاة (غير محسوبة)'), totals.cancelled].join(','));
  if (totals.missingCostOrders) lines.push([q('تنبيه'), q(`${totals.missingCostOrders} طلب فيه منتج بلا سعر تكلفة — الربح أعلى من الحقيقي لهذه الطلبات`)].join(','));
  lines.push('');
  lines.push(['رقم الطلب', 'التاريخ', 'اسم الزبون', 'رقم الهاتف', 'العنوان', 'المنتجات', 'مجموع المنتجات', 'الخصم', 'أجرة التوصيل', 'الإجمالي مع التوصيل', 'تكلفة البضاعة', 'صافي الربح', 'الحالة', 'ملاحظة'].map(q).join(','));
  rows.forEach(r => {
    lines.push([
      q(r.id), q(r.date), q(r.name), q(r.phone), q(r.address), q(r.items),
      r.itemsTotal, r.discount, r.delivery, r.grand,
      r.cancelled ? 0 : r.cost, r.cancelled ? 0 : r.profit,
      q(r.status), q(r.cancelled ? 'ملغي — غير محسوب' : (r.missing ? 'تكلفة ناقصة' : ''))
    ].join(','));
  });
  return { csv: lines.join('\r\n'), totals, rowsCount: rows.length };
}

async function buildOrdersReportHTML() {
  const source = await getReportSourceOrders();
  const orders = filterOrdersForReport(source);
  const { rows, totals } = computeReportRows(orders);
  const esc = (v) => sanitizeText(String(v == null ? '' : v));
  const card = (label, value, color) => `<div class="card"><div class="lbl">${label}</div><div class="val" style="color:${color || '#111'}">${value}</div></div>`;
  const body = rows.map(r => `
    <tr class="${r.cancelled ? 'cancelled' : ''}${r.suspicious ? ' suspicious' : ''}">
      <td>${esc(r.id)}</td><td>${esc(r.date)}</td><td>${esc(r.name)}</td><td dir="ltr">${esc(r.phone)}</td>
      <td>${esc(r.address)}</td><td>${esc(r.items)}</td>
      <td class="n">${fmtReportNum(r.itemsTotal)}</td><td class="n">${r.discount ? fmtReportNum(r.discount) : '—'}</td>
      <td class="n">${fmtReportNum(r.delivery)}</td><td class="n b">${fmtReportNum(r.grand)}</td>
      <td class="n">${r.cancelled ? '—' : fmtReportNum(r.cost)}</td>
      <td class="n b ${r.profit < 0 ? 'neg' : 'pos'}">${r.cancelled ? '—' : fmtReportNum(r.profit)}${r.missing && !r.cancelled ? ' *' : ''}</td>
      <td>${esc(r.status)}${r.cancelled ? ' (غير محسوب)' : ''}</td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>تقرير مبيعات ${esc(pharmacyProfile.name || currentPharmacyId)}</title>
<style>
  body{font-family:-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;background:#f6f7f9;color:#111;margin:0;padding:18px}
  h1{margin:0 0 4px;font-size:22px} .sub{color:#666;font-size:13px;margin-bottom:14px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
  .lbl{font-size:12px;color:#666;margin-bottom:6px} .val{font-size:20px;font-weight:800}
  .wrap{overflow-x:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
  table{border-collapse:collapse;width:100%;min-width:1100px;font-size:13px}
  th{background:#111827;color:#fff;padding:9px 8px;text-align:right;position:sticky;top:0;white-space:nowrap}
  td{padding:8px;border-top:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa} tr.cancelled td{color:#9ca3af;text-decoration:line-through} tr.suspicious td{background:#fef2f2 !important;font-weight:700}
  .n{text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums} .b{font-weight:800} .pos{color:#15803d} .neg{color:#b91c1c}
  .note{margin-top:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;font-size:13px}
  @media print{body{background:#fff;padding:0}.wrap{border:0}th{position:static}}
</style></head><body>
<h1>📊 تقرير مبيعات ${esc(pharmacyProfile.name || currentPharmacyId)}</h1>
<div class="sub">الفترة: ${esc(reportPeriodLabel())} — أُنشئ في ${esc(reportFormatDate({ date: new Date().toISOString() }))} — المبالغ بالدينار العراقي</div>
<div class="cards">
  ${card('عدد الطلبات', totals.orders)}
  ${card('مبيعات المنتجات', fmtReportNum(totals.grand - totals.delivery))}
  ${card('أجور التوصيل', fmtReportNum(totals.delivery))}
  ${card('إجمالي المقبوض', fmtReportNum(totals.grand), '#1d4ed8')}
  ${card('تكلفة البضاعة', fmtReportNum(totals.cost))}
  ${card('صافي الربح', fmtReportNum(totals.profit), totals.profit < 0 ? '#b91c1c' : '#15803d')}
</div>
<div class="wrap"><table>
<thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الزبون</th><th>الهاتف</th><th>العنوان</th><th>المنتجات</th><th>مجموع المنتجات</th><th>الخصم</th><th>التوصيل</th><th>الإجمالي مع التوصيل</th><th>التكلفة</th><th>صافي الربح</th><th>الحالة</th></tr></thead>
<tbody>${body || '<tr><td colspan="13" style="text-align:center;padding:24px;color:#666">لا توجد طلبات ضمن هذا الفلتر</td></tr>'}</tbody>
</table></div>
${totals.cancelled ? `<div class="note">يوجد ${totals.cancelled} طلب ملغي ظاهر بالجدول بخط مشطوب وغير محسوب بالمجاميع.</div>` : ''}
${totals.suspiciousOrders ? `<div class="note" style="color:#991B1B;background:#FEF2F2;border-color:#FECACA">⚠️ يوجد ${totals.suspiciousOrders} طلب بمبلغ غير معتاد (أكثر من ${fmtReportNum(REPORT_SUSPICIOUS_ORDER_TOTAL)} د.ع). غالباً خطأ بإدخال سعر منتج — راجعيه، فهو يؤثر على كل المجاميع والأرباح.</div>` : ''}
${totals.missingCostOrders ? `<div class="note">* ${totals.missingCostOrders} طلب فيه منتج بلا سعر تكلفة، لذلك صافي الربح لهذه الطلبات أعلى من الحقيقي. أضيفي سعر التكلفة للمنتجات لتصبح الأرباح دقيقة.</div>` : ''}
<div class="note" style="color:#374151;background:#f3f4f6;border-color:#e5e7eb">صافي الربح = (إجمالي الطلب − أجرة التوصيل) − تكلفة البضاعة وقت البيع. أجرة التوصيل لا تُحتسب ربحاً.</div>
</body></html>`;
}

function downloadReportFile(content, fileName, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function reportFileStamp() {
  return new Date().toISOString().split('T')[0];
}

// ================= ملف Excel حقيقي (.xlsx) بتنسيق منظّم =================
// بدل CSV الخام الذي كان يظهر عشوائياً (أرقام الهاتف والمبالغ تتحول لروابط، بلا ألوان ولا عرض أعمدة):
// ملف xlsx حقيقي يُبنى بلا أي مكتبة: ورقة "التقرير" (ملخص + جدول الطلبات + المجموع) وورقة "تفاصيل المنتجات".
// يفتح على Excel وNumbers وGoogle Sheets ومعاينة الآيباد. الجدول من اليمين لليسار، الترويسة مثبّتة، الأرقام بفواصل.
const XLSX_STYLE = { DEFAULT: 0, TITLE: 1, LABEL: 2, SUM_NUM: 3, HEADER: 4, TEXT: 5, NUM: 6, TEXT_CANCEL: 7, NUM_CANCEL: 8, TOTAL_LABEL: 9, TOTAL_NUM: 10, PROFIT_POS: 11, PROFIT_NEG: 12, NOTE: 13, WARN_TEXT: 14, WARN_NUM: 15, SUBTITLE: 16 };

const xlsxEsc = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xlsxCol = (i) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function xlsxCell(ref, cell) {
  if (cell === null || cell === undefined || cell === '') return cell && cell.s ? `<c r="${ref}"/>` : '';
  const c = (typeof cell === 'object') ? cell : { v: cell };
  const style = c.s !== undefined ? ` s="${c.s}"` : '';
  if (c.v === null || c.v === undefined || c.v === '') return `<c r="${ref}"${style}/>`;
  if (typeof c.v === 'number' && isFinite(c.v)) return `<c r="${ref}"${style}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xlsxEsc(c.v)}</t></is></c>`;
}

// sheet = { name, rows: [[cell|value,...],...], widths: [..], merges: ['A1:F1'], freezeRow: n (عدد الصفوف المثبّتة), heights: {rowIndex: pt} }
function buildSheetXml(sheet) {
  const rowsXml = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => xlsxCell(xlsxCol(c) + (r + 1), cell)).join('');
    const h = sheet.heights && sheet.heights[r] ? ` ht="${sheet.heights[r]}" customHeight="1"` : '';
    return `<row r="${r + 1}"${h}>${cells}</row>`;
  }).join('');
  const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = sheet.freezeRow ? `<pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` : '';
  const merges = (sheet.merges && sheet.merges.length) ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rowsXml}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function buildXlsxStylesXml() {
  const font = (opts) => `<font>${opts.b ? '<b/>' : ''}${opts.i ? '<i/>' : ''}${opts.strike ? '<strike/>' : ''}<sz val="${opts.sz || 11}"/><color rgb="${opts.color || 'FF111827'}"/><name val="Arial"/></font>`;
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF111827"/></patternFill></fill>',     // 2 داكن (ترويسة)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill>',     // 3 رمادي فاتح
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/></patternFill></fill>',     // 4 أحمر فاتح (تحذير)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFBEB"/></patternFill></fill>',     // 5 أصفر فاتح (ملاحظة)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>'];    // 6 أزرق فاتح (عنوان فرعي)
  const border = '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>';
  const fonts = [font({}), font({ b: 1 }), font({ b: 1, color: 'FFFFFFFF' }), font({ b: 1, sz: 16 }), font({ strike: 1, color: 'FF9CA3AF' }), font({ b: 1, color: 'FF15803D' }), font({ b: 1, color: 'FFB91C1C' }), font({ i: 1, color: 'FF92400E' }), font({ b: 1, sz: 12, color: 'FF1D4ED8' })];
  // [fontId, fillId, borderId, numFmtId, halign, wrap]
  const xfs = [
    [0, 0, 0, 0, 'right', 0],      // 0 افتراضي
    [3, 0, 0, 0, 'right', 0],      // 1 عنوان
    [1, 3, 1, 0, 'right', 0],      // 2 تسمية الملخص
    [1, 3, 1, 3, 'left', 0],       // 3 قيمة الملخص (#,##0)
    [2, 2, 1, 0, 'center', 1],     // 4 ترويسة الجدول
    [0, 0, 1, 49, 'right', 1],     // 5 نص (خلية نصية)
    [0, 0, 1, 3, 'left', 0],       // 6 رقم (#,##0)
    [4, 0, 1, 49, 'right', 1],     // 7 نص ملغي
    [4, 0, 1, 3, 'left', 0],       // 8 رقم ملغي
    [1, 3, 1, 0, 'right', 0],      // 9 تسمية المجموع
    [1, 3, 1, 3, 'left', 0],       // 10 رقم المجموع
    [5, 0, 1, 3, 'left', 0],       // 11 ربح موجب
    [6, 0, 1, 3, 'left', 0],       // 12 ربح سالب
    [7, 5, 0, 0, 'right', 1],      // 13 ملاحظة
    [1, 4, 1, 49, 'right', 1],     // 14 نص تحذير
    [1, 4, 1, 3, 'left', 0],       // 15 رقم تحذير
    [8, 6, 0, 0, 'right', 0]       // 16 عنوان فرعي
  ];
  const xfXml = xfs.map(([f, fl, b, nf, h, w]) => `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="center"${w ? ' wrapText="1"' : ''}/></xf>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfXml}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

let __crcTable = null;
function xlsxCrc32(bytes) {
  if (!__crcTable) { __crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); __crcTable[n] = c >>> 0; } }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = __crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ZIP بدون ضغط (store) — كافٍ لملف xlsx صغير، وبلا أي اعتماد خارجي
function xlsxZip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.content), crc = xlsxCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let pos = 0; all.forEach(p => { out.set(p, pos); pos += p.length; });
  return out;
}

function buildXlsxFile(sheets) {
  const sheetEntries = sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: buildSheetXml(sh) }));
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${xlsxEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return xlsxZip([
    { name: '[Content_Types].xml', content: ct }, { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: wb }, { name: 'xl/_rels/workbook.xml.rels', content: wbRels },
    { name: 'xl/styles.xml', content: buildXlsxStylesXml() }, ...sheetEntries
  ]);
}

// يحوّل الطلبات المفلترة إلى ورقتَي Excel
async function buildOrdersXlsxSheets() {
  const source = await getReportSourceOrders();
  const orders = filterOrdersForReport(source);
  const { rows, totals } = computeReportRows(orders);
  const S = XLSX_STYLE;
  const colCount = 13;
  const T = (v, s = S.TEXT) => ({ v, s });
  const N = (v, s = S.NUM) => ({ v: Number(v) || 0, s });
  const main = [];
  const merges = [];
  const mergeRow = (rowIdx) => merges.push(`A${rowIdx + 1}:${xlsxCol(colCount - 1)}${rowIdx + 1}`);

  main.push([T(`📊 تقرير مبيعات ${pharmacyProfile.name || currentPharmacyId}`, S.TITLE)]); mergeRow(0);
  main.push([T(`الفترة: ${reportPeriodLabel()}   |   أُنشئ في: ${reportFormatDate({ date: new Date().toISOString() })}   |   المبالغ بالدينار العراقي`, S.SUBTITLE)]); mergeRow(1);
  main.push([]);
  // ملخص: تسمية (A:C) + قيمة (D:E)
  const summary = [
    ['عدد الطلبات (بدون الملغاة)', totals.orders], ['مبيعات المنتجات (بعد الخصم، بدون توصيل)', totals.grand - totals.delivery],
    ['أجور التوصيل', totals.delivery], ['إجمالي المقبوض (مع التوصيل)', totals.grand],
    ['تكلفة البضاعة', totals.cost], ['صافي الربح (بدون التوصيل)', totals.profit]
  ];
  summary.forEach(([label, val]) => {
    const r = main.length;
    main.push([T(label, S.LABEL), T('', S.LABEL), T('', S.LABEL), N(val, S.SUM_NUM), T('', S.LABEL)]);
    merges.push(`A${r + 1}:C${r + 1}`, `D${r + 1}:E${r + 1}`);
  });
  if (totals.cancelled) { const r = main.length; main.push([T('طلبات ملغاة (غير محسوبة بالمجاميع)', S.LABEL), T('', S.LABEL), T('', S.LABEL), N(totals.cancelled, S.SUM_NUM), T('', S.LABEL)]); merges.push(`A${r + 1}:C${r + 1}`, `D${r + 1}:E${r + 1}`); }
  const addNote = (txt, style = S.NOTE) => { const r = main.length; main.push([T(txt, style)]); mergeRow(r); };
  if (totals.suspiciousOrders) addNote(`⚠️ يوجد ${totals.suspiciousOrders} طلب بمبلغ غير معتاد (أكثر من ${fmtReportNum(REPORT_SUSPICIOUS_ORDER_TOTAL)} د.ع) — غالباً خطأ بإدخال سعر منتج، راجعيه فهو يؤثر على كل المجاميع. الصف الأحمر بالجدول.`, S.WARN_TEXT);
  if (totals.missingCostOrders) addNote(`* ${totals.missingCostOrders} طلب فيه منتج بلا سعر تكلفة، فربحه أعلى من الحقيقي. أضيفي سعر التكلفة للمنتجات لتصبح الأرباح دقيقة.`);
  addNote('صافي الربح = (إجمالي الطلب − أجرة التوصيل) − تكلفة البضاعة وقت البيع. أجرة التوصيل لا تُحتسب ربحاً.');
  main.push([]);

  const headerRowIdx = main.length;
  const headers = ['رقم الطلب', 'التاريخ', 'اسم الزبون', 'رقم الهاتف', 'العنوان', 'المنتجات', 'مجموع المنتجات', 'الخصم', 'أجرة التوصيل', 'الإجمالي مع التوصيل', 'تكلفة البضاعة', 'صافي الربح', 'الحالة'];
  main.push(headers.map(h => T(h, S.HEADER)));
  rows.forEach(r => {
    const tx = r.cancelled ? S.TEXT_CANCEL : (r.suspicious ? S.WARN_TEXT : S.TEXT);
    const nm = r.cancelled ? S.NUM_CANCEL : (r.suspicious ? S.WARN_NUM : S.NUM);
    const profitStyle = r.cancelled ? S.NUM_CANCEL : (r.suspicious ? S.WARN_NUM : (r.profit < 0 ? S.PROFIT_NEG : S.PROFIT_POS));
    main.push([
      T(r.id, tx), T(r.date, tx), T(r.name, tx), T(String(r.phone || ''), tx), T(r.address, tx), T(r.items, tx),
      N(r.itemsTotal, nm), N(r.discount, nm), N(r.delivery, nm), N(r.grand, nm),
      r.cancelled ? T('—', tx) : N(r.cost, nm), r.cancelled ? T('—', tx) : N(r.profit, profitStyle),
      T(r.cancelled ? `${r.status} (غير محسوب)` : (r.missing ? `${r.status} — تكلفة ناقصة` : r.status), tx)
    ]);
  });
  const sumOf = (k) => rows.filter(r => !r.cancelled).reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const totalRowIdx = main.length;
  main.push([T('المجموع (بدون الملغاة)', S.TOTAL_LABEL), T('', S.TOTAL_LABEL), T('', S.TOTAL_LABEL), T('', S.TOTAL_LABEL), T('', S.TOTAL_LABEL), T('', S.TOTAL_LABEL),
    N(sumOf('itemsTotal'), S.TOTAL_NUM), N(sumOf('discount'), S.TOTAL_NUM), N(sumOf('delivery'), S.TOTAL_NUM), N(sumOf('grand'), S.TOTAL_NUM),
    N(sumOf('cost'), S.TOTAL_NUM), N(sumOf('profit'), S.TOTAL_NUM), T('', S.TOTAL_LABEL)]);
  merges.push(`A${totalRowIdx + 1}:F${totalRowIdx + 1}`);

  const heights = { 0: 30, [headerRowIdx]: 26 };
  const sheet1 = { name: 'التقرير', rows: main, merges, freezeRow: headerRowIdx + 1, heights, widths: [16, 17, 18, 15, 28, 44, 15, 11, 13, 16, 15, 15, 24] };

  // ورقة 2: سطر لكل منتج مباع
  const d = [[T('رقم الطلب', S.HEADER), T('التاريخ', S.HEADER), T('اسم الزبون', S.HEADER), T('المنتج', S.HEADER), T('الكمية', S.HEADER), T('سعر الوحدة', S.HEADER), T('إجمالي السطر', S.HEADER), T('تكلفة الوحدة', S.HEADER), T('ربح السطر', S.HEADER), T('الحالة', S.HEADER)]];
  rows.forEach(r => (r.lines || []).forEach(l => {
    const tx = r.cancelled ? S.TEXT_CANCEL : S.TEXT, nm = r.cancelled ? S.NUM_CANCEL : S.NUM;
    d.push([T(r.id, tx), T(r.date, tx), T(r.name, tx), T(l.name, tx), N(l.qty, nm), N(l.unit, nm), N(l.lineTotal, nm),
      l.unitCost === null ? T('—', tx) : N(l.unitCost, nm), l.lineProfit === null ? T('—', tx) : N(l.lineProfit, r.cancelled ? S.NUM_CANCEL : (l.lineProfit < 0 ? S.PROFIT_NEG : S.PROFIT_POS)), T(r.cancelled ? 'ملغي (غير محسوب)' : r.status, tx)]);
  }));
  const sheet2 = { name: 'تفاصيل المنتجات', rows: d, freezeRow: 1, heights: { 0: 26 }, widths: [16, 17, 18, 36, 9, 14, 15, 14, 14, 22] };
  return { sheets: [sheet1, sheet2], rowsCount: rows.length };
}

// 🔒 التقرير المالي يحتوي التكلفة وصافي الربح: لأونر الصيدلية (وللمشرف العام) فقط.
async function exportOrdersToCSV() {
  if (!assertCan('reports')) return;
  showToast('جاري تجهيز ملف Excel...');
  try {
    const { sheets, rowsCount } = await buildOrdersXlsxSheets();
    const bytes = buildXlsxFile(sheets);
    downloadReportFile(bytes, `Sales_Report_${currentPharmacyId}_${reportFileStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showToast(`تم تنزيل ملف Excel (${rowsCount} طلب) 📊`);
  } catch (e) {
    console.error('xlsx failed, falling back to CSV:', e);
    try {
      const report = await buildDetailedOrdersCSV();
      downloadReportFile('\uFEFF' + report.csv, `Sales_Report_${currentPharmacyId}_${reportFileStamp()}.csv`, 'text/csv;charset=utf-8;');
      showToast(`تم تنزيل التقرير بصيغة CSV (${report.rowsCount} طلب)`);
    } catch (e2) { console.error(e2); showToast('⚠️ تعذر إنشاء التقرير'); }
  }
}

// 🆕 تقرير بصفحة واضحة (يفتح على الآيباد/الموبايل مباشرة، قابل للطباعة أو الحفظ PDF)
async function exportOrdersReportHTML() {
  if (!assertCan('reports')) return;
  showToast('جاري تجهيز التقرير...');
  try {
    const html = await buildOrdersReportHTML();
    downloadReportFile(html, `Sales_Report_${currentPharmacyId}_${reportFileStamp()}.html`, 'text/html;charset=utf-8;');
    showToast('تم تنزيل التقرير ✅ افتحيه من التنزيلات');
  } catch (e) { console.error(e); showToast('⚠️ تعذر إنشاء التقرير'); }
}
