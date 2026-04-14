import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { attachPeopleSummary } from '$lib/server/entity-personnel';
import { getSlot } from '$lib/mixs/schema-index';
import { MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const samples = db.prepare(`
		SELECT s.*, p.project_name, st.site_name, st.geo_loc_name, st.lat_lon,
			st.latitude, st.longitude, st.env_broad_scale, st.env_local_scale,
			(SELECT COUNT(*) FROM sample_photos WHERE sample_id = s.id AND is_deleted = 0) AS photo_count
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		JOIN sites st ON st.id = s.site_id
		WHERE s.is_deleted = 0
		ORDER BY s.created_at DESC
	`).all() as Record<string, unknown>[];

	// Pivot sample_values EAV onto each sample row so the table can surface
	// any MIxS slot (or misc_param:* tag) as an optional column.
	const eavRows = db.prepare(`
		SELECT sv.sample_id, sv.slot, sv.value
		FROM sample_values sv
		JOIN samples s ON s.id = sv.sample_id
		WHERE s.is_deleted = 0 AND sv.value IS NOT NULL AND sv.value <> ''
	`).all() as { sample_id: string; slot: string; value: string }[];

	const byId = new Map<string, Record<string, unknown>>();
	for (const s of samples) byId.set(s.id as string, s);
	const eavSlotsSeen = new Set<string>();
	for (const r of eavRows) {
		const row = byId.get(r.sample_id);
		if (!row) continue;
		row[r.slot] = r.value;
		eavSlotsSeen.add(r.slot);
	}

	// Columns already shown by default in the DataTable — they shouldn't appear
	// in the "+ parameter" picker.
	const DEFAULT_COLS = new Set([
		'samp_name', 'project_name', 'site_name', 'geo_loc_name',
		'env_broad_scale', 'env_local_scale', 'env_medium', 'collection_date',
		'people_summary'
	]);
	const HOUSEKEEPING = new Set([
		'id', 'project_id', 'site_id', 'mixs_checklist', 'extension',
		'latitude', 'longitude', 'lat_lon', 'notes',
		'sync_version', 'is_deleted', 'created_by', 'created_at', 'updated_at',
		'client_id', 'local_created_at'
	]);

	// Build the "populated parameters" list: every slot that has a value on
	// at least one sample, minus the columns already shown and the
	// housekeeping/identity fields.
	const populated = new Set<string>(eavSlotsSeen);
	// Walk direct-column values to find which ones have data somewhere.
	for (const row of samples) {
		for (const k of Object.keys(row)) {
			if (HOUSEKEEPING.has(k) || DEFAULT_COLS.has(k)) continue;
			const v = row[k];
			if (v != null && v !== '') populated.add(k);
		}
	}

	const availableParameters = Array.from(populated)
		.filter((s) => !DEFAULT_COLS.has(s) && !HOUSEKEEPING.has(s))
		.map((slot) => {
			const isCustom = slot.startsWith(MISC_PARAM_PREFIX);
			const schema = isCustom ? undefined : getSlot(slot);
			return {
				slot,
				title: isCustom ? slot.slice(MISC_PARAM_PREFIX.length) : (schema?.title ?? slot),
				isCustom
			};
		})
		.sort((a, b) => a.title.localeCompare(b.title));

	const samplesWithPeople = attachPeopleSummary('sample', samples as { id: string }[]);
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();

	return { samples: samplesWithPeople, projects, availableParameters };
};
