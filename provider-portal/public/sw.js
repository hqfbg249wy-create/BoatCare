// Service Worker — PWA-Installierbarkeit + Web Push (Plattform-Ankündigungen).
// Bewusst KEIN Caching (vermeidet veraltete Assets/Update-Probleme).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* pass-through */ });

// ── Web Push: Ankündigung auf dem Sperrbildschirm / als System-Banner ──
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Skipily';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',   // Skipily-Logo zur Wiedererkennung
    badge: '/icon-192.png',
    tag: data.id ? ('ann-' + data.id) : undefined,
    data: { url: data.url || '', id: data.id || '' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tippt der Nutzer die Benachrichtigung an -> App öffnen/fokussieren.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/messages';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.focus(); } catch { /* ignore */ }
        if ('navigate' in c && target.startsWith('/')) { try { await c.navigate(target); } catch { /* ignore */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.startsWith('http') ? target : (self.location.origin + target));
  })());
});
