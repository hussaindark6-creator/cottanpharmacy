/* ==========================================================
   admin-settings.js — الإعدادات: الأقسام، الماركات، الموظفون، الاشتراك والدفع، الإشعارات
   جزء من لوحة تحكم الأدمن (كان ملف admin-panel.js الواحد). سكربت كلاسيكي بلا تغيير بالمنطق،
   يتشارك النطاق العام مع بقية الملفات: يُحمَّل مع كل ملفات admin-*.js قبل script.js (admin.html)
   أو كسلاً عبر admin-stubs.js لحساب الأدمن (index.html).
   ========================================================== */

function resetAdminCatForm() {
  if (!document.getElementById('adminCatKeyId')) return;
  document.getElementById('adminCatKeyId').value = '';
  document.getElementById('adminCatLabel').value = '';
  document.getElementById('adminCatIdInput').value = '';
  document.getElementById('adminCatIdInput').disabled = false;
  document.getElementById('adminCatImgUrl').value = '';
  document.getElementById('adminCatImgPreviewBox').style.display = 'none';
  document.getElementById('adminCatFormTitle').textContent = 'إضافة قسم رئيسي جديد';
  document.getElementById('adminSaveCatBtn').textContent = '💾 حفظ القسم في قاعدة البيانات';
}

async function handleAdminCategorySave(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveAdminCat', 1200)) return;

  const catKey = document.getElementById('adminCatKeyId').value.trim();
  const id = document.getElementById('adminCatIdInput').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const label = document.getElementById('adminCatLabel').value.trim();
  const imageUrl = sanitizeUrl(document.getElementById('adminCatImgUrl').value.trim());
  const iconSelectEl = document.getElementById('adminCatIconSelect');
  const icon = iconSelectEl ? iconSelectEl.value : 'jar';

  if (!id || !label) {
    showToast('يرجى كتابة اسم القسم والمعرف بشكل صحيح');
    return;
  }

  const payload = { id: catKey || id, label: sanitizeText(label), imageUrl, icon: sanitizeText(icon) };

  try {
    if (db) await dbPaths.categoriesCol().doc(payload.id).set(payload, { merge: true });
    refreshStorefrontCache();
    showToast('تم حفظ القسم بنجاح في قاعدة البيانات ✓');
    resetAdminCatForm();
    populateCategoryDropdowns();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ القسم');
  }
}

function previewBrandLogoImg(url) {
  const wrap = document.getElementById('adminBrandLogoPreviewWrap');
  const img = document.getElementById('adminBrandLogoPreviewImg');
  const cleanUrl = sanitizeUrl(url);
  if (cleanUrl && wrap && img) { img.src = cleanUrl; wrap.style.display = 'block'; }
  else if (wrap) { wrap.style.display = 'none'; }
}

function editAdminBrand(brandKey) {
  const b = brandsData[brandKey];
  if (!b) return;
  document.getElementById('adminBrandOriginalKey').value = brandKey;
  document.getElementById('adminBrandNameInput').value = b.name || brandKey;
  document.getElementById('adminBrandColorInput').value = b.color || '#E85D8A';
  document.getElementById('adminBrandLogoInput').value = b.logoUrl || '';
  if (b.logoUrl) previewBrandLogoImg(b.logoUrl);
  
  document.getElementById('adminBrandFormTitle').textContent = '✏️ تعديل الماركة: ' + (b.name || brandKey);
  document.getElementById('adminSaveBrandBtn').textContent = '💾 حفظ التعديلات';
  document.getElementById('adminCancelBrandBtn').style.display = 'block';
  window.scrollTo({ top: document.getElementById('adminSecBrands').offsetTop - 60, behavior: 'smooth' });
}

function cancelAdminBrandEdit() {
  if (!document.getElementById('adminBrandOriginalKey')) return;
  document.getElementById('adminBrandOriginalKey').value = '';
  document.getElementById('adminBrandNameInput').value = '';
  document.getElementById('adminBrandColorInput').value = '#E85D8A';
  document.getElementById('adminBrandLogoInput').value = '';
  document.getElementById('adminBrandLogoPreviewWrap').style.display = 'none';
  document.getElementById('adminBrandFormTitle').textContent = '🏢 إضافة ماركة جديدة';
  document.getElementById('adminSaveBrandBtn').textContent = '+ إضافة الماركة للشريط';
  document.getElementById('adminCancelBrandBtn').style.display = 'none';
}

async function handleSaveBrand(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('saveBrand', 1200)) return;

  const originalKey = document.getElementById('adminBrandOriginalKey').value.trim();
  const name = document.getElementById('adminBrandNameInput').value.trim();
  const color = document.getElementById('adminBrandColorInput').value;
  const logoUrl = sanitizeUrl(document.getElementById('adminBrandLogoInput').value.trim());
  if (!name) {
    showToast('يرجى كتابة اسم الماركة');
    return;
  }

  if (originalKey && originalKey !== name) {
    delete brandsData[originalKey];
  }

  brandsData[name] = { name: sanitizeText(name), color: sanitizeText(color), logoUrl };
  renderAdminBrandsList();
  renderBrandStrip();

  try {
    if (db) await dbPaths.pharmacyDoc().set({ brandsData }, { merge: true });
    refreshStorefrontCache();
    showToast(`تم حفظ وتحديث ماركة "${name}" بنجاح ✓`);
  } catch (err) { console.error(err); }
  cancelAdminBrandEdit();
}

async function deleteAdminBrand(brandKey) {
  if (!assertAdmin()) return;
  if (confirm(`هل أنتِ متأكدة من حذف ماركة "${brandKey}" من الشريط؟`)) {
    delete brandsData[brandKey];
    renderAdminBrandsList();
    renderBrandStrip();
    try {
      if (db) await dbPaths.pharmacyDoc().set({ brandsData }, { merge: true });
      refreshStorefrontCache();
      showToast('تم حذف الماركة بنجاح ✓');
    } catch (err) { console.error(err); }
  }
}

function renderAdminBrandsList() {
  const container = document.getElementById('adminBrandsListGrid');
  if (!container) return;
  const keys = Object.keys(brandsData);
  container.innerHTML = keys.map(k => {
    const b = brandsData[k];
    const cleanLogo = sanitizeUrl(b.logoUrl);
    return `
      <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden;">
            ${cleanLogo ? `<img src="${cleanLogo}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="width:14px; height:14px; border-radius:50%; background:${sanitizeText(b.color)};"></span>`}
          </div>
          <div>
            <div style="font-weight:800; font-size:13.5px;">${sanitizeText(b.name || k)}</div>
            <div style="font-size:11px; color:var(--text-soft); font-family:monospace;">${sanitizeText(b.color)}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button onclick="editAdminBrand('${sanitizeText(k)}')" style="background:#E0E7FF; color:#3730A3; padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">تعديل ✏️</button>
          <button onclick="deleteAdminBrand('${sanitizeText(k)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ================= 28. STAFF MANAGEMENT =================
async function fetchStaffList() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.staffCol().get();
    staffMembers = [];
    snap.forEach(d => staffMembers.push({ id: d.id, ...d.data() }));
    renderStaffList();
  } catch (err) { console.warn(err); }
}

function renderStaffList() {
  const container = document.getElementById('adminStaffListGrid');
  if (!container) return;

  if (staffMembers.length === 0) {
    container.innerHTML = `<div class="no-results" style="padding:14px 0;">لا يوجد موظفون مضافون لهذه الصيدلية حالياً.</div>`;
    return;
  }

  container.innerHTML = staffMembers.map(st => `
    <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:800; font-size:13.5px; color:var(--ink);">
          👤 ${sanitizeText(st.name || 'موظف')} (${sanitizeText(st.email)})
          <span class="log-badge" style="background:#E0E7FF; color:#3730A3;">${sanitizeText(ROLE_LABELS[normalizeStaffRole(st.role)] || 'دور غير معروف — لا صلاحيات')}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">
          الصلاحيات: ${sanitizeText(describeRolePerms(normalizeStaffRole(st.role)))}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button onclick="deleteStaffMember('${sanitizeText(st.id)}')" style="background:#FEE2E2; color:var(--red); padding:5px 10px; border-radius:8px; font-weight:800; font-size:11px;">حذف 🗑️</button>
      </div>
    </div>
  `).join('');
}

// وصف مختصر لصلاحيات كل دور (يظهر بقائمة الموظفين)
function describeRolePerms(roleKey) {
  if (roleKey === 'owner') return 'كل الميزات: الطلبات، المنتجات، التقارير، التسويق، الإعدادات، الموظفون';
  if (roleKey === 'cosmetics') return 'مشاهدة الطلبات + تعديل المنتجات + إضافة منتجات جديدة (بلا حذف/أرشفة أو تقارير)';
  if (roleKey === 'shift') return 'مشاهدة طلبات الزبائن فقط (بلا تقارير ولا تعديل)';
  return 'لا شيء';
}

async function handleAddStaffMember(e) {
  e.preventDefault();
  if (!assertCan('staff')) return;

  const email = document.getElementById('staffEmailInput').value.trim().toLowerCase();
  const name = document.getElementById('staffNameInput').value.trim();
  const role = normalizeStaffRole(document.getElementById('staffRoleSelect').value);

  if (!email || !name || !role) {
    showToast('يرجى كتابة اسم وبريد الموظف واختيار دوره');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('البريد الإلكتروني غير صحيح — يجب أن يكون حساب Google الذي سيسجّل به الموظف');
    return;
  }

  const staffDocId = email.replace(/[^a-z0-9]/g, '_');
  const payload = {
    email,
    name: sanitizeText(name),
    role,
    permissions: ROLE_PERMS[role],
    addedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    await dbPaths.staffCol().doc(staffDocId).set(payload, { merge: true });
    showToast(`تم إضافة الموظف "${name}" بنجاح ✓`);
    document.getElementById('staffEmailInput').value = '';
    document.getElementById('staffNameInput').value = '';
    fetchStaffList();
  }
}

async function deleteStaffMember(staffId) {
  if (!assertAdmin()) return;
  if (confirm('هل أنتِ متأكدة من حذف هذا الموظف؟')) {
    if (db) await dbPaths.staffCol().doc(staffId).delete();
    showToast('تم حذف الموظف بنجاح');
    fetchStaffList();
  }
}

// ================= 29. SUPER ADMIN PAYMENT INFO =================
async function fetchSuperAdminPaymentInfo() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await dbPaths.systemDoc('payment_info').get();
    if (snap.exists) {
      superAdminPaymentInfo = { ...superAdminPaymentInfo, ...snap.data() };
    }
    renderPharmacySubscriptionCard();
  } catch (e) {
    console.warn("Payment info fetch error:", e);
  }
}

function renderPharmacySubscriptionCard() {
  const container = document.getElementById('pharmacySubscriptionDetailsWrap');
  if (!container) return;

  const price = Number(pharmacyProfile.subscriptionPrice || 50000);
  const expiry = pharmacyProfile.subscriptionExpiry || '2099-12-31';

  const today = new Date();
  const expDate = new Date(expiry);
  const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
  const isExp = diffDays <= 0;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:18px;">
      <div style="background:#F0FDF4; border:1.5px solid #BBF7D0; border-radius:14px; padding:14px; text-align:center;">
        <div style="font-size:11.5px; font-weight:800; color:#15803D; margin-bottom:4px;">💰 سعر الاشتراك الشهري المعتمد</div>
        <div class="mono" style="font-size:20px; font-weight:900; color:#166534;">${fmtPrice(price)}</div>
      </div>
      <div style="background:${isExp ? '#FEF2F2' : '#EFF6FF'}; border:1.5px solid ${isExp ? '#FECACA' : '#BFDBFE'}; border-radius:14px; padding:14px; text-align:center;">
        <div style="font-size:11.5px; font-weight:800; color:${isExp ? '#DC2626' : '#1E40AF'}; margin-bottom:4px;">⏳ تاريخ انتهاء الصلاحية</div>
        <div class="mono" style="font-size:16px; font-weight:900; color:${isExp ? '#991B1B' : '#1E3A8A'};">${expiry} (${isExp ? 'منتهي' : diffDays + ' يوم متبقي'})</div>
      </div>
    </div>

    <div style="background:#F8FAFC; border:1.5px solid #E2E8F0; border-radius:16px; padding:18px; text-align:right;">
      <h4 style="margin:0 0 10px; font-size:14px; font-weight:900; color:#0F172A; display:flex; align-items:center; gap:6px;">
        💳 بيانات بطاقات ومحافظ الدفع المعتمدة للمنصة:
      </h4>
      <div style="font-size:12.5px; color:#334155; line-height:1.8; space-y:6px;">
        <div>👤 <b>اسم المستفيد:</b> <span class="mono">${sanitizeText(superAdminPaymentInfo.cardHolder || 'Hussain Admin')}</span></div>
        <div>💳 <b>رقم بطاقة Qi Card / ماستركارد:</b> <span class="mono" style="background:#E2E8F0; padding:2px 8px; border-radius:6px; font-weight:900;">${sanitizeText(superAdminPaymentInfo.qiCardNumber || '----')}</span></div>
        <div>📱 <b>محفظة زين كاش (ZainCash):</b> <span class="mono" style="background:#E2E8F0; padding:2px 8px; border-radius:6px; font-weight:900;">${sanitizeText(superAdminPaymentInfo.zainCashNumber || '07813703288')}</span></div>
        <div style="margin-top:8px; font-size:11.5px; color:#64748B;">📌 <i>${sanitizeText(superAdminPaymentInfo.notes || 'يرجى إرسال وصل التحويل عبر الواتساب لتجديد الاشتراك فورياً.')}</i></div>
      </div>
      
      <div style="margin-top:14px; display:flex; gap:10px;">
        <button type="button" onclick="sendRenewalReceiptWhatsApp(${price})" class="admin-btn-save" style="margin:0; background:linear-gradient(135deg, #25D366 0%, #128C7E 100%); font-size:13px;">
          📲 إرسال إشعار السداد ووصل التحويل عبر واتساب
        </button>
      </div>
    </div>
  `;
}

function sendRenewalReceiptWhatsApp(price) {
  const adminMsg = encodeURIComponent(`🌸 *طلب تجديد اشتراك صيدلية*\nاسم الصيدلية: ${pharmacyProfile.name}\nالمعرف: ${currentPharmacyId}\nالمبلغ المحول: ${price.toLocaleString()} د.ع\nتاريخ الطلب: ${new Date().toLocaleDateString('ar-IQ')}\nيرجى اعتماد التجديد.`);
  window.open(`https://wa.me/9647813703288?text=${adminMsg}`, '_blank');
}

async function handleSendBroadcastNotification(e) {
  e.preventDefault();
  if (!assertAdmin() || !lockAction('sendBroadcastNotif', 2000)) return;

  const title = document.getElementById('notifTitleInput').value.trim();
  const body = document.getElementById('notifBodyInput').value.trim();
  const type = document.getElementById('notifTypeInput').value;

  if (!title || !body) {
    showToast('يرجى تعبئة عنوان ونص الإشعار بالكامل');
    return;
  }

  try {
    if (db) {
      await dbPaths.notificationsCol().add({
        title: sanitizeText(title),
        body: sanitizeText(body),
        type: sanitizeText(type),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    refreshStorefrontCache();
    }
    document.getElementById('notifTitleInput').value = '';
    document.getElementById('notifBodyInput').value = '';
    showToast('🚀 تم إرسال الإشعار لجميع المستخدمين بنجاح!');
  } catch (err) {
    showToast('حدث خطأ أثناء إرسال الإشعار');
  }
}
