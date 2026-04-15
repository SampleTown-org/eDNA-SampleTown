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
 * NOTE: new labs start with EMPTY picklists / primer-sets / pcr-protocols.
 * The default lab seed only runs for the first lab on a fresh install.
 * An admin of the new lab should populate picklists via the Settings UI,
 * or copy from an existing lab with a one-off SQL command:
 *
 *   INSERT INTO constrained_values (id, lab_id, category, value, label, sort_order, is_active)
 *   SELECT lower(hex(randomblob(16))), '<new-lab-id>', category, value, label, sort_order, is_active
 *   FROM constrained_values WHERE lab_id = '<source-lab-id>';
 *
 * (and the same for primer_sets / pcr_protocols).
 *
 * After creating the lab, assign users via /api/users/[id] PUT as an
 * existing admin of the same lab, OR directly:
 *
 *   UPDATE users SET lab_id = '<new-lab-id>' WHERE username = '...';
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

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

db.close();
console.log(`Created lab: id=${id} slug=${slug} name="${name}"`);
console.log('');
console.log('Next steps:');
console.log('  1. Assign users to this lab (UPDATE users SET lab_id=\'' + id + '\' WHERE username=\'...\';)');
console.log('  2. Populate picklists/primers/protocols via the Settings UI as an admin of this lab');
