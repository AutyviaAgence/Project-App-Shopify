'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ContactProfilePanel } from '@/components/contact-profile-panel'
import { LifecycleStagesDialog } from '@/components/lifecycle-stages-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/context'
import { useSubscription } from '@/hooks/use-subscription'
import { ConversationList } from './_components/conversation-list'
import { ChatArea } from './_components/chat-area'
import { ShopifyContextPanel } from './_components/shopify-context-panel'
import { ContactsTableView } from './_components/contacts-table-view'
import { MessageSquare, Table2 } from 'lucide-react'
import { USE_CASES, guessUseCase, type UseCaseKey } from '@/lib/templates/use-cases'
import { cn } from '@/lib/utils'
import { track } from '@/lib/posthog/events'
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
  // Conversations ayant une action Shopify en attente (badge + remontée en haut).
  const [pendingActionConvIds, setPendingActionConvIds] = useState<Set<string>>(new Set())
  // Incrémenté après une action Shopify (remboursement…) → force le panneau
  // commandes/historique à se recharger sans rafraîchir la page.
  const [shopifyRefreshKey, setShopifyRefreshKey] = useState(0)
  const fetchPendingActions = useCallback(async () => {
    setShopifyRefreshKey((k) => k + 1)
    try {
      const res = await fetch('/api/shopify/actions/pending-conversations')
      const json = await res.json()
      if (res.ok) setPendingActionConvIds(new Set((json.conversationIds || []).filter(Boolean)))
    } catch { /* silencieux */ }
  }, [])
  useEffect(() => { fetchPendingActions() }, [fetchPendingActions])
  const selectedConvIdRef = useRef<string | null>(null)
  const [pendingOpenConvId, setPendingOpenConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  // Bascule template hors fenêtre 24h
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [approvedTemplates, setApprovedTemplates] = useState<{ id: string; name: string; language: string; body_text?: string; use_case?: string | null; category?: string | null }[]>([])
  // Filtre par catégorie e-commerce du sélecteur de modèles (façon onboarding).
  const [tplFilter, setTplFilter] = useState<UseCaseKey | 'all'>('all')
  // Nouvelle conversation
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [newConvTemplate, setNewConvTemplate] = useState('')
  const [newConvSending, setNewConvSending] = useState(false)
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [profileOpen, setProfileOpen] = useState(false)
  // Bascule d'affichage : messagerie (chat) ↔ tableau exportable des contacts.
  const [viewMode, setViewMode] = useState<'chat' | 'table'>('chat')
  // Cible du portail : l'emplacement réservé dans la barre du haut globale.

  // Lifecycle stages (= « étapes », l'ancien système de tags a été fusionné ici)
  const [lifecycleStages, setLifecycleStages] = useState<LifecycleStage[]>([])
  // Étapes (multi) par conversation, pour l'affichage des badges dans la liste.
  const [conversationStages, setConversationStages] = useState<Record<string, LifecycleStage[]>>({})
  const [analyzingConvId, setAnalyzingConvId] = useState<string | null>(null)
  const [manageStagesOpen, setManageStagesOpen] = useState(false)

  // Filters
  const [sessions, setSessions] = useState<{ id: string; instance_name: string; phone_number: string | null }[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [filterChannel, setFilterChannel] = useState<string>('all')
  const [filterSession, setFilterSession] = useState<string>('all')
  const [filterAiActive, setFilterAiActive] = useState<string>('all')
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterLifecycleStage, setFilterLifecycleStage] = useState<string>('all')
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

  // Système d'équipes retiré : plus d'appel /api/teams.
  const fetchTeams = useCallback(async () => {}, [])

  // Charge les ÉTAPES (multi) de plusieurs conversations en un appel.
  const fetchAllConversationStages = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) return
    try {
      const res = await fetch('/api/conversations/lifecycle/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_ids: convIds }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setConversationStages((prev) => ({ ...prev, ...json.data }))
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
        if (convIds.length > 0) fetchAllConversationStages(convIds)
      }
    } catch {
      toast.error(t('conversations.load_error'))
    } finally {
      setLoading(false)
    }
  }, [filterChannel, filterSession, filterAiActive, filterTeam, filterLifecycleStage, page, debouncedSearch, fetchAllConversationStages])

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
    track('message_sent', { type: 'text' })

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
      read_at: null,
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
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        // Hors fenêtre 24h → proposer d'envoyer un modèle approuvé (bascule)
        if (json.window_closed) {
          setTemplateDialogOpen(true)
        } else {
          toast.error(json.error || t('conversations.send_error'))
        }
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

  // Charger les modèles approuvés quand on ouvre la bascule template OU la nouvelle conversation
  useEffect(() => {
    if (!templateDialogOpen && !newConvOpen) return
    if (templateDialogOpen) setTplFilter('all') // repart sur « Tous » à chaque ouverture
    fetch('/api/templates')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) setApprovedTemplates(j.data.filter((tpl: { status: string }) => tpl.status === 'approved'))
      })
      .catch(() => {})
  }, [templateDialogOpen, newConvOpen])

  // Créer une nouvelle conversation (numéro + template approuvé)
  const handleNewConversation = useCallback(async () => {
    if (!newConvPhone.trim() || !newConvTemplate) { toast.error('Numéro et modèle requis'); return }
    setNewConvSending(true)
    try {
      const res = await fetch('/api/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newConvPhone, template_id: newConvTemplate }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success('Conversation démarrée')
      setNewConvOpen(false)
      await fetchConversations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setNewConvSending(false)
    }
  }, [newConvPhone, newConvTemplate, fetchConversations])

  // Envoyer un modèle approuvé (recontact hors fenêtre 24h)
  const handleSendTemplate = useCallback(async (templateId: string) => {
    if (!selectedConv) return
    setSending(true)
    track('template_sent_in_chat', { template_id: templateId })
    try {
      const res = await fetch(`/api/conversations/${selectedConv.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t('conversations.send_error'))
        return
      }
      if (json.data) setMessages((prev) => [...prev, json.data])
      setTemplateDialogOpen(false)
      toast.success('Modèle envoyé')
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSending(false)
    }
  }, [selectedConv, t])

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
      read_at: null,
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
    track('media_sent', { mime: file.type })

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
      read_at: null,
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
    track('ai_toggle_changed', { active: isActive })
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
        // Sync des badges multi : le sélecteur du chat pose UNE étape (remplace).
        const stage = stageId ? lifecycleStages.find((s) => s.id === stageId) : null
        setConversationStages((prev) => ({ ...prev, [convId]: stage ? [stage] : [] }))
        const stageName = stage?.name || t('conversations.unclassified')
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
        toast.success(`${result.stageName || t('conversations.unclassified')}, ${result.reason}`)
      } else {
        toast.error(json.error || t('conversations.analysis_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setAnalyzingConvId(null)
    }
  }, [analyzingConvId, selectedConv?.id, t])

  // Ajoute/retire une ÉTAPE sur une conversation (multi, plafonné à 3).
  // Optimiste + rollback ; persiste la liste complète via PUT lifecycle.
  const handleToggleStage = useCallback(async (convId: string, stageId: string) => {
    const current = conversationStages[convId] || []
    const has = current.some((s) => s.id === stageId)
    if (!has && current.length >= 3) {
      toast.error(t('conversations.max_stages') || 'Maximum 3 étapes par conversation')
      return
    }
    const stage = lifecycleStages.find((s) => s.id === stageId)
    if (!stage) return

    const next = has ? current.filter((s) => s.id !== stageId) : [...current, stage]
    setConversationStages((prev) => ({ ...prev, [convId]: next }))
    // Refléter la 1re étape sur la conv (colonne legacy, affichage badge unique ailleurs)
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, lifecycle_stage_id: next[0]?.id ?? null } : c))

    try {
      const res = await fetch(`/api/conversations/${convId}/lifecycle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_ids: next.map((s) => s.id) }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setConversationStages((prev) => ({ ...prev, [convId]: current }))
      toast.error(t('common.network_error'))
    }
  }, [conversationStages, lifecycleStages, t])

  // --- Effects ---
  useEffect(() => {
    Promise.all([
      fetchConversations(),
      fetchAgents(),
      fetchSessions(),
      fetchTeams(),
      fetchLifecycleStages(),
    ])
  }, [fetchConversations, fetchAgents, fetchSessions, fetchTeams, fetchLifecycleStages])

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
                : newMsg.message_type === 'carousel' ? '🎠 Carrousel'
                : newMsg.message_type === 'interactive' ? '🏷️ Offre'
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

  // Bascule messagerie ↔ tableau. Elle vivait dans la barre du haut globale via
  // un portail (#topbar-slot) ; elle est désormais rendue EN PLACE, au-dessus de
  // la liste des conversations, là où l'utilisateur la cherche.
  const viewToggle = (
    // `w-full` + `flex-1` sur chaque bouton : la bascule occupe toute la largeur
    // de la colonne, les deux vues se partagent l'espace à parts égales.
    <div className="flex w-full rounded-lg border bg-background/90 p-0.5 shadow-sm">
      <button
        onClick={() => setViewMode('chat')}
        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
          viewMode === 'chat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Vue messagerie"
      >
        <MessageSquare className="h-4 w-4" />
        <span>Messagerie</span>
      </button>
      <button
        onClick={() => setViewMode('table')}
        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
          viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Vue tableau"
      >
        <Table2 className="h-4 w-4" />
        <span>Tableau</span>
      </button>
    </div>
  )

  if (viewMode === 'table') {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden pb-16 md:pb-0">
        {/* En vue tableau la bascule n'est plus dans la colonne : on la borne,
            sinon `w-full` l'étirerait sur toute la largeur de l'écran. */}
        <div className="border-b px-4 py-2"><div className="max-w-xs">{viewToggle}</div></div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ContactsTableView sessions={sessions} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden pb-16 md:pb-0">
      <ConversationList
        viewToggle={viewToggle}
        conversations={conversations}
        pendingActionConvIds={pendingActionConvIds}
        onNewConversation={() => { setNewConvOpen(true); setNewConvPhone(''); setNewConvTemplate('') }}
        selectedConvId={selectedConv?.id ?? null}
        totalPages={totalPages}
        totalConversations={totalConversations}
        page={page}
        sessions={sessions}
        teams={teams}
        conversationStages={conversationStages}
        lifecycleStages={lifecycleStages}
        searchQuery={searchQuery}
        filterChannel={filterChannel}
        filterSession={filterSession}
        filterAiActive={filterAiActive}
        filterTeam={filterTeam}
        filterLifecycleStage={filterLifecycleStage}
        onSelectConversation={(conv) => { setSelectedConv(conv); setProfileOpen(false); track('conversation_opened') }}
        onTogglePin={togglePin}
        onSetPage={setPage}
        onSetSearchQuery={setSearchQuery}
        onSetFilterChannel={setFilterChannel}
        onSetFilterSession={setFilterSession}
        onSetFilterAiActive={setFilterAiActive}
        onSetFilterTeam={setFilterTeam}
        onSetFilterLifecycleStage={setFilterLifecycleStage}
        onToggleStage={handleToggleStage}
        onManageStages={() => setManageStagesOpen(true)}
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
        onActionsChange={fetchPendingActions}
        onSendTemplate={() => setTemplateDialogOpen(true)}
      />

      {/* Contexte Shopify : commandes du client (helpdesk e-commerce) */}
      {selectedConv && (
        <ShopifyContextPanel
          contactId={selectedConv.contact_id}
          conversationId={selectedConv.id}
          refreshKey={shopifyRefreshKey}
          contactName={
            selectedConv.contact?.name
            || [selectedConv.contact?.first_name, selectedConv.contact?.last_name].filter(Boolean).join(' ')
            || selectedConv.contact?.phone_number
            || null
          }
        />
      )}

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

      {/* Gestion des étapes du cycle de vie (remplace la page /lifecycle) */}
      <LifecycleStagesDialog
        open={manageStagesOpen}
        onOpenChange={setManageStagesOpen}
        stages={lifecycleStages}
        onStagesChanged={fetchLifecycleStages}
      />

      {/* Bascule template : le client est hors fenêtre 24h */}
      {/* Nouvelle conversation : numéro + modèle approuvé */}
      <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle conversation</DialogTitle>
            <DialogDescription>
              Démarrez une conversation WhatsApp avec un nouveau numéro. Un modèle
              approuvé par Meta est requis (seul moyen autorisé hors fenêtre 24h).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Numéro WhatsApp (avec indicatif)</label>
              <input
                value={newConvPhone}
                onChange={(e) => setNewConvPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Modèle</label>
              {approvedTemplates.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Aucun modèle approuvé. Créez-en un dans <span className="font-medium">Modèles</span> et faites-le approuver par Meta.
                </p>
              ) : (
                <select
                  value={newConvTemplate}
                  onChange={(e) => setNewConvTemplate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">Choisir un modèle…</option>
                  {approvedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.language})</option>
                  ))}
                </select>
              )}
            </div>
            <Button
              onClick={handleNewConversation}
              disabled={newConvSending || !newConvPhone.trim() || !newConvTemplate}
              className="w-full"
            >
              {newConvSending ? 'Envoi…' : 'Démarrer la conversation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recontacter avec un modèle</DialogTitle>
            <DialogDescription>
              Ce client n&apos;a pas écrit depuis plus de 24h. WhatsApp n&apos;autorise plus le texte libre :
              choisissez un modèle approuvé par Meta pour le recontacter.
            </DialogDescription>
          </DialogHeader>

          {approvedTemplates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun modèle approuvé. Créez-en un dans Modèles et faites-le approuver par Meta.
            </p>
          ) : (() => {
            // Catégorie de chaque modèle (use_case, ou déduite du nom).
            const catOf = (t: typeof approvedTemplates[number]): UseCaseKey =>
              (t.use_case as UseCaseKey) || guessUseCase(t.name, t.category)
            // Filtres visibles : « Tous » + les catégories réellement présentes.
            const present = new Set(approvedTemplates.map(catOf))
            const filters = USE_CASES.filter((u) => present.has(u.key))
            const shown = tplFilter === 'all'
              ? approvedTemplates
              : approvedTemplates.filter((t) => catOf(t) === tplFilter)
            return (
              <div className="space-y-3">
                {/* Puces de filtre (façon onboarding automatisations). */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTplFilter('all')}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      tplFilter === 'all' ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Tous ({approvedTemplates.length})
                  </button>
                  {filters.map((u) => {
                    const n = approvedTemplates.filter((t) => catOf(t) === u.key).length
                    return (
                      <button
                        key={u.key}
                        onClick={() => setTplFilter(u.key)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          tplFilter === u.key ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {u.label} ({n})
                      </button>
                    )
                  })}
                </div>

                {/* Carrousel horizontal : cartes-modèles en bulle WhatsApp. */}
                {shown.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aucun modèle dans cette catégorie.</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                    {shown.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => handleSendTemplate(tpl.id)}
                        disabled={sending}
                        className="group flex w-[230px] shrink-0 flex-col overflow-hidden rounded-2xl border text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                          <span className="truncate text-sm font-medium">{tpl.name}</span>
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{tpl.language}</span>
                        </div>
                        <div className="flex-1 p-3">
                          {tpl.body_text && (
                            <div className="rounded-lg rounded-tl-none bg-[#d9fdd3] px-2.5 py-2 text-[12px] leading-snug text-gray-900 shadow-sm">
                              {tpl.body_text}
                              <span className="ml-1 text-[9px] text-gray-500">12:00</span>
                            </div>
                          )}
                        </div>
                        <div className="border-t py-2 text-center text-xs font-medium text-primary transition-colors group-hover:bg-primary/5">
                          Envoyer ce modèle
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-center text-[11px] text-muted-foreground">Glissez horizontalement pour voir tous les modèles →</p>
              </div>
            )
          })()}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuler</Button>
          </div>
        </DialogContent>
      </Dialog>
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
