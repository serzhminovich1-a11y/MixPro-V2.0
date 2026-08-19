-- SECURITY FIX — admin_list_user_emails (20260819090000) took the caller's
-- identity as a client-supplied `_actor uuid` parameter and only ever
-- checked THAT value's role, never verifying it actually matched the real
-- caller (auth.uid()). Confirmed live via a direct anon-key REST probe:
-- a fully unauthenticated request passing _actor = <any admin's real user
-- id> gets past the rank check and returns every user's email in the
-- system — a full PII exfiltration, requiring nothing but that one uuid
-- (which is not meaningfully secret: visible in public profile pages,
-- forum post authorship, etc.). Also, like log_admin_action, this
-- function is anonymously reachable at all despite only ever granting to
-- `authenticated` — same unexplained anomaly, closed the same way.
--
-- Fix: drop the spoofable parameter entirely and read auth.uid() directly
-- — there is never a legitimate reason for a SECURITY DEFINER function to
-- trust a client-supplied "who am I" value when the verified one is
-- already available from the request's own JWT.
DROP FUNCTION IF EXISTS public.admin_list_user_emails(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_user_emails()
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
    FROM public.user_roles WHERE user_id = auth.uid();
  IF _rank < 2 THEN
    RAISE EXCEPTION 'Только для админов';
  END IF;
  RETURN QUERY SELECT au.id, au.email::text FROM auth.users au;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_user_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;
