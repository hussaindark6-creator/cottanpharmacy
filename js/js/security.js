/* ==========================================================
   SaaS Multi-Tenant Engine — js/security.js
   Version: 4.2.0 (Zero-Trust Sanitization & Independent Security)
   ========================================================== */

import { auth, SUPER_ADMIN_EMAIL, WORKER_API_BASE, currentPharmacyId } from './config.js';

export function sanitizeText(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeHtml(str) {
  return sanitizeText(str);
}

export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (/^https?:\/\//i.test(clean) || clean.startsWith('/') || clean.startsWith('./') || clean.startsWith('data:image/')) {
    return encodeURI(clean).replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
  }
  return '';
}

export function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[\s\-_]+/g, ' ');
}

export function isSuperAdmin() {
  const user = auth ? auth.currentUser : null;
  return !!(user && user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim());
}

export function isCurrentUserAdmin(pharmacyProfile = null, currentStaffData = null) {
  if (isSuperAdmin()) return true;
  const user = auth ? auth.currentUser : null;
  if (user && pharmacyProfile && pharmacyProfile.adminEmail && user.email.toLowerCase().trim() === pharmacyProfile.adminEmail.toLowerCase().trim()) {
    return true;
  }
  if (!user || !currentStaffData) return false;
  return currentStaffData.role === 'owner' || currentStaffData.role === 'manager' || currentStaffData.role === 'admin';
}

export function assertAdmin(pharmacyProfile = null, currentStaffData = null, showToastFn = null) {
  if (!isCurrentUserAdmin(pharmacyProfile, currentStaffData)) {
    if (typeof showToastFn === 'function') {
      showToastFn('⚠️ غير مصرح: هذه العملية مخصصة لمشرف الصيدلية فقط.');
    }
    return false;
  }
  return true;
}

const actionLocks = new Map();
export function lockAction(actionKey, cooldownMs = 1500, showToastFn = null) {
  const now = Date.now();
  const last = actionLocks.get(actionKey) || 0;
  if (now - last < cooldownMs) {
    if (typeof showToastFn === 'function') {
      showToastFn('⏳ يرجى الانتظار لحظة قبل المحاولة مجدداً...');
    }
    return false;
  }
  actionLocks.set(actionKey, now);
  return true;
}

export function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const isIAB = /Telegram|Instagram|FBAN|FBAV|TikTok|Snapchat|Line|Twitter|MicroMessenger|WhatsApp|musical_ly/i.test(ua);
  let storageBlocked = false;
  try {
    sessionStorage.setItem('__test_storage', '1');
    sessionStorage.removeItem('__test_storage');
  } catch (e) {
    storageBlocked = true;
  }
  return isIAB || storageBlocked;
}

export async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Pharmacy-Id": currentPharmacyId,
    ...(options.headers || {})
  };

  const user = auth ? auth.currentUser : null;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (e) {
      console.warn("Could not get ID token:", e);
    }
  }

  try {
    const res = await fetch(`${WORKER_API_BASE}${endpoint}`, { ...options, headers });
    return await res.json();
  } catch (err) {
    return { success: false, fallback: true, error: err.message };
  }
}
