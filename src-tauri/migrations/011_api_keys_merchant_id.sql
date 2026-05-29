-- Migration 011: api_keys merchant_id already exists
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);
CREATE INDEX IF NOT EXISTS idx_api_keys_merchant_id ON api_keys(merchant_id);
