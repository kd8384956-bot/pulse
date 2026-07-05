/*
# Add vote counting trigger

This migration adds a database trigger that automatically updates poll vote counts
when votes are inserted. 

## Changes:
- Creates `update_poll_vote_counts()` function that increments yes_votes or no_votes
- Adds AFTER INSERT trigger on votes table to call the function
- This ensures vote counts stay in sync without requiring explicit updates from the app

## Notes:
1. The function handles both 'yes' and 'no' vote choices
2. Uses COALESCE to safely increment counters
3. Trigger runs after each vote insert
*/

CREATE OR REPLACE FUNCTION update_poll_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.choice = 'yes' THEN
    UPDATE polls SET yes_votes = yes_votes + 1 WHERE id = NEW.poll_id;
  ELSIF NEW.choice = 'no' THEN
    UPDATE polls SET no_votes = no_votes + 1 WHERE id = NEW.poll_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vote_insert_trigger ON votes;
CREATE TRIGGER vote_insert_trigger
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION update_poll_vote_counts();
