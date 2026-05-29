-- Migration 012: 确保 api_keys.merchant_id 允许 NULL
-- 管理员创建的密钥不需要绑定商户
ALTER TABLE api_keys ALTER COLUMN merchant_id DROP NOT NULL;
