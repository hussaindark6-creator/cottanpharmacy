// Firebase Service Worker for Cloud Messaging (Compat v9.22.1)
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAffaEQmGt_5611SAU8WmY03hp-aMo8z0k",
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
  
  const notificationTitle = payload.notification ? payload.notification.title : 'صيدلية القطن';
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : 'لديك إشعار جديد من صيدلية القطن!',
    icon: (payload.notification && payload.notification.icon) ? payload.notification.icon : 'https://i.postimg.cc/8F4DGNYS/image.png',
    badge: 'https://i.postimg.cc/8F4DGNYS/image.png',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// التعامل مع النقر على الإشعار لفتح نافذة المتجر
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
