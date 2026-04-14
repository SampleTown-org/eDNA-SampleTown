import { json, error } from '@sveltejs/kit';
import { writeFileSync } from 'fs';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import {
	ALLOWED_IMAGE_MIME,
	MIME_TO_EXT,
	MAX_PHOTO_BYTES,
	photoFilePath
} from '$lib/server/site-photos';

/** List (non-deleted) photos for a site. */
export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const site = db.prepare('SELECT id FROM sites WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!site) throw error(404, 'Site not found');
	const rows = db.prepare(
		`SELECT id, site_id, filename, original_filename, mime_type, size_bytes, caption, created_at, created_by
		 FROM site_photos
		 WHERE site_id = ? AND is_deleted = 0
		 ORDER BY created_at DESC`
	).all(params.id);
	return json(rows);
};

/** Upload one photo (multipart/form-data, field name `file`, optional `caption`). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = requireUser(locals);
	try {
		const db = getDb();
		const site = db.prepare('SELECT id FROM sites WHERE id = ? AND is_deleted = 0').get(params.id);
		if (!site) throw error(404, 'Site not found');

		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File)) {
			return json({ error: 'file field is required' }, { status: 400 });
		}
		if (file.size === 0) {
			return json({ error: 'Empty file' }, { status: 400 });
		}
		if (file.size > MAX_PHOTO_BYTES) {
			return json(
				{ error: `File too large (max ${MAX_PHOTO_BYTES / 1024 / 1024} MB)` },
				{ status: 413 }
			);
		}
		if (!ALLOWED_IMAGE_MIME.has(file.type)) {
			return json(
				{ error: `Unsupported type ${file.type || '(none)'} — use JPEG, PNG, WebP, or GIF` },
				{ status: 415 }
			);
		}

		const captionRaw = formData.get('caption');
		const caption = typeof captionRaw === 'string' && captionRaw.trim().length > 0
			? captionRaw.trim().slice(0, 500)
			: null;

		const photoId = generateId();
		const ext = MIME_TO_EXT[file.type] ?? 'bin';
		const filename = `${photoId}.${ext}`;
		const buffer = Buffer.from(await file.arrayBuffer());
		writeFileSync(photoFilePath(filename), buffer);

		db.prepare(
			`INSERT INTO site_photos (id, site_id, filename, original_filename, mime_type, size_bytes, caption, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(photoId, params.id, filename, file.name || null, file.type, file.size, caption, user.id);

		// Touch the site so the dashboard "Modified" column reflects this change.
		db.prepare("UPDATE sites SET updated_at = datetime('now') WHERE id = ?").run(params.id);

		const row = db.prepare('SELECT * FROM site_photos WHERE id = ?').get(photoId);
		return json(row, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
