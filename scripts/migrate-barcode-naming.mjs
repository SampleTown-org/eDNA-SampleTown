#!/usr/bin/env node
/**
 * Rename the `barcode` picklist values BC01..BC24 → barcode01..barcode24
 * across ALL labs, aligning the vocabulary with ONT basecaller output folder
 * naming (which the `library_preps.barcode` data already uses). The seed data
 * (src/lib/server/seed-data.mjs) was updated to match; this migration brings
 * existing labs in line.
 *
 * Idempotent — re-running is a no-op once values are renamed. The RB01..RB12
 * (rapid-barcoding) entries are intentionally left untouched.
 *
 * Usage:
 *   node scripts/migrate-barcode-naming.mjs
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/migrate-barcode-naming.mjs
 */
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Rename in place — preserves each row's id + sort_order, so a lab's barcode
// order doesn't change. Both value and label move to the new form (the seed
// uses bare strings where value == label).
const update = db.prepare(
	"UPDATE constrained_values SET value = ?, label = ? WHERE category = 'barcode' AND value = ?"
);

let changed = 0;
const tx = db.transaction(() => {
	for (let n = 1; n <= 24; n++) {
		const pad = String(n).padStart(2, '0');
		changed += update.run(`barcode${pad}`, `barcode${pad}`, `BC${pad}`).changes;
	}
});
tx();
db.close();

console.log(`Renamed ${changed} barcode picklist value(s) (BC01..BC24 → barcode01..barcode24).`);
if (changed === 0) console.log('(nothing to do — already migrated, or no BC.. entries present)');
