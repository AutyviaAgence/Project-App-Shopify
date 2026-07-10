'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Copy, Gift, Users, Zap, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ReferralData = {
  referral_code: string
  referral_link: string
  total_tokens_earned: number
  rewards: Array<{
    id: string
    tokens_credited: number
    rewarded_user_id: string
    created_at: string
  }>
  referees: Array<{
    id: string
    email: string
    full_name: string | null
    created_at: string
    subscription_status: string | null
  }>
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referral')
      .then(r => r.json())
      .then(setData)
      .catch(() => toast.error('Impossible de charger les données de parrainage'))
      .finally(() => setLoading(false))
  }, [])

  const copyLink = () => {
    if (!data?.referral_link) return
    navigator.clipboard.writeText(data.referral_link)
    toast.success('Lien copié !')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" />
          Parrainage
        </h1>
        <p className="text-slate-500 mt-1">
          Invitez vos contacts et recevez chacun 500 000 tokens dès leur premier paiement.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-sm text-slate-500">Filleuls inscrits</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{data?.referees.length ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-sm text-slate-500">Tokens gagnés</p>
          <p className="text-3xl font-bold text-primary mt-1">
            {((data?.total_tokens_earned ?? 0) / 1000).toFixed(0)}k
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-sm text-slate-500">Récompenses</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{data?.rewards.length ?? 0}</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Votre lien de parrainage
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Partagez ce lien, votre filleul et vous recevrez chacun 500 000 tokens dès son premier paiement réel.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-mono text-slate-700 dark:text-slate-300 truncate">
            {data?.referral_link ?? '...'}
          </div>
          <Button onClick={copyLink} size="sm" className="shrink-0">
            <Copy className="h-4 w-4 mr-1.5" />
            Copier
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Code : <span className="font-mono font-semibold">{data?.referral_code ?? '...'}</span>
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Comment ça marche ?</h2>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Partagez votre lien à un contact' },
            { step: '2', text: 'Il s\'inscrit via votre lien et choisit un plan ou un audit' },
            { step: '3', text: 'Dès son premier paiement réel encaissé par Stripe, vous recevez chacun 500 000 tokens' },
            { step: '4', text: 'Il n\'y a pas de limite, parrainez autant de personnes que vous voulez' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                {step}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Referees list */}
      {(data?.referees.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-4 w-4" />
              Mes filleuls
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {data?.referees.map(referee => {
              const hasRewarded = data.rewards.some(r => r.rewarded_user_id === referee.id || r.rewarded_user_id === data.referees.find(x => x.id === referee.id)?.id)
              return (
                <div key={referee.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {referee.full_name || referee.email}
                    </p>
                    <p className="text-xs text-slate-400">
                      Inscrit le {new Date(referee.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {referee.subscription_status === 'active' || referee.subscription_status === 'trialing' ? (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                        Abonné
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500 text-xs">
                        Sans plan
                      </Badge>
                    )}
                    {hasRewarded && (
                      <div className="flex items-center gap-1 text-xs text-primary font-medium">
                        <Zap className="h-3 w-3" />
                        +500k tokens
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
