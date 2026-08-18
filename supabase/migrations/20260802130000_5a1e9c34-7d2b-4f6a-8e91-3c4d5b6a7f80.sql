-- Admin panel v2: audit log for every super-admin / admin action.
--
-- Inserts only ever happen server-side via the service-role client, after
-- the calling server function has already verified the actor's rank — so
-- there is no direct authenticated INSERT grant. That keeps the log itself
-- from being spoofable via the client SDK, which would defeat the point of
-- an audit trail.
CREATE TABLE public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_action_log_read_staff" ON public.admin_action_log
  FOR SELECT TO authenticated USING (public.can_moderate(auth.uid()));

CREATE INDEX admin_action_log_created_idx ON public.admin_action_log (created_at DESC);
CREATE INDEX admin_action_log_actor_idx ON public.admin_action_log (actor_id);
CREATE INDEX admin_action_log_target_idx ON public.admin_action_log (target_id);
