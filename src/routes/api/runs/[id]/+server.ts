import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Run not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.run_name?.trim()) {
			return json({ error: 'run_name is required' }, { status: 400 });
		}
		if (!data?.platform) {
			return json({ error: 'platform is required' }, { status: 400 });
		}
		if (!data?.seq_meth) {
			return json({ error: 'seq_meth is required' }, { status: 400 });
		}
		const db = getDb();
		db.prepare(
			`UPDATE sequencing_runs SET
				run_name = ?, run_date = ?, platform = ?, instrument_model = ?,
				seq_meth = ?, flow_cell_id = ?, run_directory = ?, fastq_directory = ?,
				total_reads = ?, total_bases = ?, notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.run_name.trim(),
			nn(data.run_date),
			data.platform,
			nn(data.instrument_model),
			data.seq_meth,
			nn(data.flow_cell_id),
			nn(data.run_directory),
			nn(data.fastq_directory),
			data.total_reads ?? null,
			data.total_bases ?? null,
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM sequencing_runs WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare(
			"UPDATE sequencing_runs SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
