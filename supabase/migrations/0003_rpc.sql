-- =====================================================================
-- 0003_rpc — parameterized JSON functions the dashboard calls via
-- supabase.rpc(). Claude reads the same views (0002) through MCP, so the
-- numbers always reconcile. Channel filter: 'all' | 'amazon' | 'flipkart' | 'shopify'.
-- =====================================================================

CREATE OR REPLACE FUNCTION api_kpi_overview(p_channel text DEFAULT 'all', p_days int DEFAULT 30)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH cur AS (
    SELECT total_value, channel FROM orders
    WHERE order_date >= now() - (p_days || ' days')::interval
      AND (p_channel = 'all' OR channel::text = p_channel)
  ),
  prev AS (
    SELECT total_value FROM orders
    WHERE order_date >= now() - (2 * p_days || ' days')::interval
      AND order_date <  now() - (p_days || ' days')::interval
      AND (p_channel = 'all' OR channel::text = p_channel)
  )
  SELECT json_build_object(
    'revenue',        COALESCE((SELECT SUM(total_value) FROM cur), 0),
    'prev_revenue',   COALESCE((SELECT SUM(total_value) FROM prev), 0),
    'orders',         (SELECT COUNT(*) FROM cur),
    'prev_orders',    (SELECT COUNT(*) FROM prev),
    'aov',            COALESCE((SELECT AVG(total_value) FROM cur), 0),
    'split',          (SELECT json_object_agg(channel, s) FROM
                        (SELECT channel, SUM(total_value) s FROM cur GROUP BY channel) x)
  );
$$;

CREATE OR REPLACE FUNCTION api_revenue_trend(p_days int DEFAULT 30)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(row ORDER BY row->>'label'), '[]'::json) FROM (
    SELECT json_build_object(
      'label', to_char(d.day, 'DD Mon'),
      'amazon',   COALESCE(SUM(o.total_value) FILTER (WHERE o.channel='amazon'), 0),
      'flipkart', COALESCE(SUM(o.total_value) FILTER (WHERE o.channel='flipkart'), 0),
      'shopify',  COALESCE(SUM(o.total_value) FILTER (WHERE o.channel='shopify'), 0)
    ) AS row, MIN(d.day) AS day
    FROM generate_series((now() - (p_days || ' days')::interval)::date, now()::date, '1 day') d(day)
    LEFT JOIN orders o ON o.order_date::date = d.day
    GROUP BY d.day
  ) t;
$$;

CREATE OR REPLACE FUNCTION api_stock_health(p_channel text DEFAULT 'all')
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(row ORDER BY (row->>'days_of_cover')::numeric NULLS LAST), '[]'::json) FROM (
    SELECT json_build_object(
      'internal_sku', internal_sku,
      'product_name', product_name,
      'available_qty', SUM(available_qty),
      'velocity', SUM(velocity),
      'days_of_cover', CASE WHEN SUM(velocity) > 0 THEN SUM(available_qty)/SUM(velocity) END,
      'status', CASE
        WHEN SUM(velocity) = 0 THEN 'healthy'
        WHEN SUM(available_qty)/SUM(velocity) < 7  THEN 'critical'
        WHEN SUM(available_qty)/SUM(velocity) < 14 THEN 'low'
        ELSE 'healthy' END
    ) AS row
    FROM v_stock_health
    WHERE (p_channel = 'all' OR channel::text = p_channel)
    GROUP BY internal_sku, product_name
  ) t;
$$;

CREATE OR REPLACE FUNCTION api_wasted_spend()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(v), '[]'::json) FROM v_wasted_spend v;
$$;

CREATE OR REPLACE FUNCTION api_return_rate()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(v), '[]'::json) FROM v_return_rate v;
$$;

-- Expose to the Supabase PostgREST roles (anon/authenticated) when they exist.
-- On Neon those roles are absent and there is no PostgREST, so this is skipped:
-- the web app calls these functions server-side over DATABASE_URL as the owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION api_kpi_overview(text, int) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION api_revenue_trend(int)      TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION api_stock_health(text)      TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION api_wasted_spend()          TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION api_return_rate()           TO anon, authenticated;
  END IF;
END $$;
