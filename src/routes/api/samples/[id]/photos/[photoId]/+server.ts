import { json, error } from '@sveltejs/kit';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import { photoFilePath } from '$lib/server/entity-photos';

interface PhotoRow {
	id: string;
	sample_id: string;
	filename: string;
	mime_type: string;
	is_deleted: number;
}

function loadPhoto(sampleId: string, photoId: string): PhotoRow {
	const db = getDb();
	const row = db.prepare(
		'SELECT id, sample_id, filename, mime_type, is_deleted FROM sample_photos WHERE id = ? AND sample_id = ?'
	).get(photoId, sampleId) as PhotoRow | undefined;
	if (!row || row.is_deleted) throw error(404, 'Photo not found');
	return row;
}

export const GET: RequestHandler = async ({ params }) => {
	const photo = loadPhoto(params.id, params.photoId);
	const path = photoFilePath('sample', photo.filename);
	if (!existsSync(path)) throw error(404, 'Photo file missing');
	const bytes = readFileSync(path);
	return new Response(bytes, {
		headers: {
			'Content-Type': photo.mime_type,
			'Cache-Control': 'private, max-age=3600'
		}
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireUser(locals);
	try {
		const photo = loadPhoto(params.id, params.photoId);
		const db = getDb();
		db.prepare('UPDATE sample_photos SET is_deleted = 1 WHERE id = ?').run(photo.id);
		db.prepare("UPDATE samples SET updated_at = datetime('now') WHERE id = ?").run(params.id);
		const path = photoFilePath('sample', photo.filename);
		if (existsSync(path)) {
			try { unlinkSync(path); } catch { /* best-effort */ }
		}
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
