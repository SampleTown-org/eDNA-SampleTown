import type Database from 'better-sqlite3';
import { getDb } from './db';

export type EntityType =
	| 'sample'
	| 'extract'
	| 'pcr_plate'
	| 'library_plate'
	| 'sequencing_run';

export interface PersonAttribution {
	personnel_id: string;
	role?: string | null;
}

export interface PersonRow {
	personnel_id: string;
	role: string | null;
	sort_order: number;
	full_name: string;
	email: string | null;
	institution: string | null;
}

/**
 * Replace the full set of attributed people for an entity with the given list.
 * Wrapped in a transaction so a partial failure doesn't leave the row in a
 * mixed state. Pass an empty array to clear all attributions.
 *
 * Caller is responsible for verifying that `entityId` exists in the
 * corresponding table — this function doesn't do FK validation beyond
 * `personnel.id` (which is enforced by the schema).
 */
export function setEntityPersonnel(
	db: Database.Database,
	entityType: EntityType,
	entityId: string,
	people: PersonAttribution[]
) {
	const del = db.prepare(
		'DELETE FROM entity_personnel WHERE entity_type = ? AND entity_id = ?'
	);
	const ins = db.prepare(
		`INSERT INTO entity_personnel (entity_type, entity_id, personnel_id, role, sort_order)
		 VALUES (?, ?, ?, ?, ?)`
	);
	const tx = db.transaction(() => {
		del.run(entityType, entityId);
		people.forEach((p, i) => {
			if (!p.personnel_id) return;
			ins.run(entityType, entityId, p.personnel_id, p.role || null, i);
		});
	});
	tx();
}

/** Load the attributed people for one entity, ordered by sort_order then name. */
export function getEntityPersonnel(
	entityType: EntityType,
	entityId: string
): PersonRow[] {
	const db = getDb();
	return db
		.prepare(
			`SELECT ep.personnel_id, ep.role, ep.sort_order,
			        p.full_name, p.email, p.institution
			   FROM entity_personnel ep
			   JOIN personnel p ON p.id = ep.personnel_id
			  WHERE ep.entity_type = ? AND ep.entity_id = ?
			  ORDER BY ep.sort_order, p.full_name`
		)
		.all(entityType, entityId) as PersonRow[];
}

/**
 * Pull the attributed people for many entities at once. Returns a Map
 * keyed by entity_id → array of person rows. Used by list pages that need
 * to render a roster column without N+1 queries.
 */
export function getEntityPersonnelBulk(
	entityType: EntityType,
	entityIds: string[]
): Map<string, PersonRow[]> {
	const map = new Map<string, PersonRow[]>();
	if (entityIds.length === 0) return map;
	const db = getDb();
	const placeholders = entityIds.map(() => '?').join(',');
	const rows = db
		.prepare(
			`SELECT ep.entity_id, ep.personnel_id, ep.role, ep.sort_order,
			        p.full_name, p.email, p.institution
			   FROM entity_personnel ep
			   JOIN personnel p ON p.id = ep.personnel_id
			  WHERE ep.entity_type = ? AND ep.entity_id IN (${placeholders})
			  ORDER BY ep.sort_order, p.full_name`
		)
		.all(entityType, ...entityIds) as (PersonRow & { entity_id: string })[];
	for (const r of rows) {
		const arr = map.get(r.entity_id) ?? [];
		arr.push(r);
		map.set(r.entity_id, arr);
	}
	return map;
}

/** Validate a `people` array from a request body. Returns a clean array. */
export function normalizePeople(input: unknown): PersonAttribution[] {
	if (!Array.isArray(input)) return [];
	return input
		.filter((p) => p && typeof p === 'object' && typeof (p as any).personnel_id === 'string')
		.map((p) => ({
			personnel_id: (p as any).personnel_id,
			role: typeof (p as any).role === 'string' ? (p as any).role : null
		}));
}

/**
 * Stitch a people roster summary onto each row of an entity list. Used by
 * the list-page loaders so the DataTable can display "Alice (collector),
 * Bob (lab tech)" without N+1 queries. Returns a new array — does not
 * mutate the input.
 */
export function attachPeopleSummary<T extends { id: string }>(
	entityType: EntityType,
	rows: T[]
): (T & { people_summary: string })[] {
	const map = getEntityPersonnelBulk(entityType, rows.map((r) => r.id));
	return rows.map((r) => {
		const people = map.get(r.id) ?? [];
		const summary = people
			.map((p) => (p.role ? `${p.full_name} (${p.role})` : p.full_name))
			.join(', ');
		return { ...r, people_summary: summary };
	});
}
