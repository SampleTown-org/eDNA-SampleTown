#!/usr/bin/env node
/**
 * Create a new lab. There is no UI for creating labs — the blast radius
 * (orphaned data, cross-lab picklist drift, OAuth landing ambiguity) is
 * too high to expose to lab-admins. This script is the single entry point
 * for provisioning a new tenant.
 *
 * Usage:
 *   node scripts/create-lab.mjs "Lab Name" [slug]
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/create-lab.mjs "Cryomics Lab"
 *
 * If slug is omitted it's derived from the name (lowercased, non-alnum → "-").
 * Re-running with an existing slug exits 1 — no duplicates.
 *
 * The new lab is seeded with the default picklists / primer-sets /
 * pcr-protocols (same data as the self-serve /auth/setup-lab path — both go
 * through `seedConstrainedValues`), so it lands ready to use. Operators can
 * then customize the vocabulary via the Settings UI.
 *
 * After creating the lab, assign users via /api/users/[id] PUT as an
 * existing admin of the same lab, OR directly:
 *
 *   UPDATE users SET lab_id = '<new-lab-id>' WHERE username = '...';
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { seedConstrainedValues } from '../src/lib/server/seed-data.mjs';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';

const [, , rawName, rawSlug] = process.argv;
if (!rawName) {
	console.error('Usage: node scripts/create-lab.mjs "Lab Name" [slug]');
	process.exit(2);
}

const name = rawName.trim();
const slug = (rawSlug || name)
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-|-$/g, '') || 'lab';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const existing = db.prepare('SELECT id, name FROM labs WHERE slug = ?').get(slug);
if (existing) {
	console.error(`Lab with slug "${slug}" already exists (id=${existing.id}, name="${existing.name}")`);
	process.exit(1);
}

const id = randomBytes(16).toString('hex');
db.prepare('INSERT INTO labs (id, name, slug) VALUES (?, ?, ?)').run(id, name, slug);

// Seed default picklists / primer sets / pcr protocols (shared with the
// self-serve web path) so the lab is usable immediately.
seedConstrainedValues(db, id);

db.close();
console.log(`Created lab: id=${id} slug=${slug} name="${name}"`);
console.log('  Seeded default picklists, primer sets, and PCR protocols.');
console.log('');
console.log('Next steps:');
console.log('  1. Assign users to this lab (UPDATE users SET lab_id=\'' + id + '\' WHERE username=\'...\';)');
console.log('  2. Customize picklists/primers/protocols via the Settings UI as an admin of this lab');
