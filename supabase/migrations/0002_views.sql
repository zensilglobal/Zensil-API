-- =====================================================================
-- 0002_views — analytical views (read by RPCs, dashboard & Claude MCP)
-- =====================================================================

-- latest inventory snapshot per (channel, sku)
CREATE OR REPLACE VIEW v_inventory_latest AS
SELECT DISTINCT ON (channel, internal_sku)
       channel, internal_sku, snapshot_date, available_qty, inbound_qty
FROM   inventory
ORDER  BY channel, internal_sku, snapshot_date DESC;

-- trailing-14-day units/day velocity per (channel, sku)
CREATE OR REPLACE VIEW v_velocity_14d AS
SELECT oi.channel, oi.internal_sku,
       SUM(oi.qty)::numeric / 14 AS units_per_day
FROM   order_items oi
JOIN   orders o ON o.channel = oi.channel AND o.order_id = oi.order_id
WHERE  o.order_date >= now() - INTERVAL '14 days'
GROUP  BY oi.channel, oi.internal_sku;

-- days-of-cover + stock-health status (FR-04)
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
       END AS status
FROM   v_inventory_latest il
JOIN   sku_master sm ON sm.internal_sku = il.internal_sku
LEFT   JOIN v_velocity_14d v
       ON v.channel = il.channel AND v.internal_sku = il.internal_sku;

-- wasted ad spend (FR-01) — over threshold, zero/near-zero orders
CREATE OR REPLACE VIEW v_wasted_spend AS
SELECT keyword_or_search_term, campaign,
       SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(orders) AS orders
FROM   ad_spend
GROUP  BY keyword_or_search_term, campaign
HAVING SUM(spend) > 500 AND SUM(orders) <= 1
ORDER  BY spend DESC;

-- return rate per sku across channels (FR-05)
CREATE OR REPLACE VIEW v_return_rate AS
SELECT sm.internal_sku, sm.product_name,
       SUM(r.qty) AS returned_units,
       COALESCE(sold.units, 0) AS sold_units,
       CASE WHEN COALESCE(sold.units,0) > 0
            THEN 100.0 * SUM(r.qty) / sold.units END AS return_rate_pct
FROM   sku_master sm
LEFT   JOIN returns r ON r.internal_sku = sm.internal_sku
LEFT   JOIN ( SELECT internal_sku, SUM(qty) units FROM order_items GROUP BY internal_sku ) sold
       ON sold.internal_sku = sm.internal_sku
GROUP  BY sm.internal_sku, sm.product_name, sold.units
ORDER  BY return_rate_pct DESC NULLS LAST;
