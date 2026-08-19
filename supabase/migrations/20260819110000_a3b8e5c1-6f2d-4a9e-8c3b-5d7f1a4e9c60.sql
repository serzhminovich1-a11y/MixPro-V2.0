-- logAction() (src/lib/admin.functions.ts) — called after every single
-- admin/super-admin action (role grants, XP, bans, subscriptions, self-
-- boost, verification, certs) — has always gone through supabaseAdmin
-- (service-role), on purpose: admin_action_log intentionally has no
-- authenticated INSERT grant at all (20260802130000), specifically so a
-- regular client can't forge audit entries directly. Same constraint as
-- every other service-role bug this session — that key only exists inside
-- Lovable Cloud's own hosting — except this one fails silently (logAction
-- wraps the whole thing in try/catch as "best-effort"), so the audit log
-- has likely never actually been populated on Vercel at all, for any
-- action, ever. Only surfaced now because the new subscription-analytics
-- growth chart reads directly from this table and would always be empty.
--
-- Fix keeps the original anti-forgery property while dropping the
-- service-role dependency: a SECURITY DEFINER RPC that only ever inserts
-- with actor_id = auth.uid() (checked from the request's own JWT, not a
-- client-supplied value) — a caller still can't log an action as anyone
-- but themselves, but no longer needs service_role to log at all.
CREATE OR REPLACE FUNCTION public.log_admin_action(_actor uuid, _action text, _target uuid, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _actor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Можно логировать только свои действия';
  END IF;
  INSERT INTO public.admin_action_log (actor_id, action, target_id, meta)
  VALUES (_actor, _action, _target, COALESCE(_meta, '{}'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, uuid, jsonb) TO authenticated;
