import { getDb } from './db';
import { env } from '$env/dynamic/private';

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

function getConfig(): GitHubConfig | null {
	const token = env.GITHUB_TOKEN;
	const repo = env.GITHUB_REPO;
	if (!token || !repo) return null;
	return { token, repo };
}

/** Export all lab-scoped tables as JSON, filtered by the caller's lab_id.
 *  Prevents cross-lab data leakage into the snapshot repo. */
export function exportTablesAsJson(labId: string): Record<string, unknown[]> {
	const db = getDb();
	const data: Record<string, unknown[]> = {};
	for (const table of TABLES_TO_EXPORT) {
		// Tables are from a hardcoded allowlist — safe to interpolate. Every
		// listed table carries lab_id (projects, samples, extracts, pcr_amps,
		// library_preps, sequencing_runs, run_libraries, analyses). If we
		// ever add a non-lab-scoped table to TABLES_TO_EXPORT, the WHERE
		// clause will fail with "no such column: lab_id" — caught by tests.
		if (table === 'run_libraries') {
			// Junction table — filter via the parent sequencing_runs row.
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

/** Commit a snapshot of this lab's tables to GitHub. The snapshot repo is
 *  global (single GITHUB_REPO env var); in a multi-lab deployment each lab
 *  shares the same repo but writes to lab-scoped paths. */
export async function commitSnapshot(labId: string, message: string): Promise<{ sha: string } | null> {
	const config = getConfig();
	if (!config) return null;

	const db = getDb();
	const data = exportTablesAsJson(labId);
	const [owner, repo] = config.repo.split('/');

	try {
		// Get the default branch ref
		const refRes = await ghApi(config, `GET /repos/${owner}/${repo}/git/ref/heads/main`);
		const latestSha = refRes.object.sha;

		// Get the commit to find the tree
		const commitRes = await ghApi(config, `GET /repos/${owner}/${repo}/git/commits/${latestSha}`);
		const baseTreeSha = commitRes.tree.sha;

		// Look up the lab slug once — used to scope the emitted path so
		// multiple labs sharing the same snapshot repo don't overwrite
		// each other's JSON files.
		const lab = db.prepare('SELECT slug FROM labs WHERE id = ?').get(labId) as
			| { slug: string }
			| undefined;
		const labPathPrefix = lab ? `data/${lab.slug}` : 'data';

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

		// Log snapshot
		db.prepare(`INSERT INTO db_snapshots (lab_id, commit_sha, commit_message, status) VALUES (?, ?, ?, 'pushed')`)
			.run(labId, newCommitRes.sha, message);

		return { sha: newCommitRes.sha };
	} catch (err) {
		console.error('GitHub snapshot failed:', err);
		// Queue for later
		db.prepare(`INSERT INTO db_snapshots (lab_id, commit_sha, commit_message, status) VALUES (?, NULL, ?, 'failed')`)
			.run(labId, message);
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
