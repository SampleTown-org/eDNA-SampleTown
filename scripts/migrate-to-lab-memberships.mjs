#!/usr/bin/env node
/**
 * One-shot migration: move lab/role info out of `users` into `lab_memberships`.
 *
 * Why: we're switching from "one lab per user" to "many labs per user, with
 * per-lab role and an active-lab pointer". The OAuth callback was crashing
 * when a soft-deleted user tried to re-auth (UNIQUE collision on username);
 * dissolving soft-delete into "no active membership" fixes that, and the
 * same model gives us the per-lab block flag lab admins want.
 *
 * What it does (all idempotent):
 *   1. Creates `lab_memberships` if missing.
 *   2. Adds `users.active_lab_id` if missing.
 *   3. Backfills one membership row per (user, user.lab_id) where lab_id is
 *      set and is_deleted=0, carrying over the user's legacy role. Uses
 *      INSERT OR IGNORE so re-running is safe.
 *   4. Copies each such user's `lab_id` into `active_lab_id` (only where
 *      active_lab_id is still NULL).
 *
 * What it does NOT do:
 *   - Drop the old columns (lab_id, role, is_deleted). Per the
 *     no-migrations rule, dead columns stay on prod. schema.sql keeps them
 *     declared so `CREATE TABLE IF NOT EXISTS` on fresh installs still
 *     produces a shape compatible with this migration.
 *   - Create memberships for soft-deleted users. They land at
 *     /auth/setup-lab on next login; a fresh invite re-adds them.
 *
 * Usage:
 *   node scripts/migrate-to-lab-memberships.mjs
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/migrate-to-lab-memberships.mjs
 */
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const tx = db.transaction(() => {
	db.exec(`
		CREATE TABLE IF NOT EXISTS lab_memberships (
			user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			lab_id   TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
			role     TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
			status   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
			added_at TEXT NOT NULL DEFAULT (datetime('now')),
			added_by TEXT REFERENCES users(id),
			PRIMARY KEY (user_id, lab_id)
		);
		CREATE INDEX IF NOT EXISTS idx_lab_memberships_lab ON lab_memberships(lab_id);
	`);

	const cols = db.prepare('PRAGMA table_info(users)').all();
	if (!cols.some((c) => c.name === 'active_lab_id')) {
		db.exec('ALTER TABLE users ADD COLUMN active_lab_id TEXT REFERENCES labs(id)');
		db.exec('CREATE INDEX IF NOT EXISTS idx_users_active_lab ON users(active_lab_id)');
	}

	const insertResult = db
		.prepare(
			`INSERT OR IGNORE INTO lab_memberships (user_id, lab_id, role, status, added_at)
			 SELECT id, lab_id, role, 'active', created_at
			 FROM users
			 WHERE lab_id IS NOT NULL AND is_deleted = 0`
		)
		.run();

	const updateResult = db
		.prepare(
			`UPDATE users
			    SET active_lab_id = lab_id
			  WHERE active_lab_id IS NULL
			    AND lab_id IS NOT NULL
			    AND is_deleted = 0`
		)
		.run();

	return { inserted: insertResult.changes, updated: updateResult.changes };
});

const { inserted, updated } = tx();

const memberships = db.prepare('SELECT COUNT(*) as n FROM lab_memberships').get().n;
const usersWithActive = db
	.prepare('SELECT COUNT(*) as n FROM users WHERE active_lab_id IS NOT NULL')
	.get().n;
const usersWithoutMembership = db
	.prepare(
		`SELECT COUNT(*) as n FROM users u
		  WHERE u.is_deleted = 0
		    AND NOT EXISTS (SELECT 1 FROM lab_memberships m WHERE m.user_id = u.id)`
	)
	.get().n;

db.close();

console.log('Migration complete.');
console.log(`  lab_memberships inserted this run : ${inserted}`);
console.log(`  users.active_lab_id set this run  : ${updated}`);
console.log(`  lab_memberships rows total        : ${memberships}`);
console.log(`  users with active_lab_id set      : ${usersWithActive}`);
console.log(`  live users without a membership   : ${usersWithoutMembership}`);
