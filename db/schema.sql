CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    amount INTEGER NOT NULL CHECK (amount >= 100 AND amount <= 100000),
    currency TEXT NOT NULL CHECK (currency = 'gbp'),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'payment_failed')),
    stripe_payment_intent_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    stripe_payment_intent_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_payment_intent
    ON webhook_events (stripe_payment_intent_id);
