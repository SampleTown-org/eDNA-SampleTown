#!/usr/bin/env node
/**
 * admin-session.mjs
 *
 * Create a 24h session for the first admin-role user in the DB and print the
 * session id (for use as the `session=` cookie value). Used by autonomous
 * import scripts so they can POST to /api/import/mixs without a browser.
 *
 * Usage:
 *   node scripts/admin-session.mjs            # prints session id
 *   curl -b "session=$(node scripts/admin-session.mjs)" ...
 */

import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

const dbPath = process.env.DB_PATH || 'data/sampletown.db';
const db = new Database(dbPath);

const admin = db.prepare(
	"SELECT id, username FROM users WHERE role = 'admin' AND is_deleted = 0 ORDER BY created_at LIMIT 1"
).get();

if (!admin) {
	console.error('No admin user found in', dbPath);
	process.exit(1);
}

const sessionId = randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
	sessionId,
	admin.id,
	expiresAt
);

db.close();
process.stdout.write(sessionId);
