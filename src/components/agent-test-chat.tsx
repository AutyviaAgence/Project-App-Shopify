'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Send, Bot, User, Trash2, AlertCircle, Wrench, CheckCircle, XCircle, ArrowRightCircle, BookOpen, ImageIcon, Wand2, Sparkles, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'

type ToolExecution = {
  name: string
  args: Record<string, unknown>
  result: string
  success: boolean
  durationMs: number
}

type RagInfo = {
  chunksUsed: number
  documentNames: string[]
  error?: string
}

type ChatEvent = {
  type: 'route' | 'stop'
  routeTo?: string
  routeScenario?: string
}

type ImageRef = {
  ref: string
  url: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  images?: ImageRef[]
  toolExecutions?: ToolExecution[]
  event?: ChatEvent
  rag?: RagInfo | null
}

type AgentTestChatProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
}

export function AgentTestChat({ open, onOpenChange, agentId, agentName }: AgentTestChatProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'test' | 'refine'>('test')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll et focus
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Reset quand on ferme
  useEffect(() => {
    if (!open) {
      // On garde les messages pour pouvoir continuer la conversation si on réouvre
    }
  }, [open])

  async function handleSend() {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)
    track('agent_tested', { agent_id: agentId })

    try {
      const res = await fetch(`/api/agents/${agentId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      })

      const json = await res.json()

      if (res.ok && json.data) {
        const data = json.data
        // Qualifier route event
        if (data.event === 'route') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '',
            toolExecutions: data.toolExecutions,
            event: { type: 'route', routeTo: data.routeTo, routeScenario: data.routeScenario },
            rag: data.rag || null,
          }])
        } else if (data.response !== undefined) {
          console.log('[test-chat] response:', data.response, 'images:', data.images)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.response,
            images: data.images,
            toolExecutions: data.toolExecutions,
            rag: data.rag || null,
          }])
        }
      } else {
        setError(json.error || t('test_chat.generation_error'))
      }
    } catch {
      setError(t('test_chat.network_error'))
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setMessages([])
    setError(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[90vh] flex-col p-0 sm:max-w-xl">
        <DialogHeader className="flex-shrink-0 px-6 pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {t('test_chat.title', { name: agentName })}
            </DialogTitle>
            {tab === 'test' && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="mr-6 h-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t('test_chat.clear')}
              </Button>
            )}
          </div>
          {/* Onglets : Test conversation / Ajuster le prompt */}
          <div className="mt-3 flex gap-1 rounded-xl bg-muted/60 p-1">
            <button
              onClick={() => setTab('test')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === 'test' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Bot className="h-4 w-4" />
              {t('test_chat.tab_test')}
            </button>
            <button
              onClick={() => setTab('refine')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === 'refine' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Wand2 className="h-4 w-4" />
              {t('test_chat.tab_refine')}
            </button>
          </div>
        </DialogHeader>

        {tab === 'refine' ? (
          <RefinePromptPanel agentId={agentId} transcript={messages} />
        ) : (
        <>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Bot className="mb-4 h-12 w-12 opacity-50" />
                <p className="text-sm">{t('test_chat.empty_message')}</p>
                <p className="mt-1 text-xs">
                  {t('test_chat.empty_hint')}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-1.5">
                    {/* RAG info — masqué si aucun résultat et que des images sont envoyées */}
                    {msg.rag && (msg.rag.error || msg.rag.chunksUsed > 0 || !msg.images?.length) && (
                      <div className={cn(
                        "flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px]",
                        msg.rag.error
                          ? "border-red-500/30 bg-red-500/5"
                          : msg.rag.chunksUsed > 0
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-muted-foreground/20 bg-muted/30"
                      )}>
                        <BookOpen className={cn(
                          "h-3 w-3 shrink-0",
                          msg.rag.error ? "text-red-500" : msg.rag.chunksUsed > 0 ? "text-emerald-500" : "text-muted-foreground"
                        )} />
                        {msg.rag.error ? (
                          <span className="text-red-600 dark:text-red-400">RAG erreur : {msg.rag.error}</span>
                        ) : msg.rag.chunksUsed > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            Base de connaissances : {msg.rag.chunksUsed} extrait{msg.rag.chunksUsed > 1 ? 's' : ''} trouvé{msg.rag.chunksUsed > 1 ? 's' : ''} dans {msg.rag.documentNames.join(', ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Base de connaissances : aucun résultat pertinent</span>
                        )}
                      </div>
                    )}
                    {/* Badge images IA */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-[11px]">
                        <ImageIcon className="h-3 w-3 shrink-0 text-violet-500" />
                        <span className="text-violet-700 dark:text-violet-300">
                          Image{msg.images.length > 1 ? 's' : ''} IA : {msg.images.map(i => i.ref).join(', ')}
                        </span>
                      </div>
                    )}
                    {/* Tool executions */}
                    {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                      <div className="space-y-1">
                        {msg.toolExecutions.map((te, j) => (
                          <div key={j} className="rounded-lg border border-dashed px-3 py-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-mono font-medium truncate">{te.name}</span>
                              {te.success ? (
                                <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                              )}
                              <span className="text-muted-foreground shrink-0">{te.durationMs}ms</span>
                            </div>
                            {te.result && (
                              <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">{te.result}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Route event */}
                    {msg.event?.type === 'route' && (
                      <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm">
                        <ArrowRightCircle className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="text-blue-700 dark:text-blue-300">
                          Redirection vers <span className="font-semibold">{msg.event.routeTo}</span>
                        </span>
                      </div>
                    )}
                    {/* Message content (skip if empty route event) */}
                    {msg.content && (
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    )}
                    {/* Images IA */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="space-y-2">
                        {msg.images.map((img) => (
                          <a key={img.ref} href={img.url} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.url}
                              alt={img.ref}
                              className="max-w-[260px] rounded-xl border object-cover shadow-sm hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">{t('test_chat.thinking')}</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t px-6 pb-6 pt-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder={t('test_chat.input_placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t('test_chat.press_enter')}
          </p>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Panneau d'ajustement du prompt (chat copilote) ──────────────────────────

type RefineEntry =
  | { kind: 'user'; content: string }
  | { kind: 'proposal'; summary: string; revised: string; applied: boolean }

function RefinePromptPanel({ agentId, transcript }: {
  agentId: string
  transcript: { role: 'user' | 'assistant'; content: string }[]
}) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<RefineEntry[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries, loading])

  async function handleSend() {
    const feedback = input.trim()
    if (!feedback || loading) return
    setInput('')
    setError(null)
    setEntries((prev) => [...prev, { kind: 'user', content: feedback }])
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/refine-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback,
          transcript: transcript.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      if (res.ok && json.data?.revised_prompt) {
        setEntries((prev) => [...prev, {
          kind: 'proposal',
          summary: json.data.summary || '',
          revised: json.data.revised_prompt,
          applied: false,
        }])
      } else {
        setError(json.error || t('test_chat.refine_error'))
      }
    } catch {
      setError(t('test_chat.network_error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(idx: number) {
    const entry = entries[idx]
    if (entry.kind !== 'proposal' || entry.applied) return
    setApplyingIdx(idx)
    try {
      const res = await fetch(`/api/agents/${agentId}/refine-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true, revised_prompt: entry.revised }),
      })
      const json = await res.json()
      if (res.ok && json.data?.applied) {
        setEntries((prev) => prev.map((e, i) => (i === idx && e.kind === 'proposal' ? { ...e, applied: true } : e)))
        toast.success(t('test_chat.refine_applied'))
      } else {
        toast.error(json.error || t('test_chat.refine_error'))
      }
    } catch {
      toast.error(t('test_chat.network_error'))
    } finally {
      setApplyingIdx(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        <div className="space-y-4 py-4">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Wand2 className="mb-4 h-12 w-12 opacity-50" />
              <p className="text-sm">{t('test_chat.refine_empty')}</p>
              <p className="mt-1 max-w-xs text-xs">{t('test_chat.refine_empty_hint')}</p>
            </div>
          ) : (
            entries.map((entry, i) =>
              entry.kind === 'user' ? (
                <div key={i} className="flex justify-end gap-3">
                  <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4" />
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    {/* Résumé des changements */}
                    {entry.summary && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Wand2 className="h-3.5 w-3.5" />
                          {t('test_chat.refine_changes')}
                        </p>
                        <p className="whitespace-pre-wrap text-foreground/90">{entry.summary}</p>
                      </div>
                    )}
                    {/* Aperçu du nouveau prompt */}
                    <details className="rounded-xl border bg-muted/40">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                        {t('test_chat.refine_preview')}
                      </summary>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t px-3 py-2 text-[11px] text-muted-foreground">{entry.revised}</pre>
                    </details>
                    {/* Action appliquer */}
                    <Button
                      size="sm"
                      onClick={() => handleApply(i)}
                      disabled={entry.applied || applyingIdx === i}
                      variant={entry.applied ? 'outline' : 'default'}
                      className="w-full"
                    >
                      {applyingIdx === i ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : entry.applied ? (
                        <Check className="mr-2 h-4 w-4 text-emerald-500" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      {entry.applied ? t('test_chat.refine_done') : t('test_chat.refine_apply')}
                    </Button>
                  </div>
                </div>
              )
            )
          )}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">{t('test_chat.refine_thinking')}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t px-6 pb-6 pt-4">
        <div className="flex gap-2">
          <Input
            placeholder={t('test_chat.refine_placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim() || loading} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t('test_chat.refine_hint')}</p>
      </div>
    </>
  )
}
