import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { RunUpdateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Run not found');
	const people = getEntityPersonnel('sequencing_run', params.id!);
	return json({ ...(row as Record<string, unknown>), people });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const parsed = parseBody(RunUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const db = getDb();
		db.prepare(
			`UPDATE sequencing_runs SET
				run_name = ?, run_date = ?, platform = ?, instrument_model = ?,
				seq_meth = ?, flow_cell_id = ?, run_directory = ?, fastq_directory = ?,
				total_reads = ?, total_bases = ?, notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.run_name,
			data.run_date ?? null,
			data.platform,
			data.instrument_model ?? null,
			data.seq_meth,
			data.flow_cell_id ?? null,
			data.run_directory ?? null,
			data.fastq_directory ?? null,
			data.total_reads ?? null,
			data.total_bases ?? null,
			data.notes ?? null,
			params.id
		);
		if (data.people !== undefined) {
			setEntityPersonnel(db, 'sequencing_run', params.id!, normalizePeople(data.people));
		}
		const updated = db.prepare('SELECT * FROM sequencing_runs WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('sequencing_run', params.id!);
		return json({ ...updated, people });
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
