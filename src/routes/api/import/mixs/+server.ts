import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseMixsTsv, xlsxToTsv, getImportableFields } from '$lib/server/mixs-io';
import { parseLatLon } from '$lib/mixs/validators';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';
import { findNearbySites } from '$lib/server/proximity';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TSV_BYTES = 20 * 1024 * 1024; // post-decompression cap (xlsx is zipped)
const MAX_ROWS = 10_000;

/** Radius used to auto-link imported samples to nearby existing sites. */
const SITE_MATCH_KM = 1;

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

	// Augment each sample with the matched site_id (if any). Works for both
	// dry runs (preview) and real imports.
	const matched = samples.map((s) => {
		const coords = s.lat_lon ? parseLatLon(s.lat_lon as string) : null;
		const lat = coords?.latitude ?? (s.latitude as number | null) ?? null;
		const lon = coords?.longitude ?? (s.longitude as number | null) ?? null;
		if (lat == null || lon == null) {
			return { sample: s, lat, lon, matched_site: null };
		}
		const nearby = findNearbySites(lat, lon, SITE_MATCH_KM, projectId);
		return { sample: s, lat, lon, matched_site: nearby[0] ?? null };
	});

	if (dryRun) {
		return json({
			samples,
			errors,
			headers,
			count: samples.length,
			column_map,
			available_fields: getImportableFields(),
			site_matches: matched.map((m) => ({
				samp_name: m.sample.samp_name,
				site: m.matched_site
					? {
							id: m.matched_site.id,
							site_name: m.matched_site.site_name,
							distance_km: Number(m.matched_site.distance_km.toFixed(3))
						}
					: null
			}))
		});
	}

	// Insert samples
	const db = getDb();
	const userId = locals.user?.id ?? null;
	const inserted: any[] = [];
	const insertErrors: string[] = [...errors];
	let matchedCount = 0;

	const insertStmt = db.prepare(`
		INSERT INTO samples (id, project_id, site_id, mixs_checklist,
			samp_name, collection_date, lat_lon, latitude, longitude,
			geo_loc_name, env_broad_scale, env_local_scale, env_medium, samp_taxon_id,
			env_package, depth, elevation, host_taxon_id,
			temp, salinity, ph, dissolved_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
			sample_type, volume_filtered_ml, filter_type, preservation_method, storage_conditions, collector_name,
			notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?)
	`);

	const insertSample = db.transaction((rows: typeof matched) => {
		for (const row of rows) {
			const sample = row.sample;
			try {
				const id = generateId();
				const siteId = row.matched_site?.id ?? null;
				if (siteId) matchedCount++;

				insertStmt.run(
					id,
					projectId,
					siteId,
					sample.mixs_checklist || 'MIMARKS-SU',
					sample.samp_name,
					sample.collection_date || 'not collected',
					sample.lat_lon || 'not collected',
					row.lat,
					row.lon,
					sample.geo_loc_name || 'not collected',
					sample.env_broad_scale || 'not collected',
					sample.env_local_scale || 'not collected',
					sample.env_medium || 'not collected',
					sample.samp_taxon_id || null,
					sample.env_package || 'water',
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
		insertSample(matched);
	} catch (err) {
		return apiError(err);
	}

	return json(
		{
			imported: inserted.length,
			site_matches: matchedCount,
			errors: insertErrors,
			samples: inserted
		},
		{ status: 201 }
	);
};
