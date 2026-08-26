/**
 * Which standard a TSV column answers to.
 *
 * A SampleTown sheet mixes three vocabularies and nothing in a column name
 * distinguishes them: `env_medium` is MIxS, `sample_accession` is INSDC,
 * `site_code` is SampleTown's own. Every TSV the app emits carries a row
 * naming each column's vocabulary, and the importer strips it on the way back.
 *
 * Lives under `$lib/mixs` rather than in the server's mixs-io so the browser
 * can label a download too — it needs only the MIxS schema index and the
 * INSDC field list, neither of which touches the database.
 */
import { getSlot } from './schema-index';
import { INSDC_FIELDS } from './sra-mapping';
import { MISC_PARAM_PREFIX } from './sample-form';

export type ColumnVocabulary = 'sampletown' | 'insdc' | 'mixs';

/** Display order for grouped columns. */
export const COLUMN_VOCABULARIES: ColumnVocabulary[] = ['sampletown', 'insdc', 'mixs'];

/**
 * Classify a column by name.
 *
 * Callers that know where a column came from should say so directly instead —
 * a few MIxS class properties have no slot definition in the 6.3 release and
 * would be misread here.
 */
export function columnVocabulary(header: string): ColumnVocabulary {
	// Headers carry a leading `*` for MIxS-required slots.
	const name = header.replace(/^\*/, '');

	// A misc_param tag is off-schema by definition, so it is classified by
	// where the tag came from rather than by the schema.
	if (name.startsWith(MISC_PARAM_PREFIX)) {
		const tag = name.slice(MISC_PARAM_PREFIX.length);
		return INSDC_FIELDS.has(tag) ? 'insdc' : 'sampletown';
	}

	if (getSlot(name)) return 'mixs';
	if (INSDC_FIELDS.has(name)) return 'insdc';
	return 'sampletown';
}

/** True when every populated cell of a row names a vocabulary — i.e. the row
 *  describes the columns rather than a sample. No real row satisfies this. */
export function isVocabularyRow(cells: string[]): boolean {
	const populated = cells.map((c) => c.trim().toLowerCase()).filter((c) => c !== '');
	return (
		populated.length > 0 &&
		populated.every((c) => (COLUMN_VOCABULARIES as string[]).includes(c))
	);
}
