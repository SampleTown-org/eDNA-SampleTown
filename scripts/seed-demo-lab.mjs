#!/usr/bin/env node
/**
 * Provision the demo tenant: the **McGurk Institute** lab + the **guest/guest**
 * account the login page pre-fills. Idempotent — safe to re-run.
 *
 * This is the missing piece between `create-lab.mjs` (generic lab) and
 * `seed-mcgurk-demo.mjs` (data only — it assumes the lab already exists with a
 * fixed id and refuses to run otherwise). Run order for a fresh install:
 *
 *   node scripts/seed-demo-lab.mjs       # lab + guest user + membership
 *   node scripts/seed-mcgurk-demo.mjs    # Arrowsmith-inspired demo data
 *
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/seed-demo-lab.mjs
 *
 * The guest is a local account with is_demo=1 (read/write, but flagged so the
 * UI can mark it a demo) whose active_lab_id + membership point at McGurk, so a
 * guest/guest login lands in the demo lab. The 'guest' password is intentionally
 * short (matches the admin/admin bootstrap precedent — length policy is enforced
 * on web password-set, not on direct seeding or verify).
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { seedConstrainedValues } from '../src/lib/server/seed-data.mjs';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const LAB_ID = 'a06ff4182a9d6f805158d1bc7cfec924'; // must match seed-mcgurk-demo.mjs
const LAB_NAME = 'McGurk Institute';
const LAB_SLUG = 'mcgurk-institute';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const id = () => randomBytes(16).toString('hex');

const tx = db.transaction(() => {
	// 1. McGurk Institute lab (fixed id so seed-mcgurk-demo.mjs matches).
	let lab = db.prepare('SELECT id FROM labs WHERE id = ?').get(LAB_ID);
	if (!lab) {
		// A slug collision with a different id would break the fixed-id contract.
		const slugTaken = db.prepare('SELECT id FROM labs WHERE slug = ?').get(LAB_SLUG);
		if (slugTaken) throw new Error(`slug "${LAB_SLUG}" already used by lab ${slugTaken.id}`);
		db.prepare('INSERT INTO labs (id, name, slug) VALUES (?, ?, ?)').run(LAB_ID, LAB_NAME, LAB_SLUG);
		seedConstrainedValues(db, LAB_ID); // picklists / primer sets / pcr protocols
		console.log(`Created lab "${LAB_NAME}" (${LAB_ID}) + seeded picklists.`);
	} else {
		console.log(`Lab "${LAB_NAME}" already exists.`);
	}

	// 2. guest user (local, demo), active lab = McGurk.
	let guest = db.prepare("SELECT id FROM users WHERE username = 'guest'").get();
	if (!guest) {
		const uid = id();
		const hash = bcrypt.hashSync('guest', 12);
		db.prepare(`
			INSERT INTO users (id, username, display_name, password_hash, role,
				is_local_account, is_demo, is_approved, must_change_password, active_lab_id)
			VALUES (?, 'guest', 'Guest', ?, 'user', 1, 1, 1, 0, ?)
		`).run(uid, hash, LAB_ID);
		guest = { id: uid };
		console.log('Created guest/guest demo account.');
	} else {
		// Repair an existing guest that drifted to the wrong active lab.
		db.prepare("UPDATE users SET active_lab_id = ?, is_demo = 1, is_approved = 1 WHERE id = ?").run(LAB_ID, guest.id);
		console.log('guest account already exists — pinned active_lab_id to McGurk.');
	}

	// 3. Membership: guest → McGurk (read/write).
	db.prepare(`
		INSERT INTO lab_memberships (user_id, lab_id, role, status)
		VALUES (?, ?, 'user', 'active')
		ON CONFLICT(user_id, lab_id) DO UPDATE SET role = 'user', status = 'active'
	`).run(guest.id, LAB_ID);

	// 4. Guest is McGurk-ONLY: drop any stray memberships to other labs (a guest
	//    that drifted into another tenant). The app-level guards (active-lab /
	//    join) prevent new drift; this cleans up existing rows.
	const dropped = db.prepare('DELETE FROM lab_memberships WHERE user_id = ? AND lab_id != ?')
		.run(guest.id, LAB_ID).changes;
	if (dropped > 0) console.log(`Removed ${dropped} stray membership(s) — guest is now McGurk-only.`);
});

tx();
db.close();
console.log('\nDone. Next: node scripts/seed-mcgurk-demo.mjs');
