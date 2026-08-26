import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseMixsTsv, xlsxToTsv, getImportableFields, SITE_FIELDS } from '$lib/server/mixs-io';
import { parseLatLon } from '$lib/mixs/validators';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { findNearbySites, haversineKm } from '$lib/server/proximity';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { validateRow } from '$lib/server/mixs-validator';
import { insertSampleValues } from '$lib/server/sample-body';
import { MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';

/** Extract-field keys that may live on sample._extract — used when building the
 *  insertExtract bind parameters. Keep in sync with EXTRACT_FIELDS in mixs-io.ts. */
type ExtractRow = {
	extract_name?: string;
	extraction_date?: string;
	concentration_ng_ul?: number;
	storage_box?: string;
	storage_location?: string;
	extract_notes?: string;
	nucl_acid_ext?: string;
	extract_accession?: string;
};

/** PCR-field keys that may live on sample._pcr. Keep in sync with PCR_FIELDS. */
type PcrRow = {
	pcr_name?: string;
	pcr_plate_name?: string;
	pcr_date?: string;
	pcr_cond?: string;
	nucl_acid_amp?: string;
	target_gene?: string;
	target_subfragment?: string;
	forward_primer_name?: string;
	forward_primer_seq?: string;
	reverse_primer_name?: string;
	reverse_primer_seq?: string;
	annealing_temp_c?: number;
	num_cycles?: number;
	pcr_notes?: string;
	pcr_accession?: string;
};

/** Library-field keys on sample._library. Keep in sync with LIBRARY_FIELDS. */
type LibraryRow = {
	library_name?: string;
	library_barcode?: string;
	library_prep_kit?: string;
	library_prep_date?: string;
	library_platform?: string;
	library_instrument_model?: string;
	library_concentration_ng_ul?: number;
	library_notes?: string;
	library_source?: string;
	library_selection?: string;
	library_type?: string;
	library_fragment_size_bp?: number;
	library_plate_name?: string;
	library_accession?: string;
};

/** Run-field keys on sample._run. Run records are deduped per upload by
 *  run_name; the trailing run_fastq_dir / run_read_count fields belong on the
 *  run_libraries link, not the run itself. Keep in sync with RUN_FIELDS. */
type RunRow = {
	run_name?: string;
	run_date?: string;
	run_platform?: string;
	run_instrument_model?: string;
	run_flow_cell_id?: string;
	run_directory?: string;
	run_total_bases_gb?: number;
	run_fastq_dir?: string;
	run_read_count?: number;
	run_accession_id?: string;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TSV_BYTES = 20 * 1024 * 1024; // post-decompression cap (xlsx is zipped)
const MAX_ROWS = 10_000;

/** Default radius for auto-linking imported samples to nearby existing sites. */
const DEFAULT_SITE_MATCH_KM = 1;

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const { user, labId } = requireLab(locals);
	// Rate limit per IP: 1 request / second. Hooks already require a session.
	const ip = getClientAddress();
	if (!checkRate(`import:${ip}`, 1, 1_000)) {
		return json({ error: 'Too many import requests, try again later' }, { status: 429 });
	}

	const contentType = request.headers.get('content-type') || '';

	let tsv: string;
	// Optional: sheets may instead provide a per-row `project_name` column.
	// Validated below after the TSV is parsed.
	let projectId: string | null;
	let dryRun: boolean;
	let columnMap: Record<string, string> | undefined;
	let siteMatchKm: number = DEFAULT_SITE_MATCH_KM;
	let people: { personnel_id: string; role?: string | null }[] | undefined;
	/** Create sites for samples that have no coordinates. On by default: an
	 *  archive submission omits them routinely — controls, blanks, samples whose
	 *  location was never recorded — and dropping those rows loses the negative
	 *  controls that make the rest of a run interpretable. The dry run reports
	 *  how many rows land this way, so a sheet whose lat/lon columns failed to
	 *  map still shows up as an unusually large count rather than silence.
	 *  Callers opt out by sending it explicitly false. */
	let allowSitesWithoutCoords = true;
	/** Fallback checklist/extension for rows that don't declare their own —
	 *  used for per-row MIxS validation and as sample defaults on insert. */
	let defaultChecklist = 'MimarksS';
	let defaultExtension: string | null = null;

	try {
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			projectId = (formData.get('projectId') as string) || null;
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
			const peopleRaw = formData.get('people') as string | null;
			if (peopleRaw) {
				try { people = JSON.parse(peopleRaw); }
				catch { return json({ error: 'Invalid people JSON' }, { status: 400 }); }
			}
			// Absent means "default"; only an explicit false opts out.
			allowSitesWithoutCoords = formData.get('allowSitesWithoutCoords') !== 'false';
			const dcl = formData.get('defaultChecklist') as string | null;
			if (dcl) defaultChecklist = dcl;
			const dex = formData.get('defaultExtension') as string | null;
			if (dex) defaultExtension = dex;
			const file = formData.get('file') as File;
			if (!file) {
				return json({ error: 'File is required' }, { status: 400 });
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
			projectId = body.projectId || null;
			dryRun = body.dryRun;
			columnMap = body.columnMap;
			if (body.siteMatchKm != null) {
				const km = Number(body.siteMatchKm);
				if (!isNaN(km) && km > 0 && km <= 100) siteMatchKm = km;
			}
			if (Array.isArray(body.people)) people = body.people;
			allowSitesWithoutCoords = body.allowSitesWithoutCoords !== false;
			if (typeof body.defaultChecklist === 'string') defaultChecklist = body.defaultChecklist;
			if (typeof body.defaultExtension === 'string') defaultExtension = body.defaultExtension;
			if (typeof tsv === 'string' && tsv.length > MAX_TSV_BYTES) {
				return json({ error: 'TSV payload too large' }, { status: 413 });
			}
		}
	} catch (err) {
		return apiError(err);
	}

	if (!tsv) {
		return json({ error: 'TSV data is required' }, { status: 400 });
	}

	// Cross-lab guard: if a projectId was supplied, it must belong to the caller's
	// lab. Done before any parsing so a cross-lab attempt never touches the TSV.
	// Sheets can also provide project_name per row — that path is validated below.
	if (projectId) {
		const db = getDb();
		assertLabOwnsRow(db, 'projects', projectId, labId, 'Project not found');
	}

	const { samples, errors, headers, column_map } = parseMixsTsv(tsv, columnMap);

	// Resolve per-row project: each sample either carries a project_name (looked
	// up in the lab's existing projects, or queued as a new one) or falls back
	// to the supplied projectId. Exactly one source must be present per row.
	const sheetHasProjectName = samples.some((s) => s.project_name);
	if (!sheetHasProjectName && !projectId) {
		return json(
			{ error: 'Either a project_id or a project_name column is required' },
			{ status: 400 }
		);
	}

	type NewProject = { id: string; project_name: string; accession: string | null };
	const newProjectsByName = new Map<string, NewProject>();
	const rowProjectIds: (string | null)[] = [];
	{
		const db = getDb();
		const existing = db.prepare(
			'SELECT id, project_name FROM projects WHERE lab_id = ?'
		).all(labId) as { id: string; project_name: string }[];
		const existingByName = new Map(existing.map((p) => [p.project_name, p.id]));

		for (const s of samples) {
			const pname = (s.project_name as string | undefined)?.trim();
			if (pname) {
				const hit = existingByName.get(pname);
				if (hit) {
					rowProjectIds.push(hit);
				} else {
					let q = newProjectsByName.get(pname);
					if (!q) {
						q = {
						id: generateId(),
						project_name: pname,
						accession: (s.project_accession as string)?.trim() || null
					};
						newProjectsByName.set(pname, q);
					}
					rowProjectIds.push(q.id);
				}
			} else if (projectId) {
				rowProjectIds.push(projectId);
			} else {
				rowProjectIds.push(null);
				errors.push(`${s.samp_name}: missing project_name and no fallback project_id`);
			}
		}
	}

	if (samples.length > MAX_ROWS) {
		return json(
			{ error: `Too many rows (got ${samples.length}, max ${MAX_ROWS})` },
			{ status: 413 }
		);
	}

	// Parse coordinates and match each sample to nearby sites. Site lookup is
	// scoped to the row's resolved project so two projects at the same coords
	// get two distinct site rows (schema: UNIQUE(project_id, site_name)).
	const matched = samples.map((s, i) => {
		const projId = rowProjectIds[i];
		const coords = s.lat_lon ? parseLatLon(s.lat_lon as string) : null;
		const lat = coords?.latitude ?? (s.latitude as number | null) ?? null;
		const lon = coords?.longitude ?? (s.longitude as number | null) ?? null;
		if (lat == null || lon == null || !projId) {
			return { sample: s, project_id: projId, lat, lon, matched_site: null as { id: string; site_name: string; distance_km: number } | null, new_site: false };
		}
		const nearby = findNearbySites(lat, lon, siteMatchKm, projId, labId);
		return { sample: s, project_id: projId, lat, lon, matched_site: nearby[0] ?? null, new_site: false };
	});

	// Auto-create sites for unmatched samples, clustered by proximity.
	// Samples within siteMatchKm of each other AND sharing a project share a site.
	type NewSite = { id: string; project_id: string; site_name: string; site_code: string | null; lat: number | null; lon: number | null; lat_lon: string | null; geo_loc_name: string | null; env_broad_scale: string | null; env_local_scale: string | null; name_votes: Map<string, number>; code_votes: Map<string, number> };
	const newSites: NewSite[] = [];

	for (const row of matched) {
		if (row.matched_site || row.lat == null || row.lon == null || !row.project_id) continue;

		// Check if this sample is close enough to an already-created new site
		// (same project only — cross-project clustering would violate the
		// UNIQUE(project_id, site_name) invariant on sites).
		let cluster: NewSite | null = null;
		for (const site of newSites) {
			if (site.project_id !== row.project_id) continue;
			if (site.lat == null || site.lon == null) continue; // unlocated: nothing to measure
			if (haversineKm(row.lat, row.lon, site.lat, site.lon) <= siteMatchKm) {
				cluster = site;
				break;
			}
		}

		if (!cluster) {
			const id = generateId();
			const latLon = (row.sample.lat_lon as string) ||
				`${Math.abs(row.lat).toFixed(4)} ${row.lat >= 0 ? 'N' : 'S'} ${Math.abs(row.lon).toFixed(4)} ${row.lon >= 0 ? 'E' : 'W'}`;
			cluster = {
				id,
				project_id: row.project_id,
				site_name: id.slice(0, 8),
				site_code: null,
				lat: row.lat,
				lon: row.lon,
				lat_lon: latLon,
				geo_loc_name: (row.sample.geo_loc_name as string) || null,
				env_broad_scale: (row.sample.env_broad_scale as string) || null,
				env_local_scale: (row.sample.env_local_scale as string) || null,
				name_votes: new Map(),
				code_votes: new Map()
			};
			newSites.push(cluster);
		}

		// Track site_name + site_code votes separately; winner per field.
		const sampleSiteName = (row.sample.site_name as string)?.trim();
		if (sampleSiteName) {
			cluster.name_votes.set(sampleSiteName, (cluster.name_votes.get(sampleSiteName) || 0) + 1);
		}
		const sampleSiteCode = (row.sample.site_code as string)?.trim();
		if (sampleSiteCode) {
			cluster.code_votes.set(sampleSiteCode, (cluster.code_votes.get(sampleSiteCode) || 0) + 1);
		}

		row.matched_site = { id: cluster.id, site_name: cluster.site_name, distance_km: 0 };
		row.new_site = true;
	}

	// Resolve site names + codes: pick most frequent vote per field, warn on
	// conflicts. Display names and short codes are independent fields so we
	// can have site_code=CHDR + site_name="Churchill Drive" without either
	// treating the other as a conflict.
	for (const site of newSites) {
		if (site.name_votes.size > 0) {
			let bestName = '';
			let bestCount = 0;
			for (const [name, count] of site.name_votes) {
				if (count > bestCount) { bestName = name; bestCount = count; }
			}
			site.site_name = bestName;
			if (site.name_votes.size > 1) {
				const others = Array.from(site.name_votes.keys()).filter(n => n !== bestName);
				errors.push(`Site "${bestName}": conflicting display names in same cluster (${others.join(', ')}), using most frequent`);
			}
		}
		if (site.code_votes.size > 0) {
			let bestCode = '';
			let bestCount = 0;
			for (const [code, count] of site.code_votes) {
				if (count > bestCount) { bestCode = code; bestCount = count; }
			}
			site.site_code = bestCode;
			if (site.code_votes.size > 1) {
				const others = Array.from(site.code_votes.keys()).filter(c => c !== bestCode);
				errors.push(`Site "${site.site_name}" code "${bestCode}": conflicting codes in same cluster (${others.join(', ')}), using most frequent`);
			}
		}
		// Update matched_site references
		for (const row of matched) {
			if (row.matched_site?.id === site.id) {
				row.matched_site.site_name = site.site_name;
			}
		}
	}

	// Runs after the vote resolution above so located site names are final: an
	// unlocated cluster reuses a located site of the same name rather than
	// racing it to UNIQUE(project_id, site_name).
	//
	// Samples with no coordinates. Proximity cannot group these, so they are
	// grouped by whatever name the sheet does carry: an explicit site_name or
	// site_code, else the INSDC locality (geo_loc_name), else a single
	// per-project bucket. Archive submissions routinely omit lat/lon on
	// controls and blanks, and dropping those loses the negative controls that
	// make the rest of the run interpretable.
	const UNLOCATED_SITE_NAME = 'Location not recorded';
	let unlocatedSiteCount = 0;
	if (allowSitesWithoutCoords) {
		for (const row of matched) {
			if (row.matched_site || !row.project_id) continue;
			if (row.lat != null && row.lon != null) continue;

			const sample = row.sample;
			const name =
				(sample.site_name as string)?.trim() ||
				(sample.site_code as string)?.trim() ||
				(sample.geo_loc_name as string)?.trim() ||
				UNLOCATED_SITE_NAME;

			// Reuse a site already queued for this project under the same name,
			// located or not — two rows naming the same place are the same site,
			// and UNIQUE(project_id, site_name) would reject a second one anyway.
			let cluster = newSites.find(
				(site) => site.project_id === row.project_id && site.site_name === name
			);
			if (!cluster) {
				cluster = {
					id: generateId(),
					project_id: row.project_id,
					site_name: name,
					site_code: (sample.site_code as string)?.trim() || null,
					lat: null,
					lon: null,
					lat_lon: null,
					geo_loc_name: (sample.geo_loc_name as string) || null,
					env_broad_scale: (sample.env_broad_scale as string) || null,
					env_local_scale: (sample.env_local_scale as string) || null,
					name_votes: new Map(),
					code_votes: new Map()
				};
				newSites.push(cluster);
				unlocatedSiteCount++;
			}

			row.matched_site = { id: cluster.id, site_name: cluster.site_name, distance_km: 0 };
			row.new_site = true;
		}
	}


	// Tell the dry run what the insert would drop. Without this the preview
	// reports a clean parse and the row count only falls at commit time, which
	// is the wrong moment to discover that a third of the sheet has no
	// coordinates.
	{
		const unplaceable = matched.filter((m) => !m.matched_site && m.project_id).length;
		if (unplaceable > 0) {
			errors.push(
				`${unplaceable} row(s) have no coordinates and match no existing site, so they will be skipped. Enable "create sites for samples without coordinates" to import them anyway.`
			);
		}
	}

	// MIxS validation against the LinkML-generated JSON Schema. Per-row errors
	// flow back to the dry-run UI so the user sees required/pattern/enum issues
	// inline before committing the import.
	//
	// Strip SampleTown-internal side-cars (_values EAV spill, _extract columns,
	// project_name lookup key) before validation — they aren't MIxS slots and
	// would otherwise produce "must NOT have additional properties" noise.
	const SIDECAR_KEYS = new Set([
		'_values', '_extract', '_pcr', '_library', '_run',
		'site_name', 'site_code', 'latitude', 'longitude',
		// SampleTown-local columns that are not MIxS slots. They belong on the
		// sample but the combination class has never heard of them, so leaving
		// them in makes every row report "must NOT have additional properties".
		// project_name is deliberately absent: it doubles as the project lookup
		// key, but it is also a MIxS slot the checklist requires.
		'mixs_checklist', 'extension', 'notes', 'collector_name', 'filter_type'
	]);
	const mixsValidation = matched.map((m) => {
		const checklist = (m.sample.mixs_checklist as string) || defaultChecklist;
		const extension = (m.sample.extension as string) || defaultExtension;
		const forValidation: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(m.sample)) {
			if (!SIDECAR_KEYS.has(k)) forValidation[k] = v;
		}
		// Slots without a SampleTown column spill into _values, which is most of
		// MIxS. Validating without them reports every one of those as missing
		// even when the sheet supplied it. misc_param:* tags stay out — they are
		// off-schema by definition and would read as additional properties.
		for (const [k, v] of Object.entries((m.sample._values as Record<string, unknown>) ?? {})) {
			if (!k.startsWith(MISC_PARAM_PREFIX)) forValidation[k] = v;
		}
		const rowErrors = validateRow(forValidation, checklist, extension);
		return {
			samp_name: m.sample.samp_name,
			checklist,
			extension,
			errors: rowErrors
		};
	});

	// Count extracts and collect per-row preview rows for the UI.
	const extractsPreview = matched
		.map((m) => {
			const ex = m.sample._extract as ExtractRow | undefined;
			if (!ex) return null;
			return {
				samp_name: m.sample.samp_name,
				extract_name: ex.extract_name ?? `${m.sample.samp_name}_ext`,
				extraction_date: ex.extraction_date ?? null,
				concentration_ng_ul: ex.concentration_ng_ul ?? null,
				storage_box: ex.storage_box ?? null,
				storage_location: ex.storage_location ?? null
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	// Per-row PCR preview. A reaction is created whenever the sheet carries any
	// pcr_* column; it hangs off the row's extract, which is created for it if
	// the sheet didn't supply one.
	const pcrPreview = matched
		.map((m) => {
			const pcr = m.sample._pcr as PcrRow | undefined;
			if (!pcr) return null;
			return {
				samp_name: m.sample.samp_name,
				pcr_name: pcr.pcr_name ?? `${m.sample.samp_name}_pcr`,
				pcr_date: pcr.pcr_date ?? null,
				target_gene: pcr.target_gene ?? null,
				target_subfragment: pcr.target_subfragment ?? null,
				forward_primer_name: pcr.forward_primer_name ?? null,
				reverse_primer_name: pcr.reverse_primer_name ?? null
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	// Per-row library preview + dedup'd run map. Runs are keyed by run_name
	// across the batch — multiple samples share one sequencing_runs row,
	// connected via run_libraries links per (run, library) pair.
	const librariesPreview = matched
		.map((m) => {
			const lib = m.sample._library as LibraryRow | undefined;
			if (!lib) return null;
			const run = m.sample._run as RunRow | undefined;
			return {
				samp_name: m.sample.samp_name,
				library_name: lib.library_name ?? `${m.sample.samp_name}_lib`,
				library_barcode: lib.library_barcode ?? null,
				library_platform: lib.library_platform ?? run?.run_platform ?? null,
				library_concentration_ng_ul: lib.library_concentration_ng_ul ?? null,
				run_name: run?.run_name ?? null
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	type NewRun = { id: string; run_name: string; data: RunRow };
	const newRunsByName = new Map<string, NewRun>();
	for (const m of matched) {
		const run = m.sample._run as RunRow | undefined;
		if (!run?.run_name) continue;
		const name = String(run.run_name).trim();
		if (!name) continue;
		if (!newRunsByName.has(name)) {
			newRunsByName.set(name, { id: generateId(), run_name: name, data: run });
		}
	}

	if (dryRun) {
		return json({
			samples,
			errors,
			headers,
			count: samples.length,
			column_map,
			available_fields: getImportableFields(),
			site_fields: Array.from(SITE_FIELDS),
			site_match_km: siteMatchKm,
			mixs_validation: mixsValidation,
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
			new_sites: Array.from(newSites).map((s) => ({
				id: s.id,
				site_name: s.site_name,
				lat_lon: s.lat_lon,
				geo_loc_name: s.geo_loc_name
			})),
			unlocated_sites: unlocatedSiteCount,
			new_projects: Array.from(newProjectsByName.values()).map((p) => ({
				id: p.id,
				project_name: p.project_name
			})),
			extracts: extractsPreview,
			pcrs: pcrPreview,
			libraries: librariesPreview,
			new_runs: Array.from(newRunsByName.values()).map((r) => ({
				id: r.id,
				run_name: r.run_name,
				run_date: r.data.run_date ?? null,
				run_platform: r.data.run_platform ?? null,
				run_flow_cell_id: r.data.run_flow_cell_id ?? null
			}))
		});
	}

	// Insert projects, sites, samples, extracts, libraries, runs, and run_libraries
	// links — all in one transaction.
	const db = getDb();
	const userId = user.id;
	const inserted: any[] = [];
	const insertErrors: string[] = [...errors];
	let matchedCount = 0;
	let newSiteCount = 0;
	let newProjectCount = 0;
	let extractsCreated = 0;
	let pcrsCreated = 0;
	let librariesCreated = 0;
	let runsCreated = 0;
	let runLibrariesCreated = 0;

	const insertProjectStmt = db.prepare(`
		INSERT INTO projects (id, lab_id, project_name, accession, created_by)
		VALUES (?, ?, ?, ?, ?)
	`);

	const insertSiteStmt = db.prepare(`
		INSERT INTO sites (id, lab_id, project_id, site_name, site_code, lat_lon, latitude, longitude,
			geo_loc_name, env_broad_scale, env_local_scale, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const insertExtractStmt = db.prepare(`
		INSERT INTO extracts (id, lab_id, sample_id, extract_name, extraction_date,
			concentration_ng_ul, storage_box, storage_location, notes, nucl_acid_ext,
			accession, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	// Plates are lab-scoped and named, so a sheet naming one either fills an
	// existing plate or creates it. Resolved once per batch and cached, since a
	// whole submission usually lands on a single plate.
	const findPcrPlate = db.prepare(
		'SELECT id FROM pcr_plates WHERE lab_id = ? AND plate_name = ? AND is_deleted = 0'
	);
	const insertPcrPlate = db.prepare(
		'INSERT INTO pcr_plates (id, lab_id, plate_name, created_by) VALUES (?, ?, ?, ?)'
	);
	const findLibraryPlate = db.prepare(
		'SELECT id FROM library_plates WHERE lab_id = ? AND plate_name = ? AND is_deleted = 0'
	);
	const insertLibraryPlate = db.prepare(
		'INSERT INTO library_plates (id, lab_id, plate_name, library_type, created_by) VALUES (?, ?, ?, ?, ?)'
	);
	const pcrPlateIds = new Map<string, string>();
	const libraryPlateIds = new Map<string, string>();
	let pcrPlatesCreated = 0;
	let libraryPlatesCreated = 0;

	function resolvePcrPlate(name: string | undefined): string | null {
		const key = name?.trim();
		if (!key) return null;
		const cached = pcrPlateIds.get(key);
		if (cached) return cached;
		const existing = findPcrPlate.get(labId, key) as { id: string } | undefined;
		const id = existing?.id ?? generateId();
		if (!existing) {
			insertPcrPlate.run(id, labId, key, userId);
			pcrPlatesCreated++;
		}
		pcrPlateIds.set(key, id);
		return id;
	}

	/** library_plates.library_type is NOT NULL, so the plate inherits the type
	 *  of the first prep that lands on it. */
	function resolveLibraryPlate(name: string | undefined, libraryType: string): string | null {
		const key = name?.trim();
		if (!key) return null;
		const cached = libraryPlateIds.get(key);
		if (cached) return cached;
		const existing = findLibraryPlate.get(labId, key) as { id: string } | undefined;
		const id = existing?.id ?? generateId();
		if (!existing) {
			insertLibraryPlate.run(id, labId, key, libraryType, userId);
			libraryPlatesCreated++;
		}
		libraryPlateIds.set(key, id);
		return id;
	}

	const insertPcrStmt = db.prepare(`
		INSERT INTO pcr_amplifications (id, lab_id, extract_id, plate_id, pcr_name, pcr_date,
			target_subfragment, forward_primer_name, forward_primer_seq,
			reverse_primer_name, reverse_primer_seq, pcr_cond, annealing_temp_c,
			num_cycles, notes, custom_fields, accession, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	// Lookups for re-upload idempotency: when the same samp_name already
	// exists in the project, reuse it (and its first extract) so the library/
	// run rows in the new upload land against the existing record instead of
	// failing the UNIQUE(project_id, samp_name) constraint.
	const findExistingSample = db.prepare(
		'SELECT id FROM samples WHERE project_id = ? AND samp_name = ? AND is_deleted = 0'
	);
	const findExistingExtract = db.prepare(
		'SELECT id FROM extracts WHERE sample_id = ? AND extract_name = ? AND is_deleted = 0'
	);
	const findExistingPcr = db.prepare(
		'SELECT id FROM pcr_amplifications WHERE extract_id = ? AND pcr_name = ? AND is_deleted = 0'
	);
	// Libraries dedupe against their extract where there is one; a library with
	// no extract falls back to the lab-wide name. Without this a second upload
	// of the same sheet stacks a duplicate library on every sample.
	const findExistingLibraryOnExtract = db.prepare(
		'SELECT id FROM library_preps WHERE extract_id = ? AND library_name = ? AND is_deleted = 0'
	);
	const findExistingLibraryInLab = db.prepare(
		'SELECT id FROM library_preps WHERE lab_id = ? AND library_name = ? AND extract_id IS NULL AND is_deleted = 0'
	);

	// Try to reuse an existing sequencing_runs row by run_name within the lab —
	// re-uploads of the same flowcell shouldn't create duplicate runs.
	const findExistingRun = db.prepare(
		'SELECT id FROM sequencing_runs WHERE lab_id = ? AND run_name = ? AND is_deleted = 0'
	);

	const insertRunStmt = db.prepare(`
		INSERT INTO sequencing_runs (id, lab_id, run_name, run_date, platform,
			instrument_model, flow_cell_id, run_directory, total_bases, accession, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const insertLibraryStmt = db.prepare(`
		INSERT INTO library_preps (id, lab_id, library_plate_id, extract_id, pcr_id, library_name, library_type,
			library_source, library_selection, library_prep_kit, library_prep_date,
			platform, instrument_model, barcode, fragment_size_bp,
			final_concentration_ng_ul, notes, accession, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const insertRunLibraryStmt = db.prepare(`
		INSERT OR REPLACE INTO run_libraries (run_id, library_id, fastq_single, read_count)
		VALUES (?, ?, ?, ?)
	`);

	/** library_preps.library_type is NOT NULL — derive a sensible default from
	 *  the platform if the cleaner didn't set it. amplicon for 16S/Illumina,
	 *  metagenome for nanopore (typical for our lab's WGS use case). */
	function deriveLibraryType(platform: string | undefined): string {
		const p = (platform || '').toUpperCase();
		if (p.includes('NANOPORE') || p === 'OXFORD_NANOPORE') return 'metagenome';
		if (p.includes('ILLUMINA')) return 'amplicon';
		return 'amplicon';
	}

	/** Map library_platform / run_platform free-text to the schema's CHECK enum.
	 *  Returns null when the value doesn't fit, so the column accepts NULL. */
	function normalizePlatform(raw: string | undefined): string | null {
		if (!raw) return null;
		const s = String(raw).toUpperCase().replace(/[\s-]/g, '_');
		if (s.includes('NANOPORE')) return 'OXFORD_NANOPORE';
		if (s.includes('ILLUMINA')) return 'ILLUMINA';
		if (s.includes('PACBIO') || s.includes('PAC_BIO')) return 'PACBIO';
		if (s.includes('ION') || s.includes('TORRENT')) return 'ION_TORRENT';
		return null;
	}

	const insertStmt = db.prepare(`
		INSERT INTO samples (id, lab_id, project_id, site_id, mixs_checklist, extension,
			samp_name, collection_date, env_medium,
			depth, elev, host_taxid, specific_host,
			temp, salinity, ph, diss_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
			samp_collect_device, samp_collect_method, samp_mat_process, samp_size,
			size_frac, source_mat_id,
			samp_store_sol, samp_store_temp, samp_store_dur, samp_store_loc, store_cond,
			ref_biomaterial, isol_growth_condt, tax_ident,
			filter_type, collector_name,
			notes, accession, created_by)
		VALUES (?, ?, ?, ?, ?, ?,
			?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?,
			?, ?,
			?, ?, ?)
	`);

	const insertAll = db.transaction((rows: typeof matched) => {
		// First, insert any new projects queued from the sheet's project_name column
		for (const p of newProjectsByName.values()) {
			insertProjectStmt.run(p.id, labId, p.project_name, p.accession, userId);
			newProjectCount++;
		}

		// Resolve sequencing_runs: reuse existing rows by run_name (lab-scoped),
		// else insert. Maps run_name → final id used by run_libraries inserts later.
		const runIdByName = new Map<string, string>();
		for (const r of newRunsByName.values()) {
			const existing = findExistingRun.get(labId, r.run_name) as { id: string } | undefined;
			if (existing) {
				runIdByName.set(r.run_name, existing.id);
				continue;
			}
			const totalBases = r.data.run_total_bases_gb != null
				? Math.round(Number(r.data.run_total_bases_gb) * 1e9)
				: null;
			insertRunStmt.run(
				r.id, labId, r.run_name,
				r.data.run_date ?? null,
				normalizePlatform(r.data.run_platform),
				r.data.run_instrument_model ?? null,
				r.data.run_flow_cell_id ?? null,
				r.data.run_directory ?? null,
				totalBases,
				r.data.run_accession_id ?? null,
				userId
			);
			runIdByName.set(r.run_name, r.id);
			runsCreated++;
		}

		// Lookup existing sites in this lab/project by site_code OR site_name,
		// so new-site clusters whose code/name collides with an already-created
		// site reuse it instead of failing UNIQUE(project_id, site_code|name).
		// Typical cases: re-upload of the same data, or two samples for the
		// same site that GPS-drift outside the match radius.
		const existingCodeSite = db.prepare(
			'SELECT id FROM sites WHERE lab_id = ? AND project_id = ? AND site_code = ? AND is_deleted = 0'
		);
		const existingNameSite = db.prepare(
			'SELECT id FROM sites WHERE lab_id = ? AND project_id = ? AND site_name = ? AND is_deleted = 0'
		);

		// Backfill site_code on existing proximity-matched sites when the
		// incoming data has a code and the existing site doesn't. Lets a second
		// upload enrich an earlier coords-only import without requiring a wipe.
		// Conservative: only fills NULL, never overwrites a non-NULL code.
		const backfillCode = db.prepare(
			"UPDATE sites SET site_code = ?, updated_at = datetime('now') WHERE id = ? AND (site_code IS NULL OR site_code = '')"
		);
		const backfillsApplied = new Map<string, string>(); // existing site_id → code
		for (const row of matched) {
			if (row.new_site) continue;
			if (!row.matched_site) continue;
			const incomingCode = (row.sample.site_code as string)?.trim();
			if (!incomingCode) continue;
			// Check the EXISTING site's current code so we don't thrash when two
			// rows in the same upload have the same code + target site.
			if (backfillsApplied.has(row.matched_site.id)) continue;
			const existing = db.prepare('SELECT site_code FROM sites WHERE id = ?').get(row.matched_site.id) as { site_code: string | null } | undefined;
			if (existing && (existing.site_code == null || existing.site_code === '')) {
				backfillCode.run(incomingCode, row.matched_site.id);
				backfillsApplied.set(row.matched_site.id, incomingCode);
			}
		}

		// Then insert new sites (each tied to its resolved project_id)
		const insertedSiteIds = new Set<string>();
		for (const site of newSites) {
			if (insertedSiteIds.has(site.id)) continue;
			// Try reusing an existing site by code, then by name, before creating.
			let reuse: { id: string } | undefined;
			if (site.site_code) {
				reuse = existingCodeSite.get(labId, site.project_id, site.site_code) as { id: string } | undefined;
			}
			if (!reuse && site.site_name) {
				reuse = existingNameSite.get(labId, site.project_id, site.site_name) as { id: string } | undefined;
			}
			if (reuse) {
				// Rewrite all matched_site references so samples attach to the
				// existing row, not the would-be-new one.
				for (const row of matched) {
					if (row.matched_site?.id === site.id) row.matched_site.id = reuse.id;
				}
				site.id = reuse.id;
				insertedSiteIds.add(reuse.id);
				matchedCount++; // count as existing-site match, not new
				continue;
			}
			insertSiteStmt.run(
				site.id,
				labId,
				site.project_id,
				site.site_name,
				site.site_code,
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

		// Then insert samples (and their extract row, if any)
		for (const row of rows) {
			const sample = row.sample;
			const siteId = row.matched_site?.id ?? null;
			const rowProjectId = row.project_id;
			if (!rowProjectId) {
				// Already reported when rowProjectIds was built — skip silently to
				// avoid a duplicate error line.
				continue;
			}
			if (!siteId) {
				insertErrors.push(
					`${sample.samp_name}: no coordinates and no matching site — skipped. Enable "create sites for samples without coordinates" to import it anyway.`
				);
				continue;
			}
			try {
				if (!row.new_site) matchedCount++;

				// Reuse existing sample if (project_id, samp_name) already in DB.
				// Lets a follow-up upload attach new libraries/runs to samples
				// that landed earlier without forcing a wipe + reupload.
				const existingSample = findExistingSample.get(rowProjectId, sample.samp_name) as { id: string } | undefined;
				const id = existingSample ? existingSample.id : generateId();
				const sampleAlreadyExisted = !!existingSample;

				if (!sampleAlreadyExisted) {
				insertStmt.run(
					id,
					labId,
					rowProjectId,
					siteId,
					sample.mixs_checklist || defaultChecklist,
					sample.extension || defaultExtension || null,
					sample.samp_name,
					sample.collection_date || 'not collected',
					sample.env_medium || 'not collected',
					sample.depth || null,
					sample.elev || null,
					sample.host_taxid || null,
					sample.specific_host || null,
					sample.temp ?? null,
					sample.salinity ?? null,
					sample.ph ?? null,
					sample.diss_oxygen ?? null,
					sample.pressure ?? null,
					sample.turbidity ?? null,
					sample.chlorophyll ?? null,
					sample.nitrate ?? null,
					sample.phosphate ?? null,
					sample.samp_collect_device || null,
					sample.samp_collect_method || null,
					sample.samp_mat_process || null,
					sample.samp_size || null,
					sample.size_frac || null,
					sample.source_mat_id || null,
					sample.samp_store_sol || null,
					sample.samp_store_temp || null,
					sample.samp_store_dur || null,
					sample.samp_store_loc || null,
					sample.store_cond || null,
					sample.ref_biomaterial || null,
					sample.isol_growth_condt || null,
					sample.tax_ident || null,
					sample.filter_type || null,
					sample.collector_name || null,
					sample.notes || null,
					sample.accession || null,
					userId
				);
				// Spill fields (non-column MIxS slots, misc_param:* tags)
				// routed by parseMixsTsv into sample._values — insert each as
				// a sample_values row so they're queryable first-class.
				const extras = sample._values as Record<string, string> | undefined;
				if (extras && Object.keys(extras).length > 0) {
					const cleaned: Record<string, string> = {};
					for (const [k, v] of Object.entries(extras)) {
						if (v != null && v !== '') cleaned[k] = String(v);
					}
					insertSampleValues(db, id, cleaned);
				}
				// Apply bulk-assigned people to every inserted sample
				if (people && people.length > 0) {
					setEntityPersonnel(db, 'sample', id, normalizePeople(people));
				}
				} // close `if (!sampleAlreadyExisted)`
				// Extract row, if the sheet had any extract_* columns filled.
				// Reuse existing extract on the sample by extract_name (idempotent
				// re-uploads); else insert a new one.
				let extractId: string | null = null;
				const ex = sample._extract as ExtractRow | undefined;
				const pcr = sample._pcr as PcrRow | undefined;
				// pcr_amplifications.extract_id is NOT NULL — a reaction has to have
				// been amplified from something. A sheet carrying pcr_* columns but
				// no extract_* ones still gets the extract that implies.
				if (ex || pcr) {
					try {
						const extractName = ex?.extract_name?.trim() || `${sample.samp_name}_ext`;
						const existingExtract = findExistingExtract.get(id, extractName) as { id: string } | undefined;
						if (existingExtract) {
							extractId = existingExtract.id;
						} else {
						extractId = generateId();
						const name = extractName;
						insertExtractStmt.run(
							extractId,
							labId,
							id,
							name,
							ex?.extraction_date ?? null,
							ex?.concentration_ng_ul ?? null,
							ex?.storage_box ?? null,
							ex?.storage_location ?? null,
							ex?.extract_notes ?? null,
							ex?.nucl_acid_ext ?? null,
							ex?.extract_accession ?? null,
							userId
						);
						extractsCreated++;
						}
					} catch (exErr: unknown) {
						const raw = exErr instanceof Error ? exErr.message : String(exErr);
						console.error('[import] extract row failed', sample.samp_name, raw);
						insertErrors.push(`${sample.samp_name}: extract insert failed (${raw})`);
						extractId = null;
					}
				}

				// PCR reaction, if the sheet had any pcr_* columns filled. Reused
				// by (extract, pcr_name) so a re-upload re-links rather than
				// duplicating. target_gene and nucl_acid_amp have no column on
				// pcr_amplifications — target_gene belongs to the primer set —
				// so they ride in custom_fields until a primer set is linked.
				let pcrId: string | null = null;
				if (pcr && extractId) {
					try {
						const pcrName = pcr.pcr_name?.trim() || `${sample.samp_name}_pcr`;
						const existingPcr = findExistingPcr.get(extractId, pcrName) as { id: string } | undefined;
						if (existingPcr) {
							pcrId = existingPcr.id;
						} else {
							pcrId = generateId();
							const extras: Record<string, string> = {};
							if (pcr.target_gene) extras.target_gene = String(pcr.target_gene);
							if (pcr.nucl_acid_amp) extras.nucl_acid_amp = String(pcr.nucl_acid_amp);
							insertPcrStmt.run(
								pcrId,
								labId,
								extractId,
								resolvePcrPlate(pcr.pcr_plate_name),
								pcrName,
								pcr.pcr_date ?? null,
								pcr.target_subfragment ?? null,
								pcr.forward_primer_name ?? null,
								pcr.forward_primer_seq ?? null,
								pcr.reverse_primer_name ?? null,
								pcr.reverse_primer_seq ?? null,
								pcr.pcr_cond ?? null,
								pcr.annealing_temp_c ?? null,
								pcr.num_cycles ?? null,
								pcr.pcr_notes ?? null,
								Object.keys(extras).length > 0 ? JSON.stringify(extras) : null,
								pcr.pcr_accession ?? null,
								userId
							);
							pcrsCreated++;
						}
					} catch (pcrErr: unknown) {
						const raw = pcrErr instanceof Error ? pcrErr.message : String(pcrErr);
						console.error('[import] pcr row failed', sample.samp_name, raw);
						insertErrors.push(`${sample.samp_name}: PCR insert failed (${raw})`);
						pcrId = null;
					}
				}

				// Library row + run_libraries link, if the sheet had library_*
				// or run_* columns filled. Library is FK'd to the row's extract;
				// rows without an extract land the library with extract_id=NULL
				// (library_preps allows that as long as plate / pcr / extract
				// has at least one set — schema CHECK enforces it).
				const lib = sample._library as LibraryRow | undefined;
				const runRow = sample._run as RunRow | undefined;
				if (lib || runRow) {
					try {
						const platform = normalizePlatform(lib?.library_platform || runRow?.run_platform);
						const libraryName = lib?.library_name?.trim() || `${sample.samp_name}_lib`;
						const existingLibrary = (extractId
							? findExistingLibraryOnExtract.get(extractId, libraryName)
							: findExistingLibraryInLab.get(labId, libraryName)) as { id: string } | undefined;
						const libraryId = existingLibrary ? existingLibrary.id : generateId();
						const libraryType =
							lib?.library_type?.trim() ||
							deriveLibraryType(lib?.library_platform || runRow?.run_platform);
						if (!existingLibrary) {
						insertLibraryStmt.run(
							libraryId,
							labId,
							resolveLibraryPlate(lib?.library_plate_name, libraryType),
							extractId,
							pcrId,
							libraryName,
							libraryType,
							lib?.library_source ?? null,
							lib?.library_selection ?? null,
							lib?.library_prep_kit ?? null,
							lib?.library_prep_date ?? null,
							platform,
							lib?.library_instrument_model ?? runRow?.run_instrument_model ?? null,
							lib?.library_barcode ?? null,
							lib?.library_fragment_size_bp != null
								? Math.round(Number(lib.library_fragment_size_bp))
								: null,
							lib?.library_concentration_ng_ul ?? null,
							lib?.library_notes ?? null,
							lib?.library_accession ?? null,
							userId
						);
						librariesCreated++;
						}

						if (runRow?.run_name) {
							const runId = runIdByName.get(String(runRow.run_name).trim());
							if (runId) {
								insertRunLibraryStmt.run(
									runId,
									libraryId,
									runRow.run_fastq_dir ?? null,
									runRow.run_read_count != null ? Math.round(Number(runRow.run_read_count)) : null
								);
								runLibrariesCreated++;
							}
						}
					} catch (libErr: unknown) {
						const raw = libErr instanceof Error ? libErr.message : String(libErr);
						console.error('[import] library/run row failed', sample.samp_name, raw);
						insertErrors.push(`${sample.samp_name}: library/run insert failed (${raw})`);
					}
				}
				if (!sampleAlreadyExisted) {
					inserted.push({
						id,
						samp_name: sample.samp_name,
						site_id: siteId,
						matched_site_name: row.matched_site?.site_name ?? null
					});
				}
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
		const raw = err instanceof Error ? err.message : String(err);
		console.error('[import] transaction failed:', raw);
		// Unpack common SQLite constraint failures into actionable hints so the
		// caller knows exactly which row/field collided. apiError() otherwise
		// returns a generic "record with that identifier already exists" that
		// doesn't tell the user whether to rename, widen the match radius, or
		// delete stale data.
		let hint = 'Import failed.';
		if (/UNIQUE constraint failed: sites\.project_id, sites\.site_name/i.test(raw)) {
			hint = 'Import failed: a site with the same name already exists in this project at different coordinates. Widen the site-match radius or deduplicate site_name in your TSV.';
		} else if (/UNIQUE constraint failed: sites\.project_id, sites\.site_code/i.test(raw)) {
			hint = 'Import failed: a site with that site_code already exists in this project. Rename the duplicate or remove the collision from your TSV.';
		} else if (/UNIQUE constraint failed: projects\.lab_id, projects\.project_name/i.test(raw)) {
			hint = 'Import failed: project_name collides with an existing project in this lab.';
		} else if (/UNIQUE constraint failed/i.test(raw)) {
			hint = `Import failed: uniqueness violation (${raw.replace(/^SqliteError:\s*/i, '')}).`;
		} else if (/FOREIGN KEY constraint failed/i.test(raw)) {
			hint = 'Import failed: a referenced row was missing (foreign key). This usually means a project or site was deleted mid-import.';
		}
		return json({ error: hint, detail: raw }, { status: 409 });
	}

	return json(
		{
			imported: inserted.length,
			site_matches: matchedCount,
			new_sites: newSiteCount,
			new_projects: newProjectCount,
			extracts_created: extractsCreated,
			pcrs_created: pcrsCreated,
			pcr_plates_created: pcrPlatesCreated,
			library_plates_created: libraryPlatesCreated,
			libraries_created: librariesCreated,
			runs_created: runsCreated,
			run_libraries_created: runLibrariesCreated,
			errors: insertErrors,
			samples: inserted
		},
		{ status: 201 }
	);
};
