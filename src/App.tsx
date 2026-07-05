import { useState, useEffect, useCallback } from 'react'
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { supabase, Poll, Comment, Profile } from '@/lib/supabase'
import Globe from '@/components/Globe'

type View = 'home' | 'poll' | 'create' | 'profile' | 'saved' | 'search'

const CATEGORIES = [
  'Technology', 'Politics', 'Sports', 'Movies', 'Science', 'Gaming', 'Business', 'Education'
]

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString()
}

function getPercent(yes: number, no: number): { y: number; n: number } {
  const total = yes + no
  if (total === 0) return { y: 50, n: 50 }
  return { y: Math.round(yes / total * 100), n: Math.round(no / total * 100) }
}

function getTimeRemaining(endsAt: string): string {
  const now = new Date()
  const ends = new Date(endsAt)
  const diff = ends.getTime() - now.getTime()

  if (diff <= 0) return 'Ended'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  return `${days}d`
}

function AppContent() {
  const { user, profile, loading, signIn, signUp, signOut } = useAuth()
  const [view, setView] = useState<View>('home')
  const [polls, setPolls] = useState<Poll[]>([])
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, 'yes' | 'no'>>({})
  const [savedPollIds, setSavedPollIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCategory, setSearchCategory] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [toast, setToast] = useState('')
  const [feedItems, setFeedItems] = useState<{ text: string; side: 'yes' | 'no' }[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [visitorCount, setVisitorCount] = useState(0)
  const [visitorStatus, setVisitorStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [commentSort, setCommentSort] = useState<'helpful' | 'newest'>('helpful')
  const [globeRef, setGlobeRef] = useState<{ spawnArc: (side: 'yes' | 'no') => void } | null>(null)

  // Auth form state
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }, [])

  // Fetch polls
  const fetchPolls = useCallback(async () => {
    const { data } = await supabase
      .from('polls')
      .select('*, profiles!polls_created_by_fkey(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (data) {
      setPolls(data as Poll[])
    }
  }, [])

  // Fetch user's votes
  const fetchUserVotes = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('votes')
      .select('poll_id, choice')
      .eq('user_id', user.id)

    if (data) {
      const votes: Record<string, 'yes' | 'no'> = {}
      data.forEach(v => votes[v.poll_id] = v.choice)
      setUserVotes(votes)
    }
  }, [user])

  // Fetch user's saved polls
  const fetchSavedPolls = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('saved_polls')
      .select('poll_id')
      .eq('user_id', user.id)

    if (data) {
      setSavedPollIds(new Set(data.map(s => s.poll_id)))
    }
  }, [user])

  const fetchVisitorCount = useCallback(async () => {
    const { count, error } = await supabase
      .from('site_visitors')
      .select('visitor_id', { count: 'exact', head: true })

    if (error) {
      console.warn('Visitor count is not available yet:', error.message)
      setVisitorStatus('error')
      return
    }

    if (typeof count === 'number') {
      setVisitorCount(count)
      setVisitorStatus('ready')
    }
  }, [])

  const recordVisitor = useCallback(async () => {
    const storageKey = 'pulse_visitor_id'
    let visitorId = localStorage.getItem(storageKey)

    if (!visitorId) {
      visitorId = crypto.randomUUID()
      localStorage.setItem(storageKey, visitorId)
    }

    const { error } = await supabase
      .from('site_visitors')
      .upsert(
        { visitor_id: visitorId, last_seen_at: new Date().toISOString() },
        { onConflict: 'visitor_id' }
      )

    if (error) {
      console.warn('Visitor tracking is not available yet:', error.message)
      setVisitorStatus('error')
      return
    }

    fetchVisitorCount()
  }, [fetchVisitorCount])

  // Fetch comments for a poll
  const fetchComments = useCallback(async (pollId: string) => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles!comments_user_id_fkey(*)')
      .eq('poll_id', pollId)
      .order('created_at', { ascending: false })

    if (data) {
      // Fetch user's reactions
      let commentsWithReactions = data as Comment[]
      if (user) {
        const { data: reactions } = await supabase
          .from('comment_reactions')
          .select('comment_id, reaction')
          .eq('user_id', user.id)

        if (reactions) {
          const reactionMap = new Map(reactions.map(r => [r.comment_id, r.reaction as 'like' | 'dislike']))
          commentsWithReactions = data.map(c => ({
            ...c,
            userReaction: reactionMap.get(c.id) || null
          }))
        }
      }
      setComments(commentsWithReactions)
    }
  }, [user])

  // Initial fetch (also re-runs on login/logout, since fetchUserVotes/fetchSavedPolls
  // change identity whenever `user` changes)
  useEffect(() => {
    fetchPolls()
    fetchUserVotes()
    fetchSavedPolls()
  }, [fetchPolls, fetchUserVotes, fetchSavedPolls])

  useEffect(() => {
    recordVisitor()
  }, [recordVisitor])

  // FIX: clear personal vote/save state on logout.
  // fetchUserVotes/fetchSavedPolls both early-return when `user` is null, so without
  // this effect the previous session's votes and saved polls would linger in state
  // after signing out (stale "you voted" badges, stale bookmarks, etc).
  useEffect(() => {
    if (!user) {
      setUserVotes({})
      setSavedPollIds(new Set())
    }
  }, [user])

  // Calculate total votes from polls
  useEffect(() => {
    const total = polls.reduce((sum, p) => sum + p.yes_votes + p.no_votes, 0)
    setTotalVotes(total)
  }, [polls])

  // Real-time subscriptions
  useEffect(() => {
    const pollsChannel = supabase
      .channel('polls-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
        fetchPolls()
      })
      .subscribe()

    const votesChannel = supabase
      .channel('votes-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        const vote = payload.new as { poll_id: string; user_id: string; choice: 'yes' | 'no' }
        // The DB trigger updates poll counts; the polls channel refetches accurate totals.
        globeRef?.spawnArc(vote.choice)

        const isSelf = vote.user_id && userRef.current?.id && vote.user_id === userRef.current.id
        pushFeedEvent(
          isSelf
            ? `You voted ${vote.choice.toUpperCase()}`
            : `Someone voted ${vote.choice.toUpperCase()}`,
          vote.choice
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(pollsChannel)
      supabase.removeChannel(votesChannel)
    }
  }, [fetchPolls, globeRef, user])

  const pushFeedEvent = useCallback((text: string, side: 'yes' | 'no') => {
    setFeedItems(prev => [{ text, side }, ...prev.slice(0, 7)])
  }, [])

  // Re-fetch a single poll row from the DB and patch it into state.
  // Used after voting to guarantee the displayed count matches Supabase,
  // correcting any drift instead of relying only on the optimistic update.
  const refetchPoll = useCallback(async (pollId: string) => {
    const { data: updatedPoll, error } = await supabase
      .from('polls')
      .select('*, profiles!polls_created_by_fkey(*)')
      .eq('id', pollId)
      .single()

    if (error) {
      console.error('refetchPoll error', error)
      return null
    }

    if (updatedPoll) {
      setPolls(prev => prev.map(p => (p.id === updatedPoll.id ? (updatedPoll as Poll) : p)))
    }
    return updatedPoll
  }, [])

  const navigateTo = (v: View, poll?: Poll) => {
    setView(v)
    if (v === 'poll' && poll) {
      setActivePoll(poll)
      fetchComments(poll.id)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleVote = async (poll: Poll, choice: 'yes' | 'no') => {
    if (!user) {
      setPendingAction(() => handleVote(poll, choice))
      setShowAuthModal(true)
      return
    }

    if (userVotes[poll.id]) return

    // Optimistic update
    setUserVotes(prev => ({ ...prev, [poll.id]: choice }))
    setPolls(prev => prev.map(p => {
      if (p.id === poll.id) {
        return {
          ...p,
          yes_votes: choice === 'yes' ? p.yes_votes + 1 : p.yes_votes,
          no_votes: choice === 'no' ? p.no_votes + 1 : p.no_votes
        }
      }
      return p
    }))

    const { error } = await supabase
      .from('votes')
      .insert({ poll_id: poll.id, user_id: user.id, choice })

    if (error) {
      showToast('Failed to record vote')
      setUserVotes(prev => {
        const copy = { ...prev }
        delete copy[poll.id]
        return copy
      })
    } else {
      showToast('Vote counted')
      globeRef?.spawnArc(choice)
      pushFeedEvent(`You voted ${choice.toUpperCase()}`, choice)
      // Correct the optimistic count with the authoritative DB row
      // (covers the DB trigger applying differently than our local +1 guess).
      refetchPoll(poll.id)
    }
  }

  const handleSave = async (pollId: string) => {
    if (!user) {
      setPendingAction(() => handleSave(pollId))
      setShowAuthModal(true)
      return
    }

    if (savedPollIds.has(pollId)) {
      await supabase.from('saved_polls').delete().match({ poll_id: pollId, user_id: user.id })
      setSavedPollIds(prev => {
        const copy = new Set(prev)
        copy.delete(pollId)
        return copy
      })
      showToast('Removed from saved')
    } else {
      await supabase.from('saved_polls').insert({ poll_id: pollId, user_id: user.id })
      setSavedPollIds(prev => new Set([...prev, pollId]))
      showToast('Saved to your list')
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

    if (authMode === 'login') {
      const { error } = await signIn(authEmail, authPassword)
      if (error) {
        setAuthError(error)
      } else {
        setShowAuthModal(false)
        setAuthEmail('')
        setAuthPassword('')
        showToast('Welcome back!')
        if (pendingAction) {
          pendingAction()
          setPendingAction(null)
        }
      }
    } else {
      if (authPassword.length < 6) {
        setAuthError('Password must be at least 6 characters')
        return
      }
      if (!authName.trim()) {
        setAuthError('Please enter a display name')
        return
      }
      const { error } = await signUp(authEmail, authPassword, authName.trim())
      if (error) {
        setAuthError(error)
      } else {
        setShowAuthModal(false)
        setAuthEmail('')
        setAuthPassword('')
        setAuthName('')
        showToast('Account created!')
        if (pendingAction) {
          pendingAction()
          setPendingAction(null)
        }
      }
    }
  }

  const handleReact = async (commentId: string, reaction: 'like' | 'dislike', currentReaction: 'like' | 'dislike' | null) => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    if (currentReaction === reaction) {
      // Remove reaction
      await supabase.from('comment_reactions').delete().match({ comment_id: commentId, user_id: user.id })
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            [reaction === 'like' ? 'likes' : 'dislikes']: c[reaction === 'like' ? 'likes' : 'dislikes'] - 1,
            userReaction: null
          }
        }
        return c
      }))
    } else {
      // Add or change reaction
      if (currentReaction) {
        await supabase.from('comment_reactions').delete().match({ comment_id: commentId, user_id: user.id })
        await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: user.id, reaction })
        setComments(prev => prev.map(c => {
          if (c.id === commentId) {
            return {
              ...c,
              likes: reaction === 'like' ? c.likes + 1 : c.likes - (currentReaction === 'like' ? 1 : 0),
              dislikes: reaction === 'dislike' ? c.dislikes + 1 : c.dislikes - (currentReaction === 'dislike' ? 1 : 0),
              userReaction: reaction
            }
          }
          return c
        }))
      } else {
        await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: user.id, reaction })
        setComments(prev => prev.map(c => {
          if (c.id === commentId) {
            return {
              ...c,
              [reaction === 'like' ? 'likes' : 'dislikes']: c[reaction === 'like' ? 'likes' : 'dislikes'] + 1,
              userReaction: reaction
            }
          }
          return c
        }))
      }
    }
  }

  const handlePostComment = async (pollId: string, text: string, side: 'yes' | 'no') => {
    if (!user || !text.trim()) return

    const { data } = await supabase
      .from('comments')
      .insert({
        poll_id: pollId,
        user_id: user.id,
        side,
        text: text.trim()
      })
      .select('*, profiles!comments_user_id_fkey(*)')
      .single()

    if (data) {
      setComments(prev => [{ ...data, userReaction: null } as Comment, ...prev])
      showToast('Comment posted')
    }
  }

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      setShowAuthModal(true)
      return
    }

    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const question = formData.get('question') as string
    const yesLabel = formData.get('yesLabel') as string || 'YES'
    const noLabel = formData.get('noLabel') as string || 'NO'
    const category = formData.get('category') as string
    const duration = parseInt(formData.get('duration') as string, 10)

    if (!question.trim()) {
      showToast('Enter a question')
      return
    }

    const endsAt = new Date()
    endsAt.setHours(endsAt.getHours() + duration)

    const { data } = await supabase
      .from('polls')
      .insert({
        question: question.trim(),
        yes_label: yesLabel.trim(),
        no_label: noLabel.trim(),
        category,
        ends_at: endsAt.toISOString(),
        created_by: user.id
      })
      .select()
      .single()

    if (data) {
      showToast('Poll created!')
      form.reset()
      fetchPolls()
      navigateTo('poll', data as Poll)
    } else {
      showToast('Failed to create poll')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setSearchCategory(false)
      navigateTo('search')
    }
  }

  const filteredPolls = searchCategory
    ? polls.filter(p => p.category.toLowerCase() === searchQuery.toLowerCase())
    : polls.filter(p =>
      p.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
    )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--signal)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className="grid-overlay" />
      <div className="scanline" />

      {/* Header */}
      <Header
        user={user}
        profile={profile}
        onLogin={() => { setAuthMode('login'); setShowAuthModal(true) }}
        onLogout={signOut}
        onNavigate={navigateTo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        onCreatePoll={() => {
          if (!user) {
            setPendingAction(() => navigateTo('create'))
            setAuthMode('login')
            setShowAuthModal(true)
          } else {
            navigateTo('create')
          }
        }}
      />

      {/* Live stats strip */}
      <LiveStatsStrip
        totalVotes={totalVotes}
        pollsCount={polls.length}
        visitorCount={visitorCount}
        visitorStatus={visitorStatus}
      />

      {/* Main content */}
      {view === 'home' && (
        <HomeView
          polls={polls}
          savedPollIds={savedPollIds}
          onNavigate={navigateTo}
          onSave={handleSave}
          feedItems={feedItems}
          onGlobeReady={setGlobeRef}
        />
      )}

      {view === 'poll' && activePoll && (
        <PollDetailView
          poll={activePoll}
          comments={comments}
          hasVoted={!!userVotes[activePoll.id]}
          voteChoice={userVotes[activePoll.id] || null}
          isSaved={savedPollIds.has(activePoll.id)}
          commentSort={commentSort}
          onNavigate={navigateTo}
          onVote={handleVote}
          onSave={handleSave}
          onPostComment={handlePostComment}
          onReact={handleReact}
          onSortChange={setCommentSort}
        />
      )}

      {view === 'create' && (
        <CreatePollView
          onNavigate={navigateTo}
          onSubmit={handleCreatePoll}
        />
      )}

      {view === 'profile' && (
        <ProfileView
          user={user}
          profile={profile}
          polls={polls.filter(p => p.created_by === user?.id)}
          userVotes={userVotes}
          savedPollIds={savedPollIds}
          onNavigate={navigateTo}
          onSave={handleSave}
        />
      )}

      {view === 'saved' && (
        <SavedView
          polls={polls.filter(p => savedPollIds.has(p.id))}
          savedPollIds={savedPollIds}
          onNavigate={navigateTo}
          onSave={handleSave}
        />
      )}

      {view === 'search' && (
        <SearchView
          query={searchQuery}
          isCategory={searchCategory}
          polls={filteredPolls}
          savedPollIds={savedPollIds}
          onNavigate={navigateTo}
          onSave={handleSave}
        />
      )}

      {/* Footer */}
      <footer style={footerStyle}>
        <div>PULSE - the world's opinion, live.</div>
        <div>
          <a href="#" onClick={() => navigateTo('home')}>About</a> &nbsp;·&nbsp;
          <a href="#">Privacy</a> &nbsp;·&nbsp;
          <a href="#">Terms</a>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          mode={authMode}
          email={authEmail}
          password={authPassword}
          name={authName}
          error={authError}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onNameChange={setAuthName}
          onModeChange={setAuthMode}
          onSubmit={handleAuth}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Toast */}
      {toast && <div style={toastStyle}>{toast}</div>}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Analytics />
    </AuthProvider>
  )
}

// Styles
const headerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '15px 20px',
  background: 'rgba(4, 7, 10, 0.88)',
  backdropFilter: 'blur(16px)',
  borderBottom: '1px solid var(--line)',
  gap: '20px',
}

const footerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--line)',
  padding: '34px 20px',
  marginTop: '20px',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
  color: 'var(--muted)',
  gap: '16px',
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--surface-2)',
  border: '1px solid var(--signal)',
  color: 'var(--text)',
  padding: '13px 22px',
  borderRadius: '8px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12.5px',
  zIndex: 200,
}

// Sub-components
function Header({ user, profile, onLogin, onLogout, onNavigate, searchQuery, onSearchChange, onSearch, onCreatePoll }: {
  user: any
  profile: Profile | null
  onLogin: () => void
  onLogout: () => void
  onNavigate: (v: View) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onSearch: (e: React.FormEvent) => void
  onCreatePoll: () => void
}) {
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexShrink: 0 }} onClick={() => onNavigate('home')}>
        <div style={{ width: '18px', height: '18px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.6px solid var(--signal)', borderRadius: '50%', opacity: 0.55 }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '6px',
            height: '6px',
            margin: '-3px 0 0 -3px',
            borderRadius: '50%',
            background: 'var(--signal)',
            boxShadow: '0 0 8px var(--signal-glow)',
            animation: 'pulse-dot 1.8s ease-in-out infinite',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', letterSpacing: '0.5px' }}>PULSE</span>
      </div>

      <nav className="header-nav" style={{ display: 'flex', gap: '26px', fontWeight: 500, fontSize: '14px', letterSpacing: '0.2px', color: 'var(--muted)', flexShrink: 0 }}>
        <a onClick={() => onNavigate('home')} style={{ cursor: 'pointer' }}>Home</a>
        <a onClick={() => onNavigate('saved')} style={{ cursor: 'pointer' }}>Saved</a>
        <a onClick={() => onNavigate('profile')} style={{ cursor: 'pointer' }}>Profile</a>
      </nav>

      <form className="header-search" style={{ flex: 1, maxWidth: '340px', display: 'flex' }} onSubmit={onSearch}>
        <input
          type="text"
          placeholder="Search polls..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            padding: '9px 12px',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: '13.5px',
            outline: 'none',
          }}
        />
        <button type="submit" style={{
          padding: '0 12px',
          border: '1px solid var(--line)',
          borderLeft: 'none',
          borderRadius: '0 6px 6px 0',
          background: 'var(--surface-2)',
          color: 'var(--muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}>
          <svg className="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </form>

      <div className="header-auth" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {user ? (
          <div
            onClick={onLogout}
            style={{
              width: '33px',
              height: '33px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--signal), #1c8f82)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#04070a',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
            }}
            title={`${profile?.name || 'User'} - click to log out`}
          >
            {(profile?.name || user.email?.[0] || '?')[0].toUpperCase()}
          </div>
        ) : (
          <button
            onClick={onLogin}
            style={{
              fontWeight: 600,
              fontSize: '13.5px',
              letterSpacing: '0.2px',
              padding: '10px 18px',
              borderRadius: '7px',
              cursor: 'pointer',
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--text)',
            }}
          >
            Log in
          </button>
        )}
        <button
          onClick={onCreatePoll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            fontWeight: 700,
            fontSize: '13.5px',
            letterSpacing: '0.2px',
            padding: '10px 18px',
            borderRadius: '7px',
            cursor: 'pointer',
            border: 'none',
            background: 'var(--signal)',
            color: '#04070a',
            boxShadow: '0 0 16px rgba(62, 230, 212, 0.22)',
          }}
        >
          <svg className="icon" viewBox="0 0 24 24" style={{ width: '14px', height: '14px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create poll
        </button>
      </div>

      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={onLogin}
        style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          cursor: 'pointer',
          color: 'var(--text)',
        }}
      >
        <svg className="icon" viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </header>
  )
}

function LiveStatsStrip({ totalVotes, pollsCount, visitorCount, visitorStatus }: { totalVotes: number; pollsCount: number; visitorCount: number; visitorStatus: 'loading' | 'ready' | 'error' }) {
  return (
    <div className="live-stats-strip" style={{
      position: 'relative',
      zIndex: 5,
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg-alt)',
      display: 'flex',
      alignItems: 'center',
      gap: '28px',
      padding: '9px 40px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 8px var(--signal)', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
        <b style={{ color: 'var(--signal)' }}>{formatNumber(totalVotes)}</b> total votes
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        <b style={{ color: 'var(--text)' }}>{pollsCount}</b> active polls
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        <b style={{ color: visitorStatus === 'error' ? 'var(--red)' : 'var(--text)' }}>
          {visitorStatus === 'error' ? 'SETUP NEEDED' : formatNumber(visitorCount)}
        </b> total visitors
      </div>
    </div>
  )
}

function HomeView({ polls, savedPollIds, onNavigate, onSave, feedItems, onGlobeReady }: {
  polls: Poll[]
  savedPollIds: Set<string>
  onNavigate: (v: View, p?: Poll) => void
  onSave: (id: string) => void
  feedItems: { text: string; side: 'yes' | 'no' }[]
  onGlobeReady: (ref: { spawnArc: (side: 'yes' | 'no') => void }) => void
}) {
  const trending = [...polls].sort((a, b) => (b.yes_votes + b.no_votes) - (a.yes_votes + a.no_votes)).slice(0, 4)

  return (
    <>
      {/* Hero */}
      <section className="home-grid" style={{
        position: 'relative',
        zIndex: 2,
        display: 'grid',
        gridTemplateColumns: '1.05fr 0.95fr',
        alignItems: 'center',
        gap: '20px',
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '56px 40px 30px',
        minHeight: '480px',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '3px', color: 'var(--signal)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
            <span style={{ width: '24px', height: '1px', background: 'var(--signal)' }} />
            LIVE · GLOBAL OPINION EXCHANGE
          </div>
          <h1 className="hero-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '47px', lineHeight: 1.12, maxWidth: '560px', letterSpacing: '-0.5px' }}>
            The world is voting. <span style={{ background: 'linear-gradient(90deg, var(--signal), var(--green))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Right now.</span>
          </h1>
          <p className="hero-subtitle" style={{ marginTop: '20px', fontSize: '16.5px', color: 'var(--muted)', maxWidth: '480px', lineHeight: 1.6 }}>
            Cast a vote, argue your case, and watch opinion shift across 190 countries in real time — tracked with the same precision as a market feed.
          </p>
        </div>
        <div style={{ position: 'relative', height: '460px' }}>
          <Globe onReady={onGlobeReady} />
        </div>
      </section>

      {/* Trending */}
      <section className="section-padding" style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Trending now</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '900px' }}>
          {trending.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              isSaved={savedPollIds.has(poll.id)}
              onClick={() => onNavigate('poll', poll)}
              onSave={() => onSave(poll.id)}
            />
          ))}
        </div>
      </section>

      {/* Live activity */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 40px 40px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Live activity</h2>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px 18px', maxHeight: '230px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '1.5px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 8px var(--signal)', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
            REAL-TIME FEED
          </div>
          {feedItems.map((item, i) => (
            <div key={i} style={{ fontSize: '13px', padding: '7px 0', borderBottom: '1px solid var(--line-soft)', color: 'var(--muted)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '8px', animation: 'feed-in 0.35s ease' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.side === 'yes' ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 5px ${item.side === 'yes' ? 'var(--green)' : 'var(--red)'}` }} />
              {item.text}
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 40px 40px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Categories</h2>
        </div>
        <div className="category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {CATEGORIES.map(cat => (
            <div key={cat} style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '20px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              transition: '0.15s',
            }}
            onClick={() => onNavigate('poll')}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--signal)'; e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--surface)' }}
            >
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--signal-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--signal)', flexShrink: 0 }}>
                <svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14.5px' }}>{cat}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{polls.filter(p => p.category === cat).length} polls</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* All polls */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 40px 40px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>All polls</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '900px' }}>
          {polls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              isSaved={savedPollIds.has(poll.id)}
              onClick={() => onNavigate('poll', poll)}
              onSave={() => onSave(poll.id)}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function PollCard({ poll, isSaved, onClick, onSave }: {
  poll: Poll
  isSaved: boolean
  onClick: () => void
  onSave: (id: string) => void
}) {
  const p = getPercent(poll.yes_votes, poll.no_votes)
  const total = poll.yes_votes + poll.no_votes

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, var(--surface), var(--bg-alt))',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        padding: '13px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr 190px 56px 24px',
        gap: '16px',
        alignItems: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: '9px', right: '9px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '1.5px', color: 'var(--muted-dim)' }}>
        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 6px var(--signal)' }} />
        LIVE
      </div>
      <div>
        <div style={{ fontSize: '14.5px', fontWeight: 600, letterSpacing: '0.1px' }}>{poll.question}</div>
        <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--muted)', letterSpacing: '0.8px' }}>
          <span style={{ color: 'var(--signal)' }}>{poll.category.toUpperCase()}</span> · {formatNumber(total)} votes · {getTimeRemaining(poll.ends_at)} remaining
        </div>
      </div>
      <div>
        <div style={{ height: '22px', borderRadius: '3px', overflow: 'visible', display: 'flex', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '10.5px', border: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ width: `${p.y}%`, background: 'linear-gradient(90deg, #0c1a0c, var(--green))', color: '#0f1a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.3px', overflow: 'hidden' }}>
            {poll.yes_label} {p.y}%
          </div>
          <div style={{ width: `${p.n}%`, background: 'linear-gradient(270deg, #1a0c0c, var(--red))', color: '#1a0f10', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.3px', overflow: 'hidden' }}>
            {poll.no_label} {p.n}%
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.3px' }}>
          <span style={{ color: 'var(--green)' }}>{formatNumber(poll.yes_votes)} {poll.yes_label}</span>
          <span style={{ color: 'var(--red)' }}>{formatNumber(poll.no_votes)} {poll.no_label}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{formatNumber(total)}</div>
        <div style={{ fontSize: '8.5px', color: 'var(--muted)', letterSpacing: '1px' }}>VOTES</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onSave(poll.id) }}
        style={{
          background: 'none',
          border: 'none',
          color: isSaved ? 'var(--signal)' : 'var(--muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill={isSaved ? 'currentColor' : 'none'} style={{ width: '17px', height: '17px' }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>
  )
}

function PollDetailView({ poll, comments, hasVoted, voteChoice, isSaved, commentSort, onNavigate, onVote, onSave, onPostComment, onReact, onSortChange }: {
  poll: Poll
  comments: Comment[]
  hasVoted: boolean
  voteChoice: 'yes' | 'no' | null
  isSaved: boolean
  commentSort: 'helpful' | 'newest'
  onNavigate: (v: View) => void
  onVote: (p: Poll, c: 'yes' | 'no') => void
  onSave: (id: string) => void
  onPostComment: (pollId: string, text: string, side: 'yes' | 'no') => void
  onReact: (commentId: string, reaction: 'like' | 'dislike', current: 'like' | 'dislike' | null) => void
  onSortChange: (s: 'helpful' | 'newest') => void
}) {
  const [commentText, setCommentText] = useState('')
  const p = getPercent(poll.yes_votes, poll.no_votes)
  const total = poll.yes_votes + poll.no_votes

  const handleSavePoll = () => onSave(poll.id)

  const sortedComments = [...comments].sort((a, b) => {
    if (commentSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return (b.likes - b.dislikes) - (a.likes - a.dislikes)
  })

  return (
    <section className="section-padding" style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
      <span onClick={() => onNavigate('home')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--signal)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', cursor: 'pointer', marginBottom: '20px' }}>
        ← Back
      </span>

      <div className="poll-detail-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '36px', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--signal)', letterSpacing: '1.5px' }}>
          {poll.category.toUpperCase()} · {formatNumber(total)} VOTES · {getTimeRemaining(poll.ends_at).toUpperCase()} REMAINING
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', margin: '14px 0 24px', lineHeight: 1.3, fontWeight: 700 }}>{poll.question}</h2>

        <div style={{ height: '46px', borderRadius: '8px', overflow: 'hidden', display: 'flex', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px', marginBottom: '22px', position: 'relative' }}>
          <div style={{ width: `${p.y}%`, background: 'linear-gradient(90deg, #0c180c, var(--green))', color: '#0f1a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.8s cubic-bezier(.22,.8,.3,1)' }}>
            {poll.yes_label} {p.y}%
          </div>
          <div style={{ width: `${p.n}%`, background: 'linear-gradient(270deg, #1a0c10, var(--red))', color: '#1a0f10', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.8s cubic-bezier(.22,.8,.3,1)' }}>
            {poll.no_label} {p.n}%
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '-12px 0 22px', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.3px' }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{formatNumber(poll.yes_votes)} {poll.yes_label} votes</span>
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>{formatNumber(poll.no_votes)} {poll.no_label} votes</span>
        </div>

        {hasVoted && (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <svg className="icon" viewBox="0 0 24 24" style={{ width: '13px', height: '13px' }}><polyline points="20 6 9 17 4 12"/></svg>
            You voted — thanks for weighing in
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
          <button
            onClick={() => onVote(poll, 'yes')}
            disabled={hasVoted}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '8px',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '14.5px',
              letterSpacing: '0.5px',
              cursor: hasVoted ? 'default' : 'pointer',
              border: '2px solid var(--green)',
              background: 'transparent',
              color: 'var(--green)',
              opacity: hasVoted ? 0.35 : 1,
            }}
          >
            {poll.yes_label}
          </button>
          <button
            onClick={() => onVote(poll, 'no')}
            disabled={hasVoted}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '8px',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '14.5px',
              letterSpacing: '0.5px',
              cursor: hasVoted ? 'default' : 'pointer',
              border: '2px solid var(--red)',
              background: 'transparent',
              color: 'var(--red)',
              opacity: hasVoted ? 0.35 : 1,
            }}
          >
            {poll.no_label}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button
            onClick={handleSavePoll}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
            }}
          >
            <svg className="icon" viewBox="0 0 24 24" style={{ width: '14px', height: '14px' }} fill={isSaved ? 'currentColor' : 'none'}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>

        {hasVoted && (
          <div style={{ marginTop: '24px' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', letterSpacing: '1px' }}>
              WHY DID YOU VOTE THIS WAY?
            </label>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Explain your reasoning..."
              style={{
                width: '100%',
                marginTop: '8px',
                background: 'var(--bg-alt)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px',
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                resize: 'vertical',
                minHeight: '70px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                if (commentText.trim() && voteChoice) {
                  onPostComment(poll.id, commentText, voteChoice)
                  setCommentText('')
                }
              }}
              style={{
                marginTop: '8px',
                padding: '9px 18px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--signal)',
                color: '#04070a',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Post
            </button>
          </div>
        )}
      </div>

      {/* Comments */}
      <div style={{ maxWidth: '760px', margin: '36px auto 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '15.5px' }}>Comments ({comments.length})</h3>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={() => onSortChange('helpful')}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.5px',
                padding: '6px 11px',
                borderRadius: '6px',
                color: commentSort === 'helpful' ? 'var(--signal)' : 'var(--muted)',
                cursor: 'pointer',
                border: 'none',
                background: commentSort === 'helpful' ? 'var(--surface-2)' : 'transparent',
              }}
            >
              Most helpful
            </button>
            <button
              onClick={() => onSortChange('newest')}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.5px',
                padding: '6px 11px',
                borderRadius: '6px',
                color: commentSort === 'newest' ? 'var(--signal)' : 'var(--muted)',
                cursor: 'pointer',
                border: 'none',
                background: commentSort === 'newest' ? 'var(--surface-2)' : 'transparent',
              }}
            >
              Newest
            </button>
          </div>
        </div>

        {comments.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', textAlign: 'center', padding: '40px 0' }}>
            No comments yet — be the first to explain your vote.
          </div>
        ) : (
          sortedComments.map(comment => (
            <div key={comment.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px 18px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--signal)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {comment.profiles?.name || 'Anonymous'}
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    padding: '3px 8px',
                    borderRadius: '20px',
                    background: comment.side === 'yes' ? 'rgba(47, 224, 138, 0.14)' : 'rgba(255, 77, 106, 0.14)',
                    color: comment.side === 'yes' ? 'var(--green)' : 'var(--red)',
                    border: comment.side === 'yes' ? '1px solid rgba(47, 224, 138, 0.35)' : '1px solid rgba(255, 77, 106, 0.35)',
                  }}>
                    VOTED {comment.side.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'var(--text)' }}>{comment.text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px' }}>
                <button
                  onClick={() => onReact(comment.id, 'like', comment.userReaction || null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: comment.userReaction === 'like' ? 'rgba(47, 224, 138, 0.08)' : 'transparent',
                    border: `1px solid ${comment.userReaction === 'like' ? 'var(--green)' : 'var(--line)'}`,
                    color: comment.userReaction === 'like' ? 'var(--green)' : 'var(--muted)',
                    borderRadius: '20px',
                    padding: '5px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                  }}
                >
                  ▲ {comment.likes}
                </button>
                <button
                  onClick={() => onReact(comment.id, 'dislike', comment.userReaction || null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: comment.userReaction === 'dislike' ? 'rgba(255, 77, 106, 0.08)' : 'transparent',
                    border: `1px solid ${comment.userReaction === 'dislike' ? 'var(--red)' : 'var(--line)'}`,
                    color: comment.userReaction === 'dislike' ? 'var(--red)' : 'var(--muted)',
                    borderRadius: '20px',
                    padding: '5px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                  }}
                >
                  ▼ {comment.dislikes}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function CreatePollView({ onNavigate, onSubmit }: { onNavigate: (v: View) => void; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <section className="section-padding" style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
      <span onClick={() => onNavigate('home')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--signal)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', cursor: 'pointer', marginBottom: '20px' }}>
        ← Back
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Create a poll</h2>
      </div>

      <form className="create-form-card" onSubmit={onSubmit} style={{ maxWidth: '560px', margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '36px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>QUESTION</label>
          <input name="question" type="text" placeholder="Should AI replace teachers?" required style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '13px 14px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '14.5px', outline: 'none' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>OPTION A LABEL</label>
            <input name="yesLabel" type="text" defaultValue="YES" style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '13px 14px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '14.5px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>OPTION B LABEL</label>
            <input name="noLabel" type="text" defaultValue="NO" style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '13px 14px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '14.5px', outline: 'none' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>CATEGORY</label>
            <select name="category" style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '13px 14px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '14.5px', outline: 'none' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>DURATION</label>
            <select name="duration" style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '13px 14px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '14.5px', outline: 'none' }}>
              <option value="6">6 hours</option>
              <option value="24">1 day</option>
              <option value="72" selected>3 days</option>
              <option value="168">7 days</option>
            </select>
          </div>
        </div>

        <button type="submit" style={{ width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: 'var(--signal)', color: '#04070a', fontWeight: 800, fontSize: '14.5px', letterSpacing: '0.5px', cursor: 'pointer', marginTop: '6px' }}>
          Create poll
        </button>
      </form>
    </section>
  )
}

function ProfileView({ user, profile, polls, userVotes, savedPollIds, onNavigate, onSave }: {
  user: any
  profile: Profile | null
  polls: Poll[]
  userVotes: Record<string, 'yes' | 'no'>
  savedPollIds: Set<string>
  onNavigate: (v: View) => void
  onSave: (id: string) => void
}) {
  const votesCast = Object.keys(userVotes).length
  const commentsCount = 0
  const reputation = polls.length * 40 + votesCast * 5 + commentsCount * 15

  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '36px' }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--signal), #1c8f82)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '26px',
          color: '#04070a',
        }}>
          {user ? (profile?.name?.[0] || user.email?.[0] || '?').toUpperCase() : '?'}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '21px', fontWeight: 700 }}>{profile?.name || 'Guest'}</div>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11.5px', marginTop: '4px' }}>
            {user ? 'PULSE member' : 'Log in to build your reputation'}
          </div>
        </div>
      </div>

      <div className="category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '25px', color: 'var(--signal)' }}>{polls.length}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', marginTop: '6px', letterSpacing: '1px' }}>POLLS CREATED</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '25px', color: 'var(--signal)' }}>{votesCast}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', marginTop: '6px', letterSpacing: '1px' }}>VOTES CAST</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '25px', color: 'var(--signal)' }}>{commentsCount}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', marginTop: '6px', letterSpacing: '1px' }}>COMMENTS</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '25px', color: 'var(--signal)' }}>{reputation}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', marginTop: '6px', letterSpacing: '1px' }}>REPUTATION</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Polls you created</h2>
      </div>

      {polls.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', textAlign: 'center', padding: '40px 0' }}>
          {user ? "You haven't created any polls yet." : 'Log in to see your created polls.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '900px' }}>
          {polls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              isSaved={savedPollIds.has(poll.id)}
              onClick={() => onNavigate('poll')}
              onSave={() => onSave(poll.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SavedView({ polls, savedPollIds, onNavigate, onSave }: {
  polls: Poll[]
  savedPollIds: Set<string>
  onNavigate: (v: View, p?: Poll) => void
  onSave: (id: string) => void
}) {
  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>Saved polls</h2>
      </div>

      {polls.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', textAlign: 'center', padding: '40px 0' }}>
          You haven't saved any polls yet. Tap the bookmark on a poll to save it.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '900px' }}>
          {polls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              isSaved={savedPollIds.has(poll.id)}
              onClick={() => onNavigate('poll', poll)}
              onSave={() => onSave(poll.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SearchView({ query, isCategory, polls, savedPollIds, onNavigate, onSave }: {
  query: string
  isCategory: boolean
  polls: Poll[]
  savedPollIds: Set<string>
  onNavigate: (v: View, p?: Poll) => void
  onSave: (id: string) => void
}) {
  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '22px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18.5px', letterSpacing: '0.2px', fontWeight: 700 }}>
          {isCategory ? `Category: ${query}` : `Results for "${query}"`}
        </h2>
      </div>

      {polls.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', textAlign: 'center', padding: '40px 0' }}>
          No polls found. Try a different search, or create one yourself.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '900px' }}>
          {polls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              isSaved={savedPollIds.has(poll.id)}
              onClick={() => onNavigate('poll', poll)}
              onSave={() => onSave(poll.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AuthModal({ mode, email, password, name, error, onEmailChange, onPasswordChange, onNameChange, onModeChange, onSubmit, onClose }: {
  mode: 'login' | 'signup'
  email: string
  password: string
  name: string
  error: string
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onNameChange: (v: string) => void
  onModeChange: (m: 'login' | 'signup') => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: '16px',
        padding: '32px',
        width: '380px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(62, 230, 212, 0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', letterSpacing: '1px', color: 'var(--signal)', marginBottom: '18px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 10px var(--signal)' }} />
          PULSE ACCOUNT
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '9px', padding: '4px', marginBottom: '22px' }}>
          <button
            onClick={() => onModeChange('login')}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '9px',
              borderRadius: '6px',
              border: 'none',
              background: mode === 'login' ? 'var(--surface)' : 'transparent',
              color: mode === 'login' ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Log in
          </button>
          <button
            onClick={() => onModeChange('signup')}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '9px',
              borderRadius: '6px',
              border: 'none',
              background: mode === 'signup' ? 'var(--surface)' : 'transparent',
              color: mode === 'signup' ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Sign up
          </button>
        </div>

        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '6px', fontWeight: 700 }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px', lineHeight: 1.4 }}>
          {mode === 'signup' ? 'Join PULSE to vote, save polls, and build reputation.' : 'Log in to vote, save polls, and build your reputation.'}
        </p>

        <form onSubmit={onSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: '6px' }}>DISPLAY NAME</label>
              <input
                type="text"
                value={name}
                onChange={e => onNameChange(e.target.value)}
                placeholder="e.g. Alex Rivera"
                style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 13px', color: 'var(--text)', fontSize: '14.5px', outline: 'none' }}
              />
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: '6px' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 13px', color: 'var(--text)', fontSize: '14.5px', outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: '6px' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => onPasswordChange(e.target.value)}
              placeholder="At least 6 characters"
              style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 13px', color: 'var(--text)', fontSize: '14.5px', outline: 'none' }}
            />
          </div>

          {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginBottom: '6px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                background: 'transparent',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                background: 'var(--signal)',
                border: 'none',
                color: '#04070a',
                boxShadow: '0 0 16px rgba(62, 230, 212, 0.25)',
              }}
            >
              {mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
