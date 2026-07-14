'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Copy, Gift, Users, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * Page de parrainage.
 *
 * ⚠️ CE QUE L'ANCIENNE VERSION AVAIT DE CASSÉ.
 *
 *  · Elle était ORPHELINE : aucun lien de la navigation n'y menait, et son
 *    contenu était dupliqué dans les paramètres.
 *  · Elle affichait un solde qui restait éternellement à zéro — rien, nulle part,
 *    n'écrivait de récompense pour un marchand Shopify.
 *  · Son lien de parrainage pointait sur `app.autyvia.fr`, l'ancien domaine.
 *  · Elle exposait les EMAILS des filleuls. Savoir combien de marchands on a
 *    amenés suffit ; les identifier est une fuite de données.
 */

type GrowthData = {
  referral: { code: string; link: string; rewardMonths: number } | null
  stats: { signups: number; converted: number }
  totals: { freeMonths: number; aiCredits: number }
  rewards: Array<{
    id: string
    type: 'free_months' | 'ai_credits' | 'commission'
    months: number | null
    credits: number | null
    status: string
    createdAt: string
  }>
}

export default function ReferralPage() {
  const [data, setData] = useState<GrowthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/growth')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Lien copié')
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const months = data?.referral?.rewardMonths ?? 1

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Parrainage</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Invitez un marchand : dès qu’il s’abonne, vous recevez{' '}
          <span className="font-medium text-foreground">
            {months} mois offert{months > 1 ? 's' : ''}
          </span>
          , déduit automatiquement de votre prochaine facture Shopify.
        </p>
      </div>

      {data?.referral && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium">Votre lien de parrainage</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              {data.referral.link}
            </code>
            <Button onClick={() => copy(data.referral!.link)} className="shrink-0">
              <Copy className="mr-1.5 h-4 w-4" /> Copier
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Code : <span className="font-mono font-medium text-foreground">{data.referral.code}</span>
          </p>
        </div>
      )}

      {/* On distingue « inscrits » et « devenus clients » : c'est l'ABONNEMENT qui
          déclenche la récompense, pas l'inscription. Le marchand doit comprendre
          pourquoi il a 3 inscrits mais 1 seul mois offert. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Inscrits via votre lien" value={String(data?.stats.signups ?? 0)} />
        <Stat
          icon={Check}
          label="Devenus clients"
          value={String(data?.stats.converted ?? 0)}
          hint="C’est l’abonnement qui déclenche la récompense"
        />
        <Stat icon={Gift} label="Mois offerts" value={String(data?.totals.freeMonths ?? 0)} accent />
      </div>

      {/* Repli : sans jeton Partner API, la récompense prend la forme de crédits
          IA. Le marchand doit comprendre ce qu'il a réellement reçu. */}
      {(data?.totals.aiCredits ?? 0) > 0 && (
        <div className="rounded-xl border bg-card p-5 text-sm">
          <span className="font-medium">{data!.totals.aiCredits} conversations IA</span> vous ont été
          créditées grâce au parrainage.
        </div>
      )}

      {data && data.rewards.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-5 py-3 text-sm font-medium">Historique</p>
          <ul className="divide-y">
            {data.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {r.type === 'free_months'
                      ? `${r.months} mois offert${(r.months || 0) > 1 ? 's' : ''}`
                      : r.type === 'ai_credits'
                        ? `${r.credits} conversations IA`
                        : 'Commission'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <Badge variant={r.status === 'granted' ? 'default' : 'secondary'}>
                  {r.status === 'granted' ? 'Reçu' : 'En attente'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun parrainage pour le moment. Partagez votre lien pour commencer.
        </p>
      )}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Users
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={accent ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-muted-foreground'} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={accent ? 'mt-2 text-2xl font-semibold text-primary' : 'mt-2 text-2xl font-semibold'}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
