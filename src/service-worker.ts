/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
/**
 * Service worker for the offline field-capture PWA (docs/dev/offline-pwa.md, #2).
 *
 * SvelteKit auto-registers this file. It precaches the app shell (every hashed
 * build chunk + static file, which includes the bundled MIxS glossary JSON) so
 * the wizard's JS/CSS load with no network. On first ONLINE visit it also
 * caches the wizard route's SSR HTML — picklists / projects / sites are baked
 * into that payload — so a later offline load renders the full form. Captured
 * samples persist + sync via the IndexedDB outbox (#3); writes (POST) are never
 * intercepted here.
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `sampletown-${version}`;
const ASSETS = [...build, ...files];
const ASSET_SET = new Set(ASSETS);

/** SSR routes worth caching for offline render (they embed their own data). */
const CACHEABLE_ROUTES = new Set(['/samples/wizard']);

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	// Never touch writes — sample / site / photo POSTs must reach the network
	// (or be queued by the app's outbox, not the SW).
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return; // OSM tiles, avatars: leave to the browser.

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Hashed build assets are immutable → cache-first.
			if (ASSET_SET.has(url.pathname)) {
				const hit = await cache.match(request);
				if (hit) return hit;
			}

			// API reads + cacheable routes: network-first, fall back to cache,
			// and stash fresh successful responses for offline use.
			try {
				const res = await fetch(request);
				if (res.ok && (url.pathname.startsWith('/api/') || CACHEABLE_ROUTES.has(url.pathname))) {
					cache.put(request, res.clone());
				}
				return res;
			} catch (err) {
				const cached = await cache.match(request);
				if (cached) return cached;
				if (request.mode === 'navigate') {
					const shell = await cache.match('/samples/wizard');
					if (shell) return shell;
				}
				throw err;
			}
		})()
	);
});
