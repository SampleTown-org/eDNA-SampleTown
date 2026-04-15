import { getDb } from './db';

/**
 * Great-circle distance in kilometers between two WGS84 points.
 * Uses the haversine formula — accurate enough for the 0.1–100 km
 * range we care about, cheap to run in JS.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth radius in km
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

export interface NearbySite {
	id: string;
	site_name: string;
	latitude: number;
	longitude: number;
	distance_km: number;
}

/**
 * Find sites within `maxKm` of the given coordinates, optionally scoped to
 * a project. Returns the closest first.
 *
 * SQLite has no native spatial functions, so we pre-filter with a bounding
 * box (cheap, uses the idx_sites_coords index) and then compute exact
 * haversine distance in JS on the filtered rows. Fine for the expected
 * scale (hundreds of sites per project, not millions).
 */
export function findNearbySites(
	lat: number,
	lon: number,
	maxKm: number = 1,
	projectId?: string | null,
	labId?: string | null
): NearbySite[] {
	const db = getDb();

	// One degree of latitude ≈ 111 km everywhere. One degree of longitude
	// ≈ 111 * cos(lat) km. Use the wider of the two as our bounding box pad.
	const latPad = maxKm / 111;
	const lonPad = maxKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

	const minLat = lat - latPad;
	const maxLat = lat + latPad;
	const minLon = lon - lonPad;
	const maxLon = lon + lonPad;

	// Build the filter clauses dynamically so we can index on lab_id /
	// project_id when callers supply them. labId is the primary isolation
	// boundary — cross-lab proximity matches leak the existence of another
	// lab's sites, so a non-null labId should always be supplied from
	// authenticated paths.
	let q = `
		SELECT id, site_name, latitude, longitude
		FROM sites
		WHERE is_deleted = 0
		  AND latitude IS NOT NULL AND longitude IS NOT NULL
		  AND latitude BETWEEN ? AND ?
		  AND longitude BETWEEN ? AND ?
	`;
	const params: (string | number)[] = [minLat, maxLat, minLon, maxLon];
	if (labId) { q += ' AND lab_id = ?'; params.push(labId); }
	if (projectId) { q += ' AND project_id = ?'; params.push(projectId); }

	const rows = db.prepare(q).all(...params) as Omit<NearbySite, 'distance_km'>[];

	return rows
		.map((r) => ({
			...r,
			distance_km: haversineKm(lat, lon, r.latitude, r.longitude)
		}))
		.filter((r) => r.distance_km <= maxKm)
		.sort((a, b) => a.distance_km - b.distance_km);
}
