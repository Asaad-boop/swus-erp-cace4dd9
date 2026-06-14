
DROP POLICY IF EXISTS "brand-assets public read" ON storage.objects;
CREATE POLICY "brand-assets public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "brand-assets authenticated upload" ON storage.objects;
CREATE POLICY "brand-assets authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "brand-assets authenticated update" ON storage.objects;
CREATE POLICY "brand-assets authenticated update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "brand-assets authenticated delete" ON storage.objects;
CREATE POLICY "brand-assets authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'brand-assets');
