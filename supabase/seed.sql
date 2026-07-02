-- =====================================================================
-- seed.sql — representative demo data for local dev / preview deploys.
-- Safe to re-run (idempotent upserts). Mirrors the dashboard's sample set.
-- =====================================================================

INSERT INTO sku_master (internal_sku, product_name, amazon_asin, flipkart_fsn, shopify_product_id, cost_price, target_margin) VALUES
 ('ZN-AROMA-01','Zensil Amber Oud Diffuser','B0AMBER01','FSNAMBER01','shp_amber_01',540,42),
 ('ZN-SILK-22','Imperial Silk Scarf — Crimson','B0SILK22','FSNSILK22','shp_silk_22',820,38),
 ('ZN-CANDLE-07','Gilded Soy Candle Trio','B0CANDLE7','FSNCANDLE7','shp_candle_07',310,51),
 ('ZN-TEA-15','Royal Assam Gold Tin','B0TEA15','FSNTEA15','shp_tea_15',260,46),
 ('ZN-LEATHER-09','Obsidian Leather Journal','B0LEATH09','FSNLEATH09','shp_leather_09',430,44),
 ('ZN-BRASS-31','Heritage Brass Incense Stand','B0BRASS31','FSNBRASS31','shp_brass_31',380,40),
 ('ZN-GLOW-44','24K Glow Face Serum','B0GLOW44','FSNGLOW44','shp_glow_44',290,58),
 ('ZN-VELVET-12','Velvet Cushion — Emerald','B0VELV12','FSNVELV12','shp_velvet_12',610,36)
ON CONFLICT (internal_sku) DO UPDATE SET product_name = EXCLUDED.product_name, cost_price = EXCLUDED.cost_price;

-- Orders: spread ~12/day over the last 30 days across the three channels.
INSERT INTO orders (channel, order_id, order_date, status, buyer_region, total_value)
SELECT
  (ARRAY['amazon','flipkart','shopify']::channel_t[])[1 + (g % 3)],
  'SEED-' || g,
  now() - ((g % 30) || ' days')::interval - ((g % 24) || ' hours')::interval,
  (ARRAY['delivered','in_transit','pending','returned'])[1 + (g % 4)],
  (ARRAY['Maharashtra','Karnataka','Delhi NCR','Tamil Nadu','Gujarat'])[1 + (g % 5)],
  699 + (g % 9) * 180
FROM generate_series(1, 360) g
ON CONFLICT (channel, order_id) DO NOTHING;

INSERT INTO order_items (channel, order_id, line_no, internal_sku, qty, unit_price)
SELECT o.channel, o.order_id, 1,
       (ARRAY['ZN-AROMA-01','ZN-SILK-22','ZN-CANDLE-07','ZN-TEA-15','ZN-LEATHER-09','ZN-BRASS-31','ZN-GLOW-44','ZN-VELVET-12'])
         [1 + (('x'||substr(md5(o.order_id),1,8))::bit(32)::int & 7)],
       1 + (length(o.order_id) % 3),
       o.total_value
FROM orders o
ON CONFLICT (channel, order_id, line_no) DO NOTHING;

-- Inventory: today's snapshot per channel/sku.
INSERT INTO inventory (channel, internal_sku, snapshot_date, available_qty, inbound_qty)
SELECT c.channel, sm.internal_sku, now()::date,
       20 + (length(sm.internal_sku) * 7) % 200, 0
FROM sku_master sm
CROSS JOIN (SELECT unnest(ARRAY['amazon','flipkart','shopify']::channel_t[]) AS channel) c
ON CONFLICT (channel, internal_sku, snapshot_date) DO NOTHING;

-- Returns sample.
INSERT INTO returns (channel, return_id, internal_sku, return_date, reason, qty)
SELECT 'amazon', 'RET-' || g, 'ZN-SILK-22', now()::date - (g || ' days')::interval,
       (ARRAY['Damaged in transit','Not as described','Quality issue'])[1 + (g % 3)], 1
FROM generate_series(1, 14) g
ON CONFLICT (channel, return_id) DO NOTHING;

-- Ad spend (Amazon only).
INSERT INTO ad_spend (report_date, campaign, ad_group, keyword_or_search_term, impressions, clicks, spend, attributed_sales, orders) VALUES
 (now()::date, 'SP — Gold Serum Auto', 'auto', 'cheap diffuser online', 8200, 412, 2840, 0, 0),
 (now()::date, 'SP — Candle Trio Broad', 'broad', 'candle gift set under 500', 6100, 301, 1960, 0, 0),
 (now()::date, 'SP — Amber Oud Exact', 'exact', 'amber oud diffuser', 5400, 2140, 18400, 71200, 62)
ON CONFLICT (report_date, campaign, ad_group, keyword_or_search_term) DO NOTHING;

INSERT INTO sync_state (source, last_synced_at, last_status) VALUES
 ('amazon_orders', now(), 'ok'), ('flipkart_orders', now(), 'ok'), ('shopify_orders', now(), 'ok')
ON CONFLICT (source) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at, last_status = EXCLUDED.last_status;
