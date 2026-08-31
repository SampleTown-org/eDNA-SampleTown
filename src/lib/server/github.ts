import { createHash } from 'node:crypto';
import { getDb } from './db';
import { env } from '$env/dynamic/private';
import type Database from 'better-sqlite3';

/**
 * Per-lab GitHub backup. Each lab can configure its own (repo, token) pair
 * via the Backup tab in Manage; if it doesn't, the legacy global
 * GITHUB_REPO / GITHUB_TOKEN env vars are used as a fallback so the
 * original single-lab install keeps working without re-configuration.
 *
 * Snapshot files are written to `data/<lab-slug>/<table>.json` in the
 * configured repo, so multiple labs can share one repo without overwriting
 * each other.
 */

/**
 * Tables included in every snapshot, listed in dependency-safe INSERT order
 * (parents before children) so a restore can replay them straight through.
 *
 * Skipped: feedback (live admin queue), invites (transient + secrets-ish),
 * saved_carts + saved_cart_items (private to each user, not lab-shared),
 * db_snapshots (this lab's own backup history), sessions, oauth_states,
 * sync_log, users, labs.
 *
 * The users table itself stays out, but snapshots DO carry a `users.json`
 * sidecar of sanitized identity stubs (id, username, github_id, avatar —
 * never emails or password hashes) for the users the lab's rows reference,
 * so created_by provenance survives a restore onto another instance. See
 * exportUserStubs / applyUserStubs.
 *
 * run_libraries / sample_values / *_photos / entity_personnel are junction
 * or child rows — included so a restored lab is functionally complete.
 */
const TABLES_TO_EXPORT = [
	// Reference + config
	'constrained_values',
	'primer_sets',
	'pcr_protocols',
	'personnel',
	// Top-level entities
	'projects',
	'sites',
	'samples',
	'sample_values',
	'site_photos',
	'sample_photos',
	'extracts',
	'pcr_plates',
	'pcr_amplifications',
	'library_plates',
	'library_preps',
	'sequencing_runs',
	'analyses',
	// Junction tables
	'run_libraries',
	'entity_personnel'
];

interface GitHubConfig {
	token: string;
	repo: string; // "owner/repo"
}

interface LabRow {
	github_repo: string | null;
	github_token: string | null;
	slug: string;
}

/** Resolve the GitHub config for a lab — prefers per-lab values, falls
 *  back to env vars when the lab hasn't configured its own. Returns null
 *  if neither source has both pieces. */
function resolveLabConfig(db: Database.Database, labId: string): { config: GitHubConfig; lab: LabRow } | null {
	const lab = db
		.prepare('SELECT github_repo, github_token, slug FROM labs WHERE id = ?')
		.get(labId) as LabRow | undefined;
	if (!lab) return null;

	const repo = lab.github_repo || env.GITHUB_REPO;
	const token = lab.github_token || env.GITHUB_TOKEN;
	if (!token || !repo) return null;

	return { config: { token, repo }, lab };
}

/**
 * Quick connectivity check: hits GET ref/heads/main with the lab's
 * configured repo + token. Doesn't push anything; just confirms the
 * permissions chain works before the admin commits to a full snapshot.
 *
 * Returns a structured result so the UI can show an actionable message
 * (rather than a raw GitHub error string).
 */
export async function testLabConnection(
	labId: string
): Promise<{ ok: true } | { ok: false; status: number | null; error: string; hint?: string }> {
	const db = getDb();
	const resolved = resolveLabConfig(db, labId);
	if (!resolved) {
		return {
			ok: false,
			status: null,
			error: 'No GitHub repo and/or token configured for this lab.'
		};
	}
	const { config } = resolved;
	const [owner, repo] = config.repo.split('/');
	if (!owner || !repo) {
		return {
			ok: false,
			status: null,
			error: 'GitHub repo must be in "owner/repo" format.'
		};
	}
	try {
		const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, {
			headers: {
				Authorization: `Bearer ${config.token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		if (res.ok) return { ok: true };

		// Translate the common failure modes into a one-line user-friendly
		// hint so the admin doesn't have to read raw GitHub JSON.
		const body = await res.text();
		let hint: string | undefined;
		if (res.status === 401) {
			hint = 'Token is invalid or expired. Generate a new one and re-paste.';
		} else if (res.status === 403) {
			hint =
				'Token does not have permission for this repo. Check Repository access + Contents: Read and write on the token, and that the org has approved it.';
		} else if (res.status === 404) {
			hint =
				'Repo or main branch not found. Make sure the repo exists, the token can see it, and the repo has at least one commit on the main branch (an empty repo has no main).';
		} else if (res.status === 409) {
			hint = 'Repo exists but is empty. Initialize it with at least one commit (e.g. add a README) and try again.';
		}
		return { ok: false, status: res.status, error: body.slice(0, 500), hint };
	} catch (err) {
		return {
			ok: false,
			status: null,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * Fingerprint of a lab's exportable content, built from the git blob SHAs
 * of the exact JSON files a push would create. Computed entirely locally
 * (no API calls), so the sync scheduler can detect "nothing changed here"
 * for free. Compared against `labs.last_synced_state` — i.e. against this
 * instance's own content at the last sync, never against the remote — so
 * it doesn't depend on byte-parity with what another instance pushed.
 */
export function localStateHash(data: Record<string, unknown[]>): string {
	const outer = createHash('sha1');
	for (const [table, rows] of Object.entries(data)) {
		const content = JSON.stringify(rows, null, 2);
		const blob = createHash('sha1');
		blob.update(`blob ${Buffer.byteLength(content, 'utf8')}\0`);
		blob.update(content, 'utf8');
		outer.update(`${table}:${blob.digest('hex')}\n`);
	}
	return outer.digest('hex');
}

/** Latest commit that touched this lab's snapshot path, or null when the
 *  repo has no snapshot for the lab yet. Throws on API failure. */
async function getRemoteHeadSha(config: GitHubConfig, lab: LabRow): Promise<string | null> {
	const [owner, repo] = config.repo.split('/');
	const path = `data/${lab.slug}`;
	const res = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
		{
			headers: {
				Authorization: `Bearer ${config.token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		}
	);
	// 409 = repo exists but is empty (no commits at all).
	if (res.status === 409) return null;
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`GitHub commits lookup: ${res.status} ${body.slice(0, 300)}`);
	}
	const list = (await res.json()) as Array<{ sha: string }>;
	return list[0]?.sha ?? null;
}

/** Columns of `table` that are foreign keys into `users`. */
function userRefColumns(db: Database.Database, table: string): Set<string> {
	return new Set(
		(db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string }[])
			.filter((fk) => fk.table === 'users')
			.map((fk) => fk.from)
	);
}

export interface UserStub {
	id: string;
	github_id: number | null;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
	avatar_emoji: string | null;
}

export interface MembershipRow {
	user_id: string;
	role: string;
	status: string;
}

/** The lab's memberships, exported as a snapshot sidecar so that access
 *  travels with the data: a person who signs into another instance of
 *  this lab via GitHub lands on the same user id (github_id match) and is
 *  already a member there. Restore MERGES these (insert-if-absent only) —
 *  it never removes or downgrades anyone the local instance added. */
export function exportLabMemberships(labId: string): MembershipRow[] {
	const db = getDb();
	return db
		.prepare('SELECT user_id, role, status FROM lab_memberships WHERE lab_id = ? ORDER BY user_id')
		.all(labId) as MembershipRow[];
}

/** Sanitized identity stubs for every user the exported rows reference —
 *  plus the lab's members — just enough for another instance to keep
 *  created_by provenance and membership intact. Deliberately excludes
 *  email, password hash, and every flag/role. */
export function exportUserStubs(
	data: Record<string, unknown[]>,
	memberships: MembershipRow[] = []
): UserStub[] {
	const db = getDb();
	const ids = new Set<string>();
	for (const m of memberships) if (m.user_id) ids.add(m.user_id);
	for (const [table, rows] of Object.entries(data)) {
		const refCols = userRefColumns(db, table);
		if (refCols.size === 0) continue;
		for (const raw of rows) {
			const row = raw as Record<string, unknown>;
			for (const col of refCols) {
				const v = row[col];
				if (typeof v === 'string' && v) ids.add(v);
			}
		}
	}
	if (ids.size === 0) return [];
	const placeholders = [...ids].map(() => '?').join(',');
	return db
		.prepare(
			`SELECT id, github_id, username, display_name, avatar_url, avatar_emoji
			 FROM users WHERE id IN (${placeholders}) ORDER BY id`
		)
		.all(...ids) as UserStub[];
}

/**
 * Make a snapshot's user references resolvable on THIS instance. Returns a
 * map from snapshot user id → local user id (or null = drop the ref).
 *
 *   - id already exists locally           → keep as-is
 *   - same github_id under a different id → map to the local row (the
 *     person logged in here before a pull carried their stub)
 *   - unknown                             → insert the stub. Stub rows are
 *     shells: no password, not a local account, is_approved=0 — nobody can
 *     sign in through one, but if its person later logs in via GitHub,
 *     upsertGitHubUser matches github_id and takes the row over, giving
 *     them the same user id on every instance.
 *   - insert collides (username taken by a different person) → null refs
 */
function applyUserStubs(db: Database.Database, stubs: UserStub[]): Map<string, string | null> {
	const map = new Map<string, string | null>();
	const insert = db.prepare(
		`INSERT INTO users (id, github_id, username, display_name, avatar_url, avatar_emoji, is_approved)
		 VALUES (?, ?, ?, ?, ?, ?, 0)`
	);
	for (const stub of stubs) {
		if (!stub?.id || !stub?.username) continue;
		if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(stub.id)) {
			map.set(stub.id, stub.id);
			continue;
		}
		if (stub.github_id != null) {
			const byGithub = db
				.prepare('SELECT id FROM users WHERE github_id = ?')
				.get(stub.github_id) as { id: string } | undefined;
			if (byGithub) {
				map.set(stub.id, byGithub.id);
				continue;
			}
		}
		try {
			insert.run(stub.id, stub.github_id, stub.username, stub.display_name, stub.avatar_url, stub.avatar_emoji);
			map.set(stub.id, stub.id);
		} catch {
			map.set(stub.id, null);
		}
	}
	return map;
}

function setSyncMarkers(db: Database.Database, labId: string, sha: string | null, state: string) {
	db.prepare(
		`UPDATE labs SET last_synced_sha = ?, last_synced_state = ?, updated_at = datetime('now') WHERE id = ?`
	).run(sha, state, labId);
}

/** Export all lab-scoped tables as JSON, filtered by the caller's lab_id.
 *  Prevents cross-lab data leakage into the snapshot repo.
 *
 *  Most tables carry lab_id directly. Junction / child tables filter via
 *  the parent row's lab_id — see the per-table case below. */
export function exportTablesAsJson(labId: string): Record<string, unknown[]> {
	const db = getDb();
	const data: Record<string, unknown[]> = {};
	for (const table of TABLES_TO_EXPORT) {
		// Tables are from a hardcoded allowlist — safe to interpolate.
		switch (table) {
			case 'sample_values':
				data[table] = db
					.prepare(
						`SELECT sv.* FROM sample_values sv
						 JOIN samples s ON s.id = sv.sample_id
						 WHERE s.lab_id = ?`
					)
					.all(labId);
				break;
			case 'site_photos':
				data[table] = db
					.prepare(
						`SELECT sp.* FROM site_photos sp
						 JOIN sites s ON s.id = sp.site_id
						 WHERE s.lab_id = ?`
					)
					.all(labId);
				break;
			case 'sample_photos':
				data[table] = db
					.prepare(
						`SELECT sp.* FROM sample_photos sp
						 JOIN samples s ON s.id = sp.sample_id
						 WHERE s.lab_id = ?`
					)
					.all(labId);
				break;
			case 'run_libraries':
				data[table] = db
					.prepare(
						`SELECT rl.* FROM run_libraries rl
						 JOIN sequencing_runs sr ON sr.id = rl.run_id
						 WHERE sr.lab_id = ?`
					)
					.all(labId);
				break;
			case 'entity_personnel':
				data[table] = db
					.prepare(
						`SELECT ep.* FROM entity_personnel ep
						 JOIN personnel p ON p.id = ep.personnel_id
						 WHERE p.lab_id = ?`
					)
					.all(labId);
				break;
			default:
				data[table] = db.prepare(`SELECT * FROM ${table} WHERE lab_id = ?`).all(labId);
		}
	}
	return data;
}

/**
 * List recent snapshot commits in the lab's configured GitHub repo.
 * Filters to commits that touched this lab's path (so a shared repo's
 * commits for OTHER labs don't show up). Capped at 30.
 */
export async function listSnapshotCommits(
	labId: string
): Promise<{ ok: true; commits: { sha: string; message: string; date: string }[] } | { ok: false; status: number | null; error: string; hint?: string }> {
	const db = getDb();
	const resolved = resolveLabConfig(db, labId);
	if (!resolved) {
		return { ok: false, status: null, error: 'No GitHub repo and/or token configured for this lab.' };
	}
	const { config, lab } = resolved;
	const [owner, repo] = config.repo.split('/');
	const path = `data/${lab.slug}`;
	try {
		const res = await fetch(
			`https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=30`,
			{
				headers: {
					Authorization: `Bearer ${config.token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28'
				}
			}
		);
		if (!res.ok) {
			const body = await res.text();
			return { ok: false, status: res.status, error: body.slice(0, 500) };
		}
		const list = (await res.json()) as Array<{
			sha: string;
			commit: { message: string; author?: { date: string } };
		}>;
		return {
			ok: true,
			commits: list.map((c) => ({
				sha: c.sha,
				message: c.commit.message,
				date: c.commit.author?.date ?? ''
			}))
		};
	} catch (err) {
		return {
			ok: false,
			status: null,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/**
 * Pull every TABLES_TO_EXPORT JSON file at the given commit and replace
 * the lab's data with it. The whole replace runs in one transaction with
 * deferred FKs so the wipe + reload doesn't trip RESTRICT/NO_ACTION
 * intermediate states.
 *
 * Tables that aren't present in the snapshot (e.g. older snapshots that
 * predate a TABLES_TO_EXPORT addition) are left as zero-row restores —
 * the existing rows for that table are still wiped, since we can't
 * partial-restore safely.
 *
 * Override: every restored row's `lab_id` is forcibly set to the caller's
 * current lab id, in case a snapshot is restored into a different lab
 * (forking from another lab's repo).
 *
 * Returns counts per-table on success, or a structured error.
 */
export async function restoreSnapshot(
	labId: string,
	commitSha: string,
	options: {
		/** When set (by syncLab's auto-pull), abort if the lab's content no
		 *  longer hashes to this value right before the wipe — i.e. someone
		 *  wrote to the lab while the snapshot files were downloading. The
		 *  next sync tick will then see both sides changed and flag a
		 *  conflict instead of silently discarding the fresh writes. */
		abortUnlessState?: string;
	} = {}
): Promise<
	| { ok: true; counts: Record<string, number>; missing: string[] }
	| { ok: false; status: number | null; error: string; hint?: string }
> {
	const db = getDb();
	const resolved = resolveLabConfig(db, labId);
	if (!resolved) {
		return { ok: false, status: null, error: 'No GitHub repo and/or token configured for this lab.' };
	}
	const { config, lab } = resolved;
	const [owner, repo] = config.repo.split('/');

	// Fetch each table's JSON at the requested commit. Missing files (404)
	// are tolerated — we record them in `missing` and treat as empty data.
	// 'users' and 'lab_memberships' are merge-only sidecars, not restored
	// tables.
	const SIDECARS = ['users', 'lab_memberships'];
	const fetched: Record<string, unknown[]> = {};
	const missing: string[] = [];
	for (const table of [...TABLES_TO_EXPORT, ...SIDECARS]) {
		const path = `data/${lab.slug}/${table}.json`;
		const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(commitSha)}`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${config.token}`,
				Accept: 'application/vnd.github.raw+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		if (res.status === 404) {
			// Sidecar absence just means an older snapshot — not a
			// "table skipped" worth reporting to the UI.
			if (!SIDECARS.includes(table)) missing.push(table);
			fetched[table] = [];
			continue;
		}
		if (!res.ok) {
			const body = await res.text();
			return {
				ok: false,
				status: res.status,
				error: `Fetching ${path}: ${body.slice(0, 300)}`
			};
		}
		try {
			fetched[table] = (await res.json()) as unknown[];
		} catch (err) {
			return {
				ok: false,
				status: null,
				error: `Parsing ${path} as JSON failed: ${err instanceof Error ? err.message : err}`
			};
		}
	}

	// Replay into the DB. Wipe in reverse-dependency order, insert in
	// dependency order — but with deferred FKs the order is mostly
	// cosmetic (the engine checks at commit). Schema-evolution safety:
	// build INSERT column lists from the actual table_info, intersected
	// with the snapshot row keys, so a snapshot that pre-dates a new
	// column doesn't error on the missing key.
	const counts: Record<string, number> = {};
	try {
		if (
			options.abortUnlessState &&
			localStateHash(exportTablesAsJson(labId)) !== options.abortUnlessState
		) {
			return { ok: false, status: null, error: 'Local data changed while the snapshot was downloading — pull skipped.' };
		}
		db.transaction(() => {
			db.pragma('defer_foreign_keys = ON');
			// Resolve the snapshot's user references against this instance
			// (inserting identity stubs as needed) BEFORE inserting rows.
			const userMap = applyUserStubs(db, (fetched['users'] as UserStub[]) ?? []);
			// Merge the snapshot's memberships: access travels with the lab.
			// Insert-if-absent only — local memberships (e.g. the replica's
			// creator) are never removed or downgraded by a pull, and a bad
			// row (unknown role value etc.) is skipped, not fatal.
			const memIns = db.prepare(
				`INSERT INTO lab_memberships (user_id, lab_id, role, status) VALUES (?, ?, ?, ?)
				 ON CONFLICT(user_id, lab_id) DO NOTHING`
			);
			for (const raw of (fetched['lab_memberships'] as MembershipRow[]) ?? []) {
				const mapped = userMap.has(raw?.user_id) ? userMap.get(raw.user_id) : null;
				if (!mapped) continue;
				try {
					memIns.run(mapped, labId, raw.role, raw.status);
				} catch {
					/* CHECK-constraint mismatch from a foreign schema — skip */
				}
			}
			// Wipe existing lab data, child tables first to be tidy.
			for (const t of [...TABLES_TO_EXPORT].reverse()) {
				wipeLabTable(db, t, labId);
			}
			// Re-insert in declared order.
			for (const t of TABLES_TO_EXPORT) {
				counts[t] = restoreTable(db, t, fetched[t], labId, userMap);
			}
		})();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, status: null, error: msg };
	}

	// Sync bookkeeping: after a restore, this instance's content came from
	// the repo, so re-fingerprint it (a re-export may not be byte-identical
	// to the snapshot files) and mark the lab as synced at the path head.
	// When an admin restored an OLD commit the markers still point at the
	// head + current content: sync then holds steady (nothing auto-pushes
	// or auto-pulls) until the next local edit pushes the rolled-back state
	// as a new commit — an intentional rollback is never auto-undone.
	try {
		const head = await getRemoteHeadSha(config, lab);
		setSyncMarkers(db, labId, head ?? commitSha, localStateHash(exportTablesAsJson(labId)));
	} catch {
		setSyncMarkers(db, labId, commitSha, localStateHash(exportTablesAsJson(labId)));
	}

	return { ok: true, counts, missing };
}

/** DELETE all rows for `table` belonging to this lab. Mirrors the lab-
 *  scoping logic in exportTablesAsJson. */
function wipeLabTable(db: Database.Database, table: string, labId: string) {
	switch (table) {
		case 'sample_values':
			db.prepare(
				'DELETE FROM sample_values WHERE sample_id IN (SELECT id FROM samples WHERE lab_id = ?)'
			).run(labId);
			break;
		case 'site_photos':
			db.prepare(
				'DELETE FROM site_photos WHERE site_id IN (SELECT id FROM sites WHERE lab_id = ?)'
			).run(labId);
			break;
		case 'sample_photos':
			db.prepare(
				'DELETE FROM sample_photos WHERE sample_id IN (SELECT id FROM samples WHERE lab_id = ?)'
			).run(labId);
			break;
		case 'run_libraries':
			db.prepare(
				'DELETE FROM run_libraries WHERE run_id IN (SELECT id FROM sequencing_runs WHERE lab_id = ?)'
			).run(labId);
			break;
		case 'entity_personnel':
			db.prepare(
				'DELETE FROM entity_personnel WHERE personnel_id IN (SELECT id FROM personnel WHERE lab_id = ?)'
			).run(labId);
			break;
		default:
			db.prepare(`DELETE FROM ${table} WHERE lab_id = ?`).run(labId);
	}
}

/** INSERT every row from `rows` into `table`, building the column list
 *  from the intersection of the table's actual columns and the row's
 *  keys (so snapshots that pre-date a column addition don't error).
 *  Forces lab_id to the restoring lab's id for tables that have one.
 *
 *  User references (created_by, personnel.user_id, …) go through `userMap`
 *  (snapshot user id → local user id, built by applyUserStubs): snapshots
 *  from another instance carry user ids this instance may not have, and
 *  inserting them verbatim trips the FK at commit. Unmapped ids that don't
 *  exist locally are nulled — all such columns are nullable by design. */
function restoreTable(
	db: Database.Database,
	table: string,
	rows: unknown[],
	labId: string,
	userMap: Map<string, string | null>
): number {
	if (!rows || rows.length === 0) return 0;
	const tableCols = new Set(
		(db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
	);
	const hasLabId = tableCols.has('lab_id');
	const userRefCols = userRefColumns(db, table);
	const localUserIds = userRefCols.size
		? new Set((db.prepare('SELECT id FROM users').all() as { id: string }[]).map((u) => u.id))
		: new Set<string>();
	const sample = rows[0] as Record<string, unknown>;
	const keys = Object.keys(sample).filter((k) => tableCols.has(k));
	if (keys.length === 0) return 0;
	const placeholders = keys.map(() => '?').join(',');
	const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`);
	let n = 0;
	for (const raw of rows) {
		const row = raw as Record<string, unknown>;
		const values = keys.map((k) => {
			if (k === 'lab_id' && hasLabId) return labId;
			const v = row[k] ?? null;
			if (v !== null && userRefCols.has(k)) {
				if (userMap.has(v as string)) return userMap.get(v as string);
				return localUserIds.has(v as string) ? v : null;
			}
			return v;
		});
		stmt.run(...values);
		n++;
	}
	return n;
}

/**
 * Commit a snapshot of this lab's tables to the lab's configured GitHub
 * repo. Always logs an entry in `db_snapshots` — `pushed` on success,
 * `failed` on any error (with the error message preserved for the UI).
 *
 * `automatic` is true when invoked by the periodic scheduler; false when
 * an admin clicks Backup Now.
 */
export async function commitSnapshot(
	labId: string,
	message: string,
	options: { automatic?: boolean } = {}
): Promise<{ sha: string; unchanged?: boolean } | null> {
	const automatic = options.automatic ? 1 : 0;
	const db = getDb();
	const resolved = resolveLabConfig(db, labId);
	if (!resolved) {
		db.prepare(
			`INSERT INTO db_snapshots (lab_id, commit_sha, commit_message, status, error_message, is_automatic)
			 VALUES (?, NULL, ?, 'failed', ?, ?)`
		).run(labId, message, 'No GitHub repo/token configured for this lab', automatic);
		return null;
	}
	const { config, lab } = resolved;
	const data = exportTablesAsJson(labId);
	const [owner, repo] = config.repo.split('/');
	const labPathPrefix = `data/${lab.slug}`;

	try {
		// Get the default branch ref
		const refRes = await ghApi(config, `GET /repos/${owner}/${repo}/git/ref/heads/main`);
		const latestSha = refRes.object.sha;

		// Get the commit to find the tree
		const commitRes = await ghApi(config, `GET /repos/${owner}/${repo}/git/commits/${latestSha}`);
		const baseTreeSha = commitRes.tree.sha;

		// Create blobs for each table, plus the identity-stub + membership
		// sidecars (not synced tables — see applyUserStubs / the membership
		// merge in restoreSnapshot).
		const files: Record<string, string> = {};
		for (const [table, rows] of Object.entries(data)) {
			files[`${table}.json`] = JSON.stringify(rows, null, 2);
		}
		const memberships = exportLabMemberships(labId);
		files['users.json'] = JSON.stringify(exportUserStubs(data, memberships), null, 2);
		files['lab_memberships.json'] = JSON.stringify(memberships, null, 2);
		const tree: { path: string; mode: string; type: string; sha: string }[] = [];
		for (const [filename, content] of Object.entries(files)) {
			const blobRes = await ghApi(config, `POST /repos/${owner}/${repo}/git/blobs`, {
				content,
				encoding: 'utf-8'
			});
			tree.push({
				path: `${labPathPrefix}/${filename}`,
				mode: '100644',
				type: 'blob',
				sha: blobRes.sha
			});
		}

		// Create tree
		const treeRes = await ghApi(config, `POST /repos/${owner}/${repo}/git/trees`, {
			base_tree: baseTreeSha,
			tree
		});

		// Skip the commit if nothing changed since the last snapshot. Git
		// deduplicates trees by content hash, so if every blob is identical
		// to what already exists at this path, the new tree's SHA equals
		// the parent commit's tree SHA — meaning a fresh commit would be
		// empty. Don't make it (keeps the GitHub commit list clean) and
		// don't pollute db_snapshots history with a no-op row either.
		// Bumps last_backup_at though, so the scheduler knows we checked
		// and doesn't keep retrying every tick.
		if (treeRes.sha === baseTreeSha) {
			db.prepare("UPDATE labs SET last_backup_at = datetime('now') WHERE id = ?").run(labId);
			// Content matches the repo — record the local fingerprint so the
			// sync scheduler knows this state is pushed. last_synced_sha is
			// left alone (the repo head may be another lab's commit in a
			// shared repo; syncLab sets the sha from its own path lookup).
			db.prepare(
				`UPDATE labs SET last_synced_state = ? WHERE id = ?`
			).run(localStateHash(data), labId);
			return { sha: latestSha, unchanged: true };
		}

		// Create commit
		const newCommitRes = await ghApi(config, `POST /repos/${owner}/${repo}/git/commits`, {
			message,
			tree: treeRes.sha,
			parents: [latestSha]
		});

		// Update ref
		await ghApi(config, `PATCH /repos/${owner}/${repo}/git/refs/heads/main`, {
			sha: newCommitRes.sha
		});

		// Log + bump last_backup_at on the lab so the scheduler knows when to
		// next run. Wrapped in a transaction so a partial write here doesn't
		// leave a half-recorded snapshot.
		db.transaction(() => {
			db.prepare(
				`INSERT INTO db_snapshots (lab_id, commit_sha, commit_message, status, is_automatic)
				 VALUES (?, ?, ?, 'pushed', ?)`
			).run(labId, newCommitRes.sha, message, automatic);
			db.prepare("UPDATE labs SET last_backup_at = datetime('now') WHERE id = ?").run(labId);
			// This commit is now the head of the lab's snapshot path and its
			// content is exactly `data` — record both sync markers.
			setSyncMarkers(db, labId, newCommitRes.sha, localStateHash(data));
		})();

		return { sha: newCommitRes.sha };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('GitHub snapshot failed:', msg);
		db.prepare(
			`INSERT INTO db_snapshots (lab_id, commit_sha, commit_message, status, error_message, is_automatic)
			 VALUES (?, NULL, ?, 'failed', ?, ?)`
		).run(labId, message, msg.slice(0, 1000), automatic);
		return null;
	}
}

async function ghApi(config: GitHubConfig, endpoint: string, body?: unknown): Promise<any> {
	const [method, path] = endpoint.split(' ');
	const url = path.startsWith('http') ? path : `https://api.github.com${path}`;

	const res = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${config.token}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json',
			'X-GitHub-Api-Version': '2022-11-28'
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`GitHub API ${endpoint}: ${res.status} ${text}`);
	}

	return res.json();
}

// ============================================================
// Two-way snapshot sync
// ============================================================

/**
 * List the lab slugs that have snapshot data in a repo (the directories
 * under `data/`). Used by the "sync an existing lab" onboarding path to
 * both validate a pasted repo+token and show which labs it holds — before
 * anything is created locally.
 */
export async function listRepoLabSlugs(
	config: GitHubConfig
): Promise<{ ok: true; slugs: string[] } | { ok: false; status: number | null; error: string }> {
	const [owner, repo] = config.repo.split('/');
	if (!owner || !repo) {
		return { ok: false, status: null, error: 'Repo must be in "owner/repo" format.' };
	}
	try {
		const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data`, {
			headers: {
				Authorization: `Bearer ${config.token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		if (res.status === 404) {
			// Repo unreachable vs no data/ dir are both 404 with a token that
			// lacks access — probe the repo root to tell them apart.
			const root = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
				headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' }
			});
			if (root.ok) return { ok: true, slugs: [] };
			return {
				ok: false,
				status: root.status,
				error: 'Repo not found — check the name and that the token can see it.'
			};
		}
		if (res.status === 401) {
			return { ok: false, status: 401, error: 'Token is invalid or expired.' };
		}
		if (!res.ok) {
			const body = await res.text();
			return { ok: false, status: res.status, error: body.slice(0, 300) };
		}
		const entries = (await res.json()) as Array<{ name: string; type: string }>;
		return { ok: true, slugs: entries.filter((e) => e.type === 'dir').map((e) => e.name) };
	} catch (err) {
		return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Initial pull for a lab that was just created pre-wired to a snapshot
 * repo: restore the repo's current head into the (empty) lab. The caller
 * has already stored github_repo/github_token on the lab row.
 */
export async function bootstrapLabFromRepo(
	labId: string
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
	const db = getDb();
	const lab = db
		.prepare('SELECT github_repo, github_token, slug FROM labs WHERE id = ?')
		.get(labId) as LabRow | undefined;
	if (!lab?.github_repo || !lab?.github_token) {
		return { ok: false, error: 'Lab has no snapshot repo configured.' };
	}
	const config: GitHubConfig = { token: lab.github_token, repo: lab.github_repo };
	try {
		const head = await getRemoteHeadSha(config, lab);
		if (!head) return { ok: false, error: `No snapshot found in the repo for "${lab.slug}".` };
		const res = await restoreSnapshot(labId, head);
		if (!res.ok) return { ok: false, error: res.error };
		db.prepare(
			`UPDATE labs SET last_sync_at = datetime('now'), last_sync_status = 'pulled: bootstrap' WHERE id = ?`
		).run(labId);
		return { ok: true, counts: res.counts };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** True when the lab has no entity data — only (possibly seeded) reference
 *  tables. Used by first-run sync to decide that auto-pulling the remote
 *  snapshot over this lab cannot destroy anything of value. */
function labHasNoEntityData(db: Database.Database, labId: string): boolean {
	const entityTables = [
		'projects', 'sites', 'samples', 'extracts', 'pcr_plates',
		'pcr_amplifications', 'library_plates', 'library_preps',
		'sequencing_runs', 'analyses'
	];
	for (const t of entityTables) {
		const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE lab_id = ?`).get(labId) as { n: number };
		if (row.n > 0) return false;
	}
	return true;
}

export type SyncOutcome =
	| 'unconfigured' // no repo/token — nothing to do, not recorded
	| 'ok'           // in sync, nothing moved
	| 'pushed'       // local changes pushed to the repo
	| 'pulled'       // remote changes restored into this instance
	| 'conflict'     // both sides changed — needs an admin decision
	| 'needs_init'   // first run, both sides have data — needs an admin decision
	| 'error';

/**
 * One sync pass for one lab, against the lab's snapshot repo.
 *
 * Change detection is marker-based: `last_synced_state` is this instance's
 * content fingerprint at the last sync, `last_synced_sha` the remote path
 * head at the last sync. Local-only change → push. Remote-only change →
 * pull (wipe + restore, guarded against writes that land mid-download).
 * Both → do nothing destructive; flag a conflict that the admin resolves
 * with the existing "Backup now" (keep local) or "Restore" (take remote)
 * buttons — both of which reset the markers.
 *
 * First run (no markers yet) is deliberately conservative:
 *   - remote has no snapshot            → push (bootstrap the repo)
 *   - remote head is a commit WE pushed → adopt push role (pre-sync installs)
 *   - remote has data, this lab doesn't → pull (fresh replica bootstrap)
 *   - both have data                    → needs_init, admin decides
 * The one thing this must never do is push an empty lab over real data or
 * pull over un-pushed local work.
 *
 * Note for multi-instance labs: run the same app version everywhere.
 * A re-export after a pull is re-fingerprinted locally, so version drift
 * can't ping-pong commits — but a push from an older schema drops columns
 * the newer schema would keep.
 */
export async function syncLab(labId: string): Promise<{ outcome: SyncOutcome; detail?: string }> {
	const db = getDb();
	// Sync deliberately ignores the GITHUB_REPO/GITHUB_TOKEN env fallback:
	// the fallback applies to every lab on the box, and two-way sync (which
	// can push a lab's data into the repo unprompted) should only run where
	// an admin explicitly configured THIS lab's repo + token. Env-fallback
	// labs keep the legacy push-only backup schedule instead.
	const lab = db
		.prepare('SELECT github_repo, github_token, slug FROM labs WHERE id = ?')
		.get(labId) as LabRow | undefined;
	if (!lab?.github_repo || !lab?.github_token) return { outcome: 'unconfigured' };
	const config: GitHubConfig = { token: lab.github_token, repo: lab.github_repo };

	const record = (outcome: SyncOutcome, detail?: string) => {
		db.prepare(
			`UPDATE labs SET last_sync_at = datetime('now'), last_sync_status = ? WHERE id = ?`
		).run(detail ? `${outcome}: ${detail.slice(0, 300)}` : outcome, labId);
		return { outcome, detail };
	};

	try {
		const markers = db
			.prepare('SELECT last_synced_sha, last_synced_state FROM labs WHERE id = ?')
			.get(labId) as { last_synced_sha: string | null; last_synced_state: string | null };
		const stateHash = localStateHash(exportTablesAsJson(labId));
		const remoteHead = await getRemoteHeadSha(config, lab);

		// ---- First run: no fingerprint recorded yet ----
		if (!markers.last_synced_state) {
			if (remoteHead === null) {
				const pushed = await commitSnapshot(labId, `Auto sync ${new Date().toISOString()}`, { automatic: true });
				return pushed ? record('pushed', 'bootstrap') : record('error', 'bootstrap push failed');
			}
			const wePushedHead = db
				.prepare("SELECT 1 FROM db_snapshots WHERE lab_id = ? AND commit_sha = ? AND status = 'pushed'")
				.get(labId, remoteHead);
			if (wePushedHead) {
				// Pre-sync install that has been backing up all along: the
				// remote is ours. Push (no-ops if unchanged) and set markers.
				const pushed = await commitSnapshot(labId, `Auto sync ${new Date().toISOString()}`, { automatic: true });
				if (!pushed) return record('error', 'adopt push failed');
				if (pushed.unchanged) setSyncMarkers(db, labId, remoteHead, stateHash);
				return record(pushed.unchanged ? 'ok' : 'pushed', 'adopted existing backups');
			}
			if (labHasNoEntityData(db, labId)) {
				const res = await restoreSnapshot(labId, remoteHead, { abortUnlessState: stateHash });
				return res.ok ? record('pulled', 'bootstrap from repo') : record('error', res.error);
			}
			return record('needs_init');
		}

		// ---- Steady state ----
		const localChanged = stateHash !== markers.last_synced_state;
		const remoteChanged = remoteHead !== markers.last_synced_sha;

		if (!localChanged && !remoteChanged) return record('ok');
		if (localChanged && remoteChanged) return record('conflict');
		if (localChanged) {
			const pushed = await commitSnapshot(labId, `Auto sync ${new Date().toISOString()}`, { automatic: true });
			if (!pushed) return record('error', 'push failed');
			if (pushed.unchanged) setSyncMarkers(db, labId, remoteHead, stateHash);
			return record('pushed');
		}
		// Remote changed only. A null head with markers set means the repo
		// history vanished (force-push / repo swap) — re-push our state.
		if (remoteHead === null) {
			const pushed = await commitSnapshot(labId, `Auto sync ${new Date().toISOString()}`, { automatic: true });
			return pushed ? record('pushed', 're-seeded emptied repo') : record('error', 'push failed');
		}
		const res = await restoreSnapshot(labId, remoteHead, { abortUnlessState: stateHash });
		return res.ok ? record('pulled') : record('error', res.error);
	} catch (err) {
		return record('error', err instanceof Error ? err.message : String(err));
	}
}

/**
 * Periodic backup + sync scheduler. Started once on the first getDb() call;
 * wakes every 15 minutes.
 *
 * Labs with sync_enabled run a sync pass every tick — one GitHub API call
 * when nothing changed (the local fingerprint is computed offline). Labs
 * with sync turned off keep the legacy behavior: push-only snapshots every
 * `backup_interval_hours`.
 *
 * Conservative cadence: a 24-hour-interval lab will fire approximately at
 * 24h ± 15min. Good enough — backups don't need to be punctual, they just
 * need to happen.
 */
const SCHEDULER_TICK_MS = 15 * 60_000;
let _schedulerStarted = false;

export function startBackupScheduler() {
	if (_schedulerStarted) return;
	_schedulerStarted = true;

	const tick = async () => {
		try {
			const db = getDb();

			// Sync-enabled labs: full two-way pass each tick. Sequential —
			// avoid hitting GitHub's secondary rate limit when many labs
			// are configured.
			const synced = new Set<string>();
			const syncing = db
				.prepare('SELECT id, name FROM labs WHERE sync_enabled = 1')
				.all() as { id: string; name: string }[];
			for (const lab of syncing) {
				const { outcome, detail } = await syncLab(lab.id);
				if (outcome !== 'unconfigured') synced.add(lab.id);
				if (outcome !== 'unconfigured' && outcome !== 'ok') {
					console.log(`[sync] lab ${lab.name}: ${outcome}${detail ? ` (${detail})` : ''}`);
				}
			}

			// Legacy push-only schedule: labs with sync off, plus sync-enabled
			// labs that sync can't serve (no per-lab repo config — e.g. env-
			// fallback single-lab installs, whose backups must keep running).
			const due = (db.prepare(`
				SELECT id, name, last_backup_at, backup_interval_hours
				FROM labs
				WHERE backup_interval_hours IS NOT NULL AND backup_interval_hours > 0
				  AND (
				    last_backup_at IS NULL
				    OR (julianday('now') - julianday(last_backup_at)) * 24 >= backup_interval_hours
				  )
			`).all() as { id: string; name: string; last_backup_at: string | null; backup_interval_hours: number }[])
				.filter((lab) => !synced.has(lab.id));

			for (const lab of due) {
				const msg = `Auto snapshot ${new Date().toISOString()}`;
				console.log(`[backup-scheduler] running for lab ${lab.name} (${lab.id})`);
				await commitSnapshot(lab.id, msg, { automatic: true });
			}
		} catch (err) {
			console.error('[backup-scheduler] tick failed:', err instanceof Error ? err.message : err);
		}
	};

	// One early tick shortly after boot (so a lab instance switched on
	// after time away picks up remote changes quickly), then the regular
	// interval. 90s is late enough that a crash-restart loop won't spam
	// the GitHub API.
	setTimeout(tick, 90_000);
	setInterval(tick, SCHEDULER_TICK_MS);
	console.log(`[backup-scheduler] started (tick every ${SCHEDULER_TICK_MS / 60_000} min)`);
}
