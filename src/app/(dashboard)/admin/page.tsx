'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ShieldAlert, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanId } from '@/lib/stripe/client'

type ClientRow = {
  id: string
  email: string
  full_name: string | null
  subscription_status: string | null
  plan: string | null
  tokens_used: number
  tokens_limit: number
  created_at: string
}

const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }
const STATUS_LABELS: Record<string, string> = { trial: 'Essai', active: 'Actif', expired: 'Expiré', cancelled: 'Annulé' }

export default function AdminPage() {
  const router = useRouter()
  const { subscription, loading: subLoading } = useSubscription()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId>>({})

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/admin/clients')
    if (!res.ok) return
    const data = await res.json()
    setClients(data.clients || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!subLoading && subscription?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [subLoading, subscription, router])

  useEffect(() => {
    if (subscription?.role === 'admin') {
      fetchClients()
    }
  }, [subscription, fetchClients])

  const handleActivate = async (userId: string) => {
    const plan = selectedPlans[userId] || 'scale'
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Abonnement ${plan} activé`)
      fetchClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setActivating(null)
    }
  }

  if (subLoading || loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (subscription?.role !== 'admin') {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <div className="text-center space-y-4">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">Accès refusé</h2>
          <p className="text-muted-foreground">Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Dashboard Admin</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clients enregistrés</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Statut</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-left font-semibold">Tokens</th>
              <th className="px-4 py-3 text-left font-semibold">Inscription</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.map(client => {
              const usagePct = client.tokens_limit > 0
                ? Math.round((client.tokens_used / client.tokens_limit) * 100)
                : 0
              return (
                <tr key={client.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{client.full_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={client.subscription_status === 'active' ? 'default' : 'secondary'}
                      className={cn(
                        client.subscription_status === 'active' && 'bg-green-500 hover:bg-green-600',
                        client.subscription_status === 'trial' && 'bg-amber-500 hover:bg-amber-600',
                        client.subscription_status === 'expired' && 'bg-red-500 hover:bg-red-600',
                      )}
                    >
                      {STATUS_LABELS[client.subscription_status || ''] || client.subscription_status || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium">
                      {PLAN_LABELS[client.plan || ''] || client.plan || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className={cn('h-3.5 w-3.5', usagePct >= 90 ? 'text-red-500' : 'text-muted-foreground')} />
                      <span className="text-xs">
                        {client.tokens_used.toLocaleString()} / {client.tokens_limit.toLocaleString()}
                        <span className={cn('ml-1', usagePct >= 90 ? 'text-red-500' : 'text-muted-foreground')}>
                          ({usagePct}%)
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(client.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedPlans[client.id] || 'scale'}
                        onValueChange={v => setSelectedPlans(prev => ({ ...prev, [client.id]: v as PlanId }))}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="scale">Scale</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={activating === client.id}
                        onClick={() => handleActivate(client.id)}
                      >
                        {activating === client.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Activer'
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
