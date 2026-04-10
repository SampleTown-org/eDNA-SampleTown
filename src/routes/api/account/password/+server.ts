import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setUserPassword, verifyUserPassword } from '$lib/server/auth';
import { apiError } from '$lib/server/api-errors';
import { requireUser } from '$lib/server/guards';
import { checkRate } from '$lib/server/rate-limit';

/**
 * Change the current user's own password.
 *
 * - Requires the OLD password to be supplied and verified, EVEN if the user
 *   is in the must_change_password=1 state. (Stops a stolen-session attacker
 *   from locking out the legitimate user.)
 * - Validates length on the new password.
 * - Clears must_change_password as a side effect of setUserPassword.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const user = requireUser(locals);

	// Rate limit per user: 5 / minute. Stops a stolen-cookie attacker from
	// brute-forcing the old password.
	if (!checkRate(`password-change:${user.id}:${getClientAddress()}`, 5, 60_000)) {
		return json({ error: 'Too many attempts, try again in a moment' }, { status: 429 });
	}

	try {
		const body = await request.json();
		const oldPassword = String(body?.old_password ?? '');
		const newPassword = String(body?.new_password ?? '');

		if (!oldPassword || !newPassword) {
			return json({ error: 'old_password and new_password are required' }, { status: 400 });
		}

		const ok = await verifyUserPassword(user.id, oldPassword);
		if (!ok) {
			return json({ error: 'Current password is incorrect' }, { status: 400 });
		}

		// validatePasswordPolicy is invoked inside setUserPassword and throws
		// a safe Error message if the new password is too short / too long.
		await setUserPassword(user.id, newPassword);

		return json({ ok: true });
	} catch (err) {
		// Surface the policy error message to the client (it's hand-written,
		// not from SQLite), but route everything else through apiError.
		if (err instanceof Error && /^Password must be/.test(err.message)) {
			return json({ error: err.message }, { status: 400 });
		}
		return apiError(err);
	}
};
