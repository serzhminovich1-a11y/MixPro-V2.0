
-- ============ COURSE MODULES ============
CREATE TABLE public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_url text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.course_modules TO anon, authenticated;
GRANT ALL ON public.course_modules TO service_role;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Modules readable by all" ON public.course_modules FOR SELECT USING (true);
CREATE POLICY "Moderators manage modules" ON public.course_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE TRIGGER course_modules_updated BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ EXTEND LESSONS ============
ALTER TABLE public.lessons
  ADD COLUMN module_id uuid REFERENCES public.course_modules(id) ON DELETE SET NULL,
  ADD COLUMN order_index integer NOT NULL DEFAULT 0,
  ADD COLUMN quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN pass_score integer NOT NULL DEFAULT 70,
  ADD COLUMN xp_reward integer NOT NULL DEFAULT 50;

CREATE POLICY "Moderators manage lessons" ON public.lessons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- ============ EXTEND LESSON PROGRESS ============
ALTER TABLE public.lesson_progress
  ADD COLUMN quiz_score integer NOT NULL DEFAULT 0,
  ADD COLUMN passed boolean NOT NULL DEFAULT false;

-- Replace award_xp: only award when passed, XP = xp_reward
CREATE OR REPLACE FUNCTION public.award_lesson_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reward int;
BEGIN
  IF NEW.passed IS TRUE AND (TG_OP = 'INSERT' OR (OLD.passed IS DISTINCT FROM true)) THEN
    SELECT xp_reward INTO reward FROM public.lessons WHERE id = NEW.lesson_id;
    UPDATE public.profiles
      SET xp = xp + COALESCE(reward,0),
          level = 1 + floor(sqrt((xp + COALESCE(reward,0)) / 100.0))::int
      WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lesson_progress_award ON public.lesson_progress;
CREATE TRIGGER lesson_progress_award
  AFTER INSERT OR UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.award_lesson_xp();

-- ============ MODERATION HELPERS ============
CREATE OR REPLACE FUNCTION public.can_moderate(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator')
  );
$$;

-- ============ USER BANS ============
CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own bans" ON public.user_bans FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Moderators manage bans" ON public.user_bans FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid()))
  WITH CHECK (public.can_moderate(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ============ FORUM CATEGORIES ============
CREATE TABLE public.forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_categories TO anon, authenticated;
GRANT ALL ON public.forum_categories TO service_role;
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories readable" ON public.forum_categories FOR SELECT USING (true);
CREATE POLICY "Moderators manage categories" ON public.forum_categories FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

-- ============ FORUM THREADS ============
CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.forum_categories(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_threads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Threads visible" ON public.forum_threads FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users create threads" ON public.forum_threads FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_banned(auth.uid()) = false);
CREATE POLICY "Author or mod updates thread" ON public.forum_threads FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate(auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Author or mod deletes thread" ON public.forum_threads FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE TRIGGER forum_threads_updated BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX forum_threads_cat_activity ON public.forum_threads(category_id, last_activity_at DESC);

-- ============ FORUM REPLIES ============
CREATE TABLE public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_replies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_replies TO authenticated;
GRANT ALL ON public.forum_replies TO service_role;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Replies visible" ON public.forum_replies FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users create replies" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_banned(auth.uid()) = false
    AND EXISTS (SELECT 1 FROM public.forum_threads t WHERE t.id = thread_id AND t.is_locked = false AND t.is_hidden = false)
  );
CREATE POLICY "Author or mod updates reply" ON public.forum_replies FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate(auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Author or mod deletes reply" ON public.forum_replies FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE TRIGGER forum_replies_updated BEFORE UPDATE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX forum_replies_thread ON public.forum_replies(thread_id, created_at);

-- bump thread activity on new reply
CREATE OR REPLACE FUNCTION public.bump_thread_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET last_activity_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forum_replies_bump AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_activity();

-- ============ CHAT MESSAGES ============
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read chat" ON public.chat_messages FOR SELECT TO authenticated
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users send chat" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_banned(auth.uid()) = false);
CREATE POLICY "Author or mod deletes chat" ON public.chat_messages FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Moderators hide chat" ON public.chat_messages FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));
CREATE INDEX chat_messages_created ON public.chat_messages(created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- ============ REPORTS ============
CREATE TYPE public.report_target AS ENUM ('thread','reply','message','post','comment');
CREATE TYPE public.report_status AS ENUM ('open','resolved','rejected');
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.report_target NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  status public.report_status NOT NULL DEFAULT 'open',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Reporter sees own, mods see all" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Moderators resolve reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

-- ============ SEED FORUM CATEGORIES ============
INSERT INTO public.forum_categories (slug, name, description, icon, order_index) VALUES
  ('mix', 'Микс', 'Обсуждение сведения: EQ, компрессия, баланс', '🎛', 1),
  ('mastering', 'Мастеринг', 'Финальная обработка, громкость, лимитеры', '💎', 2),
  ('gear', 'Железо', 'Мониторы, интерфейсы, микрофоны, комнаты', '🎚', 3),
  ('market', 'Барахолка', 'Продажа и обмен оборудованием', '🛒', 4),
  ('offtop', 'Оффтоп', 'Всё остальное', '💬', 5);

-- ============ SEED COURSE MODULES ============
INSERT INTO public.course_modules (slug, title, description, order_index) VALUES
  ('foundations', 'Основы сведения', 'С чего начать: сигнальная цепь, gain staging, мониторинг.', 1),
  ('eq', 'Эквализация', 'Как слышать и обрабатывать частоты.', 2),
  ('dynamics', 'Динамика', 'Компрессия, сатурация, транзиенты.', 3),
  ('space', 'Пространство', 'Реверберация, задержки, стерео.', 4),
  ('mastering', 'Мастеринг', 'Финальный этап: громкость, баланс, экспорт.', 5);
