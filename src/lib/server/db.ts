import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import schema from './schema.sql?raw';
import { seedConstrainedValues } from './seed-constrained-values';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		_db = new Database(DB_PATH);
		_db.pragma('journal_mode = WAL');
		_db.pragma('foreign_keys = ON');
		// Pre-schema migrations drop tables whose shape has changed in a way
		// that ALTER TABLE can't handle (e.g. adding a NOT NULL FK column).
		// They run BEFORE schema.exec so the CREATE TABLE IF NOT EXISTS
		// statements rebuild the tables with the new shape.
		preSchemaMigrations(_db);
		// Columns that schema.sql references in CREATE INDEX statements must
		// already exist on surviving tables (users, feedback) before
		// schema.exec runs — otherwise SQLite aborts the whole schema apply
		// at the first CREATE INDEX that points at a missing column, and we
		// end up with a partial-schema DB. This was discovered the hard way
		// on the 2026-04-14 prod deploy. Keep column additions on long-lived
		// tables HERE, not in runMigrations.
		addColumnIfMissing(_db, 'users', 'lab_id TEXT REFERENCES labs(id)');
		addColumnIfMissing(_db, 'feedback', 'lab_id TEXT REFERENCES labs(id)');
		_db.exec(schema);
		runMigrations(_db);
		seedDefaultLab(_db);
		// Seed picklists for the default lab. New labs get their own seeds
		// via scripts/create-lab.mjs which calls seedConstrainedValues directly.
		const defaultLabId = getDefaultLabId(_db);
		seedConstrainedValues(_db, defaultLabId);
		seedDefaultAdmin(_db, defaultLabId);
	}
	return _db;
}

/**
 * One-shot reset for installs that predate the multi-lab migration.
 *
 * Detects by "no labs table + existing users table". When triggered, drops
 * every table that now requires a NOT NULL lab_id column (can't be added via
 * ALTER TABLE in SQLite without a table rebuild). Users, sessions,
 * oauth_states, feedback, and sync_log are preserved — users and feedback
 * get a nullable lab_id column added post-schema and backfilled to the
 * default lab; sessions are wiped so everyone re-logs-in with the new
 * `lab_id` populated into `locals.user`.
 *
 * Safe to run more than once: the `labs` check makes it idempotent.
 */
function preSchemaMigrations(db: Database.Database) {
	const hasLabs = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='labs'")
		.get();
	if (hasLabs) return;

	const hasUsers = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
		.get();
	if (!hasUsers) return; // fresh install — schema.exec will build everything cleanly

	console.log(
		'[migration] multi-lab reset: dropping project data, preserving users + feedback'
	);

	// Force-disable FK enforcement for the drop cascade — we're intentionally
	// wiping dependent tables, so FK errors from orphaned rows would be noise.
	db.pragma('foreign_keys = OFF');
	const tablesToReset = [
		'analyses',
		'run_libraries',
		'sequencing_runs',
		'library_preps',
		'library_plates',
		'pcr_amplifications',
		'pcr_plates',
		'extracts',
		'sample_values',
		'sample_photos',
		'samples',
		'site_photos',
		'sites',
		'projects',
		'saved_cart_items',
		'saved_carts',
		'entity_personnel',
		'personnel',
		'constrained_values',
		'primer_sets',
		'pcr_protocols',
		'db_snapshots'
	];
	for (const t of tablesToReset) {
		try {
			db.exec(`DROP TABLE IF EXISTS ${t}`);
		} catch (err) {
			console.warn(`[migration] drop ${t} failed (non-fatal):`, err instanceof Error ? err.message : err);
		}
	}
	// Invalidate all existing sessions — lab_id needs to flow into locals.user
	// on next login, and some sessions may belong to rows we've just reset.
	try {
		db.exec('DELETE FROM sessions');
	} catch {
		/* sessions table may not exist yet */
	}
	db.pragma('foreign_keys = ON');
}

/**
 * Create the default lab on first run AFTER schema.exec has built the labs
 * table. Idempotent — no-op once any lab exists.
 *
 * The default lab name comes from DEFAULT_LAB_NAME (env) with a fallback of
 * "Cryomics Lab" for continuity with the production deployment. Slug is
 * derived from the name. Subsequent labs are created by
 * scripts/create-lab.mjs — there's no UI for creating labs because the
 * blast radius (and potential for accidental lab-duplication) is too high.
 */
function seedDefaultLab(db: Database.Database) {
	const existing = db.prepare('SELECT COUNT(*) AS c FROM labs').get() as { c: number };

	let defaultLabId: string;
	if (existing.c === 0) {
		const name = process.env.DEFAULT_LAB_NAME || 'Cryomics Lab';
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'default';
		defaultLabId = generateId();
		db.prepare('INSERT INTO labs (id, name, slug) VALUES (?, ?, ?)').run(defaultLabId, name, slug);
		console.log(`[seed] Created default lab "${name}" (${slug})`);
	} else {
		defaultLabId = (db
			.prepare('SELECT id FROM labs ORDER BY created_at ASC LIMIT 1')
			.get() as { id: string }).id;
	}

	// Reconciliation + first-run backfill. Runs every startup (cheap with
	// indexed FK lookups) so a mid-migration labs rebuild can't leave users
	// or feedback pointing at a dead lab_id. Three cases handled:
	//
	//   NULL lab_id         → backfill to default lab (post-initial-migration)
	//   non-existent lab_id → reconcile to default lab (stale reference
	//                         from a botched earlier migration — hit once
	//                         on the 2026-04-14 prod deploy)
	//   valid lab_id        → untouched
	try {
		const uReconcile = db.prepare(
			'UPDATE users SET lab_id = ? WHERE lab_id IS NOT NULL AND lab_id NOT IN (SELECT id FROM labs)'
		).run(defaultLabId);
		const fReconcile = db.prepare(
			'UPDATE feedback SET lab_id = ? WHERE lab_id IS NOT NULL AND lab_id NOT IN (SELECT id FROM labs)'
		).run(defaultLabId);
		if (uReconcile.changes > 0) console.warn(`[seed] Reconciled ${uReconcile.changes} users with stale lab_id → default lab`);
		if (fReconcile.changes > 0) console.warn(`[seed] Reconciled ${fReconcile.changes} feedback rows with stale lab_id → default lab`);

		db.prepare('UPDATE users SET lab_id = ? WHERE lab_id IS NULL').run(defaultLabId);
		db.prepare('UPDATE feedback SET lab_id = ? WHERE lab_id IS NULL').run(defaultLabId);
	} catch {
		/* columns may not exist yet on very-first-run; addColumnIfMissing handles it */
	}
}

/** Idempotent ADD COLUMN helper used by preSchemaMigrations. Unlike the
 *  addColumn inside runMigrations (which runs AFTER schema.exec), this runs
 *  BEFORE so schema.sql's CREATE INDEX statements can reference the new
 *  columns on tables that already exist from an earlier install. */
function addColumnIfMissing(db: Database.Database, table: string, def: string) {
	// Skip silently if the target table doesn't exist yet (fresh install —
	// schema.exec will create it with the column already in CREATE TABLE).
	const exists = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
		.get(table);
	if (!exists) return;
	try {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (!msg.includes('duplicate column')) throw err;
	}
}

/** Return the default lab's id — used by seeds (default admin, picklists). */
export function getDefaultLabId(db: Database.Database): string {
	const row = db
		.prepare('SELECT id FROM labs ORDER BY created_at ASC LIMIT 1')
		.get() as { id: string } | undefined;
	if (!row) throw new Error('No labs exist — seedDefaultLab did not run');
	return row.id;
}

/**
 * Idempotent ADD-COLUMN migrations. schema.sql uses CREATE TABLE IF NOT EXISTS,
 * so existing tables aren't upgraded when we add a column to the schema. Each
 * migration here is wrapped in try/catch — SQLite errors with "duplicate column
 * name" if the column is already present, which we treat as already-applied.
 *
 * Rule: columns added here must also be added to schema.sql so fresh installs
 * get the column from the CREATE TABLE. Never drop, rename, or change types;
 * the prod DB at edna.sampletown.org has live beta-tester data.
 */
function runMigrations(db: Database.Database) {
	const addColumn = (table: string, def: string) => {
		try {
			db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes('duplicate column')) throw err;
		}
	};
	/** RENAME COLUMN with idempotency: fine on first run, silently skipped
	 *  once the target column already has the new name. Covers both sqlite
	 *  error strings ("no such column" when old is gone, "duplicate column"
	 *  if someone ALTERs in parallel). */
	const renameColumn = (table: string, oldName: string, newName: string) => {
		try {
			db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes('no such column') && !msg.includes('duplicate column')) throw err;
		}
	};
	addColumn('users', 'is_deleted INTEGER NOT NULL DEFAULT 0');
	// NB: users.lab_id and feedback.lab_id are added earlier in getDb(), BEFORE
	// schema.exec, because schema.sql's CREATE INDEX idx_users_lab references
	// that column. See addColumnIfMissing calls above.
	addColumn('pcr_amplifications', 'well_label TEXT');
	addColumn('library_preps', 'well_label TEXT');
	// Project metadata extras — added 2026-04-15 per beta feedback.
	addColumn('projects', 'contact_email TEXT');
	addColumn('projects', 'funding_sources TEXT');
	addColumn('users', 'avatar_emoji TEXT');
	addColumn('extracts', 'nucl_acid_type TEXT');
	addColumn('pcr_amplifications', 'total_volume_ul REAL');
	addColumn('pcr_amplifications', 'a260_280 REAL');
	addColumn('pcr_amplifications', 'a260_230 REAL');
	addColumn('pcr_amplifications', 'quantification_method TEXT');
	// MIxS audit (docs/MIXS_AUDIT.md) recommended column renames for exact
	// alignment with MIxS v6.3 slot names.
	renameColumn('extracts', 'extraction_kit', 'nucl_acid_ext_kit');
	renameColumn('pcr_plates', 'pcr_conditions', 'pcr_cond');
	renameColumn('pcr_amplifications', 'pcr_conditions', 'pcr_cond');
	renameColumn('pcr_protocols', 'pcr_conditions', 'pcr_cond');
	// NB: pre-multi-lab-merge backfills for person_role and naming_template
	// were removed — multi-lab migration wipes constrained_values anyway,
	// and SEED_DATA now includes all those entries inline.
}

export function generateId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Use a client-supplied id if it matches our id format (32 lowercase hex),
 *  otherwise mint a fresh one. Lets pre-printed QR codes flow through
 *  POST endpoints as the row id for the scanner workflow. The DB will
 *  reject duplicate ids via the primary-key constraint. */
export function resolveId(suggested: unknown): string {
	if (typeof suggested === 'string' && /^[0-9a-f]{32}$/.test(suggested)) {
		return suggested;
	}
	return generateId();
}

/**
 * Seed a default `admin/admin` account if the users table is empty.
 *
 * `must_change_password=1` forces the bootstrap operator to change the
 * password on first login. The seed never runs again once any user exists.
 *
 * SECURITY NOTE: this default password is exploitable until first login.
 * Bootstrap from a private network or SSH tunnel and change the password
 * BEFORE exposing the app on the public internet.
 */
function seedDefaultAdmin(db: Database.Database, defaultLabId: string) {
	const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
	if (count > 0) return;

	const id = generateId();
	// bcrypt cost 12 to match the rest of the app, even though this is a
	// throwaway placeholder password.
	const hash = bcrypt.hashSync('admin', 12);
	db.prepare(
		`INSERT INTO users (id, lab_id, username, password_hash, role, is_local_account, is_approved, must_change_password)
		 VALUES (?, ?, 'admin', ?, 'admin', 1, 1, 1)`
	).run(id, defaultLabId, hash);
	console.log('[seed] Created default admin user (admin/admin) — change the password on first login');
}
