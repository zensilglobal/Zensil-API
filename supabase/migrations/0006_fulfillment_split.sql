-- =====================================================================
-- 0006_fulfillment_split — split inventory into FBA vs Easy Ship
-- (seller-fulfilled) units. available_qty stays the total so every
-- existing view/query keeps working. Amazon's FBA inventory report
-- carries both afn- and mfn-fulfillable quantities; Flipkart & Shopify
-- stock is seller-fulfilled by definition.
-- =====================================================================

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS fba_qty      INT NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS easyship_qty INT NOT NULL DEFAULT 0;

-- Backfill history: pre-split amazon snapshots came from the FBA report
-- (afn-fulfillable only); other channels were always seller-fulfilled.
-- Guarded so re-runs never clobber rows the new ETL has already written.
UPDATE inventory SET fba_qty = available_qty
WHERE  channel = 'amazon' AND fba_qty = 0 AND easyship_qty = 0 AND available_qty > 0;
UPDATE inventory SET easyship_qty = available_qty
WHERE  channel <> 'amazon' AND fba_qty = 0 AND easyship_qty = 0 AND available_qty > 0;

-- Views: columns may only be APPENDED with CREATE OR REPLACE.
CREATE OR REPLACE VIEW v_inventory_latest AS
SELECT DISTINCT ON (channel, internal_sku)
       channel, internal_sku, snapshot_date, available_qty, inbound_qty,
       fba_qty, easyship_qty
FROM   inventory
ORDER  BY channel, internal_sku, snapshot_date DESC;

CREATE OR REPLACE VIEW v_stock_health AS
SELECT il.channel,
       il.internal_sku,
       sm.product_name,
       il.available_qty,
       COALESCE(v.units_per_day, 0) AS velocity,
       CASE WHEN COALESCE(v.units_per_day,0) > 0
            THEN il.available_qty / v.units_per_day END AS days_of_cover,
       CASE
         WHEN COALESCE(v.units_per_day,0) = 0 THEN 'healthy'
         WHEN il.available_qty / v.units_per_day < 7  THEN 'critical'
         WHEN il.available_qty / v.units_per_day < 14 THEN 'low'
         ELSE 'healthy'
       END AS status,
       il.fba_qty,
       il.easyship_qty
FROM   v_inventory_latest il
JOIN   sku_master sm ON sm.internal_sku = il.internal_sku
LEFT   JOIN v_velocity_14d v
       ON v.channel = il.channel AND v.internal_sku = il.internal_sku;
