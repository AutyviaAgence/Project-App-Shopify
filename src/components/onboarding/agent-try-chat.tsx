'use client'

import { useRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'assistant'; content: string }

/**
 * Mini-chat de test de l'agent, pour l'onboarding. Le marchand essaie son
 * agent en direct (avec le prompt EN COURS d'édition, pas encore sauvegardé)
 * via /api/agents/[id]/test (system_prompt_override). Questions suggérées
 * pré-générées par l'IA à partir de la boutique pour amorcer l'essai.
 */
export function AgentTryChat({
  agentId,
  systemPrompt,
  suggestions = [],
}: {
  agentId: string | null
  systemPrompt: string
  suggestions?: string[]
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || sending || !agentId) return
    const history = messages
    setMessages((m) => [...m, { role: 'user', content: msg }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history, system_prompt_override: systemPrompt }),
      })
      const json = await res.json()
      const reply = json?.data?.response || json?.error || 'Désolé, une erreur est survenue.'
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Impossible de contacter l’agent, réessayez.' }])
    } finally {
      setSending(false)
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }))
    }
  }

  const remainingSuggestions = suggestions.filter((s) => !messages.some((m) => m.role === 'user' && m.content === s))

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Testez votre agent
      </div>

      {/* Fil */}
      <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Posez une question comme le ferait un client — l’agent répond avec les infos de votre boutique.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
              m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions pré-générées */}
      {remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
          {remainingSuggestions.map((s) => (
            <button key={s} disabled={sending} onClick={() => send(s)}
              className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Saisie */}
      <div className="flex items-center gap-2 border-t p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
          placeholder="Écrivez un message…"
          disabled={sending}
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button onClick={() => send(input)} disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
