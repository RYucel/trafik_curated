-- KKTC Traffic Intelligence Database Schema

-- Historical Statistics Table (1975 - 2025 YTD from official PDF)
CREATE TABLE IF NOT EXISTS historical_statistics (
    year INTEGER PRIMARY KEY,
    fatal_accidents INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    injury_accidents INTEGER NOT NULL DEFAULT 0,
    injured INTEGER NOT NULL DEFAULT 0,
    damage_accidents INTEGER NOT NULL DEFAULT 0,
    total_accidents INTEGER NOT NULL DEFAULT 0,
    deaths_per_fatal_accident REAL NOT NULL DEFAULT 0.0,
    injured_per_injury_accident REAL NOT NULL DEFAULT 0.0,
    data_period TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Canonical Accidents Table
CREATE TABLE IF NOT EXISTS accidents (
    accident_id TEXT PRIMARY KEY,
    event_date TEXT NOT NULL,          -- YYYY-MM-DD
    event_time TEXT,                   -- HH:MM
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day_of_week TEXT,
    district TEXT NOT NULL,            -- Lefkoşa, Girne, Gazimağusa, İskele, Güzelyurt, Lefke
    location_raw TEXT,
    location_normalized TEXT NOT NULL,
    road_raw TEXT,
    road_normalized TEXT,
    latitude REAL,
    longitude REAL,
    fatal INTEGER NOT NULL DEFAULT 0,  -- 0 or 1
    death_count INTEGER NOT NULL DEFAULT 0,
    injury_count INTEGER NOT NULL DEFAULT 0,
    vehicle_types TEXT,                -- JSON string array
    vehicle_count INTEGER DEFAULT 1,
    reported_cause TEXT,
    cause_category TEXT NOT NULL DEFAULT 'UNKNOWN', -- SPEED, DRUNK_DRIVING, DISTRACTED_DRIVING, etc.
    cause_confidence REAL DEFAULT 0.5,
    weather TEXT DEFAULT 'Açık / Güneşli',
    road_condition TEXT DEFAULT 'Kuru',
    lighting_condition TEXT DEFAULT 'Gündüz',
    victim_information TEXT,           -- JSON array
    age_group TEXT,                    -- e.g. 18-25, 26-40, 41-60, 60+
    gender TEXT,
    description_raw TEXT,
    description_normalized TEXT,
    source_type TEXT NOT NULL,         -- Official, Established Media, Secondary
    source_tier TEXT NOT NULL DEFAULT 'TIER_3_ESTABLISHED_MEDIA', -- TIER_1_OFFICIAL, TIER_2_AGENCY, TIER_3_ESTABLISHED_MEDIA, TIER_4_OTHER
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_date TEXT,
    record_type TEXT NOT NULL DEFAULT 'INDIVIDUAL_ACCIDENT', -- INDIVIDUAL_ACCIDENT, AGGREGATE_TRAFFIC_STATISTICS, GENERAL_TRAFFIC_NEWS
    verification_status TEXT NOT NULL DEFAULT 'VERIFIED', -- VERIFIED, MEDIA_CORROBORATED, UNVERIFIED, CONFLICT, INCOMPLETE
    publication_approval_status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, REVIEW, APPROVED, REJECTED, PUBLISHED
    confidence_score REAL NOT NULL DEFAULT 0.9,
    content_hash TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accident Sources & Provenance Traceability
CREATE TABLE IF NOT EXISTS accident_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accident_id TEXT NOT NULL,
    source_tier TEXT NOT NULL,        -- Tier 1 (Official), Tier 2 (Established Media), Tier 3 (Secondary)
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    extracted_death_count INTEGER,
    extracted_injury_count INTEGER,
    extracted_cause TEXT,
    raw_snippet TEXT,
    verification_status TEXT DEFAULT 'VERIFIED',
    FOREIGN KEY(accident_id) REFERENCES accidents(accident_id) ON DELETE CASCADE
);

-- Human Review Queue
CREATE TABLE IF NOT EXISTS review_queue (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    accident_id TEXT NOT NULL,
    issue_type TEXT NOT NULL,          -- CONFLICTING_DEATH_COUNT, POTENTIAL_DUPLICATE, UNCERTAIN_LOCATION, UNCERTAIN_CAUSE, LOW_CONFIDENCE
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, RESOLVED
    match_confidence TEXT,             -- HIGH, MEDIUM, LOW
    source_a TEXT,
    source_b TEXT,
    details_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by TEXT,
    FOREIGN KEY(accident_id) REFERENCES accidents(accident_id) ON DELETE CASCADE
);

-- Generated Daily & Periodic Bulletins
CREATE TABLE IF NOT EXISTS bulletins (
    bulletin_id INTEGER PRIMARY KEY AUTOINCREMENT,
    bulletin_date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    content_telegram TEXT NOT NULL,
    data_period TEXT NOT NULL,
    fatal_accidents_2026 INTEGER NOT NULL,
    deaths_2026 INTEGER NOT NULL,
    injuries_2026 INTEGER NOT NULL, -- -1 means no verified aggregate is available
    yoy_change_pct REAL,
    notable_observation TEXT,
    sources_list_json TEXT,
    published_telegram INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Observability & Agent Run Audit Logs
CREATE TABLE IF NOT EXISTS agent_runs (
    run_id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    input_count INTEGER DEFAULT 0,
    output_count INTEGER DEFAULT 0,
    model_used TEXT,
    tokens_used INTEGER DEFAULT 0,
    status TEXT NOT NULL,              -- SUCCESS, FAILED, RUNNING
    error_message TEXT
);

-- Audit Log for Human Reviewer Actions
CREATE TABLE IF NOT EXISTS audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    previous_state TEXT,
    new_state TEXT,
    action_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raw News Articles Ingestion Table
CREATE TABLE IF NOT EXISTS news_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    published_at TEXT,
    description TEXT,
    content TEXT,
    content_hash TEXT UNIQUE NOT NULL,
    traffic_relevance INTEGER DEFAULT 0,  -- 0 or 1
    relevance_score REAL DEFAULT 0.0,
    processing_status TEXT DEFAULT 'DISCOVERED', -- DISCOVERED, RELEVANT, REJECTED, EXTRACTED, ERROR
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    error_message TEXT
);

-- Indexes for maximum query performance
CREATE INDEX IF NOT EXISTS idx_accidents_event_date ON accidents(event_date);
CREATE INDEX IF NOT EXISTS idx_accidents_year ON accidents(year);
CREATE INDEX IF NOT EXISTS idx_accidents_district ON accidents(district);
CREATE INDEX IF NOT EXISTS idx_accidents_cause ON accidents(cause_category);
CREATE INDEX IF NOT EXISTS idx_accidents_verification ON accidents(verification_status);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_news_articles_url ON news_articles(url);
CREATE INDEX IF NOT EXISTS idx_news_articles_hash ON news_articles(content_hash);
CREATE INDEX IF NOT EXISTS idx_news_articles_relevance ON news_articles(traffic_relevance);
