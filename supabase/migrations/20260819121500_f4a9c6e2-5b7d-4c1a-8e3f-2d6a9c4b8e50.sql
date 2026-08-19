-- Staff/team management: a new "teacher" role scoped to only the courses
-- they create, plus a small set of additive permission flags a super-admin
-- can grant to specific people on top of their existing role (e.g. a
-- trusted teacher who should manage ALL courses, not just their own; an
-- admin who should see the finance dashboard without being made
-- super-admin).
--
-- The enum extension itself (ALTER TYPE app_role ADD VALUE 'teacher') is
-- now its own migration (20260819120000) — must run and commit before
-- this one, since Postgres can't use a freshly added enum label in the
-- same transaction that added it (hit this live: "unsafe use of new
-- value ... must be committed before they can be used").

-- 1) Ownership tracking, needed for "teachers manage their own courses".
--    Nullable — existing rows predate this and have no known author.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) staff_permissions — one row per person with extra grants. Absence of a
--    row (or all-false) just means "only what their role already gives them".
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_manage_courses boolean NOT NULL DEFAULT false, -- teachers: edit ALL courses, not just their own
  can_view_finances boolean NOT NULL DEFAULT false,  -- admins: see /admin/subscriptions without being super-admin
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;

-- Read: yourself, or a super-admin reading anyone (for the "rules" section
-- on a profile, and the team-management page).
CREATE POLICY "staff_perms_read_self_or_super" ON public.staff_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
-- Write: super-admin only, and only for someone else (no self-granting).
-- Split from the SELECT policy on purpose — a combined FOR ALL policy's
-- USING clause would also govern DELETE, which would let a person delete
-- their own permissions row since USING(self-read) would already pass it.
CREATE POLICY "staff_perms_write_super" ON public.staff_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "staff_perms_update_super" ON public.staff_permissions FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "staff_perms_delete_super" ON public.staff_permissions FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 3) can_manage_all_courses(): can_moderate() already covers admin/
--    moderator/super_admin for course editing (existing
--    lessons_write_moderators/modules_write_moderators policies, untouched)
--    — this adds teachers who've been granted the course-wide flag.
CREATE OR REPLACE FUNCTION public.can_manage_all_courses(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_moderate(_user_id) OR EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE user_id = _user_id AND can_manage_courses = true
  );
$$;

-- 4) Teachers manage their own courses/lessons — additive policies
--    alongside the existing can_moderate() ones, not a replacement.
CREATE POLICY "lessons_read_teachers_own" ON public.lessons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND created_by = auth.uid());
CREATE POLICY "lessons_write_teachers_own" ON public.lessons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND (created_by = auth.uid() OR public.can_manage_all_courses(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND (created_by = auth.uid() OR public.can_manage_all_courses(auth.uid())));

CREATE POLICY "modules_read_teachers_own" ON public.course_modules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND created_by = auth.uid());
CREATE POLICY "modules_write_teachers_own" ON public.course_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'teacher') AND (created_by = auth.uid() OR public.can_manage_all_courses(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'teacher') AND (created_by = auth.uid() OR public.can_manage_all_courses(auth.uid())));

-- 5) can_view_finances(): admin.subscriptions.tsx's growth chart reads
--    admin_action_log, which only grants SELECT to can_moderate() (rank
--    >= 1) — a rank-0 person (plain teacher, or a "user" with nothing but
--    the can_view_finances flag) granted this flag would hit the finance
--    page (RoleGate honors the flag) but get an empty chart, silently,
--    because RLS would filter every row. This closes that gap the same
--    additive way as can_manage_all_courses — a second, OR'd SELECT
--    policy, so existing moderator+ access is untouched.
CREATE OR REPLACE FUNCTION public.can_view_finances(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE user_id = _user_id AND can_view_finances = true
  );
$$;
CREATE POLICY "admin_action_log_read_finance" ON public.admin_action_log FOR SELECT TO authenticated
  USING (public.can_view_finances(auth.uid()));
