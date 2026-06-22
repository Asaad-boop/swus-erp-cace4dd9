CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'hr_admin')
      OR public.has_role(_user_id, 'hr_manager')
      OR public.has_role(_user_id, 'operations')
      OR public.has_role(_user_id, 'accountant');
$$;

CREATE OR REPLACE FUNCTION public.has_hr_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'hr_admin')
      OR public.has_role(_user_id, 'operations');
$$;

REVOKE EXECUTE ON FUNCTION public.has_hr_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_hr_admin(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_hr_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_hr_admin(uuid) TO authenticated;