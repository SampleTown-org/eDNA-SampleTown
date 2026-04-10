import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Run not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE sequencing_runs SET run_name = ?, run_date = ?, platform = ?, instrument_model = ?,
			seq_meth = ?, flow_cell_id = ?, run_directory = ?, fastq_directory = ?,
			total_reads = ?, total_bases = ?, notes = ?,
			sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.run_name, data.run_date ?? null, data.platform, data.instrument_model ?? null,
		data.seq_meth, data.flow_cell_id ?? null, data.run_directory ?? null, data.fastq_directory ?? null,
		data.total_reads ?? null, data.total_bases ?? null, data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM sequencing_runs WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE sequencing_runs SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
