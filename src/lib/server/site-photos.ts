import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const PHOTOS_DIR = join(dirname(DB_PATH), 'site_photos');

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

/** Max upload size per photo. Site photos come off phones so 15 MB is a
 *  reasonable headroom for modern camera JPEGs without letting users DoS the
 *  disk. Raise carefully — bumping too high invites abuse on a shared VM. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function getPhotosDir(): string {
	mkdirSync(PHOTOS_DIR, { recursive: true });
	return PHOTOS_DIR;
}

export function photoFilePath(filename: string): string {
	return join(getPhotosDir(), filename);
}
