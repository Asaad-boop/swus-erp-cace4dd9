DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.order_locks'::regclass
      AND conname = 'order_locks_order_id_key'
  ) THEN
    ALTER TABLE public.order_locks
      ADD CONSTRAINT order_locks_order_id_key UNIQUE (order_id);
  END IF;
END $$;

ALTER TABLE public.order_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read order locks" ON public.order_locks;
DROP POLICY IF EXISTS "staff write order locks" ON public.order_locks;
DROP POLICY IF EXISTS "Authenticated users can read order locks" ON public.order_locks;
DROP POLICY IF EXISTS "Authenticated users can create own order locks" ON public.order_locks;
DROP POLICY IF EXISTS "Authenticated users can takeover order locks" ON public.order_locks;
DROP POLICY IF EXISTS "Authenticated users can delete own order locks" ON public.order_locks;

CREATE POLICY "Authenticated users can read order locks"
ON public.order_locks
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create own order locks"
ON public.order_locks
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can takeover order locks"
ON public.order_locks
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can delete own order locks"
ON public.order_locks
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.order_locks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_locks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_locks;
  END IF;
END $$;