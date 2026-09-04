/* ==========================================================
   SaaS Multi-Tenant Engine — js/upload.js
   Version: 4.0.0 (Client-Side WebP Compressor & Cloud R2 Upload)
   ========================================================== */

import { WORKER_API_BASE, currentPharmacyId } from './config.js';

// ضغط وتصغير أبعاد الصورة عبر HTML5 Canvas
export async function compressImageToWebP(file, maxDimension = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // خطة طوارئ لو تعذر توليد WebP
              canvas.toBlob((fallbackBlob) => resolve(fallbackBlob), 'image/jpeg', quality);
            }
          },
          'image/webp',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// رفع الصور المباشر إلى Cloudflare R2
export async function uploadDirectImageFile(fileInput, targetHiddenUrlId, previewImgId, previewBoxId, showToastFn = null) {
  const file = fileInput.files[0];
  if (!file) return;

  if (typeof showToastFn === 'function') {
    showToastFn('جاري ضغط ومعالجة الصورة سحابياً... ⏳');
  }

  try {
    // 1. ضغط الصورة في المتصفح لتقليل الحجم بنسبة 85%
    const compressedBlob = await compressImageToWebP(file, 1200, 0.82);
    
    // 2. إرسال الصورة للووركر
    const formData = new FormData();
    formData.append('file', compressedBlob, `img_${Date.now()}.webp`);

    const res = await fetch(`${WORKER_API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 'X-Pharmacy-Id': currentPharmacyId },
      body: formData
    });

    const data = await res.json();
    if (data && data.success && data.imageUrl) {
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = data.imageUrl;

      if (previewImgId) {
        const previewEl = document.getElementById(previewImgId);
        if (previewEl) previewEl.src = data.imageUrl;
      }
      if (previewBoxId) {
        const previewBox = document.getElementById(previewBoxId);
        if (previewBox) previewBox.style.display = 'flex';
      }

      if (typeof showToastFn === 'function') {
        showToastFn('تم رفع وحفظ الصورة في Cloudflare R2 بنجاح! 📸');
      }
    } else {
      throw new Error(data.message || 'فشل السيرفر في قبول الصورة');
    }
  } catch (err) {
    console.warn("Upload fallback to base64:", err);
    // خطة الطوارئ المحلية
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      const hiddenInp = document.getElementById(targetHiddenUrlId);
      if (hiddenInp) hiddenInp.value = base64;
      if (previewImgId) document.getElementById(previewImgId).src = base64;
      if (previewBoxId) document.getElementById(previewBoxId).style.display = 'flex';
      if (typeof showToastFn === 'function') {
        showToastFn('تم حفظ الصورة محلياً بنجاح ✓');
      }
    };
    reader.readAsDataURL(file);
  }
}
