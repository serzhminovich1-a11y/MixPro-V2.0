-- Merch shop — catalog only, no real payment (matches how subscriptions
-- already work: "Оформить подписку" hands off to Telegram support rather
-- than a checkout). price_label is display text, not a numeric charge.

CREATE TABLE public.merch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  price_label text NOT NULL DEFAULT '',
  category text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.merch_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merch_items TO authenticated;
GRANT ALL ON public.merch_items TO service_role;
ALTER TABLE public.merch_items ENABLE ROW LEVEL SECURITY;

-- Visitors see active items; moderators+ also see inactive ones (so the
-- admin page can manage drafts before publishing).
CREATE POLICY "Merch visible" ON public.merch_items FOR SELECT
  USING (is_active = true OR public.can_moderate(auth.uid()));

CREATE POLICY "Moderators create merch" ON public.merch_items FOR INSERT TO authenticated
  WITH CHECK (public.can_moderate(auth.uid()));
CREATE POLICY "Moderators update merch" ON public.merch_items FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));
CREATE POLICY "Moderators delete merch" ON public.merch_items FOR DELETE TO authenticated
  USING (public.can_moderate(auth.uid()));
