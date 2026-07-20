'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircleQuestion, MessageCircle, X, Send, Loader2, ArrowRight } from 'lucide-react'

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

/**
 * Au-delà, on bascule vers l'humain.
 *
 * Si l'assistant n'a pas résolu le problème en cinq questions, il ne le résoudra
 * pas : le marchand tourne en rond. Mieux vaut le mettre en relation tout de suite
 * que de le laisser s'épuiser — il finira par écrire de toute façon, en plus agacé.
 *
 * ⚠️ La limite est aussi appliquée CÔTÉ SERVEUR : ce compteur seul serait
 * contournable.
 */
const MAX_QUESTIONS = 5

/** Le numéro du support. Doit rester aligné avec celui du serveur. */
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '33636006808'

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
  // ⚠️ `/onboarding` N'EST PLUS EXCLU — c'est le moment où le marchand a le
  // PLUS besoin d'aide (connexion WhatsApp, liaison Shopify), et il n'avait
  // aucun moyen de nous joindre avant d'avoir terminé.
  const hidden =
    pathname?.startsWith('/shopify') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register')

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

  /**
   * Bascule vers l'humain, avec TOUT l'échange en contexte.
   *
   * On n'envoyait que la dernière question : l'équipe repartait de zéro, et le
   * marchand devait tout réexpliquer — exactement ce qui l'agace quand un support
   * le transfère.
   */
  const openWhatsApp = (number: string) => {
    const asked = messages.filter((m) => m.role === 'user')

    const recap = asked.length
      ? asked.map((m, i) => `${i + 1}. ${m.content}`).join('\n')
      : '(aucune question posée)'

    const text = encodeURIComponent(
      `Bonjour, j'ai besoin d'aide sur Xeyo.\n\n` +
        `J'ai posé ${asked.length > 1 ? 'ces questions' : 'cette question'} à l'assistant :\n${recap}\n\n` +
        `Mais je n'ai pas trouvé de solution.`
    )
    window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  /** Le marchand a-t-il épuisé ses questions ? */
  const asked = messages.filter((m) => m.role === 'user').length
  const limitReached = asked >= MAX_QUESTIONS

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

          {/* ⚠️ La saisie DISPARAÎT une fois la limite atteinte. Sans ça, le marchand
              taperait dans le vide : le serveur refuserait sa question de toute façon.
              On lui donne le seul chemin qui reste — et le seul qui aboutira. */}
          {limitReached ? (
            <div className="space-y-2 border-t bg-muted/30 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Je n’ai pas réussi à vous aider. Notre équipe prend le relais — elle
                aura tout le contexte de vos questions.
              </p>
              <button
                type="button"
                onClick={() => openWhatsApp(SUPPORT_WHATSAPP)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Parler à un humain sur WhatsApp
              </button>
            </div>
          ) : (
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
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

              {/* ⚠️ CONTACT HUMAIN TOUJOURS ACCESSIBLE.
                  Il n'apparaissait qu'une fois les questions épuisées. Or un
                  marchand bloqué pendant l'onboarding (connexion WhatsApp,
                  liaison Shopify) doit pouvoir nous joindre TOUT DE SUITE —
                  l'obliger à interroger l'assistant d'abord, c'est le perdre.
                  Discret pour ne pas court-circuiter l'assistant, qui répond
                  plus vite sur les questions courantes. */}
              <button
                type="button"
                onClick={() => openWhatsApp(SUPPORT_WHATSAPP)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#25D366]/40 px-3 py-1.5 text-[11px] font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/10"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Écrire à un humain sur WhatsApp
              </button>

              {/* Le compteur n'apparaît qu'à l'approche de la limite : l'afficher
                  d'emblée donnerait l'impression d'être rationné. */}
              {asked >= MAX_QUESTIONS - 2 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {MAX_QUESTIONS - asked} question{MAX_QUESTIONS - asked > 1 ? 's' : ''} restante
                  {MAX_QUESTIONS - asked > 1 ? 's' : ''}, puis notre équipe prend le relais.
                </p>
              )}
            </div>
          )}
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
