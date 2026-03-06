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
import {
  MessageSquare,
  Loader2,
  ArrowLeft,
  Bot,
  UserCircle,
  Copy,
  Check,
  Sparkles,
  Workflow,
  Wrench,
  CheckCircle,
  XCircle,
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
  onBack: () => void
  onOpenProfile: () => void
  onSendText: (content: string) => Promise<void>
  onSendMedia: (file: File, caption?: string) => Promise<void>
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
  onBack,
  onOpenProfile,
  onSendText,
  onSendMedia,
  onAssignAgent,
  onToggleAI,
  onChangeLifecycleStage,
  onAnalyzeConversation,
}: ChatAreaProps) {
  const { t, locale } = useTranslation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const prevMessageCountRef = useRef(0)

  // Reset counter when conversation changes
  useEffect(() => {
    prevMessageCountRef.current = 0
  }, [selectedConv?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    // Instant scroll on initial load / conversation switch, smooth for new messages
    const isInitialLoad = prevMessageCountRef.current === 0 && messages.length > 0
    messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoad ? 'instant' : 'smooth' })
    prevMessageCountRef.current = messages.length
  }, [messages])

  function getContactDisplay(conv: ConversationWithJoins) {
    return getContactDisplayName({
      name: conv.contact.name,
      first_name: conv.contact.first_name,
      last_name: conv.contact.last_name,
      phone_number: conv.contact.phone_number,
    })
  }

  function getContactInitials(conv: ConversationWithJoins) {
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
        'flex flex-1 flex-col bg-[#F5F7FA] dark:bg-[#1A252C]',
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
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[#7DC2A5]">
                            <Bot className="h-3 w-3" />
                            {(msg as typeof msg & { agent_name?: string }).agent_name || t('conversations.agent_ia')}
                          </div>
                        )}
                        {/* Tool executions */}
                        {(msg as typeof msg & { tool_executions?: { name: string; result: string; success: boolean; durationMs: number }[] }).tool_executions?.map((te, j) => (
                          <div key={j} className="mb-1.5 rounded-lg border border-dashed border-[#7DC2A5]/30 px-2.5 py-1 text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3 w-3 text-[#7DC2A5]/70 shrink-0" />
                              <span className="font-mono font-medium text-[#7DC2A5]/90 truncate">{te.name}</span>
                              {te.success ? (
                                <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                              )}
                              <span className="text-[#7DC2A5]/50 shrink-0">{te.durationMs}ms</span>
                            </div>
                            {te.result && (
                              <pre className="mt-0.5 max-h-16 overflow-auto whitespace-pre-wrap break-all text-[9px] text-[#7DC2A5]/50 bg-black/10 rounded px-1.5 py-0.5">{te.result.slice(0, 300)}</pre>
                            )}
                          </div>
                        ))}
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
                  onToggleAI(selectedConv.id, checked)
                }
              />
            </div>
          )}

          {/* Message input */}
          <MessageInput
            onSendText={onSendText}
            onSendMedia={onSendMedia}
            sending={sending}
          />
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
