'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message, AIAgent, ConversationTag } from '@/types/database'
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
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getSessionDisplayName, getContactDisplayName } from '@/lib/format-phone'

type ConversationWithJoins = {
  id: string
  session_id: string
  contact_id: string
  ai_agent_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  is_ai_active: boolean
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

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConv, setSelectedConv] = useState<ConversationWithJoins | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [profileOpen, setProfileOpen] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Tags
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [conversationTags, setConversationTags] = useState<Record<string, ConversationTag[]>>({})
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)

  // Filters
  const [sessions, setSessions] = useState<{ id: string; instance_name: string; phone_number: string | null }[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterAiActive, setFilterAiActive] = useState<string>('all')
  const [filterTeam, setFilterTeam] = useState<string>('all')
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

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterSession !== 'all') params.set('session_id', filterSession)
      if (filterAiActive !== 'all') params.set('is_ai_active', filterAiActive)
      if (filterTeam !== 'all') params.set('team_id', filterTeam)
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim())
        params.set('limit', '100') // Plus de résultats lors d'une recherche
      } else {
        params.set('page', page.toString())
        params.set('limit', ITEMS_PER_PAGE.toString())
      }

      const url = `/api/conversations?${params.toString()}`
      const res = await fetch(url)
      const json = await res.json()
      if (res.ok && json.data) {
        setConversations(json.data)
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages)
          setTotalConversations(json.pagination.total)
        }
      }
    } catch {
      toast.error('Erreur lors du chargement des conversations')
    } finally {
      setLoading(false)
    }
  }, [filterSession, filterAiActive, filterTeam, page, searchQuery])

  useEffect(() => {
    fetchConversations()
    fetchAgents()
    fetchSessions()
    fetchTags()
    fetchTeams()
  }, [fetchConversations, fetchAgents, fetchSessions, fetchTags, fetchTeams])

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
      toast.error('Erreur lors du chargement des messages')
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
        toast.error(json.error || 'Erreur lors de l\'envoi')
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
      toast.error('Erreur réseau')
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setNewMessage(content)
    } finally {
      setSending(false)
    }
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
        toast.success(agentId ? 'Agent assigné' : 'Agent retiré')
      }
    } catch {
      toast.error('Erreur réseau')
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
        toast.success(isActive ? 'IA activée' : 'IA désactivée')
      }
    } catch {
      toast.error('Erreur réseau')
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
      toast.error('Impossible de copier')
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim() || creatingTag) return
    setCreatingTag(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAllTags((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
        setNewTagName('')
        toast.success('Tag créé')
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
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
        toast.error('Erreur lors de la mise à jour')
      }
    } catch {
      setConversationTags((prev) => ({ ...prev, [convId]: currentTags }))
      toast.error('Erreur réseau')
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
        <div className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtres
              {(filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all') && (
                <Badge variant="default" className="ml-1 h-4 w-4 p-0 text-[10px]">
                  {(filterSession !== 'all' ? 1 : 0) + (filterAiActive !== 'all' ? 1 : 0) + (filterTeam !== 'all' ? 1 : 0)}
                </Badge>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalConversations} conversation{totalConversations !== 1 ? 's' : ''}
            </span>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 animate-fade-in-up">
              {teams.length > 0 && (
                <Select value={filterTeam} onValueChange={(v) => { setFilterTeam(v); setPage(1) }}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Équipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="personal">Personnelles</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterSession} onValueChange={(v) => { setFilterSession(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.phone_number ? `+${s.phone_number}` : s.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAiActive} onValueChange={(v) => { setFilterAiActive(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="Statut IA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="true">IA active</SelectItem>
                  <SelectItem value="false">IA inactive</SelectItem>
                </SelectContent>
              </Select>

              {(filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => { setFilterSession('all'); setFilterAiActive('all'); setFilterTeam('all'); setPage(1) }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Reset
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
              Aucune conversation
            </p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              Les messages reçus apparaîtront ici.
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
                      'flex w-full items-start gap-3 p-3 text-left transition-all hover:bg-muted/50',
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
                        {conv.last_message_at && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: fr })}
                          </span>
                        )}
                      </div>

                      {/* Nom WhatsApp si différent du nom affiché */}
                      {conv.contact.name && (conv.contact.first_name || conv.contact.last_name) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {conv.contact.name}
                        </p>
                      )}

                      <p className={cn(
                        'mt-0.5 truncate text-xs',
                        conv.unread_count > 0 ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {conv.last_message_preview || 'Pas de message'}
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
                            IA
                          </Badge>
                        )}
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
                                  <p className="text-xs text-muted-foreground py-2 text-center">Aucun tag</p>
                                )}
                              </div>
                              <div className="border-t pt-2">
                                <div className="flex gap-1">
                                  <Input
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    placeholder="Nouveau tag..."
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
                    +{selectedConv.contact.phone_number}
                  </p>
                </div>
              </button>

              {/* Agent IA controls */}
              <div className="hidden sm:flex items-center gap-2">
                <Select
                  value={selectedConv.ai_agent_id || 'none'}
                  onValueChange={(val) =>
                    handleAssignAgent(selectedConv.id, val === 'none' ? null : val)
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs border-0 bg-muted/50">
                    <Bot className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Agent IA" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun agent</SelectItem>
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
                    Démarrez la conversation
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
                              Agent IA
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {msg.content}
                          </p>
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
                            {new Date(msg.created_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {msg.status === 'pending' && ' · envoi...'}
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
                    {agents.find(a => a.id === selectedConv.ai_agent_id)?.name || 'Agent IA'}
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
            <form onSubmit={handleSend} className="bg-background border-t p-3">
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <div className="relative flex-1">
                  <Input
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Écrivez un message..."
                    disabled={sending}
                    maxLength={4096}
                    className="pr-12 h-11 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary rounded-full"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!newMessage.trim() || sending}
                  className="h-11 w-11 rounded-full shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-9 w-9 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                Vos conversations
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sélectionnez une conversation pour commencer
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
