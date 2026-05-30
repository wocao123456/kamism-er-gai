-- whitelist table: expand type to include card
ALTER TABLE whitelist DROP CONSTRAINT IF EXISTS whitelist_type_check;
ALTER TABLE whitelist ADD CONSTRAINT whitelist_type_check CHECK (type IN ('ip','device','card'));

-- card_blacklist
CREATE TABLE IF NOT EXISTS card_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    card_key VARCHAR(255) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_blacklist
    ON card_blacklist (COALESCE(merchant_id::text, 'global'), card_key);

-- card_whitelist
CREATE TABLE IF NOT EXISTS card_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    card_key VARCHAR(255) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_whitelist
    ON card_whitelist (COALESCE(merchant_id::text, 'global'), card_key);
