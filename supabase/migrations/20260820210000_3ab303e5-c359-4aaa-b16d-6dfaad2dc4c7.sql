-- Site-wide appearance settings — a scoped alternative to a full drag-and-
-- drop page builder: a fixed, curated list of things that are actually
-- worth making admin-configurable (accent color, nav item order), not
-- freeform per-element positioning. Single row, enforced by the boolean
-- primary key trick (id can only ever be `true`).
CREATE TABLE public.site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  accent_color text,
  nav_order text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.site_settings (id) VALUES (true);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site settings publicly readable" ON public.site_settings FOR SELECT
  USING (true);
-- Super-admin only (site-wide branding for every visitor, not a per-page
-- content edit — same bar as Роли/Подписки/Команда already are).
CREATE POLICY "Super-admins update site settings" ON public.site_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
