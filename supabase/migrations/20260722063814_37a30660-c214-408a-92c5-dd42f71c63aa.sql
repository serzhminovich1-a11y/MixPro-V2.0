
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL,
  post_id uuid,
  track_index int,
  comment_id uuid,
  timestamp_ms int,
  snippet text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE is_read = false;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger: create @mention notifications from track_comments
CREATE OR REPLACE FUNCTION public.create_track_mention_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m text;
  target_id uuid;
  seen uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR m IN
    SELECT DISTINCT lower(match[1])
    FROM regexp_matches(coalesce(NEW.content, ''), '@([A-Za-z0-9_]{2,32})', 'g') AS match
  LOOP
    SELECT id INTO target_id FROM public.profiles WHERE lower(username) = m LIMIT 1;
    IF target_id IS NULL THEN CONTINUE; END IF;
    IF target_id = NEW.author_id THEN CONTINUE; END IF;
    IF target_id = ANY(seen) THEN CONTINUE; END IF;
    seen := seen || target_id;
    INSERT INTO public.notifications
      (user_id, actor_id, type, post_id, track_index, comment_id, timestamp_ms, snippet)
    VALUES
      (target_id, NEW.author_id, 'mention_track_comment', NEW.post_id, NEW.track_index, NEW.id, NEW.timestamp_ms, left(NEW.content, 200));
  END LOOP;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER track_comments_mention_notify
AFTER INSERT ON public.track_comments
FOR EACH ROW
EXECUTE FUNCTION public.create_track_mention_notifications();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
