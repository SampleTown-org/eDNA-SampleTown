import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const sampleCount = (db.prepare('SELECT COUNT(*) as c FROM samples WHERE is_deleted = 0').get() as { c: number }).c;
	const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c;
	return { sampleCount, projectCount };
};
