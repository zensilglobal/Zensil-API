-- =====================================================================
-- 0007_reviews — customer product reviews across channels
-- No marketplace exposes a seller-facing reviews API, so rows arrive
-- via the dashboard's CSV import (exports from Amazon Brand Registry /
-- Flipkart seller portal / Shopify review apps) or future pipelines.
-- Idempotent: safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS reviews (
    channel      channel_t   NOT NULL,
    review_id    TEXT        NOT NULL,
    internal_sku TEXT        REFERENCES sku_master (internal_sku),
    review_date  DATE        NOT NULL,
    rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title        TEXT,
    body         TEXT,
    author       TEXT,
    verified     BOOLEAN     DEFAULT false,
    source       TEXT        DEFAULT 'import',
    ingested_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel, review_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews (review_date);
CREATE INDEX IF NOT EXISTS idx_reviews_sku  ON reviews (internal_sku, review_date);
