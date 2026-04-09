import { GitHub } from 'arctic';
import bcrypt from 'bcrypt';
import { getDb, generateId } from './db';
import { env } from '$env/dynamic/private';
import type { User } from '$lib/types';

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

const SESSION_DURATION_DAYS = 90;

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
		SELECT u.* FROM sessions s
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
	const existing = db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubUser.id) as User | undefined;

	if (existing) {
		db.prepare(`
			UPDATE users SET username = ?, display_name = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
			WHERE github_id = ?
		`).run(githubUser.login, githubUser.name, githubUser.email, githubUser.avatar_url, githubUser.id);
		return db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubUser.id) as User;
	}

	const id = generateId();
	db.prepare(`
		INSERT INTO users (id, github_id, username, display_name, email, avatar_url, role, is_local_account)
		VALUES (?, ?, ?, ?, ?, ?, 'user', 0)
	`).run(id, githubUser.id, githubUser.login, githubUser.name, githubUser.email, githubUser.avatar_url);
	return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

// ============================================================
// Local auth
// ============================================================

export async function createLocalUser(username: string, password: string, role: string = 'user'): Promise<User> {
	const db = getDb();
	const id = generateId();
	const hash = await bcrypt.hash(password, 10);
	db.prepare(`
		INSERT INTO users (id, username, password_hash, role, is_local_account)
		VALUES (?, ?, ?, ?, 1)
	`).run(id, username, hash, role);
	return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

export async function verifyLocalUser(username: string, password: string): Promise<User | null> {
	const db = getDb();
	const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_local_account = 1').get(username) as
		| (User & { password_hash: string })
		| undefined;
	if (!user || !user.password_hash) return null;
	const valid = await bcrypt.compare(password, user.password_hash);
	return valid ? user : null;
}
