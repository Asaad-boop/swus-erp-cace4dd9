
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pathao_city_id integer,
  ADD COLUMN IF NOT EXISTS pathao_city_name text,
  ADD COLUMN IF NOT EXISTS pathao_zone_id integer,
  ADD COLUMN IF NOT EXISTS pathao_zone_name text,
  ADD COLUMN IF NOT EXISTS pathao_area_id integer,
  ADD COLUMN IF NOT EXISTS pathao_area_name text;
