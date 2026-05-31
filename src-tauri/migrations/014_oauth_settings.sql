-- Persist global OAuth aggregator settings
CREATE TABLE IF NOT EXISTS oauth_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    appid TEXT NOT NULL DEFAULT '',
    appkey TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT 'https://u.suyanw.cn',
    login_path TEXT NOT NULL DEFAULT '/connect.php',
    user_path TEXT NOT NULL DEFAULT '/api.php',
    redirect_uri TEXT NOT NULL DEFAULT '',
    enabled_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT oauth_settings_singleton CHECK (id = TRUE)
);

INSERT INTO oauth_settings (id, enabled, base_url, login_path, user_path, redirect_uri, enabled_types)
VALUES (TRUE, FALSE, 'https://u.suyanw.cn', '/connect.php', '/api.php', '', ARRAY[]::TEXT[])
ON CONFLICT (id) DO NOTHING;
