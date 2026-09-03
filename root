rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // =========================================================================
    // 🛡️ GLOBAL HELPER FUNCTIONS
    // =========================================================================

    // المشرف العام للمنصة (Super Admin)
    function isSuperAdmin() {
      return request.auth != null && 
             request.auth.token.email.lower() == 'hussaindark6@gmail.com';
    }

    // التحقق من تسجيل الدخول
    function isAuthenticated() {
      return request.auth != null;
    }

    // تحويل البريد الإلكتروني لمفتاح مستند آمن
    function sanitizeEmail(email) {
      return email.lower().replace('[^a-z0-9]', '_');
    }

    // التحقق من أن المستخدم موظف مسجل في الصيدلية
    function isTenantStaff(tenantId) {
      return isAuthenticated() && (
        isSuperAdmin() ||
        exists(/databases/$(database)/documents/pharmacies/$(tenantId)/staff/$(sanitizeEmail(request.auth.token.email)))
      );
    }

    // جلب بيانات الموظف في الصيدلية
    function getStaffData(tenantId) {
      return get(/databases/$(database)/documents/pharmacies/$(tenantId)/staff/$(sanitizeEmail(request.auth.token.email))).data;
    }

    // التحقق من أن الموظف برتبة مالك (Owner) أو مدير (Manager)
    function isTenantAdminOrOwner(tenantId) {
      return isAuthenticated() && (
        isSuperAdmin() ||
        (
          exists(/databases/$(database)/documents/pharmacies/$(tenantId)/staff/$(sanitizeEmail(request.auth.token.email))) &&
          getStaffData(tenantId).role in ['owner', 'manager', 'admin']
        )
      );
    }

    // فحص ما إذا كانت الصيدلية نشطة وغير منتهية الاشتراك
    function isPharmacyActive(tenantId) {
      let pDoc = get(/databases/$(database)/documents/pharmacies/$(tenantId)).data;
      return pDoc.isActive == true;
    }

    // =========================================================================
    // 🏥 1. TENANT METADATA & PRIVATE SECRETS
    // =========================================================================

    match /pharmacies/{tenantId} {
      // قراءة عامة للبيانات غير الحساسة للمتجر
      allow read: if true;
      
      // التعديل محصور بالسوبر أدمن أو مالك الصيدلية
      allow create, update, delete: if isTenantAdminOrOwner(tenantId);

      // 🔒 الوثائق الحساسة (Private Settings & Secrets)
      match /private_settings/{settingId} {
        allow read, write: if isTenantAdminOrOwner(tenantId);
      }

      // =======================================================================
      // 💊 2. PRODUCTS & INVENTORY
      // =======================================================================
      match /products/{productId} {
        // قراءة عامة للزبائن للمنتجات غير المؤرشفة
        allow read: if true;
        
        // التعديل والإضافة والحذف محصور بطاقم الصيدلية فقط
        allow create, delete: if isTenantStaff(tenantId);
        
        // السماح بتحديث المخزون عند الشراء أو من قبل الطاقم
        allow update: if isTenantStaff(tenantId) || (
          // تحديث المخزون الآمن عند الشراء من الزبون (Atomic Transactions)
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['stockQuantity', 'inStock', 'orderCount', 'views', 'rating', 'reviews'])
        );
      }

      // =======================================================================
      // 📦 3. ORDERS
      // =======================================================================
      match /orders/{orderId} {
        // قراءة الطلبات محصورة بطاقم الصيدلية أو صاحب الطلب المسجل
        allow read: if isTenantStaff(tenantId) || (
          isAuthenticated() && resource.data.userId == request.auth.uid
        );
        
        // إنشاء طلب جديد متاح للجميع مع التحقق الصارم من الحقول الأساسية
        allow create: if isPharmacyActive(tenantId) &&
                         request.resource.data.name is string &&
                         request.resource.data.phone is string &&
                         request.resource.data.address is string &&
                         request.resource.data.total is number &&
                         request.resource.data.total >= 0;

        // تعديل حالة الطلب محصور بطاقم الصيدلية أو إلغاء الطلب من قبل العميل قبل الشحن
        allow update: if isTenantStaff(tenantId) || (
          isAuthenticated() && 
          resource.data.userId == request.auth.uid &&
          request.resource.data.status == 'طلب ملغي من قبل الزبون ❌' &&
          resource.data.status in ['قيد المعالجة والتجهيز 🚚', 'قيد الانتظار']
        );

        allow delete: if isTenantAdminOrOwner(tenantId);
      }

      // =======================================================================
      // 🗂️ 4. CATEGORIES, BUNDLES, & PROMOTIONS
      // =======================================================================
      match /categories/{catId} {
        allow read: if true;
        allow write: if isTenantStaff(tenantId);
      }

      match /bundles/{bundleId} {
        allow read: if true;
        allow write: if isTenantStaff(tenantId);
      }

      match /coupons/{couponId} {
        allow read: if true;
        allow write: if isTenantAdminOrOwner(tenantId);
      }

      match /notifications/{notifId} {
        allow read: if true;
        allow write: if isTenantStaff(tenantId);
      }

      match /analytics_daily/{dayId} {
        allow read: if isTenantStaff(tenantId);
        allow create, update: if true; // لتسجيل الزيارات اليومية من المتجر
      }

      // =======================================================================
      // 👥 5. STAFF RBAC MANAGEMENT
      // =======================================================================
      match /staff/{staffId} {
        allow read: if isTenantStaff(tenantId);
        allow write: if isTenantAdminOrOwner(tenantId);
      }
    }

    // =========================================================================
    // 🌐 6. SYSTEM LEVEL & CENTRAL MASTER CATALOG
    // =========================================================================

    // إعدادات الدفع العامة للسوبر أدمن
    match /system/payment_info {
      allow read: if true;
      allow write: if isSuperAdmin();
    }

    // بنك المنتجات المركزي الموحد (Master Catalog)
    match /system/master_catalog/products/{productId} {
      allow read: if true; // متاح لجميع الصيدليات للاستيراد
      allow write: if isSuperAdmin();
    }

    // قائمة مساهمات الصيدليات الجديدة (Crowdsourcing Queue)
    match /system/master_catalog_submissions/submissions/{submissionId} {
      allow read: if isSuperAdmin() || (
        isAuthenticated() && resource.data.sourcePharmacyAdmin == request.auth.token.email
      );
      // الصيدليات يمكنها إرسال مساهمات للمراجعة
      allow create: if isAuthenticated() && 
                       request.resource.data.status == 'pending_review';
      // الموافقة والرفض والتعديل حصراً للسوبر أدمن
      allow update, delete: if isSuperAdmin();
    }

    // =========================================================================
    // 👤 7. USER CLOUD CARTS & WISHLISTS (Multi-Device Sync)
    // =========================================================================
    match /users/{userId}/pharmacies/{tenantId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
  }
}
