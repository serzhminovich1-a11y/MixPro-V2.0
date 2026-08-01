
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

CREATE OR REPLACE FUNCTION public.role_rank(_role public.app_role)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role::text
    WHEN 'super_admin' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'moderator' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.max_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY public.role_rank(role) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.can_act_on(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _actor IS NOT NULL
    AND _actor <> _target
    AND public.role_rank(COALESCE(public.max_role(_actor), 'user'::public.app_role))
        > public.role_rank(COALESCE(public.max_role(_target), 'user'::public.app_role))
    AND public.role_rank(COALESCE(public.max_role(_actor), 'user'::public.app_role)) >= 2;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','moderator','super_admin')
  );
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;

CREATE POLICY "roles_select_self_or_mod" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "roles_insert_hierarchical" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.can_act_on(auth.uid(), user_id)
    AND public.role_rank(role) < public.role_rank(COALESCE(public.max_role(auth.uid()), 'user'::public.app_role))
  );
CREATE POLICY "roles_delete_hierarchical" ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.can_act_on(auth.uid(), user_id)
    AND public.role_rank(role) < public.role_rank(COALESCE(public.max_role(auth.uid()), 'user'::public.app_role))
  );

DROP POLICY IF EXISTS "Moderators manage bans" ON public.user_bans;
CREATE POLICY "bans_insert_hierarchical" ON public.user_bans FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on(auth.uid(), user_id));
CREATE POLICY "bans_delete_hierarchical" ON public.user_bans FOR DELETE TO authenticated
  USING (public.can_act_on(auth.uid(), user_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "bans_update_hierarchical" ON public.user_bans FOR UPDATE TO authenticated
  USING (public.can_act_on(auth.uid(), user_id)) WITH CHECK (public.can_act_on(auth.uid(), user_id));

CREATE TABLE public.certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#6EE7B7',
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.certifications TO anon, authenticated;
GRANT ALL ON public.certifications TO service_role;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certs_public_read" ON public.certifications FOR SELECT USING (true);
CREATE POLICY "certs_admin_manage" ON public.certifications FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

CREATE TABLE public.user_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, certification_id)
);
GRANT SELECT ON public.user_certifications TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_certifications TO authenticated;
GRANT ALL ON public.user_certifications TO service_role;
ALTER TABLE public.user_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_certs_public_read" ON public.user_certifications FOR SELECT USING (true);
CREATE POLICY "user_certs_award_hierarchical" ON public.user_certifications FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on(auth.uid(), user_id));
CREATE POLICY "user_certs_revoke_hierarchical" ON public.user_certifications FOR DELETE TO authenticated
  USING (public.can_act_on(auth.uid(), user_id) OR public.is_super_admin(auth.uid()));

INSERT INTO public.certifications (slug, name, description, color, icon) VALUES
  ('verified', 'Verified', 'Подтверждённый инженер', '#6EE7B7', '✓'),
  ('mentor', 'Mentor', 'Помогает новичкам', '#67E8F9', '★'),
  ('pro_mix', 'Pro Mix', 'Мастер сведения', '#A78BFA', '🎚'),
  ('pro_master', 'Pro Master', 'Мастер мастеринга', '#FCD34D', '💎'),
  ('legend', 'Legend', 'Легенда MixPro', '#F472B6', '👑')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_adjust_xp(_actor uuid, _target uuid, _delta int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_act_on(_actor, _target) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  UPDATE public.profiles
    SET xp = GREATEST(xp + _delta, 0),
        level = 1 + floor(sqrt(GREATEST(xp + _delta, 0) / 100.0))::int
    WHERE id = _target;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_adjust_xp(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_xp(uuid, uuid, int) TO authenticated;
