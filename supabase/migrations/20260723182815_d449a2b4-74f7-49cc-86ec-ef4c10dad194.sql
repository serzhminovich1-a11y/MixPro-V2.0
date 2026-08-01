CREATE TABLE public.game_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'mix',
  bpm int,
  key text,
  duration_seconds numeric,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_loops TO authenticated, anon;
GRANT ALL ON public.game_loops TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.game_loops TO authenticated;
ALTER TABLE public.game_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active loops" ON public.game_loops
  FOR SELECT USING (is_active = true OR public.can_moderate(auth.uid()));
CREATE POLICY "Moderators insert loops" ON public.game_loops
  FOR INSERT TO authenticated
  WITH CHECK (public.can_moderate(auth.uid()) AND auth.uid() = uploaded_by);
CREATE POLICY "Moderators update loops" ON public.game_loops
  FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid()));
CREATE POLICY "Moderators delete loops" ON public.game_loops
  FOR DELETE TO authenticated
  USING (public.can_moderate(auth.uid()));

CREATE TRIGGER trg_game_loops_updated_at BEFORE UPDATE ON public.game_loops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the 'game-loops' bucket (bucket itself created via tool)
CREATE POLICY "Loops readable by authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'game-loops');
CREATE POLICY "Moderators upload loops" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-loops' AND public.can_moderate(auth.uid()));
CREATE POLICY "Moderators update loop files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'game-loops' AND public.can_moderate(auth.uid()));
CREATE POLICY "Moderators delete loop files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'game-loops' AND public.can_moderate(auth.uid()));