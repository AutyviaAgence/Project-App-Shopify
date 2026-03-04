'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Message, AIAgent, ConversationTag, LifecycleStage } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ContactProfilePanel } from '@/components/contact-profile-panel'
import { MessageBubbleContent } from '@/components/message-bubble-content'
import {
  MessageSquare,
  Send,
  Loader2,
  Smartphone,
  ArrowLeft,
  Bot,
  UserCircle,
  Copy,
  Check,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Tag,
  Plus,
  Search,
  Sparkles,
  Workflow,
  Pin,
  Paperclip,
  Mic,
  Square,
  FileText,
  Image as ImageIcon,
  Video,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, getContactDisplayName } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'

type ConversationWithJoins = {
  id: string
  session_id: string
  contact_id: string
  ai_agent_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  is_ai_active: boolean
  is_pinned: boolean
  lifecycle_stage_id: string | null
  created_at: string
  contact: {
    id: string
    phone_number: string
    name: string | null
    first_name: string | null
    last_name: string | null
    profile_picture: string | null
  }
  session: {
    id: string
    instance_name: string
    phone_number: string | null
    team_id: string | null
    team_name: string | null
  }
  tags?: ConversationTag[]
}

type Team = {
  id: string
  name: string
}

function ConversationsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [conversations, setConversations] = useState<ConversationWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConv, setSelectedConv] = useState<ConversationWithJoins | null>(null)
  const [pendingOpenConvId, setPendingOpenConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [profileOpen, setProfileOpen] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Media attachment
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)

  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Tags
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [conversationTags, setConversationTags] = useState<Record<string, ConversationTag[]>>({})
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const [creatingTag, setCreatingTag] = useState(false)

  // Couleurs prédéfinies pour les tags
  const TAG_COLORS = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#F97316', // orange
    '#6366F1', // indigo
    '#84CC16', // lime
  ]

  // Lifecycle stages
  const [lifecycleStages, setLifecycleStages] = useState<LifecycleStage[]>([])
  const [analyzingConvId, setAnalyzingConvId] = useState<string | null>(null)

  // Filters
  const [sessions, setSessions] = useState<{ id: string; instance_name: string; phone_number: string | null }[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterAiActive, setFilterAiActive] = useState<string>('all')
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterLifecycleStage, setFilterLifecycleStage] = useState<string>('all')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalConversations, setTotalConversations] = useState(0)
  const ITEMS_PER_PAGE = 20

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data.filter((a: AIAgent) => a.is_active))
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data.map((s: { id: string; instance_name: string; phone_number: string | null }) => ({
          id: s.id,
          instance_name: s.instance_name,
          phone_number: s.phone_number,
        })))
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams(json.data)
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      const json = await res.json()
      if (res.ok && json.data) {
        setAllTags(json.data)
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchConversationTags = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/tags`)
      const json = await res.json()
      if (res.ok && json.data) {
        setConversationTags((prev) => ({ ...prev, [convId]: json.data }))
      }
    } catch {
      // silently ignore
    }
  }, [])

  // Charger les tags de toutes les conversations visibles (batch)
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
    } catch {
      // silently ignore
    }
  }, [])

  const fetchLifecycleStages = useCallback(async () => {
    try {
      const res = await fetch('/api/lifecycle/stages')
      const json = await res.json()
      if (res.ok && json.data) {
        setLifecycleStages(json.data)
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterSession !== 'all') params.set('session_id', filterSession)
      if (filterAiActive !== 'all') params.set('is_ai_active', filterAiActive)
      if (filterTeam !== 'all') params.set('team_id', filterTeam)
      if (filterLifecycleStage !== 'all') params.set('lifecycle_stage_id', filterLifecycleStage)
      if (filterTags.length > 0) params.set('tag_ids', filterTags.join(','))
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      params.set('page', page.toString())
      params.set('limit', ITEMS_PER_PAGE.toString())

      const url = `/api/conversations?${params.toString()}`
      const res = await fetch(url)
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations(json.data)
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages)
          setTotalConversations(json.pagination.total)
        }
        // Charger les tags de toutes les conversations
        const convIds = json.data.map((c: ConversationWithJoins) => c.id)
        if (convIds.length > 0) {
          fetchAllConversationTags(convIds)
        }
      }
    } catch {
      toast.error(t('conversations.load_error'))
    } finally {
      setLoading(false)
    }
  }, [filterSession, filterAiActive, filterTeam, filterLifecycleStage, filterTags, page, searchQuery, fetchAllConversationTags])

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
          // Re-sort: pinned first, then by last_message_at
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

  useEffect(() => {
    fetchConversations()
    fetchAgents()
    fetchSessions()
    fetchTags()
    fetchTeams()
    fetchLifecycleStages()
  }, [fetchConversations, fetchAgents, fetchSessions, fetchTags, fetchTeams, fetchLifecycleStages])

  // Gérer le paramètre ?open=conversationId dans l'URL
  useEffect(() => {
    const openConvId = searchParams.get('open')
    if (openConvId) {
      setPendingOpenConvId(openConvId)
      // Nettoyer l'URL après avoir récupéré le paramètre
      router.replace('/conversations', { scroll: false })
    }
  }, [searchParams, router])

  // Ouvrir la conversation quand elle est disponible
  useEffect(() => {
    if (pendingOpenConvId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === pendingOpenConvId)
      if (conv) {
        setSelectedConv(conv)
        setProfileOpen(false)
        setPendingOpenConvId(null)
      } else if (!loading) {
        // La conversation n'est pas dans la liste actuelle, essayer de la charger
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

  // Load messages when selecting a conversation
  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true)
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`)
      const json = await res.json()
      if (res.ok && json.data) {
        setMessages(json.data)
        // Reset unread in list
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

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id)
      // Auto-focus input on desktop
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [selectedConv?.id, loadMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime: new messages
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new as Message
          if (selectedConv && newMsg.conversation_id === selectedConv.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return prev
            })

            try {
              const res = await fetch(`/api/conversations/${selectedConv.id}/messages/${newMsg.id}`)
              if (res.ok) {
                const json = await res.json()
                if (json.data) {
                  setMessages((prev) => {
                    if (prev.some((m) => m.id === json.data.id)) return prev
                    return [...prev, json.data]
                  })
                }
              } else {
                loadMessages(selectedConv.id)
              }
            } catch {
              loadMessages(selectedConv.id)
            }
          }
          fetchConversations()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const updated = payload.new as ConversationWithJoins
          setConversations((prev) =>
            prev.map((c) =>
              c.id === updated.id
                ? { ...c, last_message_at: updated.last_message_at, last_message_preview: updated.last_message_preview, unread_count: updated.unread_count }
                : c
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConv?.id, fetchConversations, loadMessages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    // If file attached, send media instead
    if (attachedFile) {
      handleSendMedia(attachedFile, newMessage.trim() || undefined)
      return
    }
    if (!selectedConv || !newMessage.trim() || sending) return

    setSending(true)
    const content = newMessage.trim()
    setNewMessage('')

    // Optimistic update
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      session_id: selectedConv.session_id,
      direction: 'outbound',
      content,
      message_type: 'text',
      media_url: null,
      media_mime_type: null,
      transcription: null,
      wa_message_id: null,
      sent_by: 'user',
      ai_agent_id: null,
      status: 'pending',
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
        setNewMessage(content)
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
      setNewMessage(content)
    } finally {
      setSending(false)
    }
  }

  // --- Attachment handling ---
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('conversations.file_too_large'))
      return
    }
    setAttachedFile(file)
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setAttachedPreview(url)
    } else {
      setAttachedPreview(null)
    }
  }

  function clearAttachment() {
    setAttachedFile(null)
    if (attachedPreview) {
      URL.revokeObjectURL(attachedPreview)
      setAttachedPreview(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSendMedia(file: File, caption?: string) {
    if (!selectedConv || sending) return
    setSending(true)

    const mediatype = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('audio/') ? 'audio'
      : file.type.startsWith('video/') ? 'video'
      : 'document'

    // Optimistic update
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      session_id: selectedConv.session_id,
      direction: 'outbound',
      content: caption || null,
      message_type: mediatype,
      media_url: null,
      media_mime_type: file.type,
      transcription: null,
      wa_message_id: null,
      sent_by: 'user',
      ai_agent_id: null,
      status: 'pending',
      ai_processed: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    clearAttachment()
    setNewMessage('')

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
  }

  // --- Voice recording ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      audioChunksRef.current = []
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' })
        handleSendMedia(file)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1)
      }, 1000)
    } catch {
      toast.error(t('conversations.mic_permission_error') || 'Microphone access denied')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    setRecordingDuration(0)
    audioChunksRef.current = []
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  async function handleAssignAgent(convId: string, agentId: string | null) {
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
        console.error('[Conversations] Erreur assignation agent:', json.error)
        toast.error(json.error || t('conversations.agent_assign_error'))
      }
    } catch (err) {
      console.error('[Conversations] Erreur réseau assignation agent:', err)
      toast.error(t('common.network_error'))
    }
  }

  async function handleToggleAI(convId: string, isActive: boolean) {
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
  }

  function getContactDisplay(conv: ConversationWithJoins) {
    return getContactDisplayName({
      name: conv.contact.name,
      first_name: conv.contact.first_name,
      last_name: conv.contact.last_name,
      phone_number: conv.contact.phone_number,
    })
  }

  function getContactInitials(conv: ConversationWithJoins) {
    // Priorité au prénom/nom
    const fullName = [conv.contact.first_name, conv.contact.last_name]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (fullName) {
      return fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    }
    if (conv.contact.name) {
      return conv.contact.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    }
    return conv.contact.phone_number.slice(-2)
  }

  function getSessionLabel(conv: ConversationWithJoins) {
    return getSessionDisplayName({
      display_name: null, // pas encore disponible dans la query
      phone_number: conv.session.phone_number,
      instance_name: conv.session.instance_name,
    })
  }

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch {
      toast.error(t('conversations.copy_error'))
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim() || creatingTag) return
    setCreatingTag(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAllTags((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
        setNewTagName('')
        setNewTagColor('#3B82F6')
        toast.success(t('conversations.tag_created'))
      } else {
        toast.error(json.error || t('conversations.tag_create_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleToggleTag(convId: string, tag: ConversationTag) {
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
  }

  async function handleChangeLifecycleStage(convId: string, stageId: string | null) {
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
  }

  async function handleAnalyzeConversation(convId: string) {
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
  }

  // Debounce search - déclenche fetchConversations après 300ms sans frappe
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1) // Reset page on search
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Re-fetch quand le debounced search change
  useEffect(() => {
    fetchConversations()
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] md:h-[calc(100dvh-4rem)] pb-16 md:pb-0">
      {/* Conversation list - Intercom style */}
      <div
        className={cn(
          'w-full flex-col bg-background md:w-80 lg:w-96 md:border-r',
          selectedConv ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Search header */}
        <div data-tour="conversations-header" className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('conversations.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Filter bar */}
          <div data-tour="conversations-filters" className="flex items-center gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
              {t('conversations.filters')}
              {(filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all' || filterLifecycleStage !== 'all' || filterTags.length > 0) && (
                <Badge variant="default" className="ml-1 h-4 w-4 p-0 text-[10px]">
                  {(filterSession !== 'all' ? 1 : 0) + (filterAiActive !== 'all' ? 1 : 0) + (filterTeam !== 'all' ? 1 : 0) + (filterLifecycleStage !== 'all' ? 1 : 0) + (filterTags.length > 0 ? 1 : 0)}
                </Badge>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('conversations.conversations_count', { count: totalConversations })}
            </span>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 animate-fade-in-up">
              {teams.length > 0 && (
                <Select value={filterTeam} onValueChange={(v) => { setFilterTeam(v); setPage(1) }}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder={t('conversations.team')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('conversations.all_teams')}</SelectItem>
                    <SelectItem value="personal">{t('conversations.personal')}</SelectItem>
                    {teams.map((tm) => (
                      <SelectItem key={tm.id} value={tm.id}>
                        {tm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterSession} onValueChange={(v) => { setFilterSession(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder={t('conversations.session')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('conversations.all_sessions')}</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.phone_number ? `+${s.phone_number}` : s.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAiActive} onValueChange={(v) => { setFilterAiActive(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder={t('conversations.ai_status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('conversations.all_statuses')}</SelectItem>
                  <SelectItem value="true">{t('conversations.ai_active')}</SelectItem>
                  <SelectItem value="false">{t('conversations.ai_inactive')}</SelectItem>
                </SelectContent>
              </Select>

              {lifecycleStages.length > 0 && (
                <Select value={filterLifecycleStage} onValueChange={(v) => { setFilterLifecycleStage(v); setPage(1) }}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <Workflow className="mr-1 h-3 w-3" />
                    <SelectValue placeholder={t('conversations.stage')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('conversations.all_stages')}</SelectItem>
                    <SelectItem value="none">{t('conversations.unclassified')}</SelectItem>
                    {lifecycleStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {allTags.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterTags.length > 0 ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Tag className="h-3 w-3" />
                      {filterTags.length > 0
                        ? t('conversations.filter_tags_count', { count: String(filterTags.length) })
                        : t('conversations.filter_tags')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {allTags.map((tag) => {
                        const isSelected = filterTags.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              setFilterTags((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== tag.id)
                                  : [...prev, tag.id]
                              )
                              setPage(1)
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors',
                              isSelected && 'bg-muted'
                            )}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="truncate">{tag.name}</span>
                            {isSelected && <Check className="h-3 w-3 ml-auto text-primary shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                    {filterTags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-1 h-7 text-xs"
                        onClick={() => { setFilterTags([]); setPage(1) }}
                      >
                        {t('common.reset')}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {(filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all' || filterLifecycleStage !== 'all' || filterTags.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => { setFilterSession('all'); setFilterAiActive('all'); setFilterTeam('all'); setFilterLifecycleStage('all'); setFilterTags([]); setPage(1) }}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t('common.reset')}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Conversation list */}
        {conversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {t('conversations.no_conversations')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              {t('conversations.no_conversations_desc')}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto scrollbar-thin">
              {conversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id
                return (
                  <button
                    key={conv.id}
                    onClick={() => { setSelectedConv(conv); setProfileOpen(false) }}
                    className={cn(
                      'group/conv flex w-full items-start gap-3 p-3 text-left transition-all hover:bg-muted/50',
                      isSelected && 'bg-primary/5 border-l-2 border-l-primary'
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] text-white'
                      )}>
                        {getContactInitials(conv)}
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          'truncate text-sm',
                          conv.unread_count > 0 ? 'font-semibold' : 'font-medium'
                        )}>
                          {getContactDisplay(conv)}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); togglePin(conv.id, conv.is_pinned) }}
                            className={cn(
                              'p-0.5 rounded hover:bg-muted transition-opacity',
                              conv.is_pinned ? 'opacity-100 text-primary' : 'opacity-0 group-hover/conv:opacity-100 text-muted-foreground'
                            )}
                            title={conv.is_pinned ? t('conversations.unpin_conversation') : t('conversations.pin_conversation')}
                          >
                            <Pin className={cn('h-3 w-3', conv.is_pinned && 'fill-current')} />
                          </span>
                          {conv.last_message_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: locale === 'fr' ? fr : enUS })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Numéro de téléphone - toujours visible si le contact a un nom */}
                      {(conv.contact.first_name || conv.contact.last_name || conv.contact.name) && (
                        <div className="flex items-center gap-1 group/phone">
                          <p className="text-[10px] text-muted-foreground truncate">
                            +{conv.contact.phone_number}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(`+${conv.contact.phone_number}`)
                              toast.success(t('conversations.number_copied'))
                            }}
                            className="opacity-0 group-hover/phone:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                          >
                            <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                          </button>
                        </div>
                      )}

                      <p className={cn(
                        'mt-0.5 truncate text-xs',
                        conv.unread_count > 0 ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {conv.last_message_preview || t('conversations.no_message')}
                      </p>

                      {/* Meta row */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Smartphone className="h-3 w-3" />
                          {getSessionLabel(conv)}
                        </span>
                        {conv.session.team_name && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/30 text-primary">
                            {conv.session.team_name}
                          </Badge>
                        )}
                        {conv.is_ai_active && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-[#7DC2A5]/10 text-[#7DC2A5] hover:bg-[#7DC2A5]/20 border-0">
                            <Bot className="mr-0.5 h-2.5 w-2.5" />
                            {locale === 'fr' ? 'IA' : 'AI'}
                          </Badge>
                        )}
                        {conv.lifecycle_stage_id && (() => {
                          const stage = lifecycleStages.find((s) => s.id === conv.lifecycle_stage_id)
                          return stage ? (
                            <Badge
                              className="h-4 px-1.5 text-[9px] border-0"
                              style={{ backgroundColor: `${stage.color}15`, color: stage.color }}
                            >
                              {stage.name}
                            </Badge>
                          ) : null
                        })()}
                      </div>

                      {/* Tags */}
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                        {(conversationTags[conv.id] || []).slice(0, 2).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {(conversationTags[conv.id] || []).length > 2 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{(conversationTags[conv.id] || []).length - 2}
                          </span>
                        )}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!conversationTags[conv.id]) fetchConversationTags(conv.id)
                              }}
                              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted"
                            >
                              <Tag className="h-2.5 w-2.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-52 p-2"
                            align="start"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-2">
                              <p className="text-xs font-medium px-1">Tags</p>
                              <div className="max-h-32 overflow-auto space-y-0.5">
                                {allTags.map((tag) => {
                                  const isTagSelected = (conversationTags[conv.id] || []).some((t) => t.id === tag.id)
                                  return (
                                    <button
                                      key={tag.id}
                                      onClick={() => handleToggleTag(conv.id, tag)}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                                        isTagSelected ? 'bg-muted' : 'hover:bg-muted/50'
                                      )}
                                    >
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: tag.color }}
                                      />
                                      <span className="flex-1 text-left truncate">{tag.name}</span>
                                      {isTagSelected && <Check className="h-3 w-3 text-primary" />}
                                    </button>
                                  )
                                })}
                                {allTags.length === 0 && (
                                  <p className="text-xs text-muted-foreground py-2 text-center">{t('conversations.no_tags')}</p>
                                )}
                              </div>
                              <div className="border-t pt-2 space-y-2">
                                <div className="flex gap-1">
                                  <Input
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    placeholder={t('conversations.new_tag_placeholder')}
                                    className="h-7 text-xs"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleCreateTag()
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={handleCreateTag}
                                    disabled={!newTagName.trim() || creatingTag}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {TAG_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      onClick={() => setNewTagColor(color)}
                                      className={cn(
                                        'h-5 w-5 rounded-full transition-all',
                                        newTagColor === color ? 'ring-2 ring-offset-1 ring-primary' : 'hover:scale-110'
                                      )}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t p-2 flex items-center justify-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-3 min-w-[60px] text-center">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat area */}
      <div
        className={cn(
          'flex flex-1 flex-col bg-[#F5F7FA] dark:bg-[#1A252C]',
          !selectedConv ? 'hidden md:flex' : 'flex'
        )}
      >
        {selectedConv ? (
          <>
            {/* Chat header - Intercom style */}
            <div className="flex items-center gap-3 bg-background border-b px-4 py-3">
              <button
                onClick={() => { setSelectedConv(null); setProfileOpen(false) }}
                className="md:hidden p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <button
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] text-white text-sm font-medium">
                  {getContactInitials(selectedConv)}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold">
                    {getContactDisplay(selectedConv)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {/^\d{8,}$/.test(selectedConv.contact.phone_number)
                      ? `+${selectedConv.contact.phone_number}`
                      : selectedConv.contact.phone_number}
                  </p>
                </div>
              </button>

              {/* Agent IA controls */}
              <div className="hidden sm:flex items-center gap-2">
                {/* Lifecycle stage selector */}
                {lifecycleStages.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Select
                      value={selectedConv.lifecycle_stage_id || 'none'}
                      onValueChange={(val) =>
                        handleChangeLifecycleStage(selectedConv.id, val === 'none' ? null : val)
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs border-0 bg-muted/50">
                        <Workflow className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                        <SelectValue placeholder={t('conversations.stage')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('conversations.unclassified')}</SelectItem>
                        {lifecycleStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAnalyzeConversation(selectedConv.id)}
                      disabled={analyzingConvId === selectedConv.id}
                      title={t('conversations.analyze_ai')}
                    >
                      {analyzingConvId === selectedConv.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}

                <Select
                  value={selectedConv.ai_agent_id || 'none'}
                  onValueChange={(val) =>
                    handleAssignAgent(selectedConv.id, val === 'none' ? null : val)
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs border-0 bg-muted/50">
                    <Bot className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder={t('conversations.agent_ia')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.no_agent')}</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedConv.ai_agent_id && (
                  <Switch
                    checked={selectedConv.is_ai_active}
                    onCheckedChange={(checked) =>
                      handleToggleAI(selectedConv.id, checked)
                    }
                  />
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setProfileOpen(true)}
              >
                <UserCircle className="h-5 w-5" />
              </Button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-auto p-4 scrollbar-thin">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <MessageSquare className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {t('conversations.start_conversation')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {messages.map((msg) => {
                    const isAI = msg.sent_by === 'ai_agent'
                    const isOutbound = msg.direction === 'outbound'
                    const isCopied = copiedMessageId === msg.id

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'group flex items-end gap-2',
                          isOutbound ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {/* Copy button (left for outbound) */}
                        {isOutbound && msg.content && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                            className="mb-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

                        {/* Message bubble */}
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-4 py-2.5',
                            isAI
                              ? 'bubble-ai'
                              : isOutbound
                                ? 'bubble-outgoing'
                                : 'bubble-incoming'
                          )}
                        >
                          {isAI && (
                            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[#7DC2A5]">
                              <Bot className="h-3 w-3" />
                              {(msg as typeof msg & { agent_name?: string }).agent_name || t('conversations.agent_ia')}
                            </div>
                          )}
                          <MessageBubbleContent msg={msg} isOutbound={isOutbound} />
                          <p
                            className={cn(
                              'mt-1.5 text-[10px]',
                              isAI
                                ? 'text-[#7DC2A5]/70'
                                : isOutbound
                                  ? 'text-white/70'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {new Date(msg.created_at).toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {msg.status === 'pending' && ` · ${t('conversations.sending')}`}
                          </p>
                        </div>

                        {/* Copy button (right for inbound) */}
                        {!isOutbound && msg.content && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                            className="mb-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Mobile AI controls */}
            {selectedConv.ai_agent_id && (
              <div className="sm:hidden flex items-center justify-between px-4 py-2 bg-background border-t">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {agents.find(a => a.id === selectedConv.ai_agent_id)?.name || t('conversations.agent_ia')}
                  </span>
                </div>
                <Switch
                  checked={selectedConv.is_ai_active}
                  onCheckedChange={(checked) =>
                    handleToggleAI(selectedConv.id, checked)
                  }
                />
              </div>
            )}

            {/* Message input - Modern style */}
            <div className="bg-background border-t">
              {/* Attachment preview */}
              {attachedFile && (
                <div className="px-3 pt-3 max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                    {attachedPreview ? (
                      <img src={attachedPreview} alt="" className="h-14 w-14 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                        {attachedFile.type.startsWith('video/') ? (
                          <Video className="h-6 w-6 text-muted-foreground" />
                        ) : (
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{attachedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachedFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAttachment}
                      className="shrink-0 p-1 rounded-full hover:bg-muted"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )}

              {/* Recording indicator */}
              {isRecording ? (
                <div className="p-3">
                  <div className="flex items-center gap-3 max-w-3xl mx-auto">
                    <div className="flex items-center gap-2 flex-1 rounded-full bg-red-50 dark:bg-red-950/30 px-4 h-11">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                        {t('conversations.recording')} {formatDuration(recordingDuration)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={cancelRecording}
                      className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={stopRecording}
                      className="h-11 w-11 rounded-full shrink-0 bg-red-500 hover:bg-red-600"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSend} className="p-3">
                  <div className="flex items-center gap-2 max-w-3xl mx-auto">
                    {/* Attachment button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                      onChange={handleFileSelect}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                      title={t('conversations.attach_file')}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>

                    <div className="relative flex-1">
                      <Input
                        ref={inputRef}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={attachedFile ? t('conversations.caption_placeholder') : t('conversations.write_message')}
                        disabled={sending}
                        maxLength={4096}
                        className="pr-4 h-11 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary rounded-full"
                      />
                    </div>

                    {/* Send or Mic button */}
                    {newMessage.trim() || attachedFile ? (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={(!newMessage.trim() && !attachedFile) || sending}
                        className="h-11 w-11 rounded-full shrink-0"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        onClick={startRecording}
                        disabled={sending}
                        className="h-11 w-11 rounded-full shrink-0"
                        title={t('conversations.record_voice')}
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-9 w-9 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                {t('conversations.your_conversations')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('conversations.select_conversation')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contact profile panel */}
      <ContactProfilePanel
        contactId={selectedConv?.contact.id ?? null}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onContactDeleted={() => {
          // Retirer la conversation de la liste et désélectionner
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
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ConversationsPageContent />
    </Suspense>
  )
}
