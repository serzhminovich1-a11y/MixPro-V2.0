-- `posts`/`post_comments` got an `is_hidden` column + moderator hide policy
-- in 20260803090000, but the original SELECT policy ("Posts/Comments are
-- publicly readable" USING (true)) was never tightened. `getPosts` filters
-- is_hidden client-side for the main feed, but that's app-level only —
-- anyone querying `posts`/`post_comments` directly (e.g. src/routes/_authenticated/post.$postId.tsx,
-- which fetches by id with no is_hidden check) could still fully view and
-- play a moderator-hidden post's tracks. Match the forum_threads/forum_replies
-- pattern: hidden rows are visible only to the author and moderators.
DROP POLICY IF EXISTS "Posts are publicly readable" ON public.posts;
CREATE POLICY "Posts visible" ON public.posts FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());

DROP POLICY IF EXISTS "Comments are publicly readable" ON public.post_comments;
CREATE POLICY "Comments visible" ON public.post_comments FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
