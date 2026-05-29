-- Migration 011: api_keys merchant_id 字段
-- 创建: 允许 NULL（管理员不需要绑定商户），外键 SET NULL（商户删除后密钥保留）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL;
ALTER TABLE api_keys ALTER COLUMN merchant_id DROP NOT NULL;

-- 重建外键约束（确保 ON DELETE SET NULL）
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_merchant_id_fkey;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_merchant_id ON api_keys(merchant_id);
