-- course_modules and lessons both already have "moderators manage" RLS
-- policies (FOR ALL), but the base GRANT was only ever widened to SELECT
-- for `authenticated` — same shape of bug as user_roles in 20260802120000
-- and admin_action_log's read side worked around in the app tonight.
-- lesson-assets storage writes hit this indirectly: uploadLessonAsset
-- etc. never needed the service-role client for permission reasons, they
-- only used it because there was no other way to write course_modules/
-- lessons at all. Fixing the grant here lets all of course-editor.functions.ts
-- run on the plain authenticated client.
GRANT INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lessons TO authenticated;

-- Same bug, glossary_terms: "mods manage terms" is FOR ALL but the base
-- grant was only ever SELECT. This is what was actually behind the
-- glossary "Missing SUPABASE_SERVICE_ROLE_KEY" error — the image upload
-- itself was already fixed (lesson-assets storage), but saving the term
-- afterwards (upsertGlossaryTerm) still hit the same missing-grant wall.
GRANT INSERT, UPDATE, DELETE ON public.glossary_terms TO authenticated;
