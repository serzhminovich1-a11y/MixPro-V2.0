-- Follows + direct messages. Neither existed before — public profile
-- pages had no "Подписаться"/"Написать сообщение" because there was
-- nothing behind them.

-- ── Follows ──────────────────────────────────────────────────────────────
CREATE TABLE public.user_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX user_follows_followed_idx ON public.user_follows (followed_id);

GRANT SELECT ON public.user_follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;
GRANT ALL ON public.user_follows TO service_role;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

-- Counts/"do I follow them" need to be publicly readable (shown on public
-- profile pages, including to logged-out visitors) — same shape as
-- user_certifications_public_read.
CREATE POLICY "follows_public_read" ON public.user_follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_self" ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid() AND public.is_banned(auth.uid()) = false);
CREATE POLICY "follows_delete_self" ON public.user_follows FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.followed_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_follows_notify
  AFTER INSERT ON public.user_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

-- ── Direct messages ──────────────────────────────────────────────────────
-- One thread per unordered pair of users. user_a/user_b are always stored
-- least-first (see get_or_create_dm_thread) so (a,b) and (b,a) can't both
-- exist — a plain UNIQUE(user_a, user_b) can't express "unordered pair"
-- on its own.
CREATE TABLE public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
CREATE INDEX dm_threads_user_a_idx ON public.dm_threads (user_a, last_message_at DESC);
CREATE INDEX dm_threads_user_b_idx ON public.dm_threads (user_b, last_message_at DESC);

GRANT SELECT ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_threads_participants_read" ON public.dm_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);
-- No direct INSERT grant — threads are only ever created through
-- get_or_create_dm_thread() below, which normalizes the (user_a, user_b)
-- ordering. A client-side insert could violate the `user_a < user_b`
-- invariant and silently create a duplicate thread for the same pair.

CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dm_messages_thread_idx ON public.dm_messages (thread_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.dm_messages TO authenticated;
GRANT ALL ON public.dm_messages TO service_role;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_messages_participants_read" ON public.dm_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
  ));
CREATE POLICY "dm_messages_participants_send" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_banned(auth.uid()) = false
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
    )
  );
-- Mark-as-read: the recipient (not the sender) flips is_read on the other
-- side's messages when they open the thread.
CREATE POLICY "dm_messages_participants_mark_read" ON public.dm_messages FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
    )
  )
  WITH CHECK (sender_id <> auth.uid());

CREATE OR REPLACE FUNCTION public.touch_dm_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  UPDATE public.dm_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  SELECT (CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END) INTO recipient
    FROM public.dm_threads WHERE id = NEW.thread_id;
  IF recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, actor_id, type, thread_id, snippet)
    VALUES (recipient, NEW.sender_id, 'dm', NEW.thread_id, left(NEW.content, 200));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dm_messages_touch_thread
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_dm_thread();

-- Find-or-create a thread with `_other`, normalizing pair order. Also
-- doubles as the one legitimate way to create a thread at all (see the
-- missing INSERT grant on dm_threads above).
CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _a uuid;
  _b uuid;
  _id uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;
  IF _other = _me THEN
    RAISE EXCEPTION 'Нельзя написать самому себе';
  END IF;
  IF public.is_banned(_me) THEN
    RAISE EXCEPTION 'Недоступно';
  END IF;
  _a := LEAST(_me, _other);
  _b := GREATEST(_me, _other);
  INSERT INTO public.dm_threads (user_a, user_b) VALUES (_a, _b)
    ON CONFLICT (user_a, user_b) DO NOTHING;
  SELECT id INTO _id FROM public.dm_threads WHERE user_a = _a AND user_b = _b;
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_thread(uuid) TO authenticated;
