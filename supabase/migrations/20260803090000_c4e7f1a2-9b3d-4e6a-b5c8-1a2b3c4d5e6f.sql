-- Forum improvements: pin/lock, feed moderation, reply notifications.
--
-- 1) `forum_threads`/`forum_replies` already have an "author or moderator"
--    UPDATE policy — but it's row-scoped only, not column-scoped, so a
--    thread's own author could already self-pin, self-unlock, or
--    self-unhide via a direct client `.update()` call (same shape of bug as
--    the `profiles` one fixed in 20260802120000). A BEFORE UPDATE trigger is
--    used instead of column grants here because column grants can't express
--    "only when can_moderate()" — they apply to the whole `authenticated`
--    role regardless of row.
CREATE OR REPLACE FUNCTION public.protect_forum_thread_mod_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_moderate(auth.uid()) THEN
    IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
       OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
       OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN
      RAISE EXCEPTION 'Только модератор может менять pin/lock/hide';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forum_threads_protect_mod_fields
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.protect_forum_thread_mod_fields();

CREATE OR REPLACE FUNCTION public.protect_forum_reply_mod_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_moderate(auth.uid()) THEN
    IF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN
      RAISE EXCEPTION 'Только модератор может менять hide';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forum_replies_protect_mod_fields
  BEFORE UPDATE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.protect_forum_reply_mod_fields();

-- 2) `posts`/`post_comments` had no moderation path at all — a reported
--    post/comment couldn't be hidden OR deleted by a moderator (only the
--    author could delete their own). Add is_hidden + a moderator UPDATE
--    policy, mirroring the forum_threads/forum_replies shape.
ALTER TABLE public.posts ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.post_comments ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

CREATE POLICY "Moderators hide posts" ON public.posts FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));
CREATE POLICY "Moderators hide comments" ON public.post_comments FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

-- 3) Notify a thread's author when someone replies (skip self-replies).
--    Reuses the existing `notifications` table/UI (post_id/comment_id were
--    shaped for the track-comment-mention feature); add a dedicated
--    thread_id column rather than overloading post_id for clarity.
ALTER TABLE public.notifications ADD COLUMN thread_id uuid;

CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_author uuid;
BEGIN
  SELECT author_id INTO thread_author FROM public.forum_threads WHERE id = NEW.thread_id;
  IF thread_author IS NOT NULL AND thread_author <> NEW.author_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, thread_id, comment_id, snippet)
    VALUES (thread_author, NEW.author_id, 'forum_reply', NEW.thread_id, NEW.id, left(NEW.content, 200));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forum_replies_notify
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_forum_reply();
