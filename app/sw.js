// Glacier service worker — enables install + notifications.
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});

// Tapping a notification focuses (or opens) the app.
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

// Web Push handler (used if a push server is added later).
self.addEventListener("push", function (e) {
  var data = { title: "Glacier", body: "" };
  try {
    data = e.data.json();
  } catch (_) {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Glacier", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});
