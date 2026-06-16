DROP POLICY IF EXISTS "Admin manage ad accounts" ON public.marketing_ad_accounts;
CREATE POLICY "Admins and operations manage ad accounts"
ON public.marketing_ad_accounts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

DROP POLICY IF EXISTS "Admin manage campaigns" ON public.marketing_campaigns;
CREATE POLICY "Admins and operations manage campaigns"
ON public.marketing_campaigns
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

DROP POLICY IF EXISTS "Admin manage adsets" ON public.marketing_adsets;
CREATE POLICY "Admins and operations manage adsets"
ON public.marketing_adsets
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

DROP POLICY IF EXISTS "Admin manage ads" ON public.marketing_ads;
CREATE POLICY "Admins and operations manage ads"
ON public.marketing_ads
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

DROP POLICY IF EXISTS "Admin manage insights" ON public.marketing_insights_daily;
CREATE POLICY "Admins and operations manage insights"
ON public.marketing_insights_daily
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);