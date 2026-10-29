// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/types').User | null;
			/** How the request authenticated: browser session cookie or API token. */
			authVia?: 'session' | 'token';
		}
	}
}

export {};
