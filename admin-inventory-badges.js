// 🏷️ شارات المخزون المنخفض/قرب الانتهاء بكروت المنتجات (لوحة الأدمن)
// (ملف مستقل: يُحمَّل في admin.html)

// 🏷️ شارات تنبيه بكارت المنتج: منتهي/قريب الانتهاء (60 يوماً) + مخزون منخفض (حسب حد الصيدلية)
function adminStockExpiryBadges(p) {
  const out = [];
  const chip = (bg, color, text) => `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:999px;">${text}</span>`;
  const exp = p.expiryDate ? String(p.expiryDate).slice(0, 10) : '';
  if (exp) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(exp + 'T00:00:00') - today) / 86400000);
    if (!isNaN(days)) {
      if (days < 0) out.push(chip('#FEE2E2', '#991B1B', `⛔ منتهي (${exp})`));
      else if (days <= 60) out.push(chip('#FEF3C7', '#92400E', `⏳ ينتهي خلال ${days} يوم`));
    }
  }
  const th = pharmacyProfile && pharmacyProfile.lowStockThreshold !== undefined ? Number(pharmacyProfile.lowStockThreshold) || 0 : 5;
  const q = (p.stockQuantity !== undefined && p.stockQuantity !== null) ? Number(p.stockQuantity) : null;
  if (th > 0 && q !== null && q > 0 && q <= th) out.push(chip('#FFEDD5', '#9A3412', `⚠️ بقي ${q}`));
  return out.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin:4px 0;font-size:10.5px;font-weight:800;">${out.join('')}</div>` : '';
}
