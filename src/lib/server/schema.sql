-- SampleTown Database Schema
-- MIxS-compliant eDNA sample tracking

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    github_id INTEGER UNIQUE,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    -- User-chosen emoji avatar shown in the navbar / people roster when no
    -- GitHub avatar_url is set. Free-form single-grapheme string.
    avatar_emoji TEXT,
    password_hash TEXT,                  -- for local accounts only
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    is_local_account INTEGER NOT NULL DEFAULT 0,
    -- Approval gate: GitHub-OAuth users start with is_approved=0 and must be
    -- approved by an admin before they can sign in. Local users created by
    -- an admin start with is_approved=1.
    is_approved INTEGER NOT NULL DEFAULT 1,
    -- Force password change on next login (used for the seeded admin/admin
    -- account and for admin-created users with a temporary password).
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_name TEXT NOT NULL,
    description TEXT,
    pi_name TEXT,
    institution TEXT,
    github_repo TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SITES (sampling locations)
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    site_name TEXT NOT NULL,
    description TEXT,

    -- Location
    lat_lon TEXT,                          -- 'd[d.dddd] N|S d[dd.dddd] W|E'
    latitude REAL,
    longitude REAL,
    geo_loc_name TEXT,                     -- INSDC country:region
    locality TEXT,                         -- finer-grained locality name

    -- ENVO terms (site-level environment descriptors)
    env_broad_scale TEXT,                  -- ENVO biome term
    env_local_scale TEXT,                  -- ENVO feature term

    -- Site characteristics
    access_notes TEXT,                     -- how to get there, permits, etc.

    notes TEXT,
    custom_fields TEXT,                    -- JSON

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(project_id, site_name)
);

CREATE INDEX IF NOT EXISTS idx_sites_project ON sites(project_id);
CREATE INDEX IF NOT EXISTS idx_sites_coords ON sites(latitude, longitude);

-- ============================================================
-- PHYSICAL SAMPLES (MIxS 6.3-aligned)
--
-- Column names here mirror MIxS LinkML slot names 1:1 so import/export is a
-- straight copy. The combination of (mixs_checklist, extension) drives which
-- slots are required — resolved at runtime via src/lib/mixs/schema-index.ts.
-- ============================================================
CREATE TABLE IF NOT EXISTS samples (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- MIxS checklist class name (LinkML class in src/lib/mixs/schema/v<ver>/mixs.yaml).
    -- Not CHECK-constrained — the valid set evolves between MIxS releases;
    -- enforced in app code against schema-index.ts instead.
    mixs_checklist TEXT NOT NULL DEFAULT 'MimarksS',

    -- MIxS Extension (formerly "env_package" in pre-6.3). Resolved to a
    -- combination class `<mixs_checklist><extension>` to look up required slots.
    extension TEXT,                       -- e.g. 'Water', 'Soil', 'HostAssociated'

    -- MIxS mandatory core
    samp_name TEXT NOT NULL,
    collection_date TEXT NOT NULL,        -- ISO 8601
    env_medium TEXT NOT NULL,             -- ENVO material term (per-sample: water/ice/sediment at same site)
    -- samp_taxon_id, samp_vol_we_dna_ext, pool_dna_extracts — those describe
    -- the DNA sample, not the physical collection; they live on extracts.
    -- project_name is sourced from the joined projects.project_name at
    -- export time rather than stored redundantly on each sample.

    -- Extension-specific location context
    depth TEXT,                           -- required for water/sediment
    elev TEXT,                            -- required for soil/air (formerly 'elevation')

    -- Host-associated context
    host_taxid TEXT,                      -- NCBI taxid (formerly 'host_taxon_id')
    specific_host TEXT,                   -- host scientific name

    -- Environmental measurements (numeric where MIxS allows; unit handled in app)
    temp REAL,
    salinity REAL,
    ph REAL,
    diss_oxygen REAL,                     -- formerly 'dissolved_oxygen'
    pressure REAL,
    turbidity REAL,
    chlorophyll REAL,
    nitrate REAL,
    phosphate REAL,

    -- Sampling (MIxS sample-collection slots)
    samp_collect_device TEXT,
    samp_collect_method TEXT,
    samp_mat_process TEXT,
    samp_size TEXT,                       -- amount or size of sample collected
    size_frac TEXT,                       -- size fraction selected
    source_mat_id TEXT,

    -- Sample storage
    samp_store_sol TEXT,                  -- formerly 'preservation_method'
    samp_store_temp TEXT,                 -- MIxS string with units, e.g. "-80 degree Celsius"
    samp_store_dur TEXT,                  -- ISO 8601 duration
    samp_store_loc TEXT,                  -- storage location
    store_cond TEXT,                      -- MIxS storage_conditions slot

    -- MIxS nucl_acid_ext lives on extracts (it's an extraction protocol),
    -- nucl_acid_amp lives on pcr_plates (it's an amplification protocol).
    -- Both are joined in at MIxS export time.

    -- MIGS/MIMAG/MISAG genome context
    ref_biomaterial TEXT,
    isol_growth_condt TEXT,
    tax_ident TEXT,                       -- taxonomic identity marker

    -- SampleTown-local extras (no MIxS slot)
    filter_type TEXT,                     -- filter pore/type; MIxS has filter_type slot
    collector_name TEXT,                  -- free-text; primary attribution lives in entity_personnel

    -- Notes — plain-text scratch; every other "extra" MIxS slot or custom
    -- misc_param:<tag> is stored in the sample_values EAV table so each slot
    -- is a first-class queryable row rather than a JSON blob.
    notes TEXT,

    -- Sync tracking
    client_id TEXT,
    local_created_at TEXT,
    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,

    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(project_id, samp_name)
);

CREATE INDEX IF NOT EXISTS idx_samples_project ON samples(project_id);
CREATE INDEX IF NOT EXISTS idx_samples_site ON samples(site_id);
CREATE INDEX IF NOT EXISTS idx_samples_collection_date ON samples(collection_date);
CREATE INDEX IF NOT EXISTS idx_samples_checklist ON samples(mixs_checklist, extension);

-- EAV table for MIxS slots SampleTown doesn't have a dedicated column for.
-- Covers ~500+ MIxS environmental / chemical / context slots that the
-- samples table would otherwise need individual columns for (alkalinity,
-- ammonium, bromide, silicate, size_frac_*, isol_growth_condt, …). Also
-- holds user-typed misc_param:<tag> annotations, which use the full
-- `misc_param:<name>` string as their slot identifier so they self-identify
-- as off-schema tags. Each value queryable and indexable; no JSON parsing
-- at read time.
CREATE TABLE IF NOT EXISTS sample_values (
    sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    slot      TEXT NOT NULL,
    value     TEXT,
    PRIMARY KEY (sample_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_sample_values_slot ON sample_values(slot);

-- ============================================================
-- DNA EXTRACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS extracts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,

    extract_name TEXT NOT NULL,
    extraction_date TEXT,
    extraction_method TEXT,
    extraction_kit TEXT,
    nucl_acid_ext TEXT,                   -- MIxS nucleic acid extraction protocol (URL / DOI / PID)
    samp_taxon_id TEXT,                   -- MIxS: NCBI taxid of the DNA sample's source taxon
    samp_vol_we_dna_ext TEXT,             -- MIxS: sample volume or weight used for DNA extraction (string with units)
    pool_dna_extracts TEXT,               -- MIxS: pooling of DNA extracts (if done)
    concentration_ng_ul REAL,
    total_volume_ul REAL,
    a260_280 REAL,
    a260_230 REAL,
    quantification_method TEXT,
    storage_location TEXT,
    storage_room TEXT,
    storage_box TEXT,
    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extracts_sample ON extracts(sample_id);

-- ============================================================
-- PCR PLATES & AMPLIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS pcr_plates (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    plate_name TEXT NOT NULL,
    pcr_date TEXT,

    -- Shared conditions for the plate
    primer_set_id TEXT REFERENCES primer_sets(id),  -- source of truth for target_gene
    target_subfragment TEXT,
    forward_primer_name TEXT,
    forward_primer_seq TEXT,
    reverse_primer_name TEXT,
    reverse_primer_seq TEXT,
    pcr_conditions TEXT,
    annealing_temp_c REAL,
    num_cycles INTEGER,
    polymerase TEXT,
    nucl_acid_amp TEXT,                   -- MIxS nucleic acid amplification protocol (URL / DOI / PID)

    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pcr_amplifications (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    plate_id TEXT REFERENCES pcr_plates(id) ON DELETE CASCADE,
    extract_id TEXT NOT NULL REFERENCES extracts(id) ON DELETE CASCADE,

    pcr_name TEXT NOT NULL,
    -- Plate well position (e.g. 'A1', 'H12') — set when the reaction was placed
    -- on a plate in /pcr/new. Nullable for reactions created without a layout.
    well_label TEXT,
    -- Per-reaction fields (primers inherited from plate if plate_id set)
    primer_set_id TEXT REFERENCES primer_sets(id),
    target_subfragment TEXT,
    forward_primer_name TEXT,
    forward_primer_seq TEXT,
    reverse_primer_name TEXT,
    reverse_primer_seq TEXT,
    pcr_conditions TEXT,
    annealing_temp_c REAL,
    num_cycles INTEGER,
    polymerase TEXT,
    pcr_date TEXT,
    band_observed INTEGER,
    concentration_ng_ul REAL,
    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pcr_extract ON pcr_amplifications(extract_id);
CREATE INDEX IF NOT EXISTS idx_pcr_plate ON pcr_amplifications(plate_id);

-- ============================================================
-- LIBRARY PLATES & PREPS
-- ============================================================
CREATE TABLE IF NOT EXISTS library_plates (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    plate_name TEXT NOT NULL,
    library_prep_date TEXT,

    -- Shared conditions
    library_type TEXT NOT NULL,
    library_source TEXT,                    -- SRA library_source (GENOMIC, METAGENOMIC, etc.)
    library_selection TEXT,                 -- SRA library_selection (RANDOM, PCR, etc.)
    library_prep_kit TEXT,
    platform TEXT CHECK (platform IN ('ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT', 'other')),
    instrument_model TEXT,
    fragment_size_bp INTEGER,

    -- Source plate reference (optional)
    pcr_plate_id TEXT REFERENCES pcr_plates(id),

    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_preps (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    library_plate_id TEXT REFERENCES library_plates(id) ON DELETE CASCADE,

    -- Source: either a PCR product or a direct extract
    pcr_id TEXT REFERENCES pcr_amplifications(id) ON DELETE SET NULL,
    extract_id TEXT REFERENCES extracts(id) ON DELETE SET NULL,

    library_name TEXT NOT NULL,
    -- Plate well position (e.g. 'A1', 'H12') — set when the library was placed
    -- on a plate in /libraries/new. Nullable for libraries created without a layout.
    well_label TEXT,
    library_type TEXT NOT NULL,
    library_source TEXT,                    -- SRA library_source
    library_selection TEXT,                 -- SRA library_selection
    library_prep_kit TEXT,
    library_prep_date TEXT,
    platform TEXT CHECK (platform IN ('ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT', 'other')),
    instrument_model TEXT,
    index_sequence_i7 TEXT,
    index_sequence_i5 TEXT,
    barcode TEXT,
    fragment_size_bp INTEGER,
    final_concentration_ng_ul REAL,
    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (pcr_id IS NOT NULL OR extract_id IS NOT NULL OR library_plate_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_libprep_pcr ON library_preps(pcr_id);
CREATE INDEX IF NOT EXISTS idx_libprep_extract ON library_preps(extract_id);

-- ============================================================
-- SEQUENCING RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS sequencing_runs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

    run_name TEXT NOT NULL,
    run_date TEXT,
    platform TEXT CHECK (platform IS NULL OR platform IN ('ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT')),
    instrument_model TEXT,
    flow_cell_id TEXT,
    run_directory TEXT,
    fastq_directory TEXT,
    total_reads INTEGER,
    total_bases INTEGER,
    notes TEXT,
    custom_fields TEXT,

    sync_version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Junction table: many libraries per run
CREATE TABLE IF NOT EXISTS run_libraries (
    run_id TEXT NOT NULL REFERENCES sequencing_runs(id) ON DELETE CASCADE,
    library_id TEXT NOT NULL REFERENCES library_preps(id) ON DELETE CASCADE,
    fastq_r1 TEXT,
    fastq_r2 TEXT,
    fastq_single TEXT,
    read_count INTEGER,
    PRIMARY KEY (run_id, library_id)
);

-- ============================================================
-- ANALYSES
-- ============================================================
CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    run_id TEXT NOT NULL REFERENCES sequencing_runs(id) ON DELETE CASCADE,

    pipeline TEXT NOT NULL,
    pipeline_version TEXT,
    pipeline_profile TEXT,

    nextflow_run_name TEXT,
    nextflow_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    )),

    input_directory TEXT,
    output_directory TEXT,
    reference_db TEXT,
    extra_params TEXT,                    -- JSON

    results_summary TEXT,                 -- JSON
    report_url TEXT,

    launched_at TEXT,
    completed_at TEXT,
    notes TEXT,

    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id);

-- ============================================================
-- CONSTRAINED VALUES (user-editable picklists)
-- ============================================================
CREATE TABLE IF NOT EXISTS constrained_values (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    category TEXT NOT NULL,
    value TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(category, value)
);

CREATE INDEX IF NOT EXISTS idx_cv_category ON constrained_values(category);

-- Primer sets (linked: gene + region + primers)
CREATE TABLE IF NOT EXISTS primer_sets (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    target_gene TEXT NOT NULL,
    target_subfragment TEXT,
    forward_primer_name TEXT,
    forward_primer_seq TEXT,
    reverse_primer_name TEXT,
    reverse_primer_seq TEXT,
    reference TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PCR protocols (linked: polymerase + cycling conditions)
CREATE TABLE IF NOT EXISTS pcr_protocols (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    polymerase TEXT,
    annealing_temp_c REAL,
    num_cycles INTEGER,
    pcr_conditions TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PERSONNEL
-- ============================================================
CREATE TABLE IF NOT EXISTS personnel (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT,                              -- e.g., PI, Lab Manager, Field Tech, Student
    institution TEXT,
    orcid TEXT,
    user_id TEXT UNIQUE REFERENCES users(id),  -- linked GitHub account (optional)
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Many-to-many: each entity (sample, extract, plate, run) can have any
-- number of attributed people, each with a free-text role label. The
-- role vocabulary is suggested via the `person_role` constrained_values
-- category but not enforced — operators can type their own.
CREATE TABLE IF NOT EXISTS entity_personnel (
    entity_type  TEXT NOT NULL CHECK (entity_type IN
        ('sample', 'extract', 'pcr_plate', 'library_plate', 'sequencing_run')),
    entity_id    TEXT NOT NULL,
    personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    role         TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_id, personnel_id, role)
);

CREATE INDEX IF NOT EXISTS idx_entity_personnel_lookup
    ON entity_personnel(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_personnel_person
    ON entity_personnel(personnel_id);

-- ============================================================
-- FEEDBACK
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    page_url TEXT NOT NULL,
    message TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    username TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wontfix')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SYNC & AUDIT
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data TEXT,
    new_data TEXT,
    user_id TEXT,
    client_id TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_log_table ON sync_log(table_name, record_id);

CREATE TABLE IF NOT EXISTS db_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_sha TEXT,
    commit_message TEXT,
    snapshot_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'committed', 'pushed', 'failed'
    )),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
