-- Classic-forum redesign: subforums (category tree) + view counts.
-- forum_categories was a flat list (order_index only, no nesting) —
-- add self-referencing parent_id so a category can be a subforum of
-- another. NULL parent_id = top-level category, same as today.
ALTER TABLE public.forum_categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.forum_categories(id) ON DELETE SET NULL;

-- forum_threads never tracked views at all.
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

-- Incrementing a view count needs to work for anonymous visitors too
-- (classic forums show "N guests viewing" / view counts to everyone),
-- but forum_threads UPDATE is restricted to the thread's author or a
-- moderator ("Author or mod updates thread") — a plain client update
-- would fail RLS for anyone else, logged in or not. No identity check
-- needed inside: this only ever increments a public counter on an
-- existing thread, there's nothing here to forge or leak.
CREATE OR REPLACE FUNCTION public.increment_thread_views(_thread_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.forum_threads SET views = views + 1 WHERE id = _thread_id;
$$;
REVOKE ALL ON FUNCTION public.increment_thread_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_thread_views(uuid) TO anon, authenticated;

-- Classic forums always show a staff badge (Модератор/Админ/...) under a
-- poster's name — user_roles is currently self-or-moderator readable only
-- (roles_select_self_or_mod), so a regular visitor reading the forum can't
-- see anyone else's role at all. Add a second, purely additive SELECT
-- policy scoped to just the elevated roles — this exposes "is this account
-- staff, and which staff role" to anyone (standard, expected forum
-- information, same as every real forum's staff list), nothing about
-- regular accounts (which normally have no user_roles row at all).
--
-- The forum's public read functions use the anon-key client (same as every
-- other public.functions.ts query), and RLS sits behind the base table
-- GRANT independently — user_roles was only ever GRANTed to `authenticated`,
-- so this policy alone would silently do nothing for a logged-out visitor.
GRANT SELECT ON public.user_roles TO anon;
CREATE POLICY "roles_select_public_staff" ON public.user_roles FOR SELECT
  USING (role IN ('teacher', 'moderator', 'admin', 'super_admin'));
