'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MessageBubbleContent } from '@/components/message-bubble-content'
import { MessageInput } from './message-input'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  MessageSquare,
  Loader2,
  ArrowLeft,
  Bot,
  UserCircle,
  Copy,
  Check,
  CheckCheck,
  Clock,
  Sparkles,
  Workflow,
  Wrench,
  CheckCircle,
  XCircle,
  Send,
  Mail,
  SpellCheck,
  Smile,
  Briefcase,
  ALargeSmall,
  Paperclip,
  X,
} from 'lucide-react'
import { getSessionDisplayName, getContactDisplayName } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'
import type { ConversationWithJoins, Message, AIAgent, LifecycleStage } from './types'

interface ChatAreaProps {
  selectedConv: ConversationWithJoins | null
  messages: Message[]
  messagesLoading: boolean
  sending: boolean
  agents: AIAgent[]
  lifecycleStages: LifecycleStage[]
  analyzingConvId: string | null
  canAnalyze?: boolean
  hasMoreMessages?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  onBack: () => void
  onOpenProfile: () => void
  onSendText: (content: string) => Promise<void>
  onSendMedia: (file: File, caption?: string) => Promise<void>
  onSendEmail: (content: string, subject: string, attachments?: File[]) => Promise<void>
  onAssignAgent: (convId: string, agentId: string | null) => void
  onToggleAI: (convId: string, isActive: boolean) => void
  onChangeLifecycleStage: (convId: string, stageId: string | null) => void
  onAnalyzeConversation: (convId: string) => void
}

export function ChatArea({
  selectedConv,
  messages,
  messagesLoading,
  sending,
  agents,
  lifecycleStages,
  analyzingConvId,
  canAnalyze,
  hasMoreMessages,
  loadingOlder,
  onLoadOlder,
  onBack,
  onOpenProfile,
  onSendText,
  onSendMedia,
  onSendEmail,
  onAssignAgent,
  onToggleAI,
  onChangeLifecycleStage,
  onAnalyzeConversation,
}: ChatAreaProps) {
  const { t, locale } = useTranslation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const prevMessageCountRef = useRef(0)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [improving, setImproving] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  const isEmail = selectedConv?.channel === 'email'

  // Pré-remplir le sujet avec le dernier sujet reçu (format "Re: [sujet]")
  useEffect(() => {
    if (!isEmail || !messages.length) return
    const lastSubject = [...messages]
      .reverse()
      .map((m) => {
        const t = (m as typeof m & { transcription?: string | null }).transcription
        return t?.startsWith('Objet: ') ? t.slice(7) : null
      })
      .find(Boolean)
    if (lastSubject) {
      const prefix = lastSubject.startsWith('Re:') ? '' : 'Re: '
      setEmailSubject(prefix + lastSubject)
    }
  }, [selectedConv?.id, isEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendEmail = async () => {
    if (!emailBody.trim() || sending) return
    await onSendEmail(emailBody.trim(), emailSubject.trim() || 'Re:', emailAttachments)
    setEmailBody('')
    setEmailSubject('')
    setEmailAttachments([])
  }

  const IMPROVE_ACTIONS = [
    { key: 'grammar', label: 'Corriger la grammaire', icon: SpellCheck },
    { key: 'friendly', label: 'Plus sympa', icon: Smile },
    { key: 'professional', label: 'Plus professionnel', icon: Briefcase },
    { key: 'expand', label: 'Étendre le message', icon: ALargeSmall },
  ] as const

  async function handleSuggest() {
    if (!selectedConv || suggesting) return
    setSuggesting(true)
    try {
      const res = await fetch('/api/email/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: selectedConv.id }),
      })
      const json = await res.json()
      if (res.ok && json.text) {
        setEmailBody(json.text)
      } else {
        toast.error(json.error || 'Erreur génération brouillon')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleImprove(action: 'grammar' | 'friendly' | 'professional' | 'expand') {
    if (!emailBody.trim() || improving) return
    setImproving(action)
    try {
      const res = await fetch('/api/email/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: emailBody.trim(), action }),
      })
      const json = await res.json()
      if (res.ok && json.text) {
        setEmailBody(json.text)
      } else {
        toast.error(json.error || 'Erreur lors de l\'amélioration')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setImproving(null)
    }
  }

  // Reset counter when conversation changes
  useEffect(() => {
    prevMessageCountRef.current = 0
  }, [selectedConv?.id])

  // Scroll to bottom only on initial load or new messages (not when loading older)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    const isInitialLoad = prevCount === 0 && messages.length > 0
    // New message appended at the end (count increased, last message is newer)
    const isNewMessage = prevCount > 0 && messages.length > prevCount &&
      messages.length - prevCount <= 3 // small increment = new message, not bulk load of older
    if (isInitialLoad || isNewMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoad ? 'instant' : 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  function getContactDisplay(conv: ConversationWithJoins) {
    if (!conv.contact) return conv.last_message_preview?.slice(0, 20) || 'Inconnu'
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

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch {
      toast.error(t('conversations.copy_error'))
    }
  }

  return (
    <div
      className={cn(
        'flex flex-1 flex-col bg-background',
        !selectedConv ? 'hidden md:flex' : 'flex'
      )}
    >
      {selectedConv ? (
        <>
          {/* Chat header */}
          <div className="flex items-center gap-3 bg-background border-b px-4 py-3">
            <button
              onClick={onBack}
              className="md:hidden p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <button
              onClick={onOpenProfile}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-medium" style={{ background: `linear-gradient(to bottom right, var(--primary, #7DC2A5), var(--accent, #40E9BE))` }}>
                {getContactInitials(selectedConv)}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold flex items-center gap-1.5">
                  <span className="truncate">{getContactDisplay(selectedConv)}</span>
                  {selectedConv.contact?.opt_in_status === 'opted_out' && (
                    <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-500" title="Le contact s'est désinscrit (STOP)">Désinscrit</span>
                  )}
                  {selectedConv.contact?.opt_in_status === 'subscribed' && (
                    <span className="shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-500" title="Consentement WhatsApp obtenu">Opt-in</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedConv.contact?.email
                    ? selectedConv.contact.email
                    : selectedConv.contact?.phone_number
                      ? (/^\d{8,}$/.test(selectedConv.contact.phone_number) ? `+${selectedConv.contact.phone_number}` : selectedConv.contact.phone_number)
                      : ''}
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
                      onChangeLifecycleStage(selectedConv.id, val === 'none' ? null : val)
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
                  {canAnalyze && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onAnalyzeConversation(selectedConv.id)}
                      disabled={analyzingConvId === selectedConv.id}
                      title={t('conversations.analyze_ai')}
                    >
                      {analyzingConvId === selectedConv.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              )}

              <Select
                value={selectedConv.ai_agent_id || 'none'}
                onValueChange={(val) =>
                  onAssignAgent(selectedConv.id, val === 'none' ? null : val)
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
                    onToggleAI(selectedConv.id, checked)
                  }
                />
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onOpenProfile}
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
                {hasMoreMessages && (
                  <div className="flex justify-center py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onLoadOlder}
                      disabled={loadingOlder}
                      className="text-xs text-muted-foreground"
                    >
                      {loadingOlder ? (
                        <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />{t('conversations.loading_older')}</>
                      ) : (
                        <>{t('conversations.load_older')}</>
                      )}
                    </Button>
                  </div>
                )}
                {messages.map((msg, idx) => {
                  const isAI = msg.sent_by === 'ai_agent'
                  const isOutbound = msg.direction === 'outbound'
                  const isCopied = copiedMessageId === msg.id

                  // Date separator
                  const msgDate = new Date(msg.created_at)
                  const prevMsg = idx > 0 ? messages[idx - 1] : null
                  const prevDate = prevMsg ? new Date(prevMsg.created_at) : null
                  const showDateSeparator = !prevDate ||
                    msgDate.toDateString() !== prevDate.toDateString()

                  let dateLabel = ''
                  if (showDateSeparator) {
                    const today = new Date()
                    const yesterday = new Date()
                    yesterday.setDate(yesterday.getDate() - 1)
                    if (msgDate.toDateString() === today.toDateString()) {
                      dateLabel = t('conversations.today') || "Aujourd'hui"
                    } else if (msgDate.toDateString() === yesterday.toDateString()) {
                      dateLabel = t('conversations.yesterday') || 'Hier'
                    } else {
                      dateLabel = msgDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: msgDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
                      })
                    }
                  }

                  return (
                    <div key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-4">
                          <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-medium">
                            {dateLabel}
                          </span>
                        </div>
                      )}
                    <div
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
                          'relative max-w-[80%] rounded-2xl px-4 py-2.5',
                          msg.reaction_emoji && 'mb-3',
                          isAI
                            ? 'bubble-ai'
                            : isOutbound
                              ? 'bubble-outgoing'
                              : 'bubble-incoming'
                        )}
                      >
                        {isAI && (
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[var(--primary,#7DC2A5)]">
                            <Bot className="h-3 w-3" />
                            {(msg as typeof msg & { agent_name?: string }).agent_name || t('conversations.agent_ia')}
                          </div>
                        )}
                        {/* Tool executions */}
                        {(msg as typeof msg & { tool_executions?: { name: string; result: string; success: boolean; durationMs: number }[] }).tool_executions?.map((te, j) => (
                          <div key={j} className="mb-1.5 rounded-lg border border-dashed border-[var(--primary,#7DC2A5)]/30 px-2.5 py-1 text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3 w-3 text-[var(--primary,#7DC2A5)]/70 shrink-0" />
                              <span className="font-mono font-medium text-[var(--primary,#7DC2A5)]/90 truncate">{te.name}</span>
                              {te.success ? (
                                <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                              )}
                              <span className="text-[var(--primary,#7DC2A5)]/50 shrink-0">{te.durationMs}ms</span>
                            </div>
                            {te.result && (
                              <pre className="mt-0.5 max-h-16 overflow-auto whitespace-pre-wrap break-all text-[9px] text-[var(--primary,#7DC2A5)]/50 bg-black/10 rounded px-1.5 py-0.5">{te.result.slice(0, 300)}</pre>
                            )}
                          </div>
                        ))}
                        <MessageBubbleContent msg={msg} isOutbound={isOutbound} channel={selectedConv.channel} />
                        <p
                          className={cn(
                            'mt-1.5 text-[10px]',
                            isAI
                              ? 'text-[var(--primary,#7DC2A5)]/70'
                              : isOutbound
                                ? 'text-white/70'
                                : 'text-muted-foreground'
                          )}
                        >
                          {new Date(msg.created_at).toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {isOutbound && (
                            <>
                              {' '}
                              {msg.status === 'read' ? (
                                <CheckCheck className="inline h-3.5 w-3.5 text-blue-500" />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck className="inline h-3.5 w-3.5" />
                              ) : msg.status === 'sent' ? (
                                <Check className="inline h-3.5 w-3.5" />
                              ) : (
                                <Clock className="inline h-3 w-3" />
                              )}
                            </>
                          )}
                        </p>
                        {/* Reaction emoji badge */}
                        {msg.reaction_emoji && (
                          <span className={cn(
                            'absolute -bottom-3 text-base bg-background border rounded-full px-1 shadow-sm',
                            isOutbound ? 'right-2' : 'left-2'
                          )}>
                            {msg.reaction_emoji}
                          </span>
                        )}
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
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Mobile AI controls */}
          <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-background border-t">
            <Select
              value={selectedConv.ai_agent_id || 'none'}
              onValueChange={(val) =>
                onAssignAgent(selectedConv.id, val === 'none' ? null : val)
              }
            >
              <SelectTrigger className="h-9 flex-1 text-xs border-0 bg-muted/50">
                <Bot className="mr-1.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
                  onToggleAI(selectedConv.id, checked)
                }
              />
            )}
          </div>

          {/* Zone d'envoi — email ou WhatsApp */}
          {isEmail ? (
            <div className="border-t bg-background p-3 space-y-2">
              {/* From / To / Subject */}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground shrink-0">De</span>
                  <span className="text-xs truncate text-foreground/70">
                    {selectedConv?.session?.instance_name ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground shrink-0">À</span>
                  <span className="text-xs truncate text-foreground/70">
                    {selectedConv?.contact?.email ?? selectedConv?.contact?.phone_number ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground shrink-0">Objet</span>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Re: ..."
                    className="h-7 text-xs border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent"
                  />
                </div>
              </div>
              {/* Corps du message */}
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Votre réponse..."
                className="min-h-[100px] resize-none text-sm border-0 focus-visible:ring-0 bg-muted/30 rounded-lg px-3 py-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendEmail()
                }}
              />
              {/* Pièces jointes */}
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  setEmailAttachments((prev) => [...prev, ...files])
                  e.target.value = ''
                }}
              />
              {emailAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {emailAttachments.map((file, i) => (
                    <div key={i} className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-[11px]">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button
                        onClick={() => setEmailAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Boutons amélioration IA */}
              {emailBody.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {IMPROVE_ACTIONS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => handleImprove(key)}
                      disabled={!!improving}
                      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {improving === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {(selectedConv?.ai_agent_id || (selectedConv?.session as { email_agent_id?: string | null } | undefined)?.email_agent_id) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSuggest}
                      disabled={suggesting}
                      title="Générer un brouillon avec l'IA"
                      className="gap-1.5"
                    >
                      {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Brouillon IA
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => attachmentInputRef.current?.click()}
                    title="Joindre un fichier"
                    className="gap-1.5 px-2"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={!emailBody.trim() || sending}
                  className="gap-1.5"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Envoyer
                </Button>
              </div>
            </div>
          ) : (
            <MessageInput
              onSendText={onSendText}
              onSendMedia={onSendMedia}
              sending={sending}
              conversationId={selectedConv?.id}
            />
          )}
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
  )
}
