import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const DATA_ROOT = dirname(DB_PATH);

export type PhotoEntity = 'site' | 'sample';

/** Per-entity sub-directory under the data root. Existing site photos live
 *  at data/site_photos/ — keep that path stable for backward compat. */
const DIR_NAME: Record<PhotoEntity, string> = {
	site: 'site_photos',
	sample: 'sample_photos'
};

/** Whitelisted image mime types — what we accept on upload and serve back. */
export const ALLOWED_IMAGE_MIME = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif'
]);

export const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

/** Max upload size per photo. Site/sample photos come off phones so 15 MB is
 *  reasonable headroom for modern camera JPEGs without letting users DoS the
 *  disk. Raise carefully — bumping too high invites abuse on a shared VM. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function getPhotosDir(entity: PhotoEntity): string {
	const dir = join(DATA_ROOT, DIR_NAME[entity]);
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function photoFilePath(entity: PhotoEntity, filename: string): string {
	return join(getPhotosDir(entity), filename);
}
