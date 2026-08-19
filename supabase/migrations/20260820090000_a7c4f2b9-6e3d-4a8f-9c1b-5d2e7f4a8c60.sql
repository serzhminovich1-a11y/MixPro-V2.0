-- Profile personalization: banner image, accent color, display font — a
-- "showcase" profile needs to look like the person's own, not a template.
-- accent_color/display_font are IDs into a fixed, curated set the client
-- validates against (see src/lib/profile-customization.ts) — never
-- arbitrary CSS, so there's no way to end up with an unreadable profile
-- (white text on white) or a font that isn't already self-hosted.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accent_color text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_font text;

-- profiles UPDATE is column-scoped (20260802120000 locked it down after a
-- blanket GRANT let any authenticated user edit privileged columns like xp
-- or subscription_tier on their own row) — column privilege grants are
-- additive, so this just adds these three to what self-service editing
-- already covers (username/avatar_url/bio/full_name/socials), without
-- touching anything else.
GRANT UPDATE (banner_url, accent_color, display_font) ON public.profiles TO authenticated;

-- Explicit SELECT grant too, belt-and-suspenders: getProfileByUsername
-- (public.functions.ts) already carries a scar from subscription_tier
-- silently 404-ing every public profile page because it turned out to
-- need its own column-level SELECT grant despite the table's blanket
-- `GRANT SELECT ON profiles` from the very first migration — never fully
-- explained, but cheap to just cover explicitly here rather than risk
-- the same failure mode on three new columns that need to be publicly
-- visible for this to be worth building at all.
GRANT SELECT (banner_url, accent_color, display_font) ON public.profiles TO anon, authenticated;
