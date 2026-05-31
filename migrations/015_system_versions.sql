CREATE TABLE IF NOT EXISTS system_versions (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version_text TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);