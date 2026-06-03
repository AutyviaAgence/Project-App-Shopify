'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ConversationTag } from '@/types/database'
import { toast } from 'sonner'
import { ContactProfilePanel } from '@/components/contact-profile-panel'
import { useTranslation } from '@/i18n/context'
import { useSubscription } from '@/hooks/use-subscription'
import { ConversationList } from './_components/conversation-list'
import { ChatArea } from './_components/chat-area'
import type { ConversationWithJoins, Team, Message, AIAgent, LifecycleStage } from './_components/types'
import { BlobLoaderScreen } from '@/components/blob-loader'

let notificationAudio: HTMLAudioElement | null = null

function playMessageSound() {
  try {
    if (localStorage.getItem('autyvia_sound_enabled') === 'false') return
    if (!notificationAudio) {
      notificationAudio = new Audio('/sounds/notification.mp3')
      notificationAudio.volume = 0.5
    }
    notificationAudio.currentTime = 0
    void notificationAudio.play()
  } catch {
    // Audio not available (SSR ou interaction utilisateur requise)
  }
}

function ConversationsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation()
  const { subscription } = useSubscription()
  // Analyse IA réservée aux plans pro/scale (ou admin)
  const canAnalyze = subscription?.role === 'admin' || subscription?.plan === 'pro' || subscription?.plan === 'scale'

  // Core state
  const [conversations, setConversations] = useState<ConversationWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConv, setSelectedConv] = useState<ConversationWithJoins | null>(null)
  const selectedConvIdRef = useRef<string | null>(null)
  const [pendingOpenConvId, setPendingOpenConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [profileOpen, setProfileOpen] = useState(false)

  // Tags
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [conversationTags, setConversationTags] = useState<Record<string, ConversationTag[]>>({})

  // Lifecycle stages
  const [lifecycleStages, setLifecycleStages] = useState<LifecycleStage[]>([])
  const [analyzingConvId, setAnalyzingConvId] = useState<string | null>(null)

  // Filters
  const [sessions, setSessions] = useState<{ id: string; instance_name: string; phone_number: string | null }[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [filterChannel, setFilterChannel] = useState<string>('all')
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterAiActive, setFilterAiActive] = useState<string>('all')
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterLifecycleStage, setFilterLifecycleStage] = useState<string>('all')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalConversations, setTotalConversations] = useState(0)
  const ITEMS_PER_PAGE = 20

  // --- Data fetching ---
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data.filter((a: AIAgent) => a.is_active))
      }
    } catch { /* silently ignore */ }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data.map((s: { id: string; instance_name: string; phone_number: string | null }) => ({
          id: s.id, instance_name: s.instance_name, phone_number: s.phone_number,
        })))
      }
    } catch { /* silently ignore */ }
  }, [])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) setTeams(json.data)
    } catch { /* silently ignore */ }
  }, [])

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      const json = await res.json()
      if (res.ok && json.data) setAllTags(json.data)
    } catch { /* silently ignore */ }
  }, [])

  const fetchConversationTags = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/tags`)
      const json = await res.json()
      if (res.ok && json.data) {
        setConversationTags((prev) => ({ ...prev, [convId]: json.data }))
      }
    } catch { /* silently ignore */ }
  }, [])

  const fetchAllConversationTags = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) return
    try {
      const res = await fetch('/api/conversations/tags/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_ids: convIds }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setConversationTags((prev) => ({ ...prev, ...json.data }))
      }
    } catch { /* silently ignore */ }
  }, [])

  const fetchLifecycleStages = useCallback(async () => {
    try {
      const res = await fetch('/api/lifecycle/stages')
      const json = await res.json()
      if (res.ok && json.data) setLifecycleStages(json.data)
    } catch { /* silently ignore */ }
  }, [])

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterChannel !== 'all') params.set('channel', filterChannel)
      if (filterSession !== 'all') params.set('session_id', filterSession)
      if (filterAiActive !== 'all') params.set('is_ai_active', filterAiActive)
      if (filterTeam !== 'all') params.set('team_id', filterTeam)
      if (filterLifecycleStage !== 'all') params.set('lifecycle_stage_id', filterLifecycleStage)
      if (filterTags.length > 0) params.set('tag_ids', filterTags.join(','))
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      params.set('page', page.toString())
      params.set('limit', ITEMS_PER_PAGE.toString())

      const res = await fetch(`/api/conversations?${params.toString()}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations(json.data)
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages)
          setTotalConversations(json.pagination.total)
        }
        const convIds = json.data.map((c: ConversationWithJoins) => c.id)
        if (convIds.length > 0) fetchAllConversationTags(convIds)
      }
    } catch {
      toast.error(t('conversations.load_error'))
    } finally {
      setLoading(false)
    }
  }, [filterChannel, filterSession, filterAiActive, filterTeam, filterLifecycleStage, filterTags, page, debouncedSearch, fetchAllConversationTags])

  // --- Actions ---
  const togglePin = useCallback(async (convId: string, currentPinned: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !currentPinned }),
      })
      if (res.ok) {
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === convId ? { ...c, is_pinned: !currentPinned } : c
          )
          return updated.sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
            const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
            const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
            return dateB - dateA
          })
        })
        toast.success(!currentPinned ? t('conversations.pinned') : t('conversations.unpinned'))
      }
    } catch {
      toast.error(t('common.error'))
    }
  }, [t])

  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true)
    setHasMoreMessages(false)
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`)
      const json = await res.json()
      if (res.ok && json.data) {
        setMessages(json.data)
        setHasMoreMessages(!!json.hasMore)
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
        )
      }
    } catch {
      toast.error(t('conversations.messages_load_error'))
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedConv || loadingOlder || !hasMoreMessages || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const oldestMessage = messages[0]
      const res = await fetch(`/api/conversations/${selectedConv.id}/messages?before=${encodeURIComponent(oldestMessage.created_at)}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setMessages((prev) => [...json.data, ...prev])
        setHasMoreMessages(!!json.hasMore)
      }
    } catch {
      toast.error(t('conversations.messages_load_error'))
    } finally {
      setLoadingOlder(false)
    }
  }, [selectedConv, loadingOlder, hasMoreMessages, messages, t])

  const handleSendText = useCallback(async (content: string) => {
    if (!selectedConv || sending) return
    setSending(true)

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      session_id: selectedConv.session_id ?? '',
      direction: 'outbound',
      content,
      message_type: 'text',
      media_url: null,
      media_mime_type: null,
      transcription: null,
      wa_message_id: null,
      channel_message_id: null,
      sent_by: 'user',
      ai_agent_id: null,
      status: 'pending',
      reaction_emoji: null,
      ai_processed: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const res = await fetch(`/api/conversations/${selectedConv.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error || t('conversations.send_error'))
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        return
      }

      if (json.data?.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...json.data, content } : m))
        )
      }
    } catch {
      toast.error(t('common.network_error'))
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }, [selectedConv, sending, t])

  const handleSendEmail = useCallback(async (content: string, subject: string, attachments?: File[]) => {
    if (!selectedConv || sending) return
    setSending(true)
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      session_id: '',
      direction: 'outbound',
      content,
      message_type: 'text',
      media_url: null,
      media_mime_type: null,
      transcription: subject ? `Objet: ${subject}` : null,
      wa_message_id: null,
      channel_message_id: null,
      sent_by: 'user',
      ai_agent_id: null,
      status: 'pending',
      reaction_emoji: null,
      ai_processed: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    try {
      let res: Response
      if (attachments?.length) {
        const formData = new FormData()
        formData.append('conversation_id', selectedConv.id)
        formData.append('content', content)
        if (subject) formData.append('subject', subject)
        attachments.forEach((f) => formData.append('attachments', f))
        res = await fetch('/api/email/send', { method: 'POST', body: formData })
      } else {
        res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: selectedConv.id, content, subject }),
        })
      }
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t('conversations.send_error'))
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        return
      }
      // Recharger tous les messages pour inclure les bulles document des PJ
      if (attachments?.length) {
        await loadMessages(selectedConv.id)
      } else if (json.data?.id) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...json.data, content } : m)))
      }
    } catch {
      toast.error(t('common.network_error'))
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }, [selectedConv, sending, t, loadMessages])

  const handleSendMedia = useCallback(async (file: File, caption?: string) => {
    if (!selectedConv || sending) return
    setSending(true)

    const mediatype = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('audio/') ? 'audio'
      : file.type.startsWith('video/') ? 'video'
      : 'document'

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      session_id: selectedConv.session_id ?? '',
      direction: 'outbound',
      content: caption || null,
      message_type: mediatype,
      media_url: null,
      media_mime_type: file.type,
      transcription: null,
      wa_message_id: null,
      channel_message_id: null,
      sent_by: 'user',
      ai_agent_id: null,
      status: 'pending',
      reaction_emoji: null,
      ai_processed: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (caption) formData.append('caption', caption)

      const res = await fetch(`/api/conversations/${selectedConv.id}/send`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error || t('conversations.send_media_error'))
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        return
      }

      if (json.data?.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? json.data : m))
        )
      }
    } catch {
      toast.error(t('common.network_error'))
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }, [selectedConv, sending, t])

  const handleAssignAgent = useCallback(async (convId: string, agentId: string | null) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/agent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_agent_id: agentId,
          is_ai_active: agentId ? true : false,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, ai_agent_id: json.data.ai_agent_id, is_ai_active: json.data.is_ai_active }
              : c
          )
        )
        if (selectedConv?.id === convId) {
          setSelectedConv((prev) =>
            prev ? { ...prev, ai_agent_id: json.data.ai_agent_id, is_ai_active: json.data.is_ai_active } : prev
          )
        }
        toast.success(agentId ? t('conversations.agent_assigned') : t('conversations.agent_removed'))
      } else {
        toast.error(json.error || t('conversations.agent_assign_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }, [selectedConv?.id, t])

  const handleToggleAI = useCallback(async (convId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/agent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_ai_active: isActive }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, is_ai_active: json.data.is_ai_active } : c
          )
        )
        if (selectedConv?.id === convId) {
          setSelectedConv((prev) =>
            prev ? { ...prev, is_ai_active: json.data.is_ai_active } : prev
          )
        }
        toast.success(isActive ? t('conversations.ai_enabled') : t('conversations.ai_disabled'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }, [selectedConv?.id, t])

  const handleChangeLifecycleStage = useCallback(async (convId: string, stageId: string | null) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/lifecycle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      })
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, lifecycle_stage_id: stageId } : c))
        )
        if (selectedConv?.id === convId) {
          setSelectedConv((prev) => prev ? { ...prev, lifecycle_stage_id: stageId } : prev)
        }
        const stageName = lifecycleStages.find((s) => s.id === stageId)?.name || t('conversations.unclassified')
        toast.success(t('conversations.stage_label', { name: stageName }))
      } else {
        const json = await res.json()
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }, [selectedConv?.id, lifecycleStages, t])

  const handleAnalyzeConversation = useCallback(async (convId: string) => {
    if (analyzingConvId) return
    setAnalyzingConvId(convId)
    try {
      const res = await fetch('/api/lifecycle/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_ids: [convId] }),
      })
      const json = await res.json()
      if (res.ok && json.data?.[0]) {
        const result = json.data[0]
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, lifecycle_stage_id: result.stageId } : c))
        )
        if (selectedConv?.id === convId) {
          setSelectedConv((prev) => prev ? { ...prev, lifecycle_stage_id: result.stageId } : prev)
        }
        toast.success(`${result.stageName || t('conversations.unclassified')} — ${result.reason}`)
      } else {
        toast.error(json.error || t('conversations.analysis_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setAnalyzingConvId(null)
    }
  }, [analyzingConvId, selectedConv?.id, t])

  const handleToggleTag = useCallback(async (convId: string, tag: ConversationTag) => {
    const currentTags = conversationTags[convId] || []
    const hasTag = currentTags.some((t) => t.id === tag.id)
    const newTagIds = hasTag
      ? currentTags.filter((t) => t.id !== tag.id).map((t) => t.id)
      : [...currentTags.map((t) => t.id), tag.id]

    const newTags = hasTag
      ? currentTags.filter((t) => t.id !== tag.id)
      : [...currentTags, tag]
    setConversationTags((prev) => ({ ...prev, [convId]: newTags }))

    try {
      const res = await fetch(`/api/conversations/${convId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: newTagIds }),
      })
      if (!res.ok) {
        setConversationTags((prev) => ({ ...prev, [convId]: currentTags }))
        toast.error(t('conversations.tag_update_error'))
      }
    } catch {
      setConversationTags((prev) => ({ ...prev, [convId]: currentTags }))
      toast.error(t('common.network_error'))
    }
  }, [conversationTags, t])

  const handleCreateTag = useCallback(async (name: string, color: string) => {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAllTags((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success(t('conversations.tag_created'))
      } else {
        toast.error(json.error || t('conversations.tag_create_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }, [t])

  // --- Effects ---
  useEffect(() => {
    Promise.all([
      fetchConversations(),
      fetchAgents(),
      fetchSessions(),
      fetchTags(),
      fetchTeams(),
      fetchLifecycleStages(),
    ])
  }, [fetchConversations, fetchAgents, fetchSessions, fetchTags, fetchTeams, fetchLifecycleStages])

  // Handle ?open=conversationId URL param
  useEffect(() => {
    const openConvId = searchParams.get('open')
    if (openConvId) {
      setPendingOpenConvId(openConvId)
      router.replace('/conversations', { scroll: false })
    }
  }, [searchParams, router])

  // Open pending conversation when available
  useEffect(() => {
    if (pendingOpenConvId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === pendingOpenConvId)
      if (conv) {
        setSelectedConv(conv)
        setProfileOpen(false)
        setPendingOpenConvId(null)
      } else if (!loading) {
        const fetchConversation = async () => {
          try {
            const res = await fetch(`/api/conversations/${pendingOpenConvId}`)
            if (res.ok) {
              const json = await res.json()
              if (json.data) {
                setSelectedConv(json.data)
                setProfileOpen(false)
              }
            }
          } catch {
            toast.error(t('conversations.conversation_not_found'))
          }
          setPendingOpenConvId(null)
        }
        fetchConversation()
      }
    }
  }, [pendingOpenConvId, conversations, loading])

  // Garder le ref à jour pour le realtime (évite les closures périmées)
  useEffect(() => {
    selectedConvIdRef.current = selectedConv?.id ?? null
  }, [selectedConv?.id])

  // Load messages when selecting a conversation
  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id)
    }
  }, [selectedConv?.id, loadMessages])

  // Keep stable refs for realtime callbacks to avoid stale closures without resubscribing
  const loadMessagesRef = useRef(loadMessages)
  const fetchConversationsRef = useRef(fetchConversations)
  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])
  useEffect(() => { fetchConversationsRef.current = fetchConversations }, [fetchConversations])

  // Realtime: new messages — update local state instead of re-fetching all conversations
  // This effect intentionally has no dependencies so it subscribes only once.
  // All mutable values are accessed via refs to avoid stale closures.
  useEffect(() => {
    const supabase = createClient()

    const channelId = `messages-realtime-${crypto.randomUUID()}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new as Message

          // Play sound for any inbound message
          if (newMsg.direction === 'inbound') playMessageSound()

          // Check if this message belongs to a conversation we don't have yet (new conversation)
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === newMsg.conversation_id)
            if (!exists) {
              fetchConversationsRef.current()
            }
            return prev
          })

          const currentSelectedId = selectedConvIdRef.current
          if (currentSelectedId && newMsg.conversation_id === currentSelectedId) {
            try {
              const res = await fetch(`/api/conversations/${currentSelectedId}/messages/${newMsg.id}`)
              if (res.ok) {
                const json = await res.json()
                if (json.data) {
                  setMessages((prev) => {
                    if (prev.some((m) => m.id === json.data.id)) return prev
                    return [...prev, json.data]
                  })
                }
              } else {
                loadMessagesRef.current(currentSelectedId)
              }
            } catch {
              loadMessagesRef.current(currentSelectedId)
            }
          }

          // Update conversation timestamp and unread count locally
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== newMsg.conversation_id) return c
              const tempPreview = newMsg.message_type === 'text' ? c.last_message_preview
                : newMsg.message_type === 'image' ? '📷 Image'
                : newMsg.message_type === 'audio' ? '🎤 Audio'
                : newMsg.message_type === 'video' ? '🎥 Vidéo'
                : '📎 Fichier'
              return {
                ...c,
                last_message_at: newMsg.created_at,
                last_message_preview: tempPreview,
                unread_count: selectedConvIdRef.current === c.id ? c.unread_count : c.unread_count + 1,
              }
            }).sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
              const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
              const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
              return dateB - dateA
            })
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const updated = payload.new as ConversationWithJoins
          const isCurrentlyOpen = selectedConvIdRef.current === updated.id
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== updated.id) return c
              return {
                ...c,
                last_message_at: updated.last_message_at,
                last_message_preview: updated.last_message_preview,
                unread_count: isCurrentlyOpen ? 0 : updated.unread_count,
              }
            })
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  if (loading) {
    return <BlobLoaderScreen />
  }

  return (
    <div className="flex h-full pb-16 md:pb-0">
      <ConversationList
        conversations={conversations}
        selectedConvId={selectedConv?.id ?? null}
        totalPages={totalPages}
        totalConversations={totalConversations}
        page={page}
        sessions={sessions}
        teams={teams}
        allTags={allTags}
        conversationTags={conversationTags}
        lifecycleStages={lifecycleStages}
        searchQuery={searchQuery}
        filterChannel={filterChannel}
        filterSession={filterSession}
        filterAiActive={filterAiActive}
        filterTeam={filterTeam}
        filterLifecycleStage={filterLifecycleStage}
        filterTags={filterTags}
        onSelectConversation={(conv) => { setSelectedConv(conv); setProfileOpen(false) }}
        onTogglePin={togglePin}
        onSetPage={setPage}
        onSetSearchQuery={setSearchQuery}
        onSetFilterChannel={setFilterChannel}
        onSetFilterSession={setFilterSession}
        onSetFilterAiActive={setFilterAiActive}
        onSetFilterTeam={setFilterTeam}
        onSetFilterLifecycleStage={setFilterLifecycleStage}
        onSetFilterTags={setFilterTags}
        onFetchConversationTags={fetchConversationTags}
        onToggleTag={handleToggleTag}
        onCreateTag={handleCreateTag}
      />

      <ChatArea
        selectedConv={selectedConv}
        messages={messages}
        messagesLoading={messagesLoading}
        sending={sending}
        agents={agents}
        lifecycleStages={lifecycleStages}
        analyzingConvId={analyzingConvId}
        canAnalyze={canAnalyze}
        hasMoreMessages={hasMoreMessages}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlderMessages}
        onBack={() => { setSelectedConv(null); setProfileOpen(false) }}
        onOpenProfile={() => setProfileOpen(true)}
        onSendText={handleSendText}
        onSendMedia={handleSendMedia}
        onSendEmail={handleSendEmail}
        onAssignAgent={handleAssignAgent}
        onToggleAI={handleToggleAI}
        onChangeLifecycleStage={handleChangeLifecycleStage}
        onAnalyzeConversation={handleAnalyzeConversation}
      />

      {/* Contact profile panel */}
      <ContactProfilePanel
        contactId={selectedConv?.contact?.id ?? null}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onContactDeleted={() => {
          if (selectedConv) {
            setConversations(prev => prev.filter(c => c.id !== selectedConv.id))
            setSelectedConv(null)
          }
        }}
      />
    </div>
  )
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <ConversationsPageContent />
    </Suspense>
  )
}
