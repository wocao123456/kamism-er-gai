CREATE TABLE IF NOT EXISTS operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type VARCHAR(20) NOT NULL DEFAULT 'admin',
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  module VARCHAR(50) NOT NULL DEFAULT 'system',
  detail TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_logs_user ON operation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_logs_created ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_logs_action ON operation_logs(action);
