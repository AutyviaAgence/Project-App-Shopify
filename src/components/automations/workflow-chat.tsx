'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles, Loader2, Send, ArrowLeft, FileText, Check, AlertTriangle } from 'lucide-react'
import type { WorkflowGraph } from '@/lib/automations/graph-types'

/**
 * Assistant IA de création de workflow (funnel), calqué sur l'assistant des
 * Modèles. L'IA pose 2-4 questions, s'appuie sur les modèles APPROUVÉS du
 * marchand, puis génère un parcours COMPLET (plusieurs messages, délais,
 * conditions, A/B). Si un message manque, elle le dit et on propose un bouton
 * « Créer ce modèle » qui redirige vers la page Modèles.
 */

type Msg = { role: 'user' | 'assistant'; content: string }
/** `nodeId` : le nœud du parcours où brancher ce message une fois créé (posé par
 *  la route — l'ordre d'affichage ne garantirait rien). */
type MissingTpl = { purpose: string; suggestion: string; nodeId?: string }
/** Suivi de la création d'un message manquant, depuis la conversation. */
type CreatedState = { busy?: boolean; id?: string; body?: string; submitted?: boolean; error?: string }

type Ready = {
  name: string
  graph: WorkflowGraph
  trigger: string | null
  explanation: string
  missingTemplates: MissingTpl[]
  hallucinated: number
}

export function WorkflowChat({ kind, onComplete, onCancel }: {
  kind: 'marketing' | 'transactional'
  onComplete: (data: { name: string; graph: WorkflowGraph; trigger: string }) => void
  onCancel: () => void
}) {
  const [chat, setChat] = useState<Msg[]>([])
  const [question, setQuestion] = useState<string>('')
  const [options, setOptions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<Ready | null>(null)
  const [missing, setMissing] = useState<MissingTpl[]>([])
  // État de création par message manquant (indexé comme `missing`).
  const [created, setCreated] = useState<Record<number, CreatedState>>({})
  const started = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  /**
   * Crée le modèle manquant À PARTIR de la suggestion de l'IA, sans quitter la
   * page.
   *
   * Avant, le bouton renvoyait vers /templates : le parcours en cours était
   * perdu, et la suggestion — pourtant précise — devait être recopiée à la main.
   */
  async function createFromSuggestion(i: number, m: MissingTpl, submit: boolean) {
    setCreated((c) => ({ ...c, [i]: { busy: true } }))
    try {
      const res = await fetch('/api/templates/from-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: m.purpose,
          suggestion: m.suggestion,
          // La famille du parcours donne celle du message : une campagne peut
          // promouvoir, une automatisation transactionnelle ne le peut pas.
          useCase: kind === 'marketing' ? 'marketing' : 'order_status',
          submit,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCreated((c) => ({ ...c, [i]: { error: json.error || 'Création impossible' } }))
        toast.error(json.error || 'Création impossible')
        return
      }
      // Soumission refusée par Meta : le brouillon EXISTE quand même. On le dit
      // clairement plutôt que de laisser croire à un échec total — le marchand
      // n'a pas à refaire le travail.
      const submitFailed = submit && json.submitted && !json.submitted.ok
      setCreated((c) => ({
        ...c,
        [i]: {
          // ⚠️ L'id est indispensable : c'est lui qui permet de RATTACHER le
          // message au nœud du parcours. Sans lui, on créait un brouillon que
          // rien ne reliait à l'automatisation — ses nœuds restaient vides.
          id: json.template?.id,
          body: json.template?.body_text || '',
          submitted: submit && json.submitted?.ok,
          error: submitFailed ? `Enregistré en brouillon, mais Meta a refusé la soumission : ${json.submitted.error}` : undefined,
        },
      }))
      toast.success(submitFailed ? 'Message créé (soumission à reprendre)' : submit ? 'Message créé et envoyé à Meta' : 'Message créé en brouillon')
    } catch {
      setCreated((c) => ({ ...c, [i]: { error: 'Erreur réseau' } }))
      toast.error('Erreur réseau')
    }
  }

  /**
   * Le graphe, avec les messages qu'on vient de créer BRANCHÉS sur leurs nœuds.
   *
   * Sans ça, les brouillons créés ici existaient bien dans Modèles… mais le
   * parcours arrivait avec ses nœuds vides : il fallait re-choisir chaque message
   * à la main dans l'éditeur, alors qu'on venait de les créer pour lui.
   *
   * On s'appuie sur `nodeId`, posé par la route sur chaque message manquant —
   * pas sur l'ordre d'affichage, qui ne garantit rien.
   */
  function graphWithCreated(): WorkflowGraph {
    if (!ready) throw new Error('graphe absent')
    const list = missing.length > 0 ? missing : ready.missingTemplates
    // nodeId → id du modèle fraîchement créé.
    const byNode = new Map<string, string>()
    list.forEach((m, i) => {
      const id = created[i]?.id
      if (m.nodeId && id) byNode.set(m.nodeId, id)
    })
    if (byNode.size === 0) return ready.graph
    return {
      ...ready.graph,
      nodes: ready.graph.nodes.map((n) => {
        if (n.type !== 'action' || n.templateId || !byNode.has(n.id)) return n
        // Le brief « message à publier » disparaît avec le trou qu'il décrivait :
        // le message existe désormais, le garder afficherait un rappel obsolète.
        const { todo: _todo, ...rest } = n as typeof n & { todo?: unknown }
        return { ...rest, templateId: byNode.get(n.id)! }
      }),
    }
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, question, ready])

  // Question d'ouverture au montage.
  useEffect(() => {
    if (started.current) return
    started.current = true
    converse([])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function converse(next: Msg[]) {
    setBusy(true)
    try {
      const res = await fetch('/api/automations/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, kind }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Erreur de l’assistant'); return }

      if (json.mode === 'need_templates') {
        setQuestion('')
        setMissing(json.missingTemplates || [])
        setChat([...next, { role: 'assistant', content: json.message || 'Il faut d’abord créer un modèle.' }])
        return
      }
      if (json.mode === 'ready') {
        setQuestion('')
        setOptions([])
        setReady({
          name: json.name, graph: json.graph, trigger: json.trigger,
          explanation: json.explanation || '',
          missingTemplates: json.missingTemplates || [],
          hallucinated: json.hallucinated || 0,
        })
        setChat([...next, { role: 'assistant', content: json.explanation || 'Voici le parcours proposé.' }])
        return
      }
      // mode ask
      setQuestion(json.question || '')
      setOptions(Array.isArray(json.options) ? json.options : [])
      setChat([...next, { role: 'assistant', content: json.question || '' }])
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setBusy(false)
    }
  }

  function answer(text: string) {
    const t = text.trim()
    if (!t || busy) return
    const next: Msg[] = [...chat, { role: 'user', content: t }]
    setChat(next)
    setDraft('')
    setQuestion('')
    setOptions([])
    converse(next)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Assistant IA — {kind === 'marketing' ? 'campagne' : 'automatisation'}
        </div>
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border bg-muted/20 p-4">
        {chat.length === 0 && busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> L’assistant réfléchit…
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={m.role === 'user'
              ? 'max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
              : 'max-w-[85%] rounded-2xl rounded-tl-sm border bg-background px-3 py-2 text-sm'}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && chat.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
          </div>
        )}

        {/* Modèles manquants → conseils pour convertir + bouton de création */}
        {(missing.length > 0 || (ready?.missingTemplates?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Message(s) à créer
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Ce parcours a besoin de message(s) que vous n’avez pas encore. Voici ce qu’il faut créer,
              avec des conseils pour <span className="font-medium text-foreground">convertir</span> :
            </p>
            <div className="space-y-2">
              {(missing.length > 0 ? missing : ready!.missingTemplates).map((m, i) => {
                const st = created[i]
                return (
                  <div key={i} className="rounded-lg border bg-background p-2.5">
                    <p className="text-sm font-medium">{m.purpose}</p>
                    {m.suggestion && (
                      <p className="mt-1 rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
                        💡 {m.suggestion}
                      </p>
                    )}

                    {/* Le message généré : le marchand LE VOIT avant qu'il ne
                        parte en revue Meta — c'est lui qui sera envoyé à ses
                        clients. */}
                    {st?.body && (
                      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">{st.body}</p>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {st.submitted
                            ? '✓ Envoyé en revue chez Meta — approbation sous 24 h en général.'
                            : 'Enregistré en brouillon. Vous pouvez le retoucher dans Modèles avant de le soumettre.'}
                        </p>
                      </div>
                    )}

                    {!st?.body && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {/* ⚠️ Avant, ce bouton faisait router.push('/templates') :
                            on perdait TOUT le parcours en cours, et la suggestion
                            de l'IA n'était qu'un texte à recopier à la main. On
                            crée désormais le message sur place, sans quitter la
                            conversation. */}
                        <Button size="sm" disabled={st?.busy}
                          onClick={() => createFromSuggestion(i, m, true)}>
                          {st?.busy
                            ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Création…</>
                            : <><Sparkles className="mr-1 h-3.5 w-3.5" /> Créer et soumettre à Meta</>}
                        </Button>
                        <Button size="sm" variant="outline" disabled={st?.busy}
                          onClick={() => createFromSuggestion(i, m, false)}>
                          <FileText className="mr-1 h-3.5 w-3.5" /> Créer en brouillon
                        </Button>
                      </div>
                    )}
                    {st?.error && (
                      <p className="mt-1.5 text-[11px] text-red-500">{st.error}</p>
                    )}
                  </div>
                )
              })}
            </div>
            {/* ⚠️ SORTIE DU MODE « messages à créer ».
                Sans ce bouton, le marchand créait ses 3 messages… et restait
                bloqué : plus aucun moyen de construire le parcours. L'assistant
                proposait tout, et n'aboutissait à rien. */}
            {!ready && Object.values(created).some((c) => c.id) && (
              <div className="mt-3 border-t pt-3">
                <Button
                  className="w-full" disabled={busy}
                  onClick={() => {
                    // ⚠️ On DIT à l'assistant que le catalogue a changé.
                    //
                    // Rejouer la conversation telle quelle ne suffit pas : il
                    // avait conclu « aucun de vos modèles ne correspond », et
                    // rien dans l'historique ne dit que le marchand vient de les
                    // créer. Sans ce message, il reconclurait la même chose.
                    // (La route relit le catalogue à chaque appel : les
                    // brouillons fraîchement créés y sont.)
                    setMissing([])
                    converse([...chat, {
                      role: 'user',
                      content: 'J’ai créé les messages que tu m’as demandés. Construis le parcours complet maintenant.',
                    }])
                  }}
                >
                  {busy
                    ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Construction…</>
                    : <><Sparkles className="mr-1 h-4 w-4" /> Construire le parcours avec ces messages</>}
                </Button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Vos messages sont créés : je peux maintenant assembler le parcours complet.
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Une fois approuvés par Meta, rattachez ces messages au parcours dans l’éditeur.
            </p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Parcours prêt → aperçu + création */}
      {ready ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold">{ready.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ready.graph.nodes.filter((n) => n.type === 'action').length} message(s) ·{' '}
              {ready.graph.nodes.filter((n) => n.type === 'delay').length} délai(s) ·{' '}
              {ready.graph.nodes.filter((n) => n.type === 'condition').length} condition(s) ·{' '}
              {ready.graph.nodes.filter((n) => n.type === 'ab_test').length} test(s) A/B
            </p>
          </div>
          {/* Le message dépend de ce qui a VRAIMENT été créé : dire « rattachez-les
              dans l'éditeur » alors qu'ils viennent d'être branchés
              automatiquement enverrait le marchand faire un travail déjà fait. */}
          {(() => {
            const total = (missing.length > 0 ? missing : ready.missingTemplates)?.length ?? 0
            if (total === 0) return null
            const done = Object.values(created).filter((c) => c.id).length
            const rest = total - done
            return (
              <p className="flex items-start gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {done > 0 && (
                  <span>
                    {done} message{done > 1 ? 's' : ''} créé{done > 1 ? 's' : ''} seront rattachés au parcours.{' '}
                    {rest > 0 ? `Il en reste ${rest} à écrire. ` : ''}
                    Le parcours ne pourra être activé qu’une fois tous les messages approuvés par Meta.
                  </span>
                )}
                {done === 0 && (
                  <span>
                    Le parcours sera créé mais {total} message{total > 1 ? 's' : ''} reste{total > 1 ? 'nt' : ''} à écrire
                    (voir les conseils ci-dessus). Rattachez-les dans l’éditeur avant d’activer.
                  </span>
                )}
              </p>
            )
          })()}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!ready.trigger}
              onClick={() => {
                if (!ready.trigger) { toast.error('Déclencheur manquant'); return }
                onComplete({ name: ready.name, graph: graphWithCreated(), trigger: ready.trigger })
              }}
            >
              <Check className="mr-1 h-4 w-4" /> Créer ce parcours
            </Button>
            <Button variant="outline" onClick={() => { setReady(null); setQuestion('Que souhaitez-vous changer ?') }}>
              Ajuster
            </Button>
          </div>
        </div>
      ) : (
        // Saisie de la réponse
        <div className="space-y-2">
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o} onClick={() => answer(o)} disabled={busy}
                  className="rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50">
                  {o}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') answer(draft) }}
              placeholder={question ? 'Votre réponse…' : 'Décrivez le parcours souhaité…'}
              disabled={busy}
            />
            <Button onClick={() => answer(draft)} disabled={busy || !draft.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
