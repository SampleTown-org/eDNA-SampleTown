/**
 * TSV mechanics shared by everything that reads or writes a SampleTown sheet.
 *
 * Lives under `$lib/mixs` rather than in the server's mixs-io so the browser
 * can build a download with exactly the shape the importer expects — the two
 * used to be written separately and drifted.
 */
import { columnVocabulary, isVocabularyRow, COLUMN_VOCABULARIES } from './vocabulary';

/**
 * Split one TSV line, honouring the quoting the exporter emits: a cell
 * containing a tab or a quote is wrapped in quotes, and a literal quote inside
 * it is doubled.
 */
export function parseTsvLine(line: string): string[] {
	const result: string[] = [];
	let i = 0;
	while (i <= line.length) {
		if (i >= line.length) { result.push(''); break; }
		if (line[i] === '"') {
			let val = '';
			i++;
			while (i < line.length) {
				if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
				else if (line[i] === '"') { i++; break; }
				else { val += line[i]; i++; }
			}
			if (i < line.length && line[i] === '\t') i++;
			result.push(val);
		} else {
			const tab = line.indexOf('\t', i);
			if (tab === -1) { result.push(line.slice(i)); break; }
			result.push(line.slice(i, tab));
			i = tab + 1;
		}
	}
	return result;
}

/** Escape one cell. Blank stays blank — the importer reads it as null. */
export function escapeTsvCell(value: string | undefined): string {
	if (!value) return '';
	const s = value.replace(/[\r\n]+/g, ' ');
	return /[\t"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Column name without the `*` that marks a MIxS-required slot. */
const bare = (header: string) => header.replace(/^\*/, '');

/**
 * Group a sheet's columns by vocabulary, alphabetically within each group,
 * and label them with a row under the header.
 *
 * `samp_name` is pulled to the front: it identifies the row, and burying it
 * inside the MIxS block makes the sheet hard to read. An existing vocabulary
 * row is regenerated rather than kept, so re-labelling a sheet that has
 * already been through here is a no-op.
 *
 * `alsoOffer` names columns the importer accepts that the sheet does not use.
 * They are appended empty, after everything with data in it, so the sheet
 * doubles as a list of what can be filled in — the auto-create chain is
 * otherwise invisible until someone reads the source. Columns already present
 * are not repeated.
 */
export function sortAndLabelTsv(tsv: string, alsoOffer: string[] = []): string {
	const lines = tsv.replace(/\r\n/g, '\n').split('\n');
	if (lines.length === 0 || !lines[0].trim()) return tsv;

	const headers = parseTsvLine(lines[0]);
	const body = lines.slice(1).filter((l, idx) => !(idx === 0 && isVocabularyRow(parseTsvLine(l))));

	const vocabularies = headers.map((h) => columnVocabulary(h.trim()));
	const order = headers.map((_, i) => i).sort((a, b) => {
		const byVocab =
			COLUMN_VOCABULARIES.indexOf(vocabularies[a]) - COLUMN_VOCABULARIES.indexOf(vocabularies[b]);
		if (byVocab !== 0) return byVocab;
		return bare(headers[a]).localeCompare(bare(headers[b]));
	});
	const nameIdx = order.findIndex((i) => bare(headers[i]).toLowerCase() === 'samp_name');
	if (nameIdx > 0) order.unshift(...order.splice(nameIdx, 1));

	const take = (cells: string[]) => order.map((i) => escapeTsvCell(cells[i]));

	// Offered columns keep to the right of the data, sorted, each one distinct
	// and not already in the sheet.
	const present = new Set(headers.map((h) => bare(h).trim().toLowerCase()));
	const offered: string[] = [];
	for (const column of alsoOffer) {
		const key = bare(column).trim().toLowerCase();
		if (!key || present.has(key)) continue;
		present.add(key);
		offered.push(column.trim());
	}
	offered.sort((a, b) => a.localeCompare(b));
	const blanks = offered.map(() => '');

	return [
		[...take(headers), ...offered.map(escapeTsvCell)].join('\t'),
		[...order.map((i) => vocabularies[i]), ...offered.map(columnVocabulary)].join('\t'),
		...body
			.filter((l) => l !== '')
			.map((l) => [...take(parseTsvLine(l)), ...blanks].join('\t'))
	].join('\n');
}
