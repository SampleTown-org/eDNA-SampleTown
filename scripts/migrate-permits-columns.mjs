#!/usr/bin/env node
/**
 * One-off migration for the permits-governance + principles work: add the
 * columns those features introduced to EXISTING tables. Idempotent — safe to
 * run multiple times.
 *
 * schema.sql uses CREATE TABLE IF NOT EXISTS and does not re-shape existing
 * tables, so any DB created before these columns needs this migration. The
 * new `permits` / `permit_scopes` tables + their indexes are created
 * automatically on app startup (CREATE ... IF NOT EXISTS) and need nothing
 * here — only the added columns on pre-existing tables do.
 *
 * Columns added:
 *   users.principles_ack_at        TEXT     (one-time principles acknowledgement)
 *   samples.is_location_sensitive  INTEGER  (coordinate-coarsening flag, default 0)
 *
 * Usage:
 *   node scripts/migrate-permits-columns.mjs [db-path]
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/migrate-permits-columns.mjs
 */
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || process.env.DB_PATH || 'data/sampletown.db';
const db = new Database(dbPath);

/** Add `<table>.<column>` (defined by `ddl`) only if it's not already there. */
function addColumn(table, column, ddl) {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all();
	if (cols.some((c) => c.name === column)) {
		console.log(`  ${table}.${column} already present`);
		return 0;
	}
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
	console.log(`  added ${table}.${column}`);
	return 1;
}

console.log(`Migrating ${dbPath} …`);
let added = 0;
added += addColumn('users', 'principles_ack_at', 'principles_ack_at TEXT');
added += addColumn('samples', 'is_location_sensitive', 'is_location_sensitive INTEGER NOT NULL DEFAULT 0');
db.close();
console.log(added ? `Done — added ${added} column(s).` : 'Done — nothing to add (already migrated).');
