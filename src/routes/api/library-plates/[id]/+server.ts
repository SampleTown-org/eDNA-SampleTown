import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { LibraryPlateUpdateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const plate = db
		.prepare('SELECT * FROM library_plates WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.id, labId);
	if (!plate) throw error(404, 'Library plate not found');
	const people = getEntityPersonnel('library_plate', params.id!);
	return json({ ...plate, people });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { labId } = requireLab(locals);
	const parsed = parseBody(LibraryPlateUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const db = getDb();
		assertLabOwnsRow(db, 'library_plates', params.id!, labId, 'Library plate not found');
		db.prepare(
			`UPDATE library_plates SET
				plate_name = ?, library_prep_date = ?, library_type = ?,
				library_source = ?, library_selection = ?,
				library_prep_kit = ?, platform = ?, instrument_model = ?, fragment_size_bp = ?,
				notes = ?, sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.plate_name,
			data.library_prep_date ?? null,
			data.library_type,
			data.library_source ?? null,
			data.library_selection ?? null,
			data.library_prep_kit ?? null,
			data.platform ?? null,
			data.instrument_model ?? null,
			data.fragment_size_bp ?? null,
			data.notes ?? null,
			params.id
		);
		if (data.people !== undefined) {
			setEntityPersonnel(db, 'library_plate', params.id!, normalizePeople(data.people));
		}
		const updated = db.prepare('SELECT * FROM library_plates WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('library_plate', params.id!);
		return json({ ...updated, people });
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const db = getDb();
		assertLabOwnsRow(db, 'library_plates', params.id!, labId, 'Library plate not found');
		db.prepare(
			"UPDATE library_plates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
