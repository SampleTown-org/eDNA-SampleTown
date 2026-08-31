#!/usr/bin/env node
/**
 * Migration for the snapshot-sync feature: add the sync bookkeeping columns
 * to the EXISTING `labs` table. Idempotent — safe to run multiple times.
 *
 * schema.sql uses CREATE TABLE IF NOT EXISTS and does not re-shape existing
 * tables, so any DB created before these columns needs this migration.
 *
 * Columns added:
 *   labs.sync_enabled       INTEGER NOT NULL DEFAULT 1
 *   labs.last_synced_sha    TEXT
 *   labs.last_synced_state  TEXT
 *   labs.last_sync_at       TEXT
 *   labs.last_sync_status   TEXT
 *
 * Usage:
 *   node scripts/migrate-sync-columns.mjs [db-path]
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/migrate-sync-columns.mjs
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
added += addColumn('labs', 'sync_enabled', 'sync_enabled INTEGER NOT NULL DEFAULT 1');
added += addColumn('labs', 'last_synced_sha', 'last_synced_sha TEXT');
added += addColumn('labs', 'last_synced_state', 'last_synced_state TEXT');
added += addColumn('labs', 'last_sync_at', 'last_sync_at TEXT');
added += addColumn('labs', 'last_sync_status', 'last_sync_status TEXT');
db.close();
console.log(added ? `Done — added ${added} column(s).` : 'Done — nothing to add (already migrated).');
