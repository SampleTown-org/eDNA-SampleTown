import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { RunCreateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	return json(
		db
			.prepare('SELECT * FROM sequencing_runs WHERE is_deleted = 0 AND lab_id = ? ORDER BY created_at DESC')
			.all(labId)
	);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const parsed = parseBody(RunCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();

	// Validate every attached library belongs to this lab before inserting.
	if (data.library_ids?.length) {
		for (const libId of data.library_ids) {
			assertLabOwnsRow(db, 'library_preps', libId, labId, 'Library prep not found');
		}
	}

	const id = resolveId((data as Record<string, unknown>)?.id);
	db.prepare(`
		INSERT INTO sequencing_runs (id, lab_id, run_name, run_date, platform, instrument_model,
			flow_cell_id, run_directory, fastq_directory, total_reads, total_bases, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, labId, data.run_name, data.run_date ?? null, data.platform ?? null, data.instrument_model ?? null,
		data.flow_cell_id ?? null, data.run_directory ?? null, data.fastq_directory ?? null,
		data.total_reads ?? null, data.total_bases ?? null, data.notes ?? null, data.custom_fields ?? null,
		user.id);

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
