#!/usr/bin/env node
/**
 * One-off migration: add the site_code column + partial unique index to the
 * sites table. Idempotent — safe to run multiple times. Required for any DB
 * that predates the schema change (schema.sql uses CREATE TABLE IF NOT EXISTS
 * and does not re-shape existing tables).
 *
 * Usage:
 *   node scripts/migrate-add-site-code.mjs [db-path]
 *
 * Default db path: data/sampletown.db (matches DB_PATH default in db.ts).
 */

import Database from 'better-sqlite3';

const dbPath = process.argv[2] || 'data/sampletown.db';
const db = new Database(dbPath);

const cols = db.prepare('PRAGMA table_info(sites)').all();
const hasCode = cols.some((c) => c.name === 'site_code');
if (!hasCode) {
	db.exec('ALTER TABLE sites ADD COLUMN site_code TEXT');
	console.log(`Added site_code column to ${dbPath}`);
} else {
	console.log(`site_code already present in ${dbPath}`);
}

db.exec(
	'CREATE UNIQUE INDEX IF NOT EXISTS uniq_sites_project_code ' +
	'ON sites(project_id, site_code) WHERE site_code IS NOT NULL'
);
console.log('Ensured partial unique index uniq_sites_project_code');

db.close();
