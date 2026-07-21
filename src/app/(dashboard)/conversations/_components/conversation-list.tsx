'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import {
  MessageSquare,
  Smartphone,
  Bot,
  Check,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Workflow,
  Pin,
  UserX,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, getContactDisplayName } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'
import type { ConversationWithJoins, Team, LifecycleStage } from './types'

interface ConversationListProps {
  conversations: ConversationWithJoins[]
  pendingActionConvIds?: Set<string>
  onNewConversation?: () => void
  /** Bascule Messagerie/Tableau, rendue en tête de la colonne. */
  viewToggle?: React.ReactNode
  selectedConvId: string | null
  totalPages: number
  totalConversations: number
  page: number
  sessions: { id: string; instance_name: string; phone_number: string | null }[]
  teams: Team[]
  conversationStages: Record<string, LifecycleStage[]>
  lifecycleStages: LifecycleStage[]
  searchQuery: string
  filterChannel: string
  filterSession: string
  filterAiActive: string
  filterTeam: string
  filterLifecycleStage: string
  onSelectConversation: (conv: ConversationWithJoins) => void
  onTogglePin: (convId: string, currentPinned: boolean) => void
  onSetPage: (page: number) => void
  onSetSearchQuery: (query: string) => void
  onSetFilterChannel: (value: string) => void
  onSetFilterSession: (value: string) => void
  onSetFilterAiActive: (value: string) => void
  onSetFilterTeam: (value: string) => void
  onSetFilterLifecycleStage: (value: string) => void
  onToggleStage: (convId: string, stageId: string) => void
  onManageStages?: () => void
}

export function ConversationList({
  conversations,
  pendingActionConvIds,
  onNewConversation,
  viewToggle,
  selectedConvId,
  totalPages,
  totalConversations,
  page,
  sessions,
  teams,
  conversationStages,
  lifecycleStages,
  searchQuery,
  filterChannel,
  filterSession,
  filterAiActive,
  filterTeam,
  filterLifecycleStage,
  onSelectConversation,
  onTogglePin,
  onSetPage,
  onSetSearchQuery,
  onSetFilterChannel,
  onSetFilterSession,
  onSetFilterAiActive,
  onSetFilterTeam,
  onSetFilterLifecycleStage,
  onToggleStage,
  onManageStages,
}: ConversationListProps) {
  const { t, locale } = useTranslation()
  const [showFilters, setShowFilters] = useState(false)

  function getContactDisplay(conv: ConversationWithJoins) {
    if (!conv.contact) return conv.last_message_preview?.slice(0, 30) || t('conversations.unknown_contact')
    return getContactDisplayName({
      name: conv.contact.name,
      first_name: conv.contact.first_name,
      last_name: conv.contact.last_name,
      phone_number: conv.contact.phone_number,
    })
  }

  // Nettoie l'apercu : retire le HTML (emails) et normalise les espaces
  function cleanPreview(raw: string | null | undefined): string {
    if (!raw) return ''
    return raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')                 // balises HTML
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  function getContactInitials(conv: ConversationWithJoins) {
    if (!conv.contact) return '?'
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
      display_name: null,
      phone_number: conv.session.phone_number,
      instance_name: conv.session.instance_name,
    })
  }

  const hasActiveFilters = filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all' || filterLifecycleStage !== 'all'
  const activeFilterCount = (filterSession !== 'all' ? 1 : 0) + (filterAiActive !== 'all' ? 1 : 0) + (filterTeam !== 'all' ? 1 : 0) + (filterLifecycleStage !== 'all' ? 1 : 0)

  return (
    <div
      data-tour="conversation-list"
      className={cn(
        'h-full min-h-0 w-full flex-col overflow-hidden bg-background md:w-80 lg:w-96 md:border-r',
        selectedConvId ? 'hidden md:flex' : 'flex'
      )}
    >
      {/* Search header */}
      <div data-tour="conversations-header" className="p-3 space-y-3">
        {/* Bascule Messagerie / Tableau, au-dessus de la recherche, à l'endroit
            où on la cherche (elle vivait auparavant dans la barre du haut). */}
        {viewToggle}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('conversations.search_placeholder')}
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          {onNewConversation && (
            <button
              onClick={onNewConversation}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title={t('conversations.new_conversation_title')}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
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
            {hasActiveFilters && (
              <Badge variant="default" className="ml-1 h-4 w-4 p-0 text-[10px]">
                {activeFilterCount}
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
              <Select value={filterTeam} onValueChange={(v) => { onSetFilterTeam(v); onSetPage(1) }}>
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

            <Select value={filterSession} onValueChange={(v) => { onSetFilterSession(v); onSetPage(1) }}>
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

            <Select value={filterAiActive} onValueChange={(v) => { onSetFilterAiActive(v); onSetPage(1) }}>
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
              <Select value={filterLifecycleStage} onValueChange={(v) => { onSetFilterLifecycleStage(v); onSetPage(1) }}>
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

            {onManageStages && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onManageStages}
                title={t('conversations.manage_stages_title')}
              >
                <Workflow className="h-3 w-3" />
                {t('conversations.manage_stages')}
              </Button>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => { onSetFilterSession('all'); onSetFilterAiActive('all'); onSetFilterTeam('all'); onSetFilterLifecycleStage('all'); onSetPage(1) }}
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
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {[...conversations].sort((a, b) => {
              // Conversations avec une action à valider remontent en haut.
              const pa = pendingActionConvIds?.has(a.id) ? 1 : 0
              const pb = pendingActionConvIds?.has(b.id) ? 1 : 0
              return pb - pa
            }).map((conv) => {
              const isSelected = selectedConvId === conv.id
              const hasPendingAction = pendingActionConvIds?.has(conv.id)
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={cn(
                    // Mobile : padding réduit et texte centré sur l'avatar (h-11),
                    // le bloc ne fait plus que 2 lignes (nom + aperçu).
                    // Desktop : ancrage en haut, la 3e ligne de métadonnées revient.
                    'group/conv mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-3 py-1.5 text-left transition-all hover:bg-muted/60 sm:items-start sm:py-2.5',
                    isSelected && 'bg-primary/10 ring-1 ring-primary/20'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-semibold text-white shadow-sm"
                      style={isSelected
                        ? { background: 'var(--primary, #3B82F6)' }
                        : { background: 'linear-gradient(to bottom right, var(--primary, #3B82F6), var(--accent, #3B82F6))' }
                      }
                    >
                      {getContactInitials(conv)}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-700 shadow ring-1 ring-slate-200">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                    {/* Canal badge (WhatsApp) */}
                    <span
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 space-y-1 leading-tight">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'truncate text-[15px] leading-none',
                        conv.unread_count > 0 ? 'font-bold' : 'font-semibold'
                      )}>
                        {getContactDisplay(conv)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {conv.last_message_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: locale === 'fr' ? fr : enUS })}
                          </span>
                        )}
                        {/* Épingle APRÈS l'horodatage, tout à droite. Sur desktop
                            elle n'apparaît qu'au survol ; en MOBILE il n'y a pas de
                            survol, et `opacity-0` la laissait invisible tout en
                            occupant sa place, d'où un vide entre le nom et l'heure.
                            Elle y reste donc discrètement visible : c'est le SEUL
                            moyen d'épingler une conversation. */}
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id, conv.is_pinned) }}
                          className={cn(
                            'inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-opacity',
                            conv.is_pinned
                              ? 'opacity-100 text-primary'
                              : 'text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground sm:opacity-0 sm:group-hover/conv:opacity-100'
                          )}
                          title={conv.is_pinned ? t('conversations.unpin_conversation') : t('conversations.pin_conversation')}
                        >
                          <Pin className={cn('h-3.5 w-3.5', conv.is_pinned && 'fill-current')} />
                        </span>
                      </div>
                    </div>

                    <p className={cn(
                      'truncate text-[13px] leading-snug',
                      conv.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}>
                      {cleanPreview(conv.last_message_preview) || t('conversations.no_message')}
                    </p>

                    {/* Badge : action Shopify à valider sur cette conversation */}
                    {hasPendingAction && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {t('conversations.action_to_validate')}
                      </span>
                    )}

                    {/* Meta + tags : toujours 1 seule ligne (overflow cache) pour
                        que toutes les conversations aient la meme hauteur.
                        MASQUÉE en mobile : elle ajoutait une 3e ligne, alors que
                        nom + aperçu tiennent exactement dans la hauteur de
                        l'avatar (h-11). Le numéro et les tags restent visibles
                        dans la conversation elle-même. */}
                    <div className="hidden flex-nowrap items-center gap-x-1.5 overflow-hidden sm:mt-0.5 sm:flex sm:gap-x-2">
                      {/* Numéro du contact, seulement s'il n'est PAS déjà le titre.
                          Tester la seule présence d'un `name` ne suffit pas : un
                          contact sans nom réel se voit attribuer son numéro comme
                          nom, et le numéro s'affichait alors deux fois. */}
                      {conv.contact?.phone_number
                        && getContactDisplay(conv).replace(/\D/g, '') !== conv.contact.phone_number.replace(/\D/g, '') && (
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(`+${conv.contact?.phone_number ?? ''}`)
                            toast.success(t('conversations.number_copied'))
                          }}
                          className="shrink-0 truncate text-[10px] text-muted-foreground hover:text-foreground"
                          title={t('conversations.number_copied')}
                        >
                          +{conv.contact.phone_number}
                        </span>
                      )}
                      {/* Session (plug) */}
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        <Smartphone className="h-3 w-3 shrink-0" />
                        <span className="max-w-[90px] truncate">{getSessionLabel(conv)}</span>
                      </span>
                      {conv.session.team_name && (
                        <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[9px] border-primary/30 text-primary">
                          {conv.session.team_name}
                        </Badge>
                      )}
                      {conv.is_ai_active && (
                        <Badge className="h-4 shrink-0 px-1.5 text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-0">
                          <Bot className="mr-0.5 h-2.5 w-2.5" />
                          {locale === 'fr' ? 'IA' : 'AI'}
                        </Badge>
                      )}
                      {/* Désabonné : repérable d'un coup d'œil dans la liste (le
                          contact ne reçoit plus de messages automatiques). */}
                      {conv.contact?.opt_in_status === 'opted_out' && (
                        <Badge className="h-4 shrink-0 px-1.5 text-[9px] bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
                          <UserX className="mr-0.5 h-2.5 w-2.5" />
                          {locale === 'fr' ? 'Désabonné' : 'Unsubscribed'}
                        </Badge>
                      )}
                      {/* Étapes de la conversation (multi), 2 badges visibles + « +N ».
                          CLIQUABLES : ouvrir le sélecteur qui montre TOUTES les étapes
                          (les cochées = celles de la conversation) + ajout/retrait.
                          Triées par position (l'ordre du gestionnaire d'étapes). */}
                      <Popover>
                        {(() => {
                          const convStages = (conversationStages[conv.id] || [])
                            .slice()
                            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                          return (
                            <PopoverTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="flex min-w-0 shrink items-center gap-x-1.5 rounded-md hover:bg-muted/60"
                                title={t('conversations.stage')}
                              >
                                {convStages.slice(0, 2).map((stage) => (
                                  <Badge
                                    key={stage.id}
                                    className="h-4 shrink-0 px-1.5 text-[9px] border-0"
                                    style={{ backgroundColor: `${stage.color}15`, color: stage.color }}
                                  >
                                    {stage.name}
                                  </Badge>
                                ))}
                                {convStages.length > 2 && (
                                  <span className="shrink-0 rounded-full bg-muted px-1.5 text-[9px] font-medium text-muted-foreground">
                                    +{convStages.length - 2}
                                  </span>
                                )}
                                {/* Icône d'ajout (toujours visible, même sans étape) */}
                                <span className="inline-flex shrink-0 items-center rounded-full px-1 py-0.5 text-[9px] text-muted-foreground">
                                  <Workflow className="h-2.5 w-2.5" />
                                </span>
                              </button>
                            </PopoverTrigger>
                          )
                        })()}
                        <PopoverContent
                          className="w-56 p-2"
                          align="start"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="space-y-2">
                            {/* Étapes ACTUELLES de la conversation (récap en haut). */}
                            {(() => {
                              const current = (conversationStages[conv.id] || [])
                                .slice()
                                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                              if (current.length === 0) return null
                              return (
                                <div className="flex flex-wrap gap-1 border-b pb-2">
                                  {current.map((stage) => (
                                    <button
                                      key={stage.id}
                                      onClick={() => onToggleStage(conv.id, stage.id)}
                                      className="group/tag inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                                      title={t('conversations.remove_stage')}
                                    >
                                      {stage.name}
                                      <X className="h-2.5 w-2.5 opacity-50 group-hover/tag:opacity-100" />
                                    </button>
                                  ))}
                                </div>
                              )
                            })()}
                            <p className="text-xs font-medium px-1">{t('conversations.stage')}</p>
                            <div className="max-h-40 overflow-auto space-y-0.5">
                              {lifecycleStages.map((stage) => {
                                const current = conversationStages[conv.id] || []
                                const isSelected = current.some((s) => s.id === stage.id)
                                const atCap = !isSelected && current.length >= 3
                                return (
                                  <button
                                    key={stage.id}
                                    disabled={atCap}
                                    onClick={() => onToggleStage(conv.id, stage.id)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                                      isSelected ? 'bg-muted' : atCap ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50'
                                    )}
                                  >
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                    <span className="flex-1 text-left truncate">{stage.name}</span>
                                    {isSelected && <Check className="h-3 w-3 text-primary" />}
                                  </button>
                                )
                              })}
                              {lifecycleStages.length === 0 && (
                                <p className="text-xs text-muted-foreground py-2 text-center">{t('conversations.no_stages')}</p>
                              )}
                            </div>
                            {onManageStages && (
                              <button
                                onClick={onManageStages}
                                className="w-full rounded-md border-t pt-2 text-[11px] text-primary hover:underline"
                              >
                                {t('conversations.manage_stages')}
                              </button>
                            )}
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
                onClick={() => onSetPage(Math.max(1, page - 1))}
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
                onClick={() => onSetPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
