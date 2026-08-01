-- Roles enum + user_roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  avatar_url text,
  bio text,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are publicly readable" ON public.profiles
FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'user_' || left(NEW.id::text, 8)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Game scores
CREATE TABLE public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_type text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  accuracy numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_scores TO anon;
GRANT SELECT, INSERT ON public.game_scores TO authenticated;
GRANT ALL ON public.game_scores TO service_role;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game scores are publicly readable" ON public.game_scores
FOR SELECT USING (true);
CREATE POLICY "Users can insert own scores" ON public.game_scores
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- XP award function (called after inserting a score)
CREATE OR REPLACE FUNCTION public.award_xp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET xp = xp + GREATEST(NEW.score, 0),
      level = 1 + floor(sqrt((xp + GREATEST(NEW.score, 0)) / 100.0))::int
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_scores_award_xp AFTER INSERT ON public.game_scores
FOR EACH ROW EXECUTE FUNCTION public.award_xp();

-- Lessons
CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL DEFAULT 'beginner',
  content_md text NOT NULL,
  duration_min integer NOT NULL DEFAULT 10,
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lessons TO anon;
GRANT SELECT ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lessons are publicly readable" ON public.lessons
FOR SELECT USING (true);

-- Lesson progress
CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
GRANT SELECT, INSERT, DELETE ON public.lesson_progress TO authenticated;
GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own progress" ON public.lesson_progress
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Presets
CREATE TABLE public.presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  daw text NOT NULL,
  genre text,
  file_url text,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.presets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presets TO authenticated;
GRANT ALL ON public.presets TO service_role;
ALTER TABLE public.presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Presets are publicly readable" ON public.presets
FOR SELECT USING (true);
CREATE POLICY "Users can create presets" ON public.presets
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own presets" ON public.presets
FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own presets" ON public.presets
FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Download counter (security definer so anyone logged-in can increment)
CREATE OR REPLACE FUNCTION public.increment_downloads(_preset_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.presets SET downloads = downloads + 1 WHERE id = _preset_id;
$$;

-- Community posts
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are publicly readable" ON public.posts
FOR SELECT USING (true);
CREATE POLICY "Users can create posts" ON public.posts
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can delete own posts" ON public.posts
FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Post likes
CREATE TABLE public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT ON public.post_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are publicly readable" ON public.post_likes
FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.post_likes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.post_likes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Post comments
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.post_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are publicly readable" ON public.post_comments
FOR SELECT USING (true);
CREATE POLICY "Users can comment" ON public.post_comments
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can delete own comments" ON public.post_comments
FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Realtime for community feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

-- Seed lessons
INSERT INTO public.lessons (slug, title, category, difficulty, duration_min, content_md) VALUES
('osnovy-ekvalizacii', 'Основы эквализации', 'Сведение', 'beginner', 15, E'# Основы эквализации\n\nЭквалайзер (EQ) — главный инструмент звукорежиссёра. Он позволяет усиливать или ослаблять определённые частоты.\n\n## Частотные диапазоны\n\n- **20–60 Гц (саб-бас)** — глубина, ощущается телом. Излишек = гул.\n- **60–250 Гц (бас)** — основа мощности. Излишек = «каша».\n- **250–500 Гц (нижняя середина)** — тепло. Излишек = «коробка».\n- **500 Гц–2 кГц (середина)** — тело инструментов. Излишек = «телефонность».\n- **2–4 кГц (верхняя середина)** — атака, разборчивость.\n- **4–6 кГц (презенс)** — близость, яркость.\n- **6–20 кГц (воздух)** — блеск, открытость.\n\n## Главные правила\n\n1. **Режь, а не буст.** Вырезание проблемных частот звучит естественнее.\n2. **Узкий срез, широкий буст.** Проблемы убираются узкой добротностью (Q), украшения — широкой.\n3. **EQ в контексте микса.** Соло-канал обманывает — слушай всё вместе.\n\n## Практика\n\nПройди игру «Угадай частоту», чтобы натренировать слух на диапазоны!'),
('kompressiya-dlya-nachinayushchih', 'Компрессия для начинающих', 'Сведение', 'beginner', 20, E'# Компрессия для начинающих\n\nКомпрессор уменьшает динамический диапазон — разницу между тихими и громкими местами.\n\n## Основные параметры\n\n- **Threshold** — порог, выше которого начинается сжатие.\n- **Ratio** — степень сжатия (4:1 = сигнал выше порога на 4 дБ выйдет на 1 дБ).\n- **Attack** — как быстро компрессор срабатывает. Быстрая атака давит транзиенты.\n- **Release** — как быстро отпускает. Слишком быстрый release = «качание».\n- **Makeup Gain** — компенсация громкости после сжатия.\n\n## Стартовые настройки для вокала\n\n- Ratio: 3:1 – 4:1\n- Attack: 5–10 мс\n- Release: 40–60 мс\n- Gain reduction: 3–6 дБ\n\n## Совет\n\nЛучше два компрессора по чуть-чуть, чем один давящий сильно.'),
('gain-staging', 'Gain staging: фундамент микса', 'Сведение', 'intermediate', 12, E'# Gain staging\n\nПравильная настройка уровней — фундамент чистого микса.\n\n## Зачем это нужно\n\nВ цифре важно оставлять запас (headroom), чтобы плагины работали в оптимальном диапазоне и не было клиппинга на мастере.\n\n## Правила\n\n1. Пики каналов около **-18 dBFS** (это аналоговый 0 VU).\n2. Мастер-шина не выше **-6 dBFS** до мастеринга.\n3. Выравнивай громкость до и после каждого плагина.\n4. Клип-гейном выравнивай сырые записи до фейдеров.\n\n## Ошибки новичков\n\n- Всё в красной зоне «потому что громче = лучше».\n- Компенсация тихого микса лимитером на мастере.\n- Игнорирование входного уровня в сатураторы и компрессоры — они чувствительны к уровню!'),
('reverb-i-delay', 'Реверберация и дилей', 'Эффекты', 'beginner', 18, E'# Реверберация и дилей\n\nПространственные эффекты создают глубину и объём микса.\n\n## Виды реверберации\n\n- **Room** — маленькое помещение, короткий хвост. Для «склейки».\n- **Hall** — большой зал, длинный хвост. Для баллад и струнных.\n- **Plate** — металлическая пластина. Классика для вокала.\n- **Spring** — пружинный. Гитарные усилители, сёрф, даб.\n\n## Ключевые параметры\n\n- **Pre-delay** — задержка до начала реверба (20–40 мс отделяет вокал от хвоста).\n- **Decay time** — длина хвоста.\n- **Damping** — затухание высоких частот.\n\n## Дилей вместо реверба\n\nВ плотном миксе дилей (1/8, 1/4) часто работает чище реверба — создаёт пространство, не размывая.\n\n## Совет\n\nСрезай низ (до 300 Гц) и верх (после 8 кГц) на возврате реверба — хвост станет прозрачнее.'),
('svedenie-vokala', 'Сведение вокала: полный чеклист', 'Сведение', 'intermediate', 25, E'# Сведение вокала\n\nВокал — центр современного трека. Вот проверенная цепочка.\n\n## Цепочка обработки\n\n1. **Чистка** — убрать шумы, щелчки, дыхания (вручную или RX).\n2. **Тюнинг** — Melodyne/Auto-Tune по вкусу жанра.\n3. **Субтрактивный EQ** — HPF 80–100 Гц, срезать бубнёж 200–400 Гц, резкость 2–4 кГц.\n4. **Компрессия #1** — быстрая, снимает пики (1176-стиль, 3–5 дБ GR).\n5. **Компрессия #2** — медленная, выравнивает (LA-2A-стиль, 2–3 дБ GR).\n6. **Аддитивный EQ** — воздух 10–12 кГц, презенс 5 кГц.\n7. **De-esser** — контроль «с» и «ш» (5–8 кГц).\n8. **Сатурация** — параллельно, для плотности.\n9. **Пространство** — plate-реверб + slap delay.\n\n## Автоматизация\n\nФейдер-райдинг — то, что отличает про-микс. Автоматизируй громкость по фразам, до компрессора.'),
('masterig-osnovy', 'Мастеринг: с чего начать', 'Мастеринг', 'advanced', 30, E'# Мастеринг: с чего начать\n\nМастеринг — финальная стадия: баланс, громкость, перевод на все системы воспроизведения.\n\n## Типичная цепочка\n\n1. **EQ** — тональный баланс, широкие движения ±1–2 дБ.\n2. **Компрессия** — «склейка», ratio 1.5:1–2:1, GR 1–2 дБ.\n3. **Сатурация/эксайтер** — гармоники, плотность.\n4. **Стерео-обработка** — расширение верха, моно-низ (до 120 Гц).\n5. **Лимитер** — финальная громкость.\n\n## Целевая громкость\n\n- Стриминг: **-14 LUFS** (integrated) — но большинство релизов громче, -9…-11 LUFS.\n- Клубная музыка: -6…-8 LUFS.\n- True Peak: не выше **-1 dBTP**.\n\n## Главное правило\n\nМастеринг не исправит плохой микс. Если приходится крутить больше ±3 дБ — вернись в микс.')
;