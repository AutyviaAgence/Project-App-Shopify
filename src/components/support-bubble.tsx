'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircleQuestion, X, Send, Loader2, ArrowRight } from 'lucide-react'

/**
 * ASSISTANT D'AIDE — il répond, et il MONTRE.
 *
 * ── L'IDÉE ──────────────────────────────────────────────────────────────────
 *
 * Un chatbot de support qui se contente de décrire (« allez dans Paramètres, puis
 * cliquez sur… ») fait travailler l'utilisateur. Celui-ci l'amène directement à
 * l'endroit voulu et SURLIGNE l'élément : il voit le bouton, il ne le cherche pas.
 *
 * ── ET SI L'AGENT NE SAIT PAS ───────────────────────────────────────────────
 *
 * Il le dit, et propose de basculer sur WhatsApp. Un agent qui invente une réponse
 * est pire qu'un agent qui avoue ne pas savoir : le marchand suit une fausse piste,
 * perd du temps, et finit par écrire quand même — en plus agacé.
 */

type Msg = {
  role: 'user' | 'assistant'
  content: string
  /** Le piège à connaître sur ce sujet. Vient de notre base, pas du modèle. */
  note?: string | null
  page?: string | null
  target?: string | null
  escalate?: boolean
  whatsapp?: string
}

/** Ce que l'assistant sait faire — proposé d'emblée, pour amorcer. */
const SUGGESTIONS = [
  'Comment connecter WhatsApp ?',
  'Comment changer de plan ?',
  'Mon agent ne répond pas',
]

export function SupportBubble() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // La bulle n'a rien à faire sur les pages publiques (connexion, inscription) ni
  // dans l'app embarquée Shopify — elle y masquerait l'interface.
  const hidden =
    pathname?.startsWith('/shopify') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register') ||
    pathname?.startsWith('/onboarding')

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }))
  }, [messages, sending])

  if (hidden) return null

  /**
   * Amène le marchand à l'endroit voulu et surligne l'élément.
   *
   * ⚠️ Le délai après navigation n'est pas décoratif : la page cible doit avoir
   * fini de se monter, sinon l'élément n'existe pas encore dans le DOM et le
   * surlignage échoue en silence.
   */
  const showMe = async (page: string | null | undefined, target: string | null | undefined) => {
    if (!page) return

    // ⚠️ `pathname` ne contient PAS la query. Une destination comme
    // `/automations?tab=marketing` doit être comparée sur sa partie chemin, sinon
    // on croirait toujours devoir naviguer — et on rechargerait la page pour rien.
    const [path] = page.split('?')
    const samePage = pathname === path && !page.includes('?')

    if (!samePage) {
      router.push(page)
      // On referme : la bulle masquerait justement l'élément qu'on veut montrer.
      setOpen(false)
    }

    if (!target) return

    // Laisse à la page le temps de se monter (plus long si on vient de naviguer).
    await new Promise((r) => setTimeout(r, samePage ? 100 : 800))

    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
    if (!el) return

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('xeyo-highlight')
    setTimeout(() => el.classList.remove('xeyo-highlight'), 3200)
  }

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || sending) return

    setMessages((m) => [...m, { role: 'user', content: question }])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le fil de la conversation : « et pour en créer une ? » n'a de sens
        // qu'avec ce qui précède.
        body: JSON.stringify({
          question,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      const d = json?.data

      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: d?.answer || 'Je n’ai pas la réponse à cette question.',
          note: d?.note,
          page: d?.page,
          target: d?.target,
          escalate: d?.escalate,
          whatsapp: d?.whatsapp,
        },
      ])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: 'Je n’arrive pas à répondre pour le moment. Voulez-vous en parler à notre équipe ?',
          escalate: true,
          whatsapp: '33636006808',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const openWhatsApp = (number: string) => {
    const text = encodeURIComponent(
      `Bonjour, j'ai besoin d'aide sur Xeyo.\n\nMa question : ${
        [...messages].reverse().find((m) => m.role === 'user')?.content || ''
      }`
    )
    window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      {/* Le halo de surlignage. Défini ici pour que le composant soit autonome —
          il fonctionne où qu'il soit monté. */}
      <style jsx global>{`
        .xeyo-highlight {
          position: relative;
          z-index: 40;
          border-radius: 12px;
          animation: xeyo-pulse 1.6s ease-out 2;
        }
        @keyframes xeyo-pulse {
          0% { box-shadow: 0 0 0 0 rgb(59 130 246 / 0.5); }
          70% { box-shadow: 0 0 0 12px rgb(59 130 246 / 0); }
          100% { box-shadow: 0 0 0 0 rgb(59 130 246 / 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .xeyo-highlight { animation: none; outline: 2px solid rgb(59 130 246); outline-offset: 4px; }
        }
      `}</style>

      {/* La fenêtre de chat */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[min(460px,calc(100vh-12rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl md:bottom-20">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Besoin d’aide ?</p>
              <p className="text-xs text-muted-foreground">Je vous montre où aller.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Posez votre question. Si la réponse se trouve quelque part dans l’app, je vous y
                  emmène directement.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[90%] space-y-2'
                  }
                >
                  {m.role === 'assistant' ? (
                    <>
                      <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                        {m.content}
                      </div>

                      {/* Le piège à connaître. Il vient de NOTRE base, pas du modèle :
                          c'est le genre de détail qu'une IA reformule mal, alors que
                          c'est précisément ce qui évite au marchand de se tromper. */}
                      {m.note && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                            {m.note}
                          </p>
                        </div>
                      )}

                      {/* L'action qui distingue cet assistant : il MONTRE. */}
                      {m.page && (
                        <button
                          type="button"
                          onClick={() => showMe(m.page, m.target)}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          Montrez-moi <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* L'agent avoue ne pas savoir → on bascule vers l'humain. */}
                      {m.escalate && m.whatsapp && (
                        <button
                          type="button"
                          onClick={() => openWhatsApp(m.whatsapp!)}
                          className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          Parler à un humain sur WhatsApp
                        </button>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask(input) }}
              placeholder="Votre question…"
              disabled={sending}
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* La bulle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        // `bottom-20` sur mobile : la navigation du bas occupe déjà les 4 rem
        // inférieures — la bulle la recouvrirait.
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-4"
        aria-label={open ? 'Fermer l’aide' : 'Ouvrir l’aide'}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircleQuestion className="h-5 w-5" />}
      </button>
    </>
  )
}
