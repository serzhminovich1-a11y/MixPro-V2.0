
-- 1) Extend course_modules with level, prerequisite, tree position
DO $$ BEGIN
  CREATE TYPE public.course_level AS ENUM ('beginner','intermediate','pro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS level public.course_level NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS prerequisite_id uuid REFERENCES public.course_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_x integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_y integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certification_id uuid REFERENCES public.certifications(id) ON DELETE SET NULL;

-- 2) user_course_progress
CREATE TABLE IF NOT EXISTS public.user_course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  completed_lessons integer NOT NULL DEFAULT 0,
  total_lessons integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_course_progress TO authenticated;
GRANT ALL ON public.user_course_progress TO service_role;
ALTER TABLE public.user_course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own progress read" ON public.user_course_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own progress write" ON public.user_course_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Trigger to recompute course progress on lesson_progress change
CREATE OR REPLACE FUNCTION public.recompute_course_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _course_id uuid;
  _total int;
  _done int;
  _cert_id uuid;
BEGIN
  SELECT module_id INTO _course_id FROM public.lessons WHERE id = NEW.lesson_id;
  IF _course_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO _total FROM public.lessons WHERE module_id = _course_id AND is_published = true;
  SELECT count(*) INTO _done FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
   WHERE l.module_id = _course_id AND l.is_published = true AND lp.user_id = NEW.user_id AND lp.passed = true;

  INSERT INTO public.user_course_progress (user_id, course_id, completed_lessons, total_lessons, completed_at, updated_at)
  VALUES (NEW.user_id, _course_id, _done, _total,
          CASE WHEN _total > 0 AND _done >= _total THEN now() ELSE NULL END, now())
  ON CONFLICT (user_id, course_id) DO UPDATE
    SET completed_lessons = EXCLUDED.completed_lessons,
        total_lessons = EXCLUDED.total_lessons,
        completed_at = CASE WHEN EXCLUDED.total_lessons > 0 AND EXCLUDED.completed_lessons >= EXCLUDED.total_lessons
                            THEN COALESCE(public.user_course_progress.completed_at, now())
                            ELSE NULL END,
        updated_at = now();

  -- Award certification if attached and course fully done
  IF _total > 0 AND _done >= _total THEN
    SELECT certification_id INTO _cert_id FROM public.course_modules WHERE id = _course_id;
    IF _cert_id IS NOT NULL THEN
      INSERT INTO public.user_certifications (user_id, certification_id)
      VALUES (NEW.user_id, _cert_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recompute_course_progress ON public.lesson_progress;
CREATE TRIGGER trg_recompute_course_progress
AFTER INSERT OR UPDATE ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.recompute_course_progress();

-- 4) Glossary terms
CREATE TABLE IF NOT EXISTS public.glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  term text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  short_def text NOT NULL,
  long_def_md text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty text NOT NULL DEFAULT 'basic',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.glossary_terms TO authenticated;
GRANT ALL ON public.glossary_terms TO service_role;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read terms" ON public.glossary_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "mods manage terms" ON public.glossary_terms FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

CREATE TRIGGER trg_glossary_updated_at BEFORE UPDATE ON public.glossary_terms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Glossary quiz progress
CREATE TABLE IF NOT EXISTS public.glossary_quiz_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.glossary_terms(id) ON DELETE CASCADE,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.glossary_quiz_progress TO authenticated;
GRANT ALL ON public.glossary_quiz_progress TO service_role;
ALTER TABLE public.glossary_quiz_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own glossary progress" ON public.glossary_quiz_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) Seed baseline terms
INSERT INTO public.glossary_terms (slug, term, category, short_def, long_def_md, difficulty) VALUES
('sine','Синусоида','synthesis','Простейшая периодическая волна из одной частоты.','Синусоида — базовая форма колебания без гармоник. Слышится как чистый тон.','basic'),
('square','Прямоугольная волна','synthesis','Волна с нечётными гармониками, звучит "жужжаще".',NULL,'basic'),
('saw','Пилообразная волна','synthesis','Все гармоники — яркая и агрессивная.',NULL,'basic'),
('triangle','Треугольная волна','synthesis','Мягче квадрата: только нечётные гармоники быстро затухают.',NULL,'basic'),
('compression','Компрессия','dynamics','Уменьшение динамического диапазона: громкое становится тише.','Компрессор снижает пики, если сигнал выше threshold, с заданным ratio, атакой и релизом.','basic'),
('ratio','Ratio','dynamics','Степень сжатия сигнала выше порога.',NULL,'basic'),
('attack','Attack','dynamics','Время реакции компрессора на пик.',NULL,'basic'),
('release','Release','dynamics','Время возврата GR к нулю после падения сигнала.',NULL,'basic'),
('threshold','Threshold','dynamics','Уровень, выше которого начинается компрессия.',NULL,'basic'),
('knee','Knee','dynamics','Плавность включения компрессии у порога.',NULL,'intermediate'),
('limiter','Лимитер','dynamics','Компрессор с очень высоким ratio (10:1+) — не пропускает пики выше threshold.',NULL,'basic'),
('gate','Гейт','dynamics','Обратный компрессор: заглушает тихие сигналы ниже threshold.',NULL,'basic'),
('sidechain','Sidechain','dynamics','Управление динамикой одного трека сигналом другого.',NULL,'intermediate'),
('eq','Эквалайзер','frequency','Инструмент для изменения громкости частотных диапазонов.',NULL,'basic'),
('hpf','HPF (Хай-пасс)','frequency','Фильтр, срезающий низкие частоты.',NULL,'basic'),
('lpf','LPF (Лоу-пасс)','frequency','Фильтр, срезающий высокие частоты.',NULL,'basic'),
('shelf','Shelf-фильтр','frequency','Поднимает или опускает всё выше/ниже точки.',NULL,'basic'),
('bell','Bell-фильтр','frequency','Точечный подъём/срез вокруг выбранной частоты.',NULL,'basic'),
('q','Q (добротность)','frequency','Ширина полосы Bell-фильтра. Чем выше — тем уже.',NULL,'intermediate'),
('sub','Sub-bass','frequency','20–60 Гц. Ощущается телом, не ушами.',NULL,'basic'),
('presence','Presence','frequency','2–5 кГц. Разборчивость вокала.',NULL,'basic'),
('air','Air','frequency','10 кГц+. Ощущение "воздуха" и открытости.',NULL,'basic'),
('reverb','Реверберация','space','Отражения звука в помещении.',NULL,'basic'),
('delay','Дилей','space','Задержка сигнала с повторами.',NULL,'basic'),
('panorama','Панорама','space','Положение звука в стереополе.',NULL,'basic'),
('mono','Моно','space','Один канал — звук из центра.',NULL,'basic'),
('stereo','Стерео','space','Два канала — есть ширина.',NULL,'basic'),
('ms','M/S','space','Кодирование стерео как Mid+Side.',NULL,'intermediate'),
('lufs','LUFS','loudness','Восприятие громкости по стандарту EBU R128.',NULL,'intermediate'),
('truepeak','True Peak','loudness','Пиковая амплитуда с учётом межсэмпловых пиков.',NULL,'intermediate'),
('saturation','Сатурация','harmonics','Насыщение гармониками — тепло и плотность.',NULL,'basic'),
('bus','Bus','routing','Групповой канал для суммирования сигналов.',NULL,'basic'),
('send','Send','routing','Отправка сигнала на параллельный обработчик.',NULL,'basic')
ON CONFLICT (slug) DO NOTHING;
