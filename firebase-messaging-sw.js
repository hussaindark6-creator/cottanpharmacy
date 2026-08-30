/* ==========================================================
   SaaS Multi-Tenant Service Worker — firebase-messaging-sw.js
   ========================================================== */

importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDXAp6CTcq3OlN2egGOj5Yg8jK5wUsR6Uc",
  authDomain: "cottanpharmacy.firebaseapp.com",
  projectId: "cottanpharmacy",
  storageBucket: "cottanpharmacy.firebasestorage.app",
  messagingSenderId: "163407198551",
  appId: "1:163407198551:web:1c397d23733101456a6612",
  measurementId: "G-QC29GK2MDW"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// معالجة الإشعارات الواردة في الخلفية (Background Push Notifications)
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const data = payload.data || {};
  const pharmacyName = data.pharmacyName || (payload.notification ? payload.notification.title : 'إشعار من الصيدلية');
  const pharmacyId = data.pharmacyId || 'cottanpharmacy';
  const logoUrl = data.logoUrl || (payload.notification && payload.notification.icon) || 'https://imgdb.io/i/EQ4D9ag.png';

  const notificationTitle = payload.notification ? payload.notification.title : pharmacyName;
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : 'لديك تحديث جديد في متجر الصيدلية!',
    icon: logoUrl,
    badge: logoUrl,
    data: {
      pharmacyId: pharmacyId,
      url: data.targetUrl || (data.isAdmin ? `./admin.html?pharmacy=${encodeURIComponent(pharmacyId)}` : `./?pharmacy=${encodeURIComponent(pharmacyId)}`),
      ...data
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// التعامل مع النقر على الإشعار وتوجيه المستخدم للصيدلية المعنية
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) 
    ? event.notification.data.url 
    : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url && 'focus' in client) {
          if (client.url.includes(targetUrl) || client.url.includes(event.notification.data.pharmacyId || '')) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
