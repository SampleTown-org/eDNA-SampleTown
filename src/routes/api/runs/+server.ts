import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { RunCreateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async () => {
	const db = getDb();
	return json(db.prepare('SELECT * FROM sequencing_runs WHERE is_deleted = 0 ORDER BY created_at DESC').all());
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = parseBody(RunCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const id = generateId();
	db.prepare(`
		INSERT INTO sequencing_runs (id, run_name, run_date, platform, instrument_model, seq_meth,
			flow_cell_id, run_directory, fastq_directory, total_reads, total_bases, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, data.run_name, data.run_date ?? null, data.platform ?? null, data.instrument_model ?? null,
		data.seq_meth ?? null, data.flow_cell_id ?? null, data.run_directory ?? null, data.fastq_directory ?? null,
		data.total_reads ?? null, data.total_bases ?? null, data.notes ?? null, data.custom_fields ?? null,
		locals.user?.id ?? null);

	// Attach libraries if provided
	if (data.library_ids?.length) {
		const stmt = db.prepare('INSERT INTO run_libraries (run_id, library_id) VALUES (?, ?)');
		for (const libId of data.library_ids) {
			stmt.run(id, libId);
		}
	}

	setEntityPersonnel(db, 'sequencing_run', id, normalizePeople(data.people));

	return json(db.prepare('SELECT * FROM sequencing_runs WHERE id = ?').get(id), { status: 201 });
};
