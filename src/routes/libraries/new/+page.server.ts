import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const pcrs = db.prepare(`SELECT p.id, p.pcr_name, p.target_gene, e.extract_name
		FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id
		WHERE p.is_deleted = 0 ORDER BY p.pcr_name`).all();
	const extracts = db.prepare(`SELECT e.id, e.extract_name, s.samp_name
		FROM extracts e JOIN samples s ON s.id = e.sample_id
		WHERE e.is_deleted = 0 ORDER BY e.extract_name`).all();
	const pcrPlates = db.prepare(`SELECT p.id, p.plate_name, p.target_gene, p.target_subfragment,
		(SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS reaction_count
		FROM pcr_plates p WHERE p.is_deleted = 0 ORDER BY p.created_at DESC`).all();
	const picklists = getConstrainedValues('library_prep_kit', 'library_type', 'seq_platform', 'seq_instrument', 'index_i7', 'index_i5', 'barcode', 'person_role');
	const personnel = getActivePersonnel();
	return {
		pcrs, extracts, pcrPlates, picklists, personnel,
		preselectedPcrId: url.searchParams.get('pcr_id') || '',
		preselectedExtractId: url.searchParams.get('extract_id') || '',
		preselectedPcrPlateId: url.searchParams.get('pcr_plate_id') || ''
	};
};
