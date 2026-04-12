import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseMixsTsv, xlsxToTsv, getImportableFields, SITE_FIELDS } from '$lib/server/mixs-io';
import { parseLatLon } from '$lib/mixs/validators';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';
import { findNearbySites } from '$lib/server/proximity';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TSV_BYTES = 20 * 1024 * 1024; // post-decompression cap (xlsx is zipped)
const MAX_ROWS = 10_000;

/** Default radius for auto-linking imported samples to nearby existing sites. */
const DEFAULT_SITE_MATCH_KM = 1;

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	// Rate limit per IP: 10 imports / hour. Hooks already require a session.
	const ip = getClientAddress();
	if (!checkRate(`import:${ip}`, 10, 60 * 60_000)) {
		return json({ error: 'Too many import requests, try again later' }, { status: 429 });
	}

	const contentType = request.headers.get('content-type') || '';

	let tsv: string;
	let projectId: string;
	let dryRun: boolean;
	let columnMap: Record<string, string> | undefined;
	let siteMatchKm: number = DEFAULT_SITE_MATCH_KM;

	try {
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			projectId = formData.get('projectId') as string;
			dryRun = formData.get('dryRun') === 'true';
			const colMapRaw = formData.get('columnMap') as string | null;
			if (colMapRaw) {
				try { columnMap = JSON.parse(colMapRaw); }
				catch { return json({ error: 'Invalid columnMap JSON' }, { status: 400 }); }
			}
			const kmRaw = formData.get('siteMatchKm') as string | null;
			if (kmRaw) {
				const km = Number(kmRaw);
				if (!isNaN(km) && km > 0 && km <= 100) siteMatchKm = km;
			}
			const file = formData.get('file') as File;
			if (!file || !projectId) {
				return json({ error: 'File and project_id are required' }, { status: 400 });
			}
			if (file.size > MAX_UPLOAD_BYTES) {
				return json(
					{ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` },
					{ status: 413 }
				);
			}
			const buffer = Buffer.from(await file.arrayBuffer());
			if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
				tsv = xlsxToTsv(buffer);
			} else {
				tsv = buffer.toString('utf-8');
			}
			if (tsv.length > MAX_TSV_BYTES) {
				return json({ error: 'Decoded payload too large' }, { status: 413 });
			}
		} else {
			const body = await request.json();
			tsv = body.tsv;
			projectId = body.projectId;
			dryRun = body.dryRun;
			columnMap = body.columnMap;
			if (body.siteMatchKm != null) {
				const km = Number(body.siteMatchKm);
				if (!isNaN(km) && km > 0 && km <= 100) siteMatchKm = km;
			}
			if (typeof tsv === 'string' && tsv.length > MAX_TSV_BYTES) {
				return json({ error: 'TSV payload too large' }, { status: 413 });
			}
		}
	} catch (err) {
		return apiError(err);
	}

	if (!tsv || !projectId) {
		return json({ error: 'TSV data and project_id are required' }, { status: 400 });
	}

	const { samples, errors, headers, column_map } = parseMixsTsv(tsv, columnMap);

	if (samples.length > MAX_ROWS) {
		return json(
			{ error: `Too many rows (got ${samples.length}, max ${MAX_ROWS})` },
			{ status: 413 }
		);
	}

	// Parse coordinates and match each sample to nearby sites.
	const matched = samples.map((s) => {
		const coords = s.lat_lon ? parseLatLon(s.lat_lon as string) : null;
		const lat = coords?.latitude ?? (s.latitude as number | null) ?? null;
		const lon = coords?.longitude ?? (s.longitude as number | null) ?? null;
		if (lat == null || lon == null) {
			return { sample: s, lat, lon, matched_site: null as { id: string; site_name: string; distance_km: number } | null, new_site: false };
		}
		const nearby = findNearbySites(lat, lon, siteMatchKm, projectId);
		return { sample: s, lat, lon, matched_site: nearby[0] ?? null, new_site: false };
	});

	// Auto-create sites for unmatched samples, grouped by lat_lon string.
	const newSitesByLatLon = new Map<string, { id: string; site_name: string; lat: number; lon: number; lat_lon: string; geo_loc_name: string | null; env_broad_scale: string | null; env_local_scale: string | null }>();

	for (const row of matched) {
		if (row.matched_site || row.lat == null || row.lon == null) continue;

		// Build a lat_lon key — either from the parsed sample or compose one
		const latLonKey = (row.sample.lat_lon as string) ||
			`${Math.abs(row.lat).toFixed(4)} ${row.lat >= 0 ? 'N' : 'S'} ${Math.abs(row.lon).toFixed(4)} ${row.lon >= 0 ? 'E' : 'W'}`;

		if (!newSitesByLatLon.has(latLonKey)) {
			const id = generateId();
			newSitesByLatLon.set(latLonKey, {
				id,
				site_name: id,
				lat: row.lat,
				lon: row.lon,
				lat_lon: latLonKey,
				geo_loc_name: (row.sample.geo_loc_name as string) || null,
				env_broad_scale: (row.sample.env_broad_scale as string) || null,
				env_local_scale: (row.sample.env_local_scale as string) || null
			});
		}

		const site = newSitesByLatLon.get(latLonKey)!;
		row.matched_site = { id: site.id, site_name: site.site_name, distance_km: 0 };
		row.new_site = true;
	}

	if (dryRun) {
		return json({
			samples,
			errors,
			headers,
			count: samples.length,
			column_map,
			available_fields: getImportableFields(),
			site_fields: SITE_FIELDS,
			site_match_km: siteMatchKm,
			site_matches: matched.map((m) => ({
				samp_name: m.sample.samp_name,
				new_site: m.new_site,
				site: m.matched_site
					? {
							id: m.matched_site.id,
							site_name: m.matched_site.site_name,
							distance_km: Number(m.matched_site.distance_km.toFixed(3))
						}
					: null
			})),
			new_sites: Array.from(newSitesByLatLon.values()).map((s) => ({
				id: s.id,
				site_name: s.site_name,
				lat_lon: s.lat_lon,
				geo_loc_name: s.geo_loc_name
			}))
		});
	}

	// Insert sites and samples
	const db = getDb();
	const userId = locals.user?.id ?? null;
	const inserted: any[] = [];
	const insertErrors: string[] = [...errors];
	let matchedCount = 0;
	let newSiteCount = 0;

	const insertSiteStmt = db.prepare(`
		INSERT INTO sites (id, project_id, site_name, lat_lon, latitude, longitude,
			geo_loc_name, env_broad_scale, env_local_scale, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const insertStmt = db.prepare(`
		INSERT INTO samples (id, project_id, site_id, mixs_checklist,
			samp_name, collection_date, env_medium, samp_taxon_id,
			depth, elevation, host_taxon_id,
			temp, salinity, ph, dissolved_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
			sample_type, volume_filtered_ml, filter_type, preservation_method, storage_conditions, collector_name,
			notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?,
			?, ?, ?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?)
	`);

	const insertAll = db.transaction((rows: typeof matched) => {
		// First, insert all new sites
		const insertedSiteIds = new Set<string>();
		for (const site of newSitesByLatLon.values()) {
			if (insertedSiteIds.has(site.id)) continue;
			insertSiteStmt.run(
				site.id,
				projectId,
				site.site_name,
				site.lat_lon,
				site.lat,
				site.lon,
				site.geo_loc_name,
				site.env_broad_scale,
				site.env_local_scale,
				userId
			);
			insertedSiteIds.add(site.id);
			newSiteCount++;
		}

		// Then insert samples
		for (const row of rows) {
			const sample = row.sample;
			const siteId = row.matched_site?.id ?? null;
			if (!siteId) {
				insertErrors.push(`${sample.samp_name}: no site match and no coordinates — skipped`);
				continue;
			}
			try {
				const id = generateId();
				if (!row.new_site) matchedCount++;

				insertStmt.run(
					id,
					projectId,
					siteId,
					sample.mixs_checklist || 'MIMARKS-SU',
					sample.samp_name,
					sample.collection_date || 'not collected',
					sample.env_medium || 'not collected',
					sample.samp_taxon_id || null,
					sample.depth || null,
					sample.elevation || null,
					sample.host_taxon_id || null,
					sample.temp ?? null,
					sample.salinity ?? null,
					sample.ph ?? null,
					sample.dissolved_oxygen ?? null,
					sample.pressure ?? null,
					sample.turbidity ?? null,
					sample.chlorophyll ?? null,
					sample.nitrate ?? null,
					sample.phosphate ?? null,
					sample.sample_type || null,
					sample.volume_filtered_ml ?? null,
					sample.filter_type || null,
					sample.preservation_method || null,
					sample.storage_conditions || null,
					sample.collector_name || null,
					sample.notes || null,
					sample.custom_fields || null,
					userId
				);
				inserted.push({
					id,
					samp_name: sample.samp_name,
					site_id: siteId,
					matched_site_name: row.matched_site?.site_name ?? null
				});
			} catch (err: unknown) {
				const raw = err instanceof Error ? err.message : String(err);
				console.error('[import] row failed', sample.samp_name, raw);
				insertErrors.push(`${sample.samp_name}: failed to insert (validation)`);
			}
		}
	});

	try {
		insertAll(matched);
	} catch (err) {
		return apiError(err);
	}

	return json(
		{
			imported: inserted.length,
			site_matches: matchedCount,
			new_sites: newSiteCount,
			errors: insertErrors,
			samples: inserted
		},
		{ status: 201 }
	);
};
