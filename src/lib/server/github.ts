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

const TABLES_TO_EXPORT = [
	'projects',
	'samples',
	'extracts',
	'pcr_amplifications',
	'library_preps',
	'sequencing_runs',
	'run_libraries',
	'analyses'
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

/** Export all lab-scoped tables as JSON, filtered by the caller's lab_id.
 *  Prevents cross-lab data leakage into the snapshot repo. */
export function exportTablesAsJson(labId: string): Record<string, unknown[]> {
	const db = getDb();
	const data: Record<string, unknown[]> = {};
	for (const table of TABLES_TO_EXPORT) {
		// Tables are from a hardcoded allowlist — safe to interpolate. Every
		// listed table carries lab_id (projects, samples, extracts, pcr_amps,
		// library_preps, sequencing_runs, run_libraries, analyses).
		// run_libraries is the junction table — filter via parent run.
		if (table === 'run_libraries') {
			data[table] = db
				.prepare(
					`SELECT rl.* FROM run_libraries rl
					 JOIN sequencing_runs sr ON sr.id = rl.run_id
					 WHERE sr.lab_id = ?`
				)
				.all(labId);
		} else {
			data[table] = db.prepare(`SELECT * FROM ${table} WHERE lab_id = ?`).all(labId);
		}
	}
	return data;
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
): Promise<{ sha: string } | null> {
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

		// Create blobs for each table
		const tree: { path: string; mode: string; type: string; sha: string }[] = [];
		for (const [table, rows] of Object.entries(data)) {
			const content = JSON.stringify(rows, null, 2);
			const blobRes = await ghApi(config, `POST /repos/${owner}/${repo}/git/blobs`, {
				content,
				encoding: 'utf-8'
			});
			tree.push({
				path: `${labPathPrefix}/${table}.json`,
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

/**
 * Periodic backup scheduler. Started once on the first getDb() call. Wakes
 * every 15 minutes, finds labs whose `backup_interval_hours` is set and
 * whose `last_backup_at` is older than that interval, and runs an
 * automatic snapshot for each.
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
			const due = db.prepare(`
				SELECT id, name, last_backup_at, backup_interval_hours
				FROM labs
				WHERE backup_interval_hours IS NOT NULL AND backup_interval_hours > 0
				  AND (
				    last_backup_at IS NULL
				    OR (julianday('now') - julianday(last_backup_at)) * 24 >= backup_interval_hours
				  )
			`).all() as { id: string; name: string; last_backup_at: string | null; backup_interval_hours: number }[];

			for (const lab of due) {
				const msg = `Auto snapshot ${new Date().toISOString()}`;
				console.log(`[backup-scheduler] running for lab ${lab.name} (${lab.id})`);
				// Sequential — avoid hitting GitHub's secondary rate limit
				// when many labs are due at once.
				await commitSnapshot(lab.id, msg, { automatic: true });
			}
		} catch (err) {
			console.error('[backup-scheduler] tick failed:', err instanceof Error ? err.message : err);
		}
	};

	// First tick fires after the interval, not on boot — so a quick restart
	// loop doesn't spam the GitHub API.
	setInterval(tick, SCHEDULER_TICK_MS);
	console.log(`[backup-scheduler] started (tick every ${SCHEDULER_TICK_MS / 60_000} min)`);
}
