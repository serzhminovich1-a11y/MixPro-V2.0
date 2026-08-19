-- exportUsersXlsx (src/lib/admin-export.functions.ts) used supabaseAdmin
-- (service-role) for two things: (1) bulk-reading a dozen regular tables,
-- which admin+ can already do through RLS on the plain authenticated
-- client — no service role needed there at all; (2) supabaseAdmin.auth.
-- admin.listUsers(), to get emails for the sheet — that one's a genuine
-- GoTrue Admin API call, not a table read, and it *does* strictly require
-- service_role. Since that key only exists inside Lovable Cloud's own
-- hosting and can't be exported (same constraint as every other
-- "Missing SUPABASE_SERVICE_ROLE_KEY" bug fixed this session), the whole
-- export has been failing outright on Vercel.
--
-- Standard Supabase pattern for this: a SECURITY DEFINER function that
-- reads auth.users on the caller's behalf — the function owner has the
-- necessary access even though `authenticated` itself never does.
CREATE OR REPLACE FUNCTION public.admin_list_user_emails(_actor uuid)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rank int;
BEGIN
  SELECT COALESCE(MAX(CASE role
    WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 1 ELSE 0 END), 0)
    INTO _rank
    FROM public.user_roles WHERE user_id = _actor;
  IF _rank < 2 THEN
    RAISE EXCEPTION 'Только для админов';
  END IF;
  RETURN QUERY SELECT au.id, au.email::text FROM auth.users au;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails(uuid) TO authenticated;
