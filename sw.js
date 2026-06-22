const STATIC_CACHE_NAME = 'aquamap-static-v2';
const DATA_CACHE_NAME = 'aquamap-data-v1';
const CDN_CACHE_NAME = 'aquamap-cdn-v1';

const APP_SHELL = [
	'/',
	'/index.html',
	'/css/style.css',
	'/js/app.js',
	'/js/config.js',
	'/js/database.js',
	'/js/map.js',
	'/js/schedule.js',
	'/manifest.json',
	'/icons/icon-192.png',
	'/icons/icon-512.png',
	'/icons/apple-touch-icon.png'
];

function cacheResponse(cacheName, request, response) {
	if (!response || !response.ok) {
		return;
	}

	caches.open(cacheName).then(cache => cache.put(request, response.clone()));
}

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(STATIC_CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
	);
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(keys => Promise.all(
			keys.map(key => ((key === STATIC_CACHE_NAME || key === DATA_CACHE_NAME || key === CDN_CACHE_NAME) ? Promise.resolve() : caches.delete(key)))
		))
	);
	self.clients.claim();
});

self.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method !== 'GET') {
		return;
	}

	const url = new URL(request.url);

	if (url.pathname === '/api/env') {
		event.respondWith(
			fetch(request)
				.then(response => {
					cacheResponse(DATA_CACHE_NAME, request, response);
					return response;
				})
				.catch(() => caches.match(request))
		);
		return;
	}

	if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1/')) {
		event.respondWith(
			fetch(request)
				.then(response => {
					cacheResponse(DATA_CACHE_NAME, request, response);
					return response;
				})
				.catch(() => caches.match(request))
		);
		return;
	}

	if ((url.hostname === 'api.mapbox.com' || url.hostname === 'cdn.jsdelivr.net') && (request.destination === 'script' || request.destination === 'style')) {
		event.respondWith(
			caches.match(request).then(cachedResponse => {
				if (cachedResponse) {
					return cachedResponse;
				}

				return fetch(request).then(networkResponse => {
					cacheResponse(CDN_CACHE_NAME, request, networkResponse);
					return networkResponse;
				});
			})
		);
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(() => caches.match('/index.html'))
		);
		return;
	}

	if (url.origin === self.location.origin) {
		event.respondWith(
			caches.match(request).then(cachedResponse => {
				if (cachedResponse) {
					return cachedResponse;
				}

				return fetch(request).then(networkResponse => {
					cacheResponse(STATIC_CACHE_NAME, request, networkResponse);
					return networkResponse;
				}).catch(() => caches.match('/index.html'));
			})
		);
		return;
	}

	event.respondWith(fetch(request));
});
