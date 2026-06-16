
CREATE OR REPLACE FUNCTION public._advance_date(_d date, _freq text, _n int)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _freq
    WHEN 'daily'   THEN _d + (_n || ' days')::interval
    WHEN 'weekly'  THEN _d + (_n * 7 || ' days')::interval
    WHEN 'monthly' THEN _d + (_n || ' months')::interval
    WHEN 'yearly'  THEN _d + (_n || ' years')::interval
  END::date;
$$;
