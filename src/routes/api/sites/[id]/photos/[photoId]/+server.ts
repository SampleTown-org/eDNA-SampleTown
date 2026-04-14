import { json, error } from '@sveltejs/kit';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import { photoFilePath } from '$lib/server/site-photos';

interface PhotoRow {
	id: string;
	site_id: string;
	filename: string;
	mime_type: string;
	is_deleted: number;
}

function loadPhoto(siteId: string, photoId: string): PhotoRow {
	const db = getDb();
	const row = db.prepare(
		'SELECT id, site_id, filename, mime_type, is_deleted FROM site_photos WHERE id = ? AND site_id = ?'
	).get(photoId, siteId) as PhotoRow | undefined;
	if (!row || row.is_deleted) throw error(404, 'Photo not found');
	return row;
}

/** Stream the binary. Browsers use this URL as <img src>. */
export const GET: RequestHandler = async ({ params }) => {
	const photo = loadPhoto(params.id, params.photoId);
	const path = photoFilePath(photo.filename);
	if (!existsSync(path)) throw error(404, 'Photo file missing');
	const bytes = readFileSync(path);
	return new Response(bytes, {
		headers: {
			'Content-Type': photo.mime_type,
			// Cache aggressively — photo ids are content-stable (generated once
			// and never overwritten). An explicit DELETE invalidates the row.
			'Cache-Control': 'private, max-age=3600'
		}
	});
};

/** Soft-delete the photo row and remove the on-disk file. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireUser(locals);
	try {
		const photo = loadPhoto(params.id, params.photoId);
		const db = getDb();
		db.prepare('UPDATE site_photos SET is_deleted = 1 WHERE id = ?').run(photo.id);
		db.prepare("UPDATE sites SET updated_at = datetime('now') WHERE id = ?").run(params.id);
		const path = photoFilePath(photo.filename);
		if (existsSync(path)) {
			try { unlinkSync(path); } catch { /* best-effort */ }
		}
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
