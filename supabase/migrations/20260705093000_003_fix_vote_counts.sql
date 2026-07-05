/*
# Fix vote counts as database-owned state

The app inserts rows into `votes`, and the database owns the cached counters on
`polls`. Because `polls` has RLS enabled and normal voters are not poll owners,
the old trigger could fail to update `yes_votes` / `no_votes`. This function runs
as the table owner and recalculates counts from the `votes` table every time a
vote changes, so refreshes and other devices see the same numbers.
*/

CREATE OR REPLACE FUNCTION refresh_poll_vote_counts(target_poll_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE polls
  SET
    yes_votes = (
      SELECT count(*)::integer
      FROM votes
      WHERE poll_id = target_poll_id AND choice = 'yes'
    ),
    no_votes = (
      SELECT count(*)::integer
      FROM votes
      WHERE poll_id = target_poll_id AND choice = 'no'
    )
  WHERE id = target_poll_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_poll_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_poll_vote_counts(OLD.poll_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_poll_vote_counts(NEW.poll_id);

  IF TG_OP = 'UPDATE' AND OLD.poll_id <> NEW.poll_id THEN
    PERFORM refresh_poll_vote_counts(OLD.poll_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vote_insert_trigger ON votes;
DROP TRIGGER IF EXISTS vote_count_trigger ON votes;

CREATE TRIGGER vote_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION update_poll_vote_counts();

UPDATE polls
SET
  yes_votes = (
    SELECT count(*)::integer
    FROM votes
    WHERE votes.poll_id = polls.id AND votes.choice = 'yes'
  ),
  no_votes = (
    SELECT count(*)::integer
    FROM votes
    WHERE votes.poll_id = polls.id AND votes.choice = 'no'
  );
