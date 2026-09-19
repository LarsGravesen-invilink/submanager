-- SubManager Database Schema

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT NOT NULL,
    attempted_at TIMESTAMP DEFAULT NOW() NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP,
    auto_update_minutes INTEGER NOT NULL DEFAULT 60,
    client_update_hours INTEGER NOT NULL DEFAULT 24,
    unique_hits INTEGER NOT NULL DEFAULT 0,
    total_hits INTEGER NOT NULL DEFAULT 0,
    access_reset_mode TEXT NOT NULL DEFAULT 'never' CHECK (access_reset_mode IN ('never', 'daily', 'weekly', 'monthly')),
    access_reset_at TIMESTAMPTZ,
    logo_url TEXT DEFAULT '',
    page_title TEXT DEFAULT '',
    whats_new TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS subscription_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    custom_name TEXT DEFAULT '',
    original_name TEXT DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_url TEXT DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    key_fingerprint TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS remote_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    last_fetched_at TIMESTAMP,
    last_status TEXT DEFAULT 'pending',
    selected_keys JSONB DEFAULT '[]',
    key_names JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    user_agent TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS access_logs_subscription_device_accessed_idx
    ON access_logs (subscription_id, device_type, accessed_at DESC);

CREATE TABLE IF NOT EXISTS subscription_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ordinary' CHECK (type IN ('ordinary', 'renewal')),
    ip TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS subscription_reports_subscription_read_idx
    ON subscription_reports (subscription_id, is_read);
CREATE INDEX IF NOT EXISTS subscription_reports_subscription_type_idx
    ON subscription_reports (subscription_id, type);
DROP INDEX IF EXISTS subscription_reports_outstanding_renewal_idx;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
