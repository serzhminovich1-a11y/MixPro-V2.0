-- Persistent per-game level progress — the EQ Academy-style piece
-- game_scores can't do on its own (it's an append-only history log, not a
-- "current state" row). One row per (user, game), upserted after each
-- ranked session: level only ever goes up (score-gated, never resets),
-- mastery_score is a running average, same idea as EQ Academy's own
-- Mastery Score.
CREATE TABLE public.game_progress (
  user_id uuid NOT NULL,
  game_type text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  mastery_score numeric NOT NULL DEFAULT 0,
  sessions_played integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_type)
);

GRANT SELECT, INSERT, UPDATE ON public.game_progress TO authenticated;
GRANT ALL ON public.game_progress TO service_role;
ALTER TABLE public.game_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own game progress" ON public.game_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
