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
		_db.exec(schema);
		runMigrations(_db);
		seedConstrainedValues(_db);
		seedDefaultAdmin(_db);
	}
	return _db;
}

export function generateId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Add a column to a table if it doesn't already exist.
 * SQLite has no IF NOT EXISTS for columns, so we check PRAGMA table_info first.
 * Use this to ship additive schema changes that need to land on existing
 * production databases without manual intervention.
 */
function ensureColumn(db: Database.Database, table: string, column: string, decl: string) {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (!cols.some((c) => c.name === column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
	}
}

function runMigrations(db: Database.Database) {
	// users.is_approved + users.must_change_password were added after the
	// initial release. Existing rows are grandfathered in (default 1 / 0).
	ensureColumn(db, 'users', 'is_approved', 'INTEGER NOT NULL DEFAULT 1');
	ensureColumn(db, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');

	// sequencing_runs.platform + seq_meth were originally NOT NULL. Operator
	// feedback: only run_name should be required at create time (the other
	// fields can be filled in later when the run actually happens). SQLite
	// doesn't support ALTER COLUMN DROP NOT NULL, so we do the table-rebuild
	// dance: create a copy with the new constraints, copy rows over, drop the
	// old table, rename. Idempotent — runs only if the old NOT NULL is still
	// in place.
	relaxSequencingRunsNotNull(db);

	// Drop CHECK enum constraints on columns whose values are operator
	// vocabulary, not externally mandated (SRA / MIxS). These columns
	// become plain TEXT NOT NULL with the picklist as the sole source of
	// truth. Uses a generic helper that reads the existing DDL, strips
	// CHECK clauses from specific columns, and does the rebuild if needed.
	// Columns NOT listed (e.g. platform, status) keep their CHECKs.
	dropColumnChecks(db, {
		pcr_plates: ['target_gene'],
		pcr_amplifications: ['target_gene'],
		library_plates: ['library_type'],
		library_preps: ['library_type'],
		analyses: ['pipeline']
	});
}

/**
 * Drop NOT NULL on sequencing_runs.platform + sequencing_runs.seq_meth via the
 * SQLite table-rebuild pattern. No-op once the new constraints are already in
 * place. Foreign keys (run_libraries → sequencing_runs.id) are temporarily
 * disabled during the swap so they re-bind to the new table cleanly.
 */
function relaxSequencingRunsNotNull(db: Database.Database) {
	const cols = db.prepare(`PRAGMA table_info(sequencing_runs)`).all() as {
		name: string;
		notnull: number;
	}[];
	const platform = cols.find((c) => c.name === 'platform');
	const seqMeth = cols.find((c) => c.name === 'seq_meth');
	// Both columns already nullable → already migrated, nothing to do.
	if (platform && platform.notnull === 0 && seqMeth && seqMeth.notnull === 0) return;

	// Suspend FK enforcement so the temporary _new table swap doesn't trip
	// the run_libraries → sequencing_runs constraint.
	db.pragma('foreign_keys = OFF');
	try {
		db.exec(`
			BEGIN;

			CREATE TABLE sequencing_runs_new (
				id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
				run_name TEXT NOT NULL,
				run_date TEXT,
				platform TEXT CHECK (platform IS NULL OR platform IN ('ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT')),
				instrument_model TEXT,
				seq_meth TEXT,
				flow_cell_id TEXT,
				run_directory TEXT,
				fastq_directory TEXT,
				total_reads INTEGER,
				total_bases INTEGER,
				notes TEXT,
				custom_fields TEXT,
				sync_version INTEGER NOT NULL DEFAULT 1,
				is_deleted INTEGER NOT NULL DEFAULT 0,
				created_by TEXT REFERENCES users(id),
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			INSERT INTO sequencing_runs_new
			SELECT id, run_name, run_date, platform, instrument_model, seq_meth,
				flow_cell_id, run_directory, fastq_directory, total_reads, total_bases,
				notes, custom_fields, sync_version, is_deleted, created_by, created_at, updated_at
			FROM sequencing_runs;

			DROP TABLE sequencing_runs;
			ALTER TABLE sequencing_runs_new RENAME TO sequencing_runs;

			COMMIT;
		`);
		console.log('[migration] Relaxed NOT NULL on sequencing_runs.platform + seq_meth');
	} finally {
		db.pragma('foreign_keys = ON');
	}
}

/**
 * For each table, strip CHECK constraints from ONLY the named columns,
 * preserving CHECKs on other columns (e.g. platform, status). Reads the
 * existing DDL from sqlite_master, strips the CHECK clause (including
 * multi-line ones where the IN list wraps across lines), and rebuilds the
 * table if anything changed.
 *
 * Idempotent: if the target columns already have no CHECK, the table is
 * skipped. Foreign keys are temporarily disabled during each rebuild.
 */
function dropColumnChecks(
	db: Database.Database,
	spec: Record<string, string[]>
) {
	for (const [table, targetColumns] of Object.entries(spec)) {
		const row = db.prepare(
			"SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
		).get(table) as { sql: string } | undefined;
		if (!row) continue;

		let sql = row.sql;
		let changed = false;

		// For each target column, find its CHECK clause and strip it.
		// The CHECK can span multiple lines (e.g., a long IN list).
		// Strategy: find `<column_name> ... CHECK (` in the full DDL string,
		// then strip from CHECK through the balanced closing paren.
		for (const col of targetColumns) {
			// Match the column definition line up to and including CHECK (
			const pattern = new RegExp(
				`(${col}\\s+TEXT[^,\\n]*?)\\s*CHECK\\s*\\(`,
				'i'
			);
			const match = pattern.exec(sql);
			if (!match) continue; // Already stripped or doesn't exist

			// Found a CHECK — now find the balanced closing paren
			const checkStart = match.index + match[1].length;
			const afterCheck = sql.indexOf('(', checkStart);
			let depth = 1;
			let i = afterCheck + 1;
			while (i < sql.length && depth > 0) {
				if (sql[i] === '(') depth++;
				else if (sql[i] === ')') depth--;
				i++;
			}
			// i now points just past the closing paren of CHECK(...)
			// Strip from checkStart to i, clean up whitespace
			sql = sql.substring(0, checkStart) + sql.substring(i);
			changed = true;
		}

		if (!changed) continue;

		// Clean up: remove blank lines and trailing whitespace before commas
		sql = sql.replace(/\n\s*\n/g, '\n').replace(/\s+,/g, ',');

		const newTableSql = sql
			.replace(`CREATE TABLE "${table}"`, `CREATE TABLE "${table}_new"`)
			.replace(`CREATE TABLE ${table}`, `CREATE TABLE ${table}_new`)
			.replace(`CREATE TABLE IF NOT EXISTS ${table}`, `CREATE TABLE ${table}_new`);

		db.pragma('foreign_keys = OFF');
		try {
			db.exec(`
				BEGIN;
				${newTableSql};
				INSERT INTO "${table}_new" SELECT * FROM "${table}";
				DROP TABLE "${table}";
				ALTER TABLE "${table}_new" RENAME TO "${table}";
				COMMIT;
			`);
			console.log(`[migration] Dropped CHECK on [${targetColumns.join(', ')}] from ${table}`);
		} finally {
			db.pragma('foreign_keys = ON');
		}
	}
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
function seedDefaultAdmin(db: Database.Database) {
	const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
	if (count > 0) return;

	const id = generateId();
	// bcrypt cost 12 to match the rest of the app, even though this is a
	// throwaway placeholder password.
	const hash = bcrypt.hashSync('admin', 12);
	db.prepare(
		`INSERT INTO users (id, username, password_hash, role, is_local_account, is_approved, must_change_password)
		 VALUES (?, 'admin', ?, 'admin', 1, 1, 1)`
	).run(id, hash);
	console.log('[seed] Created default admin user (admin/admin) — change the password on first login');
}
