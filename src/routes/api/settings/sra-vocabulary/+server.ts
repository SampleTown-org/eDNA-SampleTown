import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSraVocabulary, ensureSraXlsx, parseSraVocabulary } from '$lib/server/sra-vocabulary';

/** GET — return the parsed SRA vocabulary as JSON. */
export const GET: RequestHandler = async () => {
	const vocab = await getSraVocabulary();
	return json(vocab);
};

/** POST — force a re-download of the SRA metadata xlsx from NCBI. */
export const POST: RequestHandler = async () => {
	// Delete cached file to force re-download
	const { unlinkSync, existsSync } = await import('fs');
	const { dirname, join } = await import('path');
	const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
	const cachePath = join(dirname(DB_PATH), 'sra-metadata.xlsx');
	if (existsSync(cachePath)) unlinkSync(cachePath);

	const path = await ensureSraXlsx();
	const vocab = parseSraVocabulary(path);
	return json({ ok: true, fetchedAt: vocab.fetchedAt, strategies: vocab.strategies.length, sources: vocab.sources.length, selections: vocab.selections.length, platforms: Object.keys(vocab.platforms).length });
};
