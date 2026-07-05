/*
# Reaction count triggers

This migration:
1. Makes created_by nullable to allow system-generated polls
2. Adds a trigger to update comment like/dislike counts

## Changes:
- Alters polls.created_by to be nullable
- Creates `update_comment_reaction_counts()` function
- Adds triggers for INSERT and DELETE on comment_reactions

## Notes:
1. The reaction function handles both 'like' and 'dislike' types
2. System polls have NULL created_by to indicate they're not user-owned
*/

-- Make created_by nullable for system polls
ALTER TABLE polls ALTER COLUMN created_by DROP NOT NULL;

-- Function to update comment reaction counts
CREATE OR REPLACE FUNCTION update_comment_reaction_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reaction = 'like' THEN
      UPDATE comments SET likes = likes + 1 WHERE id = NEW.comment_id;
    ELSIF NEW.reaction = 'dislike' THEN
      UPDATE comments SET dislikes = dislikes + 1 WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.reaction = 'like' THEN
      UPDATE comments SET likes = GREATEST(0, likes - 1) WHERE id = OLD.comment_id;
    ELSIF OLD.reaction = 'dislike' THEN
      UPDATE comments SET dislikes = GREATEST(0, dislikes - 1) WHERE id = OLD.comment_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for inserts
DROP TRIGGER IF EXISTS reaction_insert_trigger ON comment_reactions;
CREATE TRIGGER reaction_insert_trigger
  AFTER INSERT ON comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_reaction_counts();

-- Trigger for deletes
DROP TRIGGER IF EXISTS reaction_delete_trigger ON comment_reactions;
CREATE TRIGGER reaction_delete_trigger
  AFTER DELETE ON comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_reaction_counts();
