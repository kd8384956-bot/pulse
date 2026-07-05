/*
# Moderate comments in the database

The app blocks unsuitable comments before posting. This trigger adds the same
guard in Supabase so direct API calls cannot bypass the browser check.
*/

CREATE OR REPLACE FUNCTION reject_inappropriate_comment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_text text;
BEGIN
  normalized_text := lower(coalesce(NEW.text, ''));

  IF length(trim(normalized_text)) < 3 THEN
    RAISE EXCEPTION 'Comment is too short.';
  END IF;

  IF length(normalized_text) > 600 THEN
    RAISE EXCEPTION 'Comment is too long.';
  END IF;

  IF normalized_text ~ '(fuck|shit|bitch|asshole|dick|pussy|boobs|nude|sex|porn|rape|slut|whore|horny|kill yourself)' THEN
    RAISE EXCEPTION 'Please keep comments respectful and suitable for everyone.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderate_comments_trigger ON comments;

CREATE TRIGGER moderate_comments_trigger
  BEFORE INSERT OR UPDATE OF text ON comments
  FOR EACH ROW
  EXECUTE FUNCTION reject_inappropriate_comment();
