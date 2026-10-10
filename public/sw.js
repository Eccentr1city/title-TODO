// Service worker: shows reminder pushes and keeps the home-screen badge in sync.
// No fetch handler — the app is always online (tailnet), so nothing is cached.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Reminder" };
  }

  const tasks = [
    self.registration.showNotification(data.title || "Reminder", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  ];
  if (typeof data.badge === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()
    );
  }
  event.waitUntil(Promise.all(tasks).catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
