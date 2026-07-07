-- Return rate over a matched rolling 60-day window. The original view divided
-- 60-day returns (the ETL's report lookback) by ALL-TIME sold units, which
-- understates the rate more and more as order history accumulates.
CREATE OR REPLACE VIEW v_return_rate AS
SELECT sm.internal_sku, sm.product_name,
       SUM(r.qty) AS returned_units,
       COALESCE(sold.units, 0) AS sold_units,
       CASE WHEN COALESCE(sold.units,0) > 0
            THEN 100.0 * SUM(r.qty) / sold.units END AS return_rate_pct
FROM   sku_master sm
LEFT   JOIN returns r ON r.internal_sku = sm.internal_sku
       AND r.return_date >= (now() - interval '60 days')::date
LEFT   JOIN ( SELECT oi.internal_sku, SUM(oi.qty) units
              FROM order_items oi
              JOIN orders o USING (channel, order_id)
              WHERE o.order_date >= now() - interval '60 days'
              GROUP BY oi.internal_sku ) sold
       ON sold.internal_sku = sm.internal_sku
GROUP  BY sm.internal_sku, sm.product_name, sold.units
ORDER  BY return_rate_pct DESC NULLS LAST;
