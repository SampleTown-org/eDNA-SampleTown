import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { getSraVocabularySync } from '$lib/server/sra-vocabulary';

export const load: PageServerLoad = async ({ locals }) => {
	// Any signed-in user can reach the Settings page. The User Accounts
	// section + the Feedback tab are conditionally rendered for admins
	// only on the client side, and the corresponding API routes still
	// require admin via hooks.server.ts.
	const user = requireUser(locals);
	const isAdmin = user.role === 'admin';
	const db = getDb();
	const allValues = db.prepare('SELECT * FROM constrained_values ORDER BY category, sort_order, value').all() as any[];

	const categories: Record<string, any[]> = {};
	for (const v of allValues) {
		if (!categories[v.category]) categories[v.category] = [];
		categories[v.category].push(v);
	}

	const primerSets = db.prepare('SELECT * FROM primer_sets ORDER BY sort_order, name').all();
	const pcrProtocols = db.prepare('SELECT * FROM pcr_protocols ORDER BY sort_order, name').all();

	// Naming templates
	const namingRows = db.prepare("SELECT value, label FROM constrained_values WHERE category = 'naming_template' ORDER BY sort_order").all() as { value: string; label: string }[];
	const naming: Record<string, string> = {};
	for (const r of namingRows) naming[r.value] = r.label || '';

	const personnel = db.prepare('SELECT p.*, u.username AS github_username, u.avatar_url FROM personnel p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.sort_order, p.full_name').all();

	// Admin-only data: feedback queue + full user list. Don't load these
	// for non-admins — both contain potentially sensitive content (other
	// people's emails, page URLs, message text) that shouldn't leak via SSR.
	const feedback = isAdmin
		? db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all()
		: [];
	const users = isAdmin
		? db
				.prepare(
					`SELECT id, github_id, username, display_name, email, avatar_url,
					        role, is_local_account, is_approved, must_change_password,
					        (password_hash IS NOT NULL) AS has_password,
					        created_at, updated_at
					   FROM users
					   ORDER BY is_approved ASC, username`
				)
				.all()
		: [];

	const sraVocabulary = getSraVocabularySync();

	return { categories, primerSets, pcrProtocols, naming, feedback, personnel, users, isAdmin, sraVocabulary };
};
