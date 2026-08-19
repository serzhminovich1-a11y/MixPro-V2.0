-- Reposts: a repost is just another row in `posts` pointing back at the
-- post it reposts, reusing the whole existing wall/feed/likes/comments
-- infrastructure instead of a parallel system. ON DELETE SET NULL (not
-- CASCADE) so deleting the original doesn't silently wipe out someone
-- else's repost — it just becomes an "original post deleted" state,
-- same convention as everywhere else in this schema that references
-- user content.
--
-- No RLS/grant changes needed: `posts` already has table-level
-- GRANT SELECT/INSERT/DELETE (not column-restricted), and the existing
-- INSERT policy only checks `author_id = auth.uid()`, which a repost
-- row satisfies exactly like any other post.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS repost_of uuid REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON public.posts(repost_of) WHERE repost_of IS NOT NULL;
