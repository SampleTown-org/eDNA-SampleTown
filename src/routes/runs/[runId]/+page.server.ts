import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const run = db
		.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.runId, labId);
	if (!run) throw error(404, 'Run not found');
	// The link row carries what differs between the libraries on this flow
	// cell: that library's read files, their checksums and read count, and the
	// archive's own run accession for it.
	const libraries = db.prepare(`
		SELECT l.*,
			rl.fastq_r1, rl.fastq_r1_md5, rl.fastq_r2, rl.fastq_r2_md5,
			rl.fastq_single, rl.fastq_single_md5, rl.fastq_bytes,
			rl.read_count, rl.accession AS run_accession
		FROM library_preps l
		JOIN run_libraries rl ON rl.library_id = l.id
		WHERE rl.run_id = ? AND l.is_deleted = 0
	`).all(params.runId);
	const analyses = db.prepare('SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at DESC').all(params.runId);
	const people = getEntityPersonnel('sequencing_run', params.runId);
	return { run, libraries, analyses, people };
};
