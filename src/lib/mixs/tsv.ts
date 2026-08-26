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
 */
export function sortAndLabelTsv(tsv: string): string {
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

	return [
		take(headers).join('\t'),
		order.map((i) => vocabularies[i]).join('\t'),
		...body.filter((l) => l !== '').map((l) => take(parseTsvLine(l)).join('\t'))
	].join('\n');
}
