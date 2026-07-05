/*
# PULSE - Live Global Opinion Exchange Schema

This migration creates the core database schema for PULSE, a real-time opinion polling platform.

## Tables Created:

1. `profiles`
   - `id` (uuid, primary key, references auth.users)
   - `name` (text, display name)
   - `created_at` (timestamp)
   - `reputation` (integer, default 0)
   - Extends Supabase auth.users for user profiles

2. `polls`
   - `id` (uuid, primary key)
   - `question` (text, the poll question)
   - `yes_label` (text, default 'YES')
   - `no_label` (text, default 'NO')
   - `category` (text, poll category)
   - `yes_votes` (integer, count of yes votes)
   - `no_votes` (integer, count of no votes)
   - `ends_at` (timestamp, when poll ends)
   - `created_by` (uuid, references profiles.id, defaults to auth.uid())
   - `created_at` (timestamp)
   - `is_active` (boolean, whether poll is still active)

3. `votes`
   - `id` (uuid, primary key)
   - `poll_id` (uuid, references polls)
   - `user_id` (uuid, references profiles, defaults to auth.uid())
   - `choice` (text, 'yes' or 'no')
   - `created_at` (timestamp)
   - Unique constraint on (poll_id, user_id) - one vote per user per poll

4. `comments`
   - `id` (uuid, primary key)
   - `poll_id` (uuid, references polls)
   - `user_id` (uuid, references profiles, defaults to auth.uid())
   - `side` (text, 'yes' or 'no')
   - `text` (text, comment content)
   - `likes` (integer, default 0)
   - `dislikes` (integer, default 0)
   - `created_at` (timestamp)

5. `saved_polls`
   - `id` (uuid, primary key)
   - `poll_id` (uuid, references polls)
   - `user_id` (uuid, references profiles, defaults to auth.uid())
   - `created_at` (timestamp)
   - Unique constraint on (poll_id, user_id)

6. `comment_reactions`
   - `id` (uuid, primary key)
   - `comment_id` (uuid, references comments)
   - `user_id` (uuid, references profiles, defaults to auth.uid())
   - `reaction` (text, 'like' or 'dislike')
   - Unique constraint on (comment_id, user_id)

## Security (RLS):
- All tables have RLS enabled
- Owner-scoped policies using auth.uid() for user-specific data
- Public read access for polls (anyone can view polls)
- Only authenticated users can vote, comment, save

## Notes:
1. The `created_by` column on polls defaults to auth.uid() so inserts work without passing user_id
2. Votes have a unique constraint to prevent duplicate voting
3. Poll categories are stored as text for flexibility
*/

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  reputation integer DEFAULT 0
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Polls table
CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  yes_label text NOT NULL DEFAULT 'YES',
  no_label text NOT NULL DEFAULT 'NO',
  category text NOT NULL DEFAULT 'Technology',
  yes_votes integer NOT NULL DEFAULT 0,
  no_votes integer NOT NULL DEFAULT 0,
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

-- Anyone can view active polls
DROP POLICY IF EXISTS "polls_select_public" ON polls;
CREATE POLICY "polls_select_public" ON polls FOR SELECT
  TO anon, authenticated USING (true);

-- Authenticated users can create polls
DROP POLICY IF EXISTS "polls_insert_authenticated" ON polls;
CREATE POLICY "polls_insert_authenticated" ON polls FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

-- Only owner can update their polls
DROP POLICY IF EXISTS "polls_update_own" ON polls;
CREATE POLICY "polls_update_own" ON polls FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Only owner can delete their polls
DROP POLICY IF EXISTS "polls_delete_own" ON polls;
CREATE POLICY "polls_delete_own" ON polls FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('yes', 'no')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE votes ENABLE Row Level Security;

-- Anyone can view votes (for counting)
DROP POLICY IF EXISTS "votes_select_public" ON votes;
CREATE POLICY "votes_select_public" ON votes FOR SELECT
  TO anon, authenticated USING (true);

-- Authenticated users can vote
DROP POLICY IF EXISTS "votes_insert_authenticated" ON votes;
CREATE POLICY "votes_insert_authenticated" ON votes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own vote
DROP POLICY IF EXISTS "votes_delete_own" ON votes;
CREATE POLICY "votes_delete_own" ON votes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('yes', 'no')),
  text text NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  dislikes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL Security;

-- Anyone can view comments
DROP POLICY IF EXISTS "comments_select_public" ON comments;
CREATE POLICY "comments_select_public" ON comments FOR SELECT
  TO anon, authenticated USING (true);

-- Authenticated users can create comments
DROP POLICY IF EXISTS "comments_insert_authenticated" ON comments;
CREATE POLICY "comments_insert_authenticated" ON comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own comments
DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Saved polls table
CREATE TABLE IF NOT EXISTS saved_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE saved_polls ENABLE Row Level Security;

-- Users can only see their own saved polls
DROP POLICY IF EXISTS "saved_polls_select_own" ON saved_polls;
CREATE POLICY "saved_polls_select_own" ON saved_polls FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can save polls
DROP POLICY IF EXISTS "saved_polls_insert_own" ON saved_polls;
CREATE POLICY "saved_polls_insert_own" ON saved_polls FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can unsave their saved polls
DROP POLICY IF EXISTS "saved_polls_delete_own" ON saved_polls;
CREATE POLICY "saved_polls_delete_own" ON saved_polls FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Comment reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like', 'dislike')),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE comment_reactions ENABLE ROW Level Security;

-- Users can view all reactions
DROP POLICY IF EXISTS "comment_reactions_select_public" ON comment_reactions;
CREATE POLICY "comment_reactions_select_public" ON comment_reactions FOR SELECT
  TO anon, authenticated USING (true);

-- Users can create reactions
DROP POLICY IF EXISTS "comment_reactions_insert_authenticated" ON comment_reactions;
CREATE POLICY "comment_reactions_insert_authenticated" ON comment_reactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
DROP POLICY IF EXISTS "comment_reactions_delete_own" ON comment_reactions;
CREATE POLICY "comment_reactions_delete_own" ON comment_reactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_polls_category ON polls(category);
CREATE INDEX IF NOT EXISTS idx_polls_created_at ON polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);
CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_poll_id ON comments(poll_id);
CREATE INDEX IF NOT EXISTS idx_saved_polls_user_id ON saved_polls(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
