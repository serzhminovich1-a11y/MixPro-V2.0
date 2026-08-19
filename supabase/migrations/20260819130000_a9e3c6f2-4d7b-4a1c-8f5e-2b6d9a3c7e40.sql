-- User hit "permission denied for function admin_set_verified" live, using
-- their real super-admin account through the app UI (not anonymous — the
-- anon-key probe on this function correctly returns the same 42501, that's
-- expected). This exact function had its GRANT silently fail to apply once
-- already (see 20260818180000's own comment: batched migrations relayed by
-- hand through Lovable's chat, and if anything earlier in a batch doesn't
-- apply cleanly, everything after it — including a later GRANT statement —
-- never lands, with no visible error). Re-asserting is idempotent and safe
-- either way. Doing all four can_act_on-gated functions at once so this
-- doesn't come back as a separate report for each one.
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_xp(uuid, uuid, int) TO authenticated;
