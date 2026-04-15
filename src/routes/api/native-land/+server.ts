import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRate } from '$lib/server/rate-limit';

/**
 * Server-side proxy for the Native Land Digital API.
 *
 * Why proxy:
 * - Keeps the API key server-side. Native Land issues per-deployment keys
 *   tied to a single site; leaking it in client JS would let other sites
 *   ride our quota.
 * - Lets us cache responses. Native Land asks API consumers to be polite
 *   and not refetch the same polygons every map pan; we cache by
 *   (layer, rounded lat, rounded lng) for an hour.
 * - Lets us shape the response: drop fields we don't render, normalise
 *   the property casing across territories/languages/treaties (their
 *   schemas drift slightly between layers).
 *
 * Query: ?layer=territories|languages|treaties&lat=…&lng=…
 * Returns: GeoJSON FeatureCollection (possibly empty).
 */

const ALLOWED_LAYERS = new Set(['territories', 'languages', 'treaties']);

// Round lat/lng to ~0.5° (≈55km at the equator) before forming the cache
// key. The Native Land position query returns whatever feature contains
// the point, so any two requests within the same ~55km square typically
// resolve to the same polygon set — caching at that grain saves the
// upstream API a lot of trips during normal map panning.
function roundForCache(n: number): number {
	return Math.round(n * 2) / 2;
}

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60_000; // 1 hour

export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	if (!locals.user) throw error(401, 'Authentication required');

	const layer = url.searchParams.get('layer');
	const latStr = url.searchParams.get('lat');
	const lngStr = url.searchParams.get('lng');
	if (!layer || !ALLOWED_LAYERS.has(layer)) {
		throw error(400, 'layer must be one of: territories, languages, treaties');
	}
	const lat = Number(latStr);
	const lng = Number(lngStr);
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		throw error(400, 'lat and lng must be valid coordinates');
	}

	const apiKey = process.env.NATIVE_LAND_KEY;
	if (!apiKey) {
		// Don't 500 — clients fall back to "overlay unavailable" state.
		return json({ type: 'FeatureCollection', features: [], unavailable: 'NATIVE_LAND_KEY not set on server' });
	}

	// Light per-IP rate limit so a runaway client (or a hostile one) can't
	// burn the upstream quota. 60/min is generous for normal map panning.
	if (!checkRate(`native-land:${getClientAddress()}`, 60, 60_000)) {
		throw error(429, 'Rate limited');
	}

	const cacheKey = `${layer}:${roundForCache(lat)}:${roundForCache(lng)}`;
	const cached = cache.get(cacheKey);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return json(cached.body);
	}

	const upstream = `https://native-land.ca/api/index.php?maps=${layer}&position=${lat},${lng}&key=${encodeURIComponent(apiKey)}`;
	let raw: unknown;
	try {
		const res = await fetch(upstream, {
			headers: { 'User-Agent': 'SampleTown (https://edna.sampletown.org)' },
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) {
			console.error(`[native-land] upstream ${res.status}`);
			return json({ type: 'FeatureCollection', features: [], unavailable: `upstream HTTP ${res.status}` });
		}
		raw = await res.json();
	} catch (err) {
		console.error('[native-land] fetch failed:', err);
		return json({ type: 'FeatureCollection', features: [], unavailable: 'upstream timeout or network error' });
	}

	// Native Land returns either a bare feature array or a FeatureCollection
	// depending on the endpoint variant. Normalise to FeatureCollection and
	// keep only the bits we render (Name, color, link, geometry).
	const featuresRaw = Array.isArray(raw)
		? raw
		: Array.isArray((raw as { features?: unknown }).features)
			? ((raw as { features: unknown[] }).features)
			: [];

	const features = featuresRaw.map((f: unknown) => {
		const feat = f as { geometry?: unknown; properties?: Record<string, unknown> };
		const props = feat.properties ?? {};
		return {
			type: 'Feature' as const,
			geometry: feat.geometry,
			properties: {
				name: (props.Name ?? props.name ?? '') as string,
				slug: (props.Slug ?? props.slug ?? '') as string,
				color: (props.color ?? '#888') as string,
				description: (props.description ?? '') as string,
				layer
			}
		};
	}).filter((f) => f.geometry);

	const body = { type: 'FeatureCollection', features };
	cache.set(cacheKey, { at: Date.now(), body });
	return json(body);
};
