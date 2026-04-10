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
