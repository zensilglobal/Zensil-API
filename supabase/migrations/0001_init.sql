-- =====================================================================
-- 0001_init — Zensil unified warehouse (channel-agnostic)
-- Channels: amazon | flipkart | shopify  ·  UTC storage · INR money
-- =====================================================================

-- channel domain shared by every transactional table
DO $$ BEGIN
    CREATE TYPE channel_t AS ENUM ('amazon','flipkart','shopify');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keystone: maps one product across all channels + holds economics.
CREATE TABLE IF NOT EXISTS sku_master (
    internal_sku       TEXT PRIMARY KEY,
    product_name       TEXT NOT NULL,
    amazon_asin        TEXT,
    amazon_sku         TEXT,
    flipkart_fsn       TEXT,
    flipkart_sku       TEXT,
    shopify_product_id TEXT,
    shopify_variant_id TEXT,
    cost_price         NUMERIC(12,2) NOT NULL,
    target_margin      NUMERIC(5,2),
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    channel      channel_t   NOT NULL,
    order_id     TEXT        NOT NULL,
    order_date   TIMESTAMPTZ NOT NULL,
    status       TEXT,
    buyer_region TEXT,
    total_value  NUMERIC(12,2),
    currency     CHAR(3)     DEFAULT 'INR',
    ingested_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel, order_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders (channel, order_date);

CREATE TABLE IF NOT EXISTS order_items (
    channel      channel_t NOT NULL,
    order_id     TEXT      NOT NULL,
    line_no      INT       NOT NULL,
    internal_sku TEXT      REFERENCES sku_master (internal_sku),
    qty          INT       NOT NULL,
    unit_price   NUMERIC(12,2) NOT NULL,
    PRIMARY KEY (channel, order_id, line_no),
    FOREIGN KEY (channel, order_id) REFERENCES orders (channel, order_id)
);
CREATE INDEX IF NOT EXISTS idx_items_sku ON order_items (internal_sku);

-- Daily snapshot (fresh dated row each run — never overwrite).
CREATE TABLE IF NOT EXISTS inventory (
    channel       channel_t NOT NULL,
    internal_sku  TEXT      NOT NULL REFERENCES sku_master (internal_sku),
    snapshot_date DATE      NOT NULL,
    available_qty INT       NOT NULL,
    inbound_qty   INT       DEFAULT 0,
    PRIMARY KEY (channel, internal_sku, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_inv_sku_date ON inventory (internal_sku, snapshot_date);

CREATE TABLE IF NOT EXISTS returns (
    channel      channel_t NOT NULL,
    return_id    TEXT      NOT NULL,
    internal_sku TEXT      REFERENCES sku_master (internal_sku),
    return_date  DATE      NOT NULL,
    reason       TEXT,
    qty          INT       NOT NULL DEFAULT 1,
    PRIMARY KEY (channel, return_id)
);
CREATE INDEX IF NOT EXISTS idx_returns_sku ON returns (internal_sku, return_date);

-- Ad spend — AMAZON ONLY (Flipkart & Shopify expose no ingestible ads API).
CREATE TABLE IF NOT EXISTS ad_spend (
    report_date            DATE NOT NULL,
    campaign               TEXT NOT NULL,
    ad_group               TEXT NOT NULL DEFAULT '',
    keyword_or_search_term TEXT NOT NULL DEFAULT '',
    impressions            BIGINT DEFAULT 0,
    clicks                 BIGINT DEFAULT 0,
    spend                  NUMERIC(12,2) DEFAULT 0,
    attributed_sales       NUMERIC(12,2) DEFAULT 0,
    orders                 INT DEFAULT 0,
    PRIMARY KEY (report_date, campaign, ad_group, keyword_or_search_term)
);
CREATE INDEX IF NOT EXISTS idx_ad_date ON ad_spend (report_date);

CREATE TABLE IF NOT EXISTS sync_state (
    source         TEXT PRIMARY KEY,
    last_synced_at TIMESTAMPTZ,
    last_status    TEXT,
    updated_at     TIMESTAMPTZ DEFAULT now()
);
