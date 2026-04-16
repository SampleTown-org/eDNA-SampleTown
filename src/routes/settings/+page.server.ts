import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getSraVocabularySync } from '$lib/server/sra-vocabulary';

export const load: PageServerLoad = async ({ locals }) => {
	// Any signed-in user can reach the Settings page. The User Accounts
	// section + the Feedback tab are conditionally rendered for admins
	// only on the client side, and the corresponding API routes still
	// require admin via hooks.server.ts. Every query below is scoped to
	// the caller's lab — a lab-admin's "all users" view is their own lab
	// plus unassigned users.
	const { user, labId } = requireLab(locals);
	const isAdmin = user.role === 'admin';
	const db = getDb();
	const allValues = db
		.prepare(
			'SELECT * FROM constrained_values WHERE lab_id = ? ORDER BY category, sort_order, value'
		)
		.all(labId) as any[];

	const categories: Record<string, any[]> = {};
	for (const v of allValues) {
		if (!categories[v.category]) categories[v.category] = [];
		categories[v.category].push(v);
	}

	const primerSets = db
		.prepare('SELECT * FROM primer_sets WHERE lab_id = ? ORDER BY sort_order, name')
		.all(labId);
	const pcrProtocols = db
		.prepare('SELECT * FROM pcr_protocols WHERE lab_id = ? ORDER BY sort_order, name')
		.all(labId);

	// Naming templates
	const namingRows = db
		.prepare(
			"SELECT value, label FROM constrained_values WHERE lab_id = ? AND category = 'naming_template' ORDER BY sort_order"
		)
		.all(labId) as { value: string; label: string }[];
	const naming: Record<string, string> = {};
	for (const r of namingRows) naming[r.value] = r.label || '';

	const personnel = db
		.prepare(
			'SELECT p.*, u.username AS github_username, u.avatar_url, u.avatar_emoji FROM personnel p LEFT JOIN users u ON u.id = p.user_id WHERE p.lab_id = ? ORDER BY p.sort_order, p.full_name'
		)
		.all(labId);

	// Admin-only data: feedback queue + full user list. Don't load these
	// for non-admins — both contain potentially sensitive content (other
	// people's emails, page URLs, message text) that shouldn't leak via SSR.
	// Feedback: lab-owned rows plus NULL-lab rows (anonymous / pre-migration).
	// Users: lab-owned rows plus NULL-lab rows (pending approval).
	const feedback = isAdmin
		? db
				.prepare(
					'SELECT * FROM feedback WHERE lab_id = ? OR lab_id IS NULL ORDER BY created_at DESC'
				)
				.all(labId)
		: [];
	const users = isAdmin
		? db
				.prepare(
					`SELECT u.id, m.lab_id, u.github_id, u.username, u.display_name, u.email, u.avatar_url, u.avatar_emoji,
					        m.role, m.status AS membership_status, u.is_local_account, u.is_approved, u.must_change_password,
					        (u.password_hash IS NOT NULL) AS has_password,
					        u.created_at, u.updated_at
					   FROM lab_memberships m
					   JOIN users u ON u.id = m.user_id
					   WHERE m.lab_id = ?
					   ORDER BY u.username`
				)
				.all(labId)
		: [];

	// Lab-invite tokens (admin-only). Includes recently-used invites so the
	// admin sees who joined via which link. Limited to 100 newest rows.
	const invites = isAdmin
		? db.prepare(`
				SELECT i.token, i.role, i.email_hint, i.created_at, i.expires_at, i.used_at,
					cu.username AS created_by_username,
					uu.username AS used_by_username
				FROM invites i
				LEFT JOIN users cu ON cu.id = i.created_by
				LEFT JOIN users uu ON uu.id = i.used_by
				WHERE i.lab_id = ?
				ORDER BY i.created_at DESC
				LIMIT 100
			`).all(labId)
		: [];

	const sraVocabulary = getSraVocabularySync();

	return { categories, primerSets, pcrProtocols, naming, feedback, personnel, users, invites, isAdmin, sraVocabulary };
};
