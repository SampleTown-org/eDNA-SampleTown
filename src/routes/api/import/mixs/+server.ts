import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseMixsTsv, xlsxToTsv } from '$lib/server/mixs-io';
import { parseLatLon } from '$lib/mixs/validators';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TSV_BYTES = 20 * 1024 * 1024; // post-decompression cap (xlsx is zipped)
const MAX_ROWS = 10_000;

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

	try {
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			projectId = formData.get('projectId') as string;
			dryRun = formData.get('dryRun') === 'true';
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

	const { samples, errors, headers } = parseMixsTsv(tsv);

	if (samples.length > MAX_ROWS) {
		return json(
			{ error: `Too many rows (got ${samples.length}, max ${MAX_ROWS})` },
			{ status: 413 }
		);
	}

	if (dryRun) {
		return json({ samples, errors, headers, count: samples.length });
	}

	// Insert samples
	const db = getDb();
	const userId = locals.user?.id ?? null;
	const inserted: any[] = [];
	const insertErrors: string[] = [...errors];

	const insertSample = db.transaction((sampleList: Record<string, unknown>[]) => {
		for (const sample of sampleList) {
			try {
				const id = generateId();
				const coords = sample.lat_lon ? parseLatLon(sample.lat_lon as string) : null;

				db.prepare(`
					INSERT INTO samples (id, project_id, mixs_checklist,
						samp_name, collection_date, lat_lon, latitude, longitude,
						geo_loc_name, env_broad_scale, env_local_scale, env_medium, samp_taxon_id,
						env_package, depth, elevation, host_taxon_id,
						temp, salinity, ph, dissolved_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
						sample_type, volume_filtered_ml, filter_type, preservation_method, storage_conditions, collector_name,
						notes, created_by)
					VALUES (?, ?, ?,
						?, ?, ?, ?, ?,
						?, ?, ?, ?, ?,
						?, ?, ?, ?,
						?, ?, ?, ?, ?, ?, ?, ?, ?,
						?, ?, ?, ?, ?, ?,
						?, ?)
				`).run(
					id, projectId, sample.mixs_checklist || 'MIMARKS-SU',
					sample.samp_name, sample.collection_date || null, sample.lat_lon || null,
					coords?.latitude ?? (sample.latitude as number | null) ?? null,
					coords?.longitude ?? (sample.longitude as number | null) ?? null,
					sample.geo_loc_name || null, sample.env_broad_scale || null,
					sample.env_local_scale || null, sample.env_medium || null, sample.samp_taxon_id || null,
					sample.env_package || 'water', sample.depth || null, sample.elevation || null, sample.host_taxon_id || null,
					sample.temp ?? null, sample.salinity ?? null, sample.ph ?? null,
					sample.dissolved_oxygen ?? null, sample.pressure ?? null, sample.turbidity ?? null,
					sample.chlorophyll ?? null, sample.nitrate ?? null, sample.phosphate ?? null,
					sample.sample_type || null, sample.volume_filtered_ml ?? null,
					sample.filter_type || null, sample.preservation_method || null,
					sample.storage_conditions || null, sample.collector_name || null,
					sample.notes || null, userId
				);
				inserted.push({ id, samp_name: sample.samp_name });
			} catch (err: unknown) {
				const raw = err instanceof Error ? err.message : String(err);
				console.error('[import] row failed', sample.samp_name, raw);
				// Generic per-row message — don't leak SQLite constraint names.
				insertErrors.push(`${sample.samp_name}: failed to insert (validation)`);
			}
		}
	});

	try {
		insertSample(samples);
	} catch (err) {
		return apiError(err);
	}

	return json({
		imported: inserted.length,
		errors: insertErrors,
		samples: inserted
	}, { status: 201 });
};
