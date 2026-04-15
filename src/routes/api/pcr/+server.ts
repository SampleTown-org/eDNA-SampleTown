import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const extractId = url.searchParams.get('extract_id');
	const plateId = url.searchParams.get('plate_id');
	let query = 'SELECT p.*, e.extract_name FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id WHERE p.is_deleted = 0 AND p.lab_id = ?';
	const params: string[] = [labId];
	if (extractId) { query += ' AND p.extract_id = ?'; params.push(extractId); }
	if (plateId) { query += ' AND p.plate_id = ?'; params.push(plateId); }
	query += ' ORDER BY created_at DESC';
	return json(db.prepare(query).all(...params));
};

function insertPcr(
	db: ReturnType<typeof getDb>,
	data: Record<string, unknown>,
	userId: string | null,
	labId: string
) {
	// Parent extract (required) and plate (optional) must belong to this lab.
	assertLabOwnsRow(db, 'extracts', data.extract_id as string, labId, 'Extract not found');
	if (data.plate_id) {
		assertLabOwnsRow(db, 'pcr_plates', data.plate_id as string, labId, 'PCR plate not found');
	}
	const id = resolveId(data?.id);
	db.prepare(`
		INSERT INTO pcr_amplifications (id, lab_id, extract_id, pcr_name, primer_set_id, target_subfragment,
			forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq,
			pcr_cond, annealing_temp_c, num_cycles, polymerase, pcr_date, band_observed, concentration_ng_ul,
			total_volume_ul, a260_280, a260_230, quantification_method,
			notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, labId, data.extract_id, data.pcr_name, data.primer_set_id ?? null, data.target_subfragment ?? null,
		data.forward_primer_name ?? null, data.forward_primer_seq ?? null, data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
		data.pcr_cond ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null, data.polymerase ?? null,
		data.pcr_date ?? null, data.band_observed ?? null, data.concentration_ng_ul ?? null,
		data.total_volume_ul ?? null, data.a260_280 ?? null, data.a260_230 ?? null, data.quantification_method ?? null,
		data.notes ?? null, data.custom_fields ?? null, userId);
	return db.prepare('SELECT * FROM pcr_amplifications WHERE id = ?').get(id);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();

	if (Array.isArray(data)) {
		const insertMany = db.transaction((items: Record<string, unknown>[]) =>
			items.map(item => insertPcr(db, item, user.id, labId))
		);
		return json(insertMany(data), { status: 201 });
	}

	return json(insertPcr(db, data, user.id, labId), { status: 201 });
};
