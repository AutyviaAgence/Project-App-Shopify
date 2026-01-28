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
  User,
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
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

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
    profile_picture: string | null
  }
  session: {
    id: string
    instance_name: string
    phone_number: string | null
  }
  tags?: ConversationTag[]
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

  // Tags
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [conversationTags, setConversationTags] = useState<Record<string, ConversationTag[]>>({})
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)

  // Filters
  const [sessions, setSessions] = useState<{ id: string; instance_name: string; phone_number: string | null }[]>([])
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterAiActive, setFilterAiActive] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

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
      }
    } catch {
      toast.error('Erreur lors du chargement des conversations')
    } finally {
      setLoading(false)
    }
  }, [filterSession, filterAiActive, page])

  useEffect(() => {
    fetchConversations()
    fetchAgents()
    fetchSessions()
    fetchTags()
  }, [fetchConversations, fetchAgents, fetchSessions, fetchTags])

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
        (payload) => {
          const newMsg = payload.new as Message
          // Add to current chat if matching
          if (selectedConv && newMsg.conversation_id === selectedConv.id) {
            setMessages((prev) => {
              // Deduplicate
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          }
          // Update conversation list
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
  }, [selectedConv?.id, fetchConversations])

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
        // Remove optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setNewMessage(content)
        return
      }

      // Replace optimistic with real message
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
    if (conv.contact.name) {
      return `${conv.contact.name} (+${conv.contact.phone_number})`
    }
    return `+${conv.contact.phone_number}`
  }

  function getSessionLabel(conv: ConversationWithJoins) {
    return conv.session.phone_number
      ? `+${conv.session.phone_number}`
      : conv.session.instance_name
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

    // Optimistic update
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
        // Revert
        setConversationTags((prev) => ({ ...prev, [convId]: currentTags }))
        toast.error('Erreur lors de la mise à jour')
      }
    } catch {
      setConversationTags((prev) => ({ ...prev, [convId]: currentTags }))
      toast.error('Erreur réseau')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div
        className={cn(
          'w-full border-r md:w-80 lg:w-96',
          selectedConv ? 'hidden md:block' : 'block'
        )}
      >
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">Conversations</h1>
              <p className="text-xs text-muted-foreground">
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {showFilters && (
            <div className="mt-3 space-y-2">
              <Select value={filterSession} onValueChange={setFilterSession}>
                <SelectTrigger className="h-8 text-xs">
                  <Smartphone className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sessions</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.phone_number ? `+${s.phone_number}` : s.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAiActive} onValueChange={setFilterAiActive}>
                <SelectTrigger className="h-8 text-xs">
                  <Bot className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Statut IA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="true">IA active</SelectItem>
                  <SelectItem value="false">IA inactive</SelectItem>
                </SelectContent>
              </Select>

              {(filterSession !== 'all' || filterAiActive !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => {
                    setFilterSession('all')
                    setFilterAiActive('all')
                    setPage(1)
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          )}
        </div>

        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8">
            <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucune conversation pour le moment.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Les messages reçus apparaîtront ici.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => { setSelectedConv(conv); setProfileOpen(false) }}
                  className={cn(
                    'flex w-full items-start gap-3 border-b p-3 text-left transition-colors hover:bg-muted/50',
                    selectedConv?.id === conv.id && 'bg-muted'
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {getContactDisplay(conv)}
                      </span>
                      {conv.unread_count > 0 && (
                        <Badge variant="default" className="shrink-0 text-xs">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.last_message_preview || 'Pas de message'}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Smartphone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {getSessionLabel(conv)}
                      </span>
                      {conv.is_ai_active && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] text-violet-600 border-violet-300">
                          <Bot className="mr-0.5 h-2.5 w-2.5" />
                          IA
                        </Badge>
                      )}
                      {conv.last_message_at && (
                        <span className="text-[10px] text-muted-foreground">
                          · {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: fr })}
                        </span>
                      )}
                    </div>
                    {/* Tags */}
                    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                      {(conversationTags[conv.id] || []).slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {(conversationTags[conv.id] || []).length > 3 && (
                        <span className="text-[9px] text-muted-foreground">
                          +{(conversationTags[conv.id] || []).length - 3}
                        </span>
                      )}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!conversationTags[conv.id]) {
                                fetchConversationTags(conv.id)
                              }
                            }}
                            className="inline-flex items-center rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted"
                          >
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            Tags
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-2"
                          align="start"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="space-y-2">
                            <p className="text-xs font-medium">Gérer les tags</p>
                            <div className="max-h-32 overflow-auto space-y-1">
                              {allTags.map((tag) => {
                                const isSelected = (conversationTags[conv.id] || []).some((t) => t.id === tag.id)
                                return (
                                  <button
                                    key={tag.id}
                                    onClick={() => handleToggleTag(conv.id, tag)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors',
                                      isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                                    )}
                                  >
                                    <span
                                      className="h-3 w-3 rounded-full shrink-0"
                                      style={{ backgroundColor: tag.color }}
                                    />
                                    <span className="flex-1 text-left truncate">{tag.name}</span>
                                    {isSelected && <Check className="h-3 w-3 text-primary" />}
                                  </button>
                                )
                              })}
                              {allTags.length === 0 && (
                                <p className="text-xs text-muted-foreground py-1">Aucun tag disponible</p>
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
                                  className="h-7 px-2"
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
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t p-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {totalConversations} conv.
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs px-2">
                    {page}/{totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat area */}
      <div
        className={cn(
          'flex flex-1 flex-col',
          !selectedConv ? 'hidden md:flex' : 'flex'
        )}
      >
        {selectedConv ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b p-4">
              <button
                onClick={() => { setSelectedConv(null); setProfileOpen(false) }}
                className="md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {getContactDisplay(selectedConv)}
                </p>
                <div className="flex items-center gap-1">
                  <Smartphone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {getSessionLabel(selectedConv)}
                  </span>
                </div>
              </div>

              {/* Profile button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setProfileOpen(true)}
                title="Profil du contact"
              >
                <UserCircle className="h-5 w-5" />
              </Button>

              {/* Agent IA controls */}
              <div className="flex items-center gap-2">
                <Select
                  value={selectedConv.ai_agent_id || 'none'}
                  onValueChange={(val) =>
                    handleAssignAgent(selectedConv.id, val === 'none' ? null : val)
                  }
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <Bot className="mr-1 h-3 w-3" />
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
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Aucun message dans cette conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => {
                    const isAI = msg.sent_by === 'ai_agent'
                    const isCopied = copiedMessageId === msg.id
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'group flex items-start gap-1',
                          msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.direction === 'outbound' && msg.content && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                            className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            title="Copier"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <div
                          className={cn(
                            'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                            isAI
                              ? 'bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800'
                              : msg.direction === 'outbound'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                          )}
                        >
                          {isAI && (
                            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                              <Bot className="h-3 w-3" />
                              Agent IA
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          <p
                            className={cn(
                              'mt-1 text-[10px]',
                              isAI
                                ? 'text-violet-500'
                                : msg.direction === 'outbound'
                                  ? 'text-primary-foreground/70'
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
                        {msg.direction === 'inbound' && msg.content && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                            className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            title="Copier"
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

            {/* Message input */}
            <form onSubmit={handleSend} className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Écrivez un message..."
                  disabled={sending}
                  maxLength={4096}
                  autoFocus
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
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
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <MessageSquare className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              Sélectionnez une conversation
            </p>
          </div>
        )}
      </div>

      {/* Contact profile panel */}
      <ContactProfilePanel
        contactId={selectedConv?.contact.id ?? null}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}
