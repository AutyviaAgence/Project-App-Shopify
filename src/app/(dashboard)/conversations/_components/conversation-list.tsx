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
  Copy,
  Check,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Tag,
  Plus,
  Search,
  Workflow,
  Pin,
  Mail,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, getContactDisplayName } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'
import type { ConversationWithJoins, Team, ConversationTag, LifecycleStage } from './types'

const TAG_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#84CC16',
]

interface ConversationListProps {
  conversations: ConversationWithJoins[]
  selectedConvId: string | null
  totalPages: number
  totalConversations: number
  page: number
  sessions: { id: string; instance_name: string; phone_number: string | null }[]
  teams: Team[]
  allTags: ConversationTag[]
  conversationTags: Record<string, ConversationTag[]>
  lifecycleStages: LifecycleStage[]
  searchQuery: string
  filterChannel: string
  filterSession: string
  filterAiActive: string
  filterTeam: string
  filterLifecycleStage: string
  filterTags: string[]
  onSelectConversation: (conv: ConversationWithJoins) => void
  onTogglePin: (convId: string, currentPinned: boolean) => void
  onSetPage: (page: number) => void
  onSetSearchQuery: (query: string) => void
  onSetFilterChannel: (value: string) => void
  onSetFilterSession: (value: string) => void
  onSetFilterAiActive: (value: string) => void
  onSetFilterTeam: (value: string) => void
  onSetFilterLifecycleStage: (value: string) => void
  onSetFilterTags: (tags: string[]) => void
  onFetchConversationTags: (convId: string) => void
  onToggleTag: (convId: string, tag: ConversationTag) => void
  onCreateTag: (name: string, color: string) => Promise<void>
}

export function ConversationList({
  conversations,
  selectedConvId,
  totalPages,
  totalConversations,
  page,
  sessions,
  teams,
  allTags,
  conversationTags,
  lifecycleStages,
  searchQuery,
  filterChannel,
  filterSession,
  filterAiActive,
  filterTeam,
  filterLifecycleStage,
  filterTags,
  onSelectConversation,
  onTogglePin,
  onSetPage,
  onSetSearchQuery,
  onSetFilterChannel,
  onSetFilterSession,
  onSetFilterAiActive,
  onSetFilterTeam,
  onSetFilterLifecycleStage,
  onSetFilterTags,
  onFetchConversationTags,
  onToggleTag,
  onCreateTag,
}: ConversationListProps) {
  const { t, locale } = useTranslation()
  const [showFilters, setShowFilters] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const [creatingTag, setCreatingTag] = useState(false)

  function getContactDisplay(conv: ConversationWithJoins) {
    if (!conv.contact) return conv.last_message_preview?.slice(0, 30) || 'Inconnu'
    return getContactDisplayName({
      name: conv.contact.name,
      first_name: conv.contact.first_name,
      last_name: conv.contact.last_name,
      phone_number: conv.contact.phone_number,
    })
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

  async function handleCreateTag() {
    if (!newTagName.trim() || creatingTag) return
    setCreatingTag(true)
    try {
      await onCreateTag(newTagName.trim(), newTagColor)
      setNewTagName('')
      setNewTagColor('#3B82F6')
    } finally {
      setCreatingTag(false)
    }
  }

  const hasActiveFilters = filterSession !== 'all' || filterAiActive !== 'all' || filterTeam !== 'all' || filterLifecycleStage !== 'all' || filterTags.length > 0
  const activeFilterCount = (filterSession !== 'all' ? 1 : 0) + (filterAiActive !== 'all' ? 1 : 0) + (filterTeam !== 'all' ? 1 : 0) + (filterLifecycleStage !== 'all' ? 1 : 0) + (filterTags.length > 0 ? 1 : 0)

  const channelTabs = [
    { value: 'all', label: 'Tous', icon: MessageSquare },
    { value: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { value: 'email', label: 'Email', icon: Mail },
  ]

  return (
    <div
      className={cn(
        'w-full flex-col bg-background md:w-80 lg:w-96 md:border-r',
        selectedConvId ? 'hidden md:flex' : 'flex'
      )}
    >
      {/* Search header */}
      <div data-tour="conversations-header" className="p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('conversations.search_placeholder')}
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
            className="pl-9 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* Channel tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {channelTabs.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { onSetFilterChannel(value); onSetPage(1) }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                filterChannel === value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
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
                            onSetFilterTags(
                              isSelected
                                ? filterTags.filter((id) => id !== tag.id)
                                : [...filterTags, tag.id]
                            )
                            onSetPage(1)
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
                      onClick={() => { onSetFilterTags([]); onSetPage(1) }}
                    >
                      {t('common.reset')}
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => { onSetFilterSession('all'); onSetFilterAiActive('all'); onSetFilterTeam('all'); onSetFilterLifecycleStage('all'); onSetFilterTags([]); onSetPage(1) }}
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
              const isSelected = selectedConvId === conv.id
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={cn(
                    'group/conv flex w-full items-start gap-3 p-3 text-left transition-all hover:bg-muted/50',
                    isSelected && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium text-white"
                      style={isSelected
                        ? { background: 'var(--primary, #7DC2A5)' }
                        : { background: 'linear-gradient(to bottom right, var(--primary, #7DC2A5), var(--accent, #40E9BE))' }
                      }
                    >
                      {getContactInitials(conv)}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                    {/* Canal badge */}
                    <span
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background"
                      style={{ backgroundColor: conv.channel === 'email' ? '#3B82F6' : 'var(--primary, #25D366)' }}
                    >
                      {conv.channel === 'email' ? (
                        <Mail className="h-2.5 w-2.5 text-white" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      )}
                    </span>
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
                          onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id, conv.is_pinned) }}
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

                    {/* Phone number */}
                    {conv.contact && (conv.contact.first_name || conv.contact.last_name || conv.contact.name) && (
                      <div className="flex items-center gap-1 group/phone">
                        <p className="text-[10px] text-muted-foreground truncate">
                          +{conv.contact.phone_number}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(`+${conv.contact?.phone_number ?? ''}`)
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
                      {(conv as { channel?: string }).channel === 'email' ? (
                        <span className="flex items-center gap-1 text-[10px] text-blue-500">
                          <Mail className="h-3 w-3" />
                          {getSessionLabel(conv)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Smartphone className="h-3 w-3" />
                          {getSessionLabel(conv)}
                        </span>
                      )}
                      {conv.session.team_name && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/30 text-primary">
                          {conv.session.team_name}
                        </Badge>
                      )}
                      {conv.is_ai_active && (
                        <Badge className="h-4 px-1.5 text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-0">
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
                              if (!conversationTags[conv.id]) onFetchConversationTags(conv.id)
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
                                    onClick={() => onToggleTag(conv.id, tag)}
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
