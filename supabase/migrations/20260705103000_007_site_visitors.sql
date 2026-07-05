-- Site visitor counter used by the public live stats strip.
CREATE TABLE IF NOT EXISTS site_visitors (
  visitor_id text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_visitors_select_public" ON site_visitors;
CREATE POLICY "site_visitors_select_public" ON site_visitors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "site_visitors_insert_public" ON site_visitors;
CREATE POLICY "site_visitors_insert_public" ON site_visitors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "site_visitors_update_public" ON site_visitors;
CREATE POLICY "site_visitors_update_public" ON site_visitors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_site_visitors_last_seen_at ON site_visitors(last_seen_at DESC);
