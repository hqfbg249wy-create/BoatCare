// Minimaler Service Worker — nur für die PWA-Installierbarkeit.
// Chrome/Android verlangt einen fetch-Handler, damit "Installieren" angeboten
// wird. Bewusst KEIN Caching (vermeidet veraltete Assets/Update-Probleme).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* pass-through */ });
