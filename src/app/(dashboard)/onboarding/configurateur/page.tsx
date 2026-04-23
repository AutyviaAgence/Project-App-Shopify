'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

type MultiOption = { value: string; label: string }

const MAIN_FUNCTIONS: MultiOption[] = [
  { value: 'sav', label: 'Service client / SAV' },
  { value: 'leads', label: 'Génération et qualification de leads' },
  { value: 'rdv', label: 'Prise de rendez-vous' },
  { value: 'devis', label: 'Devis et commandes' },
]

const BEHAVIORS: MultiOption[] = [
  { value: 'direct', label: 'Répond directement sans escalade' },
  { value: 'qualify_transfer', label: 'Qualifie puis transfère à un humain' },
  { value: 'qualify_silent', label: 'Qualifie et notifie en arrière-plan' },
]

const TOOLS: MultiOption[] = [
  { value: 'calendar', label: 'Agenda / réservation' },
  { value: 'crm', label: 'CRM (HubSpot, Salesforce…)' },
  { value: 'ecommerce', label: 'E-commerce (Shopify, WooCommerce…)' },
  { value: 'faq', label: 'Base de connaissances / FAQ' },
  { value: 'payment', label: 'Paiement en ligne' },
  { value: 'none', label: 'Aucun outil particulier' },
]

const ESCALATION_OPTIONS: MultiOption[] = [
  { value: 'never', label: 'Jamais — l\'agent gère tout' },
  { value: 'qualified', label: 'Uniquement les demandes qualifiées' },
  { value: 'on_demand', label: 'Sur demande explicite du client' },
  { value: 'off_hours', label: 'Hors horaires uniquement' },
]

const LANGUAGES: MultiOption[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espagnol' },
  { value: 'ar', label: 'Arabe' },
  { value: 'pt', label: 'Portugais' },
  { value: 'de', label: 'Allemand' },
]

function SingleChoice({ options, value, onChange }: {
  options: MultiOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-left text-sm transition-all',
            value === opt.value
              ? 'border-primary bg-primary/5 text-foreground font-medium'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
          )}
        >
          {value === opt.value
            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function MultiChoice({ options, values, onChange }: {
  options: MultiOption[]
  values: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val])
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const selected = values.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-left text-sm transition-all',
              selected
                ? 'border-primary bg-primary/5 text-foreground font-medium'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {selected
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              : <span className="h-4 w-4 shrink-0 rounded border-2 border-muted-foreground/40" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ConfigurateurPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const acompteOk = searchParams.get('acompte') === 'ok'

  const [form, setForm] = useState({
    main_function: '',
    behavior: '',
    tools: [] as string[],
    escalation: '',
    languages: [] as string[],
    conversation_example: '',
    info_to_collect: '',
  })
  const [cgvAccepted, setCgvAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [validatedAt, setValidatedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/onboarding/config')
      .then(r => r.json())
      .then(d => {
        if (d.data?.submitted_at) setAlreadySubmitted(true)
        if (d.data?.admin_validated_at) setValidatedAt(d.data.admin_validated_at)
        if (d.data) {
          setForm({
            main_function: d.data.main_function || '',
            behavior: d.data.behavior || '',
            tools: d.data.tools || [],
            escalation: d.data.escalation || '',
            languages: d.data.languages || [],
            conversation_example: d.data.conversation_example || '',
            info_to_collect: d.data.info_to_collect || '',
          })
        }
      })
      .catch(() => {})
  }, [])

  const isValid =
    form.main_function &&
    form.behavior &&
    form.tools.length > 0 &&
    form.escalation &&
    form.languages.length > 0 &&
    form.conversation_example.trim().length > 0 &&
    form.info_to_collect.trim().length > 0 &&
    cgvAccepted

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('Veuillez compléter tous les champs.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cgv_accepted: cgvAccepted }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Configurateur enregistré ! Notre équipe prépare votre plateforme.')
        router.push('/onboarding/confirmation')
      } else {
        toast.error(data.error || 'Erreur lors de la sauvegarde.')
      }
    } catch {
      toast.error('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  // Si validé par l'admin → afficher page lecture seule
  if (validatedAt) {
    return (
      <div className="min-h-full bg-background p-6 md:p-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-xl border-2 border-green-500/40 bg-green-50 dark:bg-green-900/20 p-6 space-y-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-green-600 shrink-0" />
              <div>
                <h1 className="text-lg font-bold text-green-800 dark:text-green-300">Configurateur validé</h1>
                <p className="text-sm text-green-700 dark:text-green-400">
                  Validé par notre équipe le {new Date(validatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400">
              Votre configurateur a été examiné et validé. La configuration de votre agent IA est en cours. Vous serez contacté par notre équipe pour la suite.
            </p>
          </div>

          {/* Récap lecture seule */}
          <div className="space-y-4 opacity-75 pointer-events-none select-none">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Récapitulatif de votre configurateur</h2>
            <div className="rounded-xl border bg-muted/20 p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground mb-0.5">Fonction principale</p><p className="font-medium">{form.main_function}</p></div>
                <div><p className="text-xs text-muted-foreground mb-0.5">Comportement</p><p className="font-medium">{form.behavior}</p></div>
                <div><p className="text-xs text-muted-foreground mb-0.5">Escalade</p><p className="font-medium">{form.escalation}</p></div>
                <div><p className="text-xs text-muted-foreground mb-0.5">Langues</p><p className="font-medium">{form.languages.join(', ')}</p></div>
              </div>
              <div><p className="text-xs text-muted-foreground mb-0.5">Outils</p><p className="font-medium">{form.tools.join(', ') || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground mb-1">Exemple de conversation</p><pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 rounded p-2">{form.conversation_example}</pre></div>
              <div><p className="text-xs text-muted-foreground mb-1">Informations à récolter</p><pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-2">{form.info_to_collect}</pre></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background p-6 md:p-10">
      <div className="mx-auto max-w-2xl space-y-10">
        {/* Header */}
        <div className="space-y-1">
          {acompteOk && (
            <div className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Acompte reçu — merci ! Complétez maintenant le configurateur.
            </div>
          )}
          {alreadySubmitted && (
            <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Configurateur déjà soumis. Vous pouvez le modifier jusqu&apos;à la fin de la configuration.
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">Configurateur de votre agent IA</h1>
          <p className="text-muted-foreground text-sm">
            Ces informations permettent à notre équipe de paramétrer votre agent WhatsApp IA exactement selon vos besoins.
          </p>
        </div>

        {/* Step 1 — Fonction principale */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">1. Fonction principale de l&apos;agent</h2>
          <SingleChoice
            options={MAIN_FUNCTIONS}
            value={form.main_function}
            onChange={v => setForm(f => ({ ...f, main_function: v }))}
          />
        </section>

        {/* Step 2 — Comportement */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">2. Comportement souhaité</h2>
          <SingleChoice
            options={BEHAVIORS}
            value={form.behavior}
            onChange={v => setForm(f => ({ ...f, behavior: v }))}
          />
        </section>

        {/* Step 3 — Outils */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">3. Outils à connecter <span className="text-muted-foreground font-normal text-sm">(plusieurs possibles)</span></h2>
          <MultiChoice
            options={TOOLS}
            values={form.tools}
            onChange={v => setForm(f => ({ ...f, tools: v }))}
          />
        </section>

        {/* Step 4 — Escalade */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">4. Gestion de l&apos;escalade humaine</h2>
          <SingleChoice
            options={ESCALATION_OPTIONS}
            value={form.escalation}
            onChange={v => setForm(f => ({ ...f, escalation: v }))}
          />
        </section>

        {/* Step 5 — Langues */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">5. Langues de l&apos;agent <span className="text-muted-foreground font-normal text-sm">(plusieurs possibles)</span></h2>
          <MultiChoice
            options={LANGUAGES}
            values={form.languages}
            onChange={v => setForm(f => ({ ...f, languages: v }))}
          />
        </section>

        {/* Step 6 — Exemple de conversation */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">6. Exemple de conversation de demande client</h2>
          <p className="text-xs text-muted-foreground">
            Décrivez ou copiez un exemple réel de conversation — comment un client vous contacte, ce qu&apos;il demande, et comment vous répondez habituellement.
          </p>
          <textarea
            value={form.conversation_example}
            onChange={e => setForm(f => ({ ...f, conversation_example: e.target.value }))}
            rows={6}
            placeholder={"Client : Bonjour, je voudrais savoir si vous livrez à Paris ?\nNous : Oui bien sûr ! Nous livrons partout en France sous 48h. Vous souhaitez passer commande ?\nClient : Oui, combien ça coûte ?\n…"}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono"
          />
        </section>

        {/* Step 7 — Informations à récolter */}
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground">7. Informations à récolter auprès du client</h2>
          <p className="text-xs text-muted-foreground">
            Listez les informations que l&apos;agent doit systématiquement collecter (nom, email, téléphone, budget, besoin spécifique…).
          </p>
          <textarea
            value={form.info_to_collect}
            onChange={e => setForm(f => ({ ...f, info_to_collect: e.target.value }))}
            rows={5}
            placeholder={"- Prénom et nom\n- Numéro de téléphone\n- Email\n- Type de prestation souhaitée\n- Budget estimé\n- Délai souhaité"}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </section>

        {/* Checkbox CGV */}
        <section className="space-y-3">
          <label className={cn(
            'flex items-start gap-3 cursor-pointer rounded-xl border-2 p-4 transition-all',
            cgvAccepted ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
          )}>
            <input
              type="checkbox"
              checked={cgvAccepted}
              onChange={e => setCgvAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                Engagement prérequis &amp; conditions de remboursement
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Je confirme avoir lu et accepté les{' '}
                <Link href="/cgu" target="_blank" className="text-primary underline hover:no-underline">CGU</Link>
                {' '}et les{' '}
                <Link href="/cgv" target="_blank" className="text-primary underline hover:no-underline">CGV</Link>.
                Je comprends que ce formulaire constitue un prérequis à la mise en place et que toute demande de remboursement sera évaluée sur la base des informations fournies ici.
              </p>
            </div>
          </label>
        </section>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !isValid}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all',
            isValid
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Envoyer le configurateur
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
