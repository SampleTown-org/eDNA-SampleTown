import type Database from 'better-sqlite3';

/** Scan every entity table for a row with the given id. Returns the entity
 *  type + id when found, or null. Used by the QR-scanner flow so a scanned
 *  UUID routes to the right detail page regardless of what kind of thing
 *  was assigned to it. Kept in a single helper so a new entity type only
 *  has to add one line here. */
export type EntityType =
	| 'project'
	| 'site'
	| 'sample'
	| 'extract'
	| 'pcr_plate'
	| 'pcr_reaction'
	| 'library_plate'
	| 'library'
	| 'run';

const TABLES: { type: EntityType; table: string; softDelete: boolean }[] = [
	{ type: 'project', table: 'projects', softDelete: false },
	{ type: 'site', table: 'sites', softDelete: true },
	{ type: 'sample', table: 'samples', softDelete: true },
	{ type: 'extract', table: 'extracts', softDelete: true },
	{ type: 'pcr_plate', table: 'pcr_plates', softDelete: true },
	{ type: 'pcr_reaction', table: 'pcr_amplifications', softDelete: true },
	{ type: 'library_plate', table: 'library_plates', softDelete: true },
	{ type: 'library', table: 'library_preps', softDelete: true },
	{ type: 'run', table: 'sequencing_runs', softDelete: true }
];

export function findEntityById(
	db: Database.Database,
	id: string
): { type: EntityType; id: string } | null {
	if (!/^[0-9a-f]{32}$/i.test(id)) return null;
	for (const { type, table, softDelete } of TABLES) {
		const sql = softDelete
			? `SELECT id FROM ${table} WHERE id = ? AND is_deleted = 0`
			: `SELECT id FROM ${table} WHERE id = ?`;
		const row = db.prepare(sql).get(id);
		if (row) return { type, id };
	}
	return null;
}

/** Map an entity type to its detail-page path. */
export function pathFor(type: EntityType, id: string): string {
	switch (type) {
		case 'project': return `/projects/${id}`;
		case 'site': return `/sites/${id}`;
		case 'sample': return `/samples/${id}`;
		case 'extract': return `/extracts/${id}`;
		case 'pcr_plate': return `/pcr/${id}`;
		case 'pcr_reaction': return `/pcr/reaction/${id}`;
		case 'library_plate': return `/libraries/${id}`;
		case 'library': return `/libraries/lib/${id}`;
		case 'run': return `/runs/${id}`;
	}
}

/** New-form path for a given entity type, carrying the pre-assigned id. */
export function newPathFor(type: EntityType, id: string): string {
	switch (type) {
		case 'project': return `/projects/new?id=${id}`;
		case 'site': return `/sites/new?id=${id}`;
		case 'sample': return `/samples/new?id=${id}`;
		case 'extract': return `/extracts/new?id=${id}`;
		case 'pcr_plate': return `/pcr/new?id=${id}`;
		case 'pcr_reaction': return `/pcr/new?id=${id}`; // reactions created inline
		case 'library_plate': return `/libraries/new?id=${id}`;
		case 'library': return `/libraries/new?id=${id}`;
		case 'run': return `/runs/new?id=${id}`;
	}
}
