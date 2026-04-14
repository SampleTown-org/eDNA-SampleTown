import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export type EventType = 'sample' | 'extract' | 'pcr' | 'library' | 'run';

export interface DayEvent {
	date: string; // YYYY-MM-DD
	type: EventType;
	count: number;
}

export const load: PageServerLoad = async () => {
	const db = getDb();

	const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
	const counts = {
		projects: count('SELECT COUNT(*) AS c FROM projects'),
		sites: count('SELECT COUNT(*) AS c FROM sites WHERE is_deleted = 0'),
		samples: count('SELECT COUNT(*) AS c FROM samples WHERE is_deleted = 0'),
		extracts: count('SELECT COUNT(*) AS c FROM extracts WHERE is_deleted = 0'),
		pcrPlates: count('SELECT COUNT(*) AS c FROM pcr_plates WHERE is_deleted = 0'),
		libraryPlates: count('SELECT COUNT(*) AS c FROM library_plates WHERE is_deleted = 0'),
		runs: count('SELECT COUNT(*) AS c FROM sequencing_runs WHERE is_deleted = 0'),
		analyses: count('SELECT COUNT(*) AS c FROM analyses')
	};

	// Event calendar: aggregate the creation/activity dates for each entity
	// type into a single list of (date, type, count) rows. We pull dates that
	// parse as YYYY-MM-DD (i.e. the first 10 chars match the ISO-ish pattern)
	// and skip the MIxS "not collected" sentinel and any other junk.
	//
	// SQLite's `date()` function returns NULL for unparseable strings, so the
	// WHERE clause filters those out naturally.
	const eventSql = `
		SELECT date(collection_date)   AS date, 'sample'  AS type, COUNT(*) AS count
		FROM samples
		WHERE is_deleted = 0 AND date(collection_date) IS NOT NULL
		GROUP BY date(collection_date)

		UNION ALL

		SELECT date(extraction_date)   AS date, 'extract' AS type, COUNT(*) AS count
		FROM extracts
		WHERE is_deleted = 0 AND date(extraction_date) IS NOT NULL
		GROUP BY date(extraction_date)

		UNION ALL

		SELECT date(pcr_date)          AS date, 'pcr'     AS type, COUNT(*) AS count
		FROM pcr_plates
		WHERE is_deleted = 0 AND date(pcr_date) IS NOT NULL
		GROUP BY date(pcr_date)

		UNION ALL

		SELECT date(library_prep_date) AS date, 'library' AS type, COUNT(*) AS count
		FROM library_plates
		WHERE is_deleted = 0 AND date(library_prep_date) IS NOT NULL
		GROUP BY date(library_prep_date)

		UNION ALL

		SELECT date(run_date)          AS date, 'run'     AS type, COUNT(*) AS count
		FROM sequencing_runs
		WHERE is_deleted = 0 AND date(run_date) IS NOT NULL
		GROUP BY date(run_date)
	`;
	const events = db.prepare(eventSql).all() as DayEvent[];

	// Activity list: individual items with dates, for the chronological list
	// below the calendar. Each row has enough info to display and to cart.
	// Each arm joins its entity's created_by against users so the list can
	// show the SampleTown user who logged the activity (with their emoji
	// avatar). Null when the entity was created before the column existed
	// or by a user who has since been deleted.
	const activitySql = `
		SELECT date(s.collection_date) AS date, 'sample' AS type, s.id, s.samp_name AS name,
			p.project_name AS detail,
			u.username AS created_by_username, u.avatar_emoji AS created_by_avatar
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		LEFT JOIN users u ON u.id = s.created_by
		WHERE s.is_deleted = 0 AND date(s.collection_date) IS NOT NULL

		UNION ALL

		SELECT date(e.extraction_date) AS date, 'extract' AS type, e.id, e.extract_name AS name,
			s.samp_name AS detail,
			u.username AS created_by_username, u.avatar_emoji AS created_by_avatar
		FROM extracts e
		JOIN samples s ON s.id = e.sample_id
		LEFT JOIN users u ON u.id = e.created_by
		WHERE e.is_deleted = 0 AND date(e.extraction_date) IS NOT NULL

		UNION ALL

		SELECT date(p.pcr_date) AS date, 'pcr_plate' AS type, p.id, p.plate_name AS name,
			COALESCE(ps.target_gene, 'PCR') || ' · ' || (SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) || ' reactions' AS detail,
			u.username AS created_by_username, u.avatar_emoji AS created_by_avatar
		FROM pcr_plates p
		LEFT JOIN primer_sets ps ON ps.id = p.primer_set_id
		LEFT JOIN users u ON u.id = p.created_by
		WHERE p.is_deleted = 0 AND date(p.pcr_date) IS NOT NULL

		UNION ALL

		SELECT date(lp.library_prep_date) AS date, 'library_plate' AS type, lp.id, lp.plate_name AS name,
			lp.library_type || ' · ' || (SELECT COUNT(*) FROM library_preps WHERE library_plate_id = lp.id AND is_deleted = 0) || ' libraries' AS detail,
			u.username AS created_by_username, u.avatar_emoji AS created_by_avatar
		FROM library_plates lp
		LEFT JOIN users u ON u.id = lp.created_by
		WHERE lp.is_deleted = 0 AND date(lp.library_prep_date) IS NOT NULL

		UNION ALL

		SELECT date(r.run_date) AS date, 'run' AS type, r.id, r.run_name AS name,
			r.platform AS detail,
			u.username AS created_by_username, u.avatar_emoji AS created_by_avatar
		FROM sequencing_runs r
		LEFT JOIN users u ON u.id = r.created_by
		WHERE r.is_deleted = 0 AND date(r.run_date) IS NOT NULL

		ORDER BY date DESC
	`;
	const activities = db.prepare(activitySql).all() as {
		date: string;
		type: string;
		id: string;
		name: string;
		detail: string | null;
		created_by_username: string | null;
		created_by_avatar: string | null;
	}[];

	return { counts, events, activities };
};
