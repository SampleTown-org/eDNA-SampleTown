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

/** Export all tables as JSON */
export function exportTablesAsJson(): Record<string, unknown[]> {
	const db = getDb();
	const data: Record<string, unknown[]> = {};
	for (const table of TABLES_TO_EXPORT) {
		data[table] = db.prepare(`SELECT * FROM ${table}`).all();
	}
	return data;
}

/** Commit a snapshot of all tables to GitHub */
export async function commitSnapshot(message: string): Promise<{ sha: string } | null> {
	const config = getConfig();
	if (!config) return null;

	const db = getDb();
	const data = exportTablesAsJson();
	const [owner, repo] = config.repo.split('/');

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
				path: `data/${table}.json`,
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
		db.prepare(`INSERT INTO db_snapshots (commit_sha, commit_message, status) VALUES (?, ?, 'pushed')`)
			.run(newCommitRes.sha, message);

		return { sha: newCommitRes.sha };
	} catch (err) {
		console.error('GitHub snapshot failed:', err);
		// Queue for later
		db.prepare(`INSERT INTO db_snapshots (commit_sha, commit_message, status) VALUES (NULL, ?, 'failed')`)
			.run(message);
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
