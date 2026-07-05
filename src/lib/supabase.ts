import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  name: string
  created_at: string
  reputation: number
}

export type Poll = {
  id: string
  question: string
  yes_label: string
  no_label: string
  category: string
  yes_votes: number
  no_votes: number
  ends_at: string
  created_by: string
  created_at: string
  is_active: boolean
  profiles?: Profile
}

export type Vote = {
  id: string
  poll_id: string
  user_id: string
  choice: 'yes' | 'no'
  created_at: string
}

export type Comment = {
  id: string
  poll_id: string
  user_id: string
  side: 'yes' | 'no'
  text: string
  likes: number
  dislikes: number
  report_count?: number
  is_hidden?: boolean
  created_at: string
  profiles?: Profile
  userReaction?: 'like' | 'dislike' | null
  userReported?: boolean
}

export type SavedPoll = {
  id: string
  poll_id: string
  user_id: string
  created_at: string
}

export type CommentReaction = {
  id: string
  comment_id: string
  user_id: string
  reaction: 'like' | 'dislike'
}

export type CommentReport = {
  id: string
  comment_id: string
  user_id: string
  created_at: string
}
