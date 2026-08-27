/**
 * Limits on an accession fetch, shared by the server that enforces them and
 * the page that tells the operator what to expect.
 *
 * Client-safe on purpose: the fetch form counts down to the deadline while it
 * waits, and a countdown to a number the server does not actually honour would
 * be worse than no countdown at all.
 */

/** Accessions accepted in one request. */
export const MAX_ACCESSIONS = 25;

/**
 * How long a fetch may run before SampleTown stops and returns what it has.
 *
 * Sits below nginx's `proxy_read_timeout 300` on the deployment host so this
 * limit is reached first: an explanation of what was and wasn't retrieved
 * beats the proxy's bare 504.
 */
export const INSDC_FETCH_TIMEOUT_MS = 240_000;
