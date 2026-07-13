'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
type MissingTpl = { purpose: string; suggestion: string }

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
  const router = useRouter()
  const [chat, setChat] = useState<Msg[]>([])
  const [question, setQuestion] = useState<string>('')
  const [options, setOptions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<Ready | null>(null)
  const [missing, setMissing] = useState<MissingTpl[]>([])
  const started = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

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

        {/* Modèles manquants → bouton pour aller les créer */}
        {(missing.length > 0 || (ready?.missingTemplates?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Modèle(s) à créer
            </p>
            <div className="space-y-2">
              {(missing.length > 0 ? missing : ready!.missingTemplates).map((m, i) => (
                <div key={i} className="rounded-lg border bg-background p-2.5">
                  <p className="text-sm font-medium">{m.purpose}</p>
                  {m.suggestion && <p className="mt-0.5 text-xs text-muted-foreground">{m.suggestion}</p>}
                  <Button size="sm" variant="outline" className="mt-2"
                    onClick={() => router.push('/templates')}>
                    <FileText className="mr-1 h-3.5 w-3.5" /> Créer ce modèle
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Créez le modèle, faites-le approuver par Meta, puis revenez ici.
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
          {ready.hallucinated > 0 && (
            <p className="flex items-start gap-1 text-[11px] text-amber-600">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {ready.hallucinated} message(s) sans modèle : choisissez-les dans l’éditeur après création.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!ready.trigger}
              onClick={() => {
                if (!ready.trigger) { toast.error('Déclencheur manquant'); return }
                onComplete({ name: ready.name, graph: ready.graph, trigger: ready.trigger })
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
