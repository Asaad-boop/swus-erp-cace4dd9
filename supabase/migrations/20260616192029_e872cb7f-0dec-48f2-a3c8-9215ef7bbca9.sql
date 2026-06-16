ALTER TABLE public.erp_product_expense_allocations
  DROP CONSTRAINT IF EXISTS erp_product_expense_allocations_expense_type_check;

ALTER TABLE public.erp_product_expense_allocations
  ADD CONSTRAINT erp_product_expense_allocations_expense_type_check
  CHECK (expense_type IN (
    'video_production',
    'photography',
    'influencer',
    'model',
    'content_creator',
    'studio',
    'meta_ads',
    'meta_ads_manual',
    'other_marketing',
    'packaging',
    'other'
  ));

ALTER TABLE public.erp_product_expense_allocations
  DROP CONSTRAINT IF EXISTS erp_product_expense_allocations_allocation_method_check;

ALTER TABLE public.erp_product_expense_allocations
  ADD CONSTRAINT erp_product_expense_allocations_allocation_method_check
  CHECK (allocation_method IN (
    'direct',
    'percent',
    'equal_split',
    'campaign_weight'
  ));