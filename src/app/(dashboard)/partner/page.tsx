'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, Wallet, Users, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * Espace partenaire — ses commissions d'affiliation.
 *
 * ⚠️ CETTE PAGE N'EXISTAIT PAS.
 *
 * Les commissions n'étaient lisibles que par l'admin. Un partenaire ne pouvait
 * donc pas savoir ce qu'on lui devait, ni combien de marchands il avait amenés,
 * ni même si son lien fonctionnait — et il ne fonctionnait pas : la chaîne
 * d'attribution était rompue, aucune commission n'a jamais été calculée.
 *
 * Le versement reste MANUEL (l'admin marque « payé ») : aucun virement
 * automatique n'est déclenché ici.
 */

type GrowthData = {
  affiliate: {
    code: string
    label: string | null
    link: string
    commissionPercent: number | null
  } | null
  stats: { signups: number; converted: number }
  totals: { commissionPendingCents: number; commissionPaidCents: number }
  rewards: Array<{
    id: string
    type: 'free_months' | 'ai_credits' | 'commission'
    amountCents: number | null
    currency: string
    status: string
    createdAt: string
    paidAt: string | null
  }>
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'

export default function PartnerPage() {
  const [data, setData] = useState<GrowthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/growth')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // L'utilisateur n'est pas partenaire : on ne lui montre pas une page vide, on
  // lui explique ce qu'est le programme et vers qui se tourner.
  if (!data?.affiliate) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <h1 className="text-2xl font-semibold">Espace partenaire</h1>
        <div className="mt-6 rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Vous n’êtes pas encore partenaire Xeyo.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Le programme d’affiliation rémunère les agences et créateurs qui nous amènent des
            marchands. Écrivez-nous pour en faire partie.
          </p>
        </div>
      </div>
    )
  }

  const a = data.affiliate
  const commissions = data.rewards.filter((r) => r.type === 'commission')

  const copy = () => {
    navigator.clipboard.writeText(a.link)
    toast.success('Lien copié')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Espace partenaire</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {a.label ? `${a.label} — ` : ''}
          Vous touchez <span className="font-medium text-foreground">{a.commissionPercent} %</span> sur
          le premier paiement de chaque marchand que vous amenez.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium">Votre lien d’affiliation</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            {a.link}
          </code>
          <Button onClick={copy} className="shrink-0">
            <Copy className="mr-1.5 h-4 w-4" /> Copier
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Code : <span className="font-mono font-medium text-foreground">{a.code}</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Inscrits" value={String(data.stats.signups)} />
        <Stat
          icon={Check}
          label="Devenus clients"
          value={String(data.stats.converted)}
          hint="La commission est due au premier paiement"
        />
        <Stat
          icon={Wallet}
          label="À recevoir"
          value={euros(data.totals.commissionPendingCents)}
          accent
        />
      </div>

      {data.totals.commissionPaidCents > 0 && (
        <p className="text-sm text-muted-foreground">
          Déjà versé : <span className="font-medium text-foreground">{euros(data.totals.commissionPaidCents)}</span>
        </p>
      )}

      {commissions.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-5 py-3 text-sm font-medium">Vos commissions</p>
          <ul className="divide-y">
            {commissions.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{euros(c.amountCents || 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                    {c.paidAt && ` — versée le ${new Date(c.paidAt).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <Badge variant={c.status === 'paid' ? 'default' : 'secondary'}>
                  {c.status === 'paid' ? 'Versée' : 'En attente'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune commission pour le moment. Partagez votre lien pour commencer.
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
