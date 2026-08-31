import type { PageServerLoad } from './$types';
import { getAuthMode, getGitHub } from '$lib/server/auth';
import { isDeviceFlowAvailable } from '$lib/server/github-device';

/** Tell the login page which sign-in methods this deployment supports.
 *  Web OAuth needs client id + secret + a registered callback (the cloud
 *  instance); device flow needs only the client id and works from any
 *  origin (lab/ship instances). When both are configured the web flow
 *  wins — it's one click instead of typing a code. */
export const load: PageServerLoad = async () => {
	const mode = getAuthMode();
	const githubWeb = mode !== 'local' && !!getGitHub();
	return {
		githubWeb,
		githubDevice: !githubWeb && isDeviceFlowAvailable(),
		localForm: mode !== 'github'
	};
};
