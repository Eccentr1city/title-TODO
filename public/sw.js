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
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  const todoId = url.searchParams.get("todo");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (!open) return self.clients.openWindow(url.href);
      // Already running: show the todo without reloading the app
      if (todoId) open.postMessage({ type: "open-todo", id: todoId });
      return open.focus();
    })
  );
});
