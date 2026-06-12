/**
 * Offline outbox (docs/dev/offline-pwa.md, #3).
 *
 * Captured sites + samples are persisted to IndexedDB and POSTed when the
 * network returns. The key trick: each queued record carries a client-generated
 * 32-hex `clientId` that we send as the row `id`. The server's `resolveId()`
 * adopts it as the primary key, so an offline sample can reference an offline
 * site by that same id with NO server-side remapping — sites flush first, then
 * the samples that point at them. Re-POSTing a clientId is idempotent on the
 * happy path (success → record removed) and, if a success response was lost,
 * the retry's UNIQUE/duplicate error is treated as already-synced.
 *
 * Raw IndexedDB (no dependency). Browser-only — every function assumes
 * `indexedDB` exists; callers invoke them from event handlers / onMount.
 */

const DB_NAME = 'sampletown-outbox';
const DB_VERSION = 1;

export interface QueuedSite {
	clientId: string;
	projectId: string;
	body: Record<string, unknown>;
	createdAt: string;
	error?: string;
}

export interface QueuedPhoto {
	name: string;
	type: string;
	caption: string;
	blob: Blob;
}

export interface QueuedSample {
	clientId: string;
	body: Record<string, unknown>;
	photos: QueuedPhoto[];
	createdAt: string;
	error?: string;
}

/** 32 lowercase hex chars — matches the schema's id format + resolveId(). */
export function genClientId(): string {
	const b = new Uint8Array(16);
	crypto.getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('sites')) db.createObjectStore('sites', { keyPath: 'clientId' });
			if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'clientId' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function put(store: 'sites' | 'samples', value: QueuedSite | QueuedSample): Promise<void> {
	const db = await openDb();
	try {
		await promisify(db.transaction(store, 'readwrite').objectStore(store).put(value));
	} finally {
		db.close();
	}
}

async function getAll<T>(store: 'sites' | 'samples'): Promise<T[]> {
	const db = await openDb();
	try {
		return (await promisify(db.transaction(store, 'readonly').objectStore(store).getAll())) as T[];
	} finally {
		db.close();
	}
}

async function remove(store: 'sites' | 'samples', clientId: string): Promise<void> {
	const db = await openDb();
	try {
		await promisify(db.transaction(store, 'readwrite').objectStore(store).delete(clientId));
	} finally {
		db.close();
	}
}

export const enqueueSite = (rec: QueuedSite) => put('sites', rec);
export const enqueueSample = (rec: QueuedSample) => put('samples', rec);

export async function pendingCount(): Promise<{ sites: number; samples: number }> {
	const [sites, samples] = await Promise.all([getAll<QueuedSite>('sites'), getAll<QueuedSample>('samples')]);
	return { sites: sites.length, samples: samples.length };
}

/**
 * Confirm a row with OUR client id actually landed on the server. A 409 from a
 * write is ambiguous — it can mean (a) an earlier POST of this same clientId
 * succeeded but its response was lost (safe to drop the queue row), or (b) a
 * DIFFERENT row collided on a UNIQUE field like (project_id, samp_name) — a real
 * rejection the user must resolve (e.g. rename). We disambiguate by GETting the
 * row by id: a 200 means it's ours and synced; a 404 means our write never
 * landed, so the conflict was a genuine collision. (A substring match on the
 * error text can't tell these apart and would silently drop the capture.)
 */
async function existsOnServer(kind: 'samples' | 'sites', id: string): Promise<boolean> {
	const r = await fetch(`/api/${kind}/${id}`, { headers: { Accept: 'application/json' } });
	if (r.status === 404) return false;
	return r.ok;
}

async function postJson(url: string, body: unknown): Promise<Response> {
	return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export interface FlushResult {
	synced: number;
	failed: number;
	offline: boolean;
	errors: string[];
}

/**
 * Flush the outbox: sites first (so samples can reference them), then samples
 * + their photos. Stops early on a network throw (we're offline) so we don't
 * spin. HTTP rejections are recorded on the row and counted as failed, but the
 * row is kept for inspection — a duplicate-id error is treated as success.
 */
export async function flush(): Promise<FlushResult> {
	const res: FlushResult = { synced: 0, failed: 0, offline: false, errors: [] };

	for (const site of await getAll<QueuedSite>('sites')) {
		try {
			const r = await postJson('/api/sites', { id: site.clientId, ...site.body });
			if (r.ok) {
				await remove('sites', site.clientId);
				res.synced++;
			} else if (r.status === 409 && (await existsOnServer('sites', site.clientId))) {
				// Our earlier POST already landed (lost success response) — done.
				await remove('sites', site.clientId);
				res.synced++;
			} else {
				const msg = (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`;
				await put('sites', { ...site, error: msg });
				res.failed++;
				res.errors.push(`site ${site.body.site_name}: ${msg}`);
			}
		} catch {
			res.offline = true;
			return res; // network down — leave everything queued.
		}
	}

	for (const sample of await getAll<QueuedSample>('samples')) {
		try {
			const r = await postJson('/api/samples', { id: sample.clientId, ...sample.body });
			if (r.ok) {
				for (const p of sample.photos) {
					try {
						const fd = new FormData();
						fd.append('file', new File([p.blob], p.name, { type: p.type }));
						if (p.caption?.trim()) fd.append('caption', p.caption.trim());
						await fetch(`/api/samples/${sample.clientId}/photos`, { method: 'POST', body: fd });
					} catch {
						/* photo upload best-effort; sample already saved */
					}
				}
				await remove('samples', sample.clientId);
				res.synced++;
			} else if (r.status === 409 && (await existsOnServer('samples', sample.clientId))) {
				// Our earlier POST already landed; its photos were handled on that pass.
				await remove('samples', sample.clientId);
				res.synced++;
			} else {
				const msg = (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`;
				await put('samples', { ...sample, error: msg });
				res.failed++;
				res.errors.push(`${sample.body.samp_name}: ${msg}`);
			}
		} catch {
			res.offline = true;
			return res;
		}
	}

	return res;
}
