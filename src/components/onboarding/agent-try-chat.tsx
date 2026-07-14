'use client'

import { useRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'assistant'; content: string }

/**
 * Consigne ajoutée au prompt PENDANT CE TEST UNIQUEMENT (jamais en production).
 *
 * ⚠️ Le problème qu'elle résout : ici, l'agent n'a AUCUN accès aux commandes — ce test
 * tourne pendant l'inscription, il n'existe ni commande, ni client, ni numéro de suivi.
 * Interrogé sur « ma commande #1234 », il répondait pourtant « je vais consulter notre
 * système, un instant… » et ne vérifiait rien. Il BLUFFAIT — et c'était la première
 * impression que le marchand avait de son agent.
 *
 * On lui demande donc de le dire franchement, et d'enchaîner sur ce qu'il SAIT vraiment
 * faire (catalogue, politiques). En production, l'outil de suivi de commande est
 * réellement branché : cette règle n'y est jamais envoyée.
 */
const PREVIEW_RULE = `
RÈGLE DE CET APERÇU (ne s'applique QUE dans ce test de configuration) :
Tu n'as ici AUCUN accès aux commandes, aux colis, au suivi ni aux comptes clients : ce
test tourne pendant l'inscription du marchand, aucune donnée réelle n'existe encore.
Si on t'interroge là-dessus, NE PRÉTENDS JAMAIS aller vérifier, ne dis pas « un instant »
et n'invente aucun statut. Dis en une phrase que le suivi de commande sera actif une
fois la boutique connectée, puis propose ce que tu peux vraiment faire maintenant
(renseigner sur les produits, les délais, les retours). Reste bref.
`.trim()

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
  maxQuestions,
}: {
  agentId: string | null
  systemPrompt: string
  suggestions?: string[]
  /** Plafond de questions d'essai (limite les coûts tokens). Absent = illimité. */
  maxQuestions?: number
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const questionsUsed = messages.filter((m) => m.role === 'user').length
  const limitReached = maxQuestions != null && questionsUsed >= maxQuestions

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || sending || !agentId || limitReached) return
    const history = messages
    setMessages((m) => [...m, { role: 'user', content: msg }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // ⚠️ Consigne propre à CE test, jamais en production (voir PREVIEW_RULE).
        body: JSON.stringify({ message: msg, history, system_prompt_override: `${systemPrompt}\n\n${PREVIEW_RULE}` }),
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
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Testez votre agent
        {maxQuestions != null && (
          <span className="ml-auto tabular-nums text-muted-foreground/70">
            {questionsUsed}/{maxQuestions} questions
          </span>
        )}
      </div>

      {/* Fil. `min-h` : la zone garde sa hauteur même vide — sans ça, le panneau
          grandit d'un coup à la première réponse et fait sauter la page. */}
      <div ref={scrollRef} className="max-h-72 min-h-[92px] space-y-2.5 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mx-auto max-w-sm py-4 text-center text-xs leading-relaxed text-muted-foreground">
            Posez une question comme le ferait un client, l’agent répond avec les infos de votre boutique.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions pré-générées */}
      {!limitReached && remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          {remainingSuggestions.map((s) => (
            <button key={s} disabled={sending} onClick={() => send(s)}
              className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Saisie, remplacée par une note quand la limite d'essai est atteinte. */}
      {limitReached ? (
        <p className="border-t bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
          Limite d’essai atteinte ✓ Vous pourrez continuer à discuter avec votre agent après la configuration.
        </p>
      ) : (
        <div className="flex items-center gap-2 border-t p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
            placeholder="Écrivez un message…"
            disabled={sending}
            className="h-10 flex-1 rounded-lg border border-input bg-background px-3.5 text-sm"
          />
          <button onClick={() => send(input)} disabled={sending || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
