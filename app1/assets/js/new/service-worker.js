/**
 * Service Worker
 * 
 * PWA features: Offline support, caching, background sync
 * Migration Phase 3: Week 11
 */

const CACHE_NAME = 'totilove-v2';
const RUNTIME_CACHE = 'totilove-runtime-v2';

// Assets to cache immediately
const PRECACHE_ASSETS = [
  '/',
  '/assets/css/vendor/font-awesome.min.css',
  '/assets/js/csrf-token.js',
  '/assets/images/default_profile_male.svg',
  '/assets/images/default_profile_female.svg'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate event');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
    .then(() => {
      return self.clients.claim(); // Take control of all pages
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Skip API requests (they need to be fresh)
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response (stream can only be consumed once)
            const responseToCache = response.clone();
            
            // Cache the response
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // Network failed - return offline page if available
            if (event.request.destination === 'document') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Sync messages when back online
async function syncMessages() {
  try {
    // This would sync pending messages
    // Implementation depends on your message queue system
    console.log('[ServiceWorker] Syncing messages...');
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
  }
}

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push notification received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Totilove';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/assets/images/icon-192.png',
    badge: '/assets/images/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'notification',
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click:', event.notification.tag);
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});














