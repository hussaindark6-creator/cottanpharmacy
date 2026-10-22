// 🔁 أعد الطلب من صفحة طلباتي
// (ملف مستقل: يُحمَّل في index.html بعد script.js)

// ================= 🔁 أعد الطلب (يضيف المتوفر حالياً للسلة بأسعار اليوم) =================
function reorderMyOrder(orderId) {
  const ord = myOrders.find(o => String(o.id) === String(orderId));
  if (!ord) return;
  let added = 0, skipped = 0;
  (ord.items || []).forEach(it => {
    const rawId = String(it.id || '');
    const isBundle = !!it.isBundle || rawId.startsWith('bundle_');
    const item = isBundle ? findBundle(rawId.replace('bundle_', '')) : findProduct(rawId);
    const qty = Math.max(1, Math.min(99, Number(it.quantity || 1)));
    const available = item && (isBundle || (item.inStock !== false && (item.stockQuantity === undefined || item.stockQuantity > 0)));
    if (!available) { skipped++; return; }
    const key = isBundle ? (rawId.startsWith('bundle_') ? rawId : 'bundle_' + rawId) : rawId;
    cart[key] = Math.min(99, (cart[key] || 0) + qty);
    added++;
  });
  updateCartBadge();
  saveLocalState();
  if (!added) { showToast('⚠️ منتجات هذا الطلب غير متوفرة حالياً'); return; }
  showToast(skipped ? `🔁 أُضيف ${added} منتج للسلة (${skipped} غير متوفر حالياً)` : '🔁 أُضيفت منتجات الطلب للسلة');
  showView('cart');
}
