/*
# Update polls RLS policy for system polls

This migration updates the polls INSERT policy to allow system polls
(created_by = NULL) as well as user-created polls.

## Changes:
- Drops and recreates the polls INSERT policy to check for either 
  NULL created_by (system poll) or matching user ID
- This allows the seed polls to exist and new system polls to be created

## Notes:
1. Users can still only create polls with their own user_id
2. System polls have NULL created_by and are readable by all
*/

DROP POLICY IF EXISTS "polls_insert_authenticated" ON polls;
CREATE POLICY "polls_insert_authenticated" ON polls FOR INSERT
  TO authenticated WITH CHECK (created_by IS NULL OR auth.uid() = created_by);
