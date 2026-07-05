/*
# Comment reports

Users can report unsuitable comments once. When a comment reaches 10 reports,
Supabase hides it from the public comment feed.
*/

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_reports_select_own" ON comment_reports;
CREATE POLICY "comment_reports_select_own" ON comment_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_reports_insert_authenticated" ON comment_reports;
CREATE POLICY "comment_reports_insert_authenticated" ON comment_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_select_public" ON comments;
CREATE POLICY "comments_select_public" ON comments FOR SELECT
  TO anon, authenticated USING (is_hidden = false);

CREATE OR REPLACE FUNCTION refresh_comment_report_count(target_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reports integer;
BEGIN
  SELECT count(*)::integer
  INTO reports
  FROM comment_reports
  WHERE comment_id = target_comment_id;

  UPDATE comments
  SET
    report_count = reports,
    is_hidden = reports >= 10
  WHERE id = target_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_comment_report_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_comment_report_count(OLD.comment_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_comment_report_count(NEW.comment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_report_count_trigger ON comment_reports;

CREATE TRIGGER comment_report_count_trigger
  AFTER INSERT OR DELETE ON comment_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_report_count();

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_user_id ON comment_reports(user_id);

UPDATE comments
SET report_count = report_totals.reports,
    is_hidden = report_totals.reports >= 10
FROM (
  SELECT comments.id, count(comment_reports.id)::integer AS reports
  FROM comments
  LEFT JOIN comment_reports ON comment_reports.comment_id = comments.id
  GROUP BY comments.id
) AS report_totals
WHERE comments.id = report_totals.id;
