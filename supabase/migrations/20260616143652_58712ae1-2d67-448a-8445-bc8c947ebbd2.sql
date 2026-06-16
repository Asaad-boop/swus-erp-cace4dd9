
CREATE OR REPLACE FUNCTION public.mkt_health_checks(p_brand_id uuid, p_from date, p_to date)
RETURNS TABLE(
  severity text, category text, title text, detail text,
  metric numeric, ref_id uuid, ref_label text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- 1) Losing campaigns
  SELECT 'critical'::text, 'campaign'::text,
    'Losing campaign: ' || COALESCE(c.name, c.external_campaign_id),
    'Spend ৳' || ROUND(SUM(d.spend))::text
      || ' · Net profit ৳' || ROUND(COALESCE(SUM(s.net_profit_after_ads),0))::text
      || ' · POAS ' || ROUND(COALESCE(SUM(s.net_profit_after_ads),0) / NULLIF(SUM(d.spend),0), 2)::text || 'x',
    ROUND(COALESCE(SUM(s.net_profit_after_ads),0) / NULLIF(SUM(d.spend),0), 4),
    c.id, c.name
  FROM marketing_insights_daily d
  JOIN marketing_campaigns c ON c.id = d.campaign_id
  LEFT JOIN marketing_order_profit_snapshots s
    ON s.campaign_id = d.campaign_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
    AND s.brand_id = p_brand_id
  WHERE d.brand_id = p_brand_id AND d.level='campaign'
    AND d.date BETWEEN p_from AND p_to
  GROUP BY c.id, c.name, c.external_campaign_id
  HAVING SUM(d.spend) >= 500
     AND COALESCE(SUM(s.net_profit_after_ads),0) / NULLIF(SUM(d.spend),0) < 0.8

  UNION ALL
  -- 2) Spend, no orders
  SELECT 'critical', 'campaign',
    'Spend but no orders: ' || COALESCE(c.name, c.external_campaign_id),
    'Spend ৳' || ROUND(SUM(d.spend))::text || ' · 0 attributed orders',
    SUM(d.spend), c.id, c.name
  FROM marketing_insights_daily d
  JOIN marketing_campaigns c ON c.id = d.campaign_id
  LEFT JOIN marketing_order_profit_snapshots s
    ON s.campaign_id = d.campaign_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
    AND s.brand_id = p_brand_id
  WHERE d.brand_id = p_brand_id AND d.level='campaign'
    AND d.date BETWEEN p_from AND p_to
  GROUP BY c.id, c.name, c.external_campaign_id
  HAVING SUM(d.spend) >= 300 AND COUNT(s.id) = 0

  UNION ALL
  -- 3) Low delivery rate
  SELECT 'warning', 'campaign',
    'Low delivery rate: ' || COALESCE(c.name, c.external_campaign_id),
    COUNT(*) FILTER (WHERE s.is_delivered)::text || ' / ' || COUNT(*)::text
      || ' delivered (' || ROUND(100.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*), 1)::text || '%)',
    ROUND(1.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*), 4),
    c.id, c.name
  FROM marketing_order_profit_snapshots s
  JOIN marketing_campaigns c ON c.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
  GROUP BY c.id, c.name, c.external_campaign_id
  HAVING COUNT(*) >= 10
     AND 1.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*) < 0.5

  UNION ALL
  -- 4) High return rate
  SELECT 'warning', 'campaign',
    'High return rate: ' || COALESCE(c.name, c.external_campaign_id),
    COUNT(*) FILTER (WHERE s.is_returned)::text || ' returned of '
      || COUNT(*)::text || ' (' || ROUND(100.0 * COUNT(*) FILTER (WHERE s.is_returned) / COUNT(*), 1)::text || '%)',
    ROUND(1.0 * COUNT(*) FILTER (WHERE s.is_returned) / COUNT(*), 4),
    c.id, c.name
  FROM marketing_order_profit_snapshots s
  JOIN marketing_campaigns c ON c.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
  GROUP BY c.id, c.name, c.external_campaign_id
  HAVING COUNT(*) >= 10
     AND 1.0 * COUNT(*) FILTER (WHERE s.is_returned) / COUNT(*) > 0.25

  UNION ALL
  -- 5) Attribution gap
  SELECT CASE WHEN gap > 0.5 THEN 'warning' ELSE 'info' END,
    'attribution', 'Attribution gap',
    ROUND(100*gap,1)::text || '% of orders have no campaign attribution ('
      || unatt::text || ' / ' || total::text || ')',
    gap, NULL::uuid, NULL::text
  FROM (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE campaign_id IS NULL) AS unatt,
      CASE WHEN COUNT(*)>0 THEN 1.0 * COUNT(*) FILTER (WHERE campaign_id IS NULL) / COUNT(*) ELSE 0 END AS gap
    FROM marketing_order_profit_snapshots
    WHERE brand_id = p_brand_id AND order_created_at::date BETWEEN p_from AND p_to
  ) t
  WHERE total >= 5 AND gap >= 0.2

  UNION ALL
  -- 6) Courier delivery low
  SELECT 'warning', 'courier',
    'Courier delivery low: ' || cs.provider,
    COUNT(*) FILTER (WHERE s.is_delivered)::text || ' / ' || COUNT(*)::text
      || ' delivered (' || ROUND(100.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*), 1)::text || '%)',
    ROUND(1.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*), 4),
    NULL::uuid, cs.provider
  FROM marketing_order_profit_snapshots s
  JOIN LATERAL (
    SELECT provider FROM courier_shipments c WHERE c.order_id = s.order_id
    ORDER BY created_at DESC LIMIT 1
  ) cs ON true
  WHERE s.brand_id = p_brand_id AND s.order_created_at::date BETWEEN p_from AND p_to
  GROUP BY cs.provider
  HAVING COUNT(*) >= 10
     AND 1.0 * COUNT(*) FILTER (WHERE s.is_delivered) / COUNT(*) < 0.6

  UNION ALL
  -- 7) Tracking: sessions with no events (FIX: join on session_id text)
  SELECT 'warning', 'tracking', 'Sessions without events',
    bad::text || ' / ' || total::text || ' sessions had no events',
    CASE WHEN total>0 THEN ROUND(1.0*bad/total,4) END,
    NULL::uuid, NULL::text
  FROM (
    SELECT COUNT(*) total,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM marketing_events e WHERE e.session_id = ms.session_id
        )
      ) bad
    FROM marketing_sessions ms
    WHERE ms.brand_id = p_brand_id
      AND ms.created_at::date BETWEEN p_from AND p_to
  ) t
  WHERE total >= 20 AND bad::numeric / NULLIF(total,0) >= 0.3

  UNION ALL
  -- 8) Meta sync stale
  SELECT 'critical', 'data', 'Meta sync stale',
    'No insights synced in last 24h',
    EXTRACT(EPOCH FROM (now() - MAX(synced_at)))/3600,
    NULL::uuid, NULL::text
  FROM marketing_insights_daily
  WHERE brand_id = p_brand_id
  HAVING MAX(synced_at) < now() - interval '24 hours'

  UNION ALL
  -- 9) Profit snapshots missing
  SELECT 'warning', 'data', 'Profit snapshots missing',
    missing::text || ' confirmed orders have no profit snapshot',
    missing::numeric, NULL::uuid, NULL::text
  FROM (
    SELECT COUNT(*) missing
    FROM orders o
    WHERE o.brand_id = p_brand_id
      AND o.created_at::date BETWEEN p_from AND p_to
      AND o.status::text IN ('confirmed','shipped','delivered','returned')
      AND NOT EXISTS (SELECT 1 FROM marketing_order_profit_snapshots s WHERE s.order_id = o.id)
  ) t
  WHERE missing > 0;
$$;
