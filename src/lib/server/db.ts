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

/**
 * Idempotent ADD-COLUMN migrations. schema.sql uses CREATE TABLE IF NOT EXISTS,
 * so existing tables aren't upgraded when we add a column to the schema. Each
 * migration here is wrapped in try/catch — SQLite errors with "duplicate column
 * name" if the column is already present, which we treat as already-applied.
 *
 * Rule: columns added here must also be added to schema.sql so fresh installs
 * get the column from the CREATE TABLE. Never drop, rename, or change types;
 * the prod DB at sampletown.reric.org has live beta-tester data.
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
	addColumn('pcr_amplifications', 'well_label TEXT');
	addColumn('library_preps', 'well_label TEXT');

	// Merge the lab-position roles (PI, Postdoc, etc.) that used to be a
	// hardcoded list on the Personnel dropdown into the person_role picklist,
	// so all role sources live in constrained_values. Case-insensitive dedup
	// against existing entries — nothing is overwritten or removed.
	mergeIntoPicklist(db, 'person_role', [
		'PI', 'Co-PI', 'Lab Manager', 'Postdoc',
		'PhD Student', 'MSc Student', 'Undergrad',
		'Field Tech', 'Lab Tech', 'Bioinformatician',
		'Collaborator', 'Other'
	]);
}

function mergeIntoPicklist(db: Database.Database, category: string, values: string[]) {
	const existsStmt = db.prepare(
		'SELECT 1 FROM constrained_values WHERE category = ? AND LOWER(value) = LOWER(?)'
	);
	const insertStmt = db.prepare(
		`INSERT INTO constrained_values (category, value, label, sort_order, is_active)
		 VALUES (?, ?, ?, ?, 1)`
	);
	const maxSortStmt = db.prepare(
		'SELECT COALESCE(MAX(sort_order), 0) AS m FROM constrained_values WHERE category = ?'
	);
	let sort = (maxSortStmt.get(category) as { m: number }).m;
	for (const v of values) {
		if (existsStmt.get(category, v)) continue;
		sort += 10;
		insertStmt.run(category, v, v, sort);
	}
}

export function generateId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
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
