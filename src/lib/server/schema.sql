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

    -- ENVO terms (defaults for samples at this site)
    env_broad_scale TEXT,                  -- ENVO biome term
    env_local_scale TEXT,                  -- ENVO feature term
    env_medium TEXT,                       -- ENVO material term

    -- Site characteristics
    env_package TEXT CHECK (env_package IN (
        'water', 'soil', 'sediment', 'host-associated',
        'air', 'built', 'plant-associated', 'agriculture'
    )),
    depth TEXT,
    elevation TEXT,
    habitat_type TEXT,
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
-- PHYSICAL SAMPLES (MIxS-compliant)
-- ============================================================
CREATE TABLE IF NOT EXISTS samples (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,

    -- MIxS checklist type
    mixs_checklist TEXT NOT NULL DEFAULT 'MIMARKS-SU' CHECK (mixs_checklist IN (
        'MIMARKS-SU', 'MIMARKS-SP', 'MIMS', 'MIMAG', 'MISAG',
        'MIGS-EU', 'MIGS-BA', 'MIGS-PL', 'MIGS-VI', 'MIGS-ORG', 'MIUViG'
    )),

    -- MIxS mandatory core
    samp_name TEXT NOT NULL,
    collection_date TEXT NOT NULL,        -- ISO 8601
    lat_lon TEXT NOT NULL,                -- 'd[d.dddd] N|S d[dd.dddd] W|E'
    latitude REAL,                        -- parsed for indexing/mapping
    longitude REAL,                       -- parsed for indexing/mapping
    geo_loc_name TEXT NOT NULL,           -- INSDC country:region
    env_broad_scale TEXT NOT NULL,        -- ENVO biome term
    env_local_scale TEXT NOT NULL,        -- ENVO feature term
    env_medium TEXT NOT NULL,             -- ENVO material term
    samp_taxon_id TEXT,                   -- NCBI taxonomy ID

    -- Environmental package
    env_package TEXT NOT NULL DEFAULT 'water' CHECK (env_package IN (
        'water', 'soil', 'sediment', 'host-associated',
        'air', 'built', 'plant-associated', 'agriculture'
    )),

    -- Package-specific fields
    depth TEXT,                           -- mandatory for water/sediment
    elevation TEXT,                       -- mandatory for soil/air
    host_taxon_id TEXT,                   -- mandatory for host-associated

    -- MIGS/MIMS/MISAG/MIMAG-specific
    assembly_software TEXT,
    number_of_contigs INTEGER,
    genome_coverage TEXT,
    reference_genome TEXT,
    annotation_source TEXT,

    -- Environmental measurements
    temp REAL,
    salinity REAL,
    ph REAL,
    dissolved_oxygen REAL,
    pressure REAL,
    turbidity REAL,
    chlorophyll REAL,
    nitrate REAL,
    phosphate REAL,

    -- Sample logistics
    sample_type TEXT,
    volume_filtered_ml REAL,
    filter_type TEXT,
    preservation_method TEXT,
    storage_conditions TEXT,
    collector_name TEXT,

    -- Metadata
    notes TEXT,
    custom_fields TEXT,                   -- JSON for arbitrary extra fields

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
CREATE INDEX IF NOT EXISTS idx_samples_collection_date ON samples(collection_date);
CREATE INDEX IF NOT EXISTS idx_samples_coords ON samples(latitude, longitude);

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
    target_gene TEXT NOT NULL CHECK (target_gene IN ('16S', '18S', 'CO1', '12S', 'ITS', 'other')),
    target_subfragment TEXT,
    forward_primer_name TEXT,
    forward_primer_seq TEXT,
    reverse_primer_name TEXT,
    reverse_primer_seq TEXT,
    pcr_conditions TEXT,
    annealing_temp_c REAL,
    num_cycles INTEGER,
    polymerase TEXT,

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
    -- Per-reaction fields (gene/primers inherited from plate if plate_id set)
    target_gene TEXT NOT NULL CHECK (target_gene IN ('16S', '18S', 'CO1', '12S', 'ITS', 'other')),
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
    library_type TEXT NOT NULL CHECK (library_type IN (
        '16S_amplicon', '18S_amplicon', 'CO1_amplicon', '12S_amplicon',
        'nanopore_metagenomic', 'illumina_metagenomic', 'rnaseq', 'other'
    )),
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
    library_type TEXT NOT NULL CHECK (library_type IN (
        '16S_amplicon', '18S_amplicon', 'CO1_amplicon', '12S_amplicon',
        'nanopore_metagenomic', 'illumina_metagenomic', 'rnaseq', 'other'
    )),
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
    platform TEXT NOT NULL CHECK (platform IN ('ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT')),
    instrument_model TEXT,
    seq_meth TEXT NOT NULL,
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

    pipeline TEXT NOT NULL CHECK (pipeline IN ('danaseq', 'microscape-nf', 'custom')),
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
    target_gene TEXT NOT NULL CHECK (target_gene IN ('16S', '18S', 'CO1', '12S', 'ITS', 'other')),
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
