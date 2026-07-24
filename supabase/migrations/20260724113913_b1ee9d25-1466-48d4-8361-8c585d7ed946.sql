UPDATE public.mkt_campaigns
SET brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513'
WHERE brand_id IS NULL
  AND name IN (
    'soccer 20d',
    'rocket launcher toy 20d',
    'origami paper kit 5d',
    'pagla gari 10d',
    'CURTAIN BUCKLE MODEL 1 / 10DOLLER',
    'aurora lamp 10d cbo'
  )
RETURNING id, name, brand_id;