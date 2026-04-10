import { GitHub } from 'arctic';
import bcrypt from 'bcrypt';
import { getDb, generateId } from './db';
import { env } from '$env/dynamic/private';
import type { User } from '$lib/types';

// Columns to select when loading a user for session/locals.
// IMPORTANT: never include `password_hash` here — locals.user flows to every
// page via +layout.server.ts, so anything in this list ends up in client HTML.
// All columns are explicitly qualified with `u.` so the same constant works
// inside JOINs (e.g. validateSession joins sessions s × users u, where both
// tables have an `id` column).
const SAFE_USER_COLS = `
	u.id, u.github_id, u.username, u.display_name, u.email, u.avatar_url,
	u.role, u.is_local_account, u.created_at, u.updated_at
`;

// GitHub OAuth client (initialized lazily)
let _github: GitHub | null = null;

export function getGitHub(): GitHub | null {
	if (_github) return _github;
	const clientId = env.GITHUB_CLIENT_ID;
	const clientSecret = env.GITHUB_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;
	_github = new GitHub(clientId, clientSecret, null);
	return _github;
}

export function getAuthMode(): 'local' | 'github' | 'hybrid' {
	return (env.AUTH_MODE as 'local' | 'github' | 'hybrid') || 'local';
}

// ============================================================
// Sessions
// ============================================================

const SESSION_DURATION_DAYS = 14;
const BCRYPT_COST = 12;

/** True if the configured public ORIGIN is HTTPS — used to set Secure on cookies. */
export function isSecureOrigin(): boolean {
	return (env.ORIGIN || '').startsWith('https://');
}

/** Standard session cookie options used by both login flows. */
export function sessionCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		secure: isSecureOrigin(),
		maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
		sameSite: 'lax' as const
	};
}

export function createSession(userId: string): string {
	const db = getDb();
	const id = generateId();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
	return id;
}

export function validateSession(sessionId: string): User | null {
	const db = getDb();
	const row = db.prepare(`
		SELECT ${SAFE_USER_COLS}
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.id = ? AND s.expires_at > datetime('now')
	`).get(sessionId) as User | undefined;
	return row ?? null;
}

export function deleteSession(sessionId: string) {
	const db = getDb();
	db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteExpiredSessions() {
	const db = getDb();
	db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

export function deleteExpiredOauthStates() {
	const db = getDb();
	db.prepare("DELETE FROM oauth_states WHERE expires_at <= datetime('now')").run();
}

// Periodic sweep — runs at most once per 5 minutes per process. Cheap because
// the predicates are indexed and the tables stay tiny.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000;
export function maybeSweepExpired() {
	const now = Date.now();
	if (now - lastSweep < SWEEP_INTERVAL_MS) return;
	lastSweep = now;
	try {
		deleteExpiredSessions();
		deleteExpiredOauthStates();
	} catch (err) {
		console.error('[auth] expired sweep failed', err instanceof Error ? err.message : err);
	}
}

// ============================================================
// GitHub user upsert
// ============================================================

export function upsertGitHubUser(githubUser: {
	id: number;
	login: string;
	name: string | null;
	email: string | null;
	avatar_url: string | null;
}): User {
	const db = getDb();
	const existing = db
		.prepare(`SELECT ${SAFE_USER_COLS} FROM users u WHERE u.github_id = ?`)
		.get(githubUser.id) as User | undefined;

	if (existing) {
		db.prepare(`
			UPDATE users SET username = ?, display_name = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
			WHERE github_id = ?
		`).run(githubUser.login, githubUser.name, githubUser.email, githubUser.avatar_url, githubUser.id);
		return db
			.prepare(`SELECT ${SAFE_USER_COLS} FROM users u WHERE u.github_id = ?`)
			.get(githubUser.id) as User;
	}

	const id = generateId();
	db.prepare(`
		INSERT INTO users (id, github_id, username, display_name, email, avatar_url, role, is_local_account)
		VALUES (?, ?, ?, ?, ?, ?, 'user', 0)
	`).run(id, githubUser.id, githubUser.login, githubUser.name, githubUser.email, githubUser.avatar_url);
	return db.prepare(`SELECT ${SAFE_USER_COLS} FROM users u WHERE u.id = ?`).get(id) as User;
}

// ============================================================
// Local auth
// ============================================================

export async function createLocalUser(username: string, password: string, role: string = 'user'): Promise<User> {
	const db = getDb();
	const id = generateId();
	const hash = await bcrypt.hash(password, BCRYPT_COST);
	db.prepare(`
		INSERT INTO users (id, username, password_hash, role, is_local_account)
		VALUES (?, ?, ?, ?, 1)
	`).run(id, username, hash, role);
	return db.prepare(`SELECT ${SAFE_USER_COLS} FROM users u WHERE u.id = ?`).get(id) as User;
}

// Dummy hash used to keep verifyLocalUser timing constant when the username
// doesn't exist. Generated once at startup; the password "x" never matches it.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('does-not-matter', 10);

export async function verifyLocalUser(username: string, password: string): Promise<User | null> {
	const db = getDb();
	const row = db
		.prepare('SELECT id, password_hash FROM users WHERE username = ? AND is_local_account = 1')
		.get(username) as { id: string; password_hash: string } | undefined;

	// Always run bcrypt.compare so unknown-username and wrong-password take
	// the same wall-clock time (mitigates username enumeration).
	const hash = row?.password_hash ?? DUMMY_BCRYPT_HASH;
	const valid = await bcrypt.compare(password, hash);
	if (!row || !valid) return null;

	return db.prepare(`SELECT ${SAFE_USER_COLS} FROM users u WHERE u.id = ?`).get(row.id) as User;
}
