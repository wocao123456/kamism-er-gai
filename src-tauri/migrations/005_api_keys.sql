-- 005: API 密钥管理 + 统计表 + 加密字段

-- 先建表
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    encrypt_code TEXT DEFAULT '',
    sign_code TEXT DEFAULT '',
    join_template TEXT DEFAULT '',
    request_method VARCHAR(10) DEFAULT 'POST',
    request_base_url TEXT DEFAULT '',
    request_success_check TEXT DEFAULT '',
    params_template TEXT DEFAULT '',
    response_template TEXT DEFAULT '',
    encrypt_enabled BOOLEAN DEFAULT false,
    encrypt_algorithm VARCHAR(50) DEFAULT 'DES',
    encrypt_mode VARCHAR(50) DEFAULT 'CBC',
    encrypt_padding VARCHAR(50) DEFAULT 'PKCS7',
    encrypt_key TEXT DEFAULT '',
    encrypt_iv_source VARCHAR(50) DEFAULT '',
    encrypt_param_name TEXT DEFAULT '',
    encrypt_encoding VARCHAR(50) DEFAULT 'base64',
    encrypt_charset VARCHAR(10) DEFAULT 'UTF-8',
    decrypt_code TEXT DEFAULT '',
    env_vars JSONB DEFAULT '[]',
    tasks JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_name ON api_keys (name);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys (status);

-- 统计表
CREATE TABLE IF NOT EXISTS card_usage_daily (
    card_hash VARCHAR(64),
    date DATE DEFAULT CURRENT_DATE,
    count BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (card_hash, date)
);

CREATE TABLE IF NOT EXISTS card_usage_total (
    card_hash VARCHAR(64) PRIMARY KEY,
    count BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_call_logs (
    id SERIAL PRIMARY KEY,
    key_name VARCHAR(255),
    card_hash VARCHAR(64),
    ip VARCHAR(45),
    device_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 追加解密逻辑字段
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS decrypt_code TEXT DEFAULT '';
