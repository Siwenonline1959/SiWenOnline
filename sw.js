/**
 * FRONTLINE · sw.js
 * Service Worker — enables PWA install + Web Push notifications.
 * Kept minimal: no offline cache (content is live news, staleness undesirable).
 */

const CACHE_NAME = 'fl-shell-v6';
const SHELL_ASSETS = [
  '/style.css',
  '/mobile.css',
  '/api.js',
  '/app.js',
  '/mobile.js',
];

/* ── Install: cache shell assets ── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: network-first for API, cache-first for shell ── */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Always network for API calls
  if (url.hostname.includes('workers.dev')) return;
  // Network-first for navigation — always fetch fresh HTML
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request));
    return;
  }
  // Cache-first for shell assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

/* ── Push: receive and show notification ── */
self.addEventListener('push', (e) => {
  let data = { title: '战线快报', body: '有新的通知', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      data:    { url: data.url },
      vibrate: [100, 50, 100],
      tag:     'fl-notif',          // replaces previous notification
      renotify: false,
    })
  );
});

/* ── Notification click: open / focus the app ── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing tab if open
      for (const client of list) {
        if (client.url.includes('news.kalyna.homes') && 'focus' in client) {
          client.postMessage({ type: 'NOTIF_CLICK', url: target });
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(target);
    })
  );
});
