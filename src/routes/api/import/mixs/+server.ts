import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseMixsTsv, xlsxToTsv } from '$lib/server/mixs-io';
import { parseLatLon } from '$lib/mixs/validators';

export const POST: RequestHandler = async ({ request, locals }) => {
	const contentType = request.headers.get('content-type') || '';

	let tsv: string;
	let projectId: string;
	let dryRun: boolean;

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		projectId = formData.get('projectId') as string;
		dryRun = formData.get('dryRun') === 'true';
		const file = formData.get('file') as File;
		if (!file || !projectId) {
			return json({ error: 'File and project_id are required' }, { status: 400 });
		}
		const buffer = Buffer.from(await file.arrayBuffer());
		if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
			tsv = xlsxToTsv(buffer);
		} else {
			tsv = buffer.toString('utf-8');
		}
	} else {
		const body = await request.json();
		tsv = body.tsv;
		projectId = body.projectId;
		dryRun = body.dryRun;
	}

	if (!tsv || !projectId) {
		return json({ error: 'TSV data and project_id are required' }, { status: 400 });
	}

	const { samples, errors, headers } = parseMixsTsv(tsv);

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
			} catch (err: any) {
				insertErrors.push(`${sample.samp_name}: ${err.message}`);
			}
		}
	});

	try {
		insertSample(samples);
	} catch (err: any) {
		return json({ error: err.message, errors: insertErrors }, { status: 400 });
	}

	return json({
		imported: inserted.length,
		errors: insertErrors,
		samples: inserted
	}, { status: 201 });
};
