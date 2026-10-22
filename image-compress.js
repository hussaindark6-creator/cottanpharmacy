// 🗜️ ضغط صور المنتجات إلى WebP قبل الرفع (لوحة الأدمن)
// (ملف مستقل: يُحمَّل في admin.html)

// 🗜️ ضغط الصورة قبل الرفع: أقصى بُعد 1200px بصيغة WebP (جودة 82%). يوفّر مساحة R2 والبيانات ويسرّع الموقع.
// إن فشل الضغط أو لم يصغّر الحجم تُرفع الصورة الأصلية كما هي.
async function compressImageToWebp(file, maxDim = 1200, quality = 0.82) {
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch (e) { return file; }
}
