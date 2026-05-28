-- 修复激活记录表缺失字段
ALTER TABLE activations ADD COLUMN IF NOT EXISTS activate_count BIGINT DEFAULT 0;

-- api_call_logs 补全缺失字段（表可能已存在）
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS auth_key VARCHAR(128);
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS card_key VARCHAR(255);
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'success';
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS sign_result TEXT;
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS params JSONB;
ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS fail_reason TEXT;

-- 索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_api_call_logs_created ON api_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_key_name ON api_call_logs(key_name);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_status ON api_call_logs(status);

-- 白名单表
CREATE TABLE IF NOT EXISTS whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('ip','device')),
    value VARCHAR(255) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(type, value)
);

-- 设备心跳表
CREATE TABLE IF NOT EXISTS device_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id_hash VARCHAR(64) NOT NULL,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
    consecutive_failures INT DEFAULT 0,
    consecutive_successes INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'online',
    total_violations INT DEFAULT 0,
    last_violation_at TIMESTAMPTZ,
    last_blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_device ON device_heartbeats(device_id_hash);
CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON device_heartbeats(status);

-- 风控设置表
CREATE TABLE IF NOT EXISTS risk_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(64) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 修复 api_call_logs 表 id 列类型为 UUID（修正：先删除自增默认值再转换）
ALTER TABLE api_call_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE api_call_logs ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE api_call_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ip和设备黑名单加 blocked_until 列
ALTER TABLE ip_blacklist ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
ALTER TABLE device_blacklist ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
