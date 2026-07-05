'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { ContactTableRow } from '@/app/api/contacts/table/route'

type SortKey =
  | 'name' | 'phone_number' | 'opt_in_status' | 'messages_total'
  | 'messages_out' | 'messages_ai' | 'messages_read'
  | 'orders_count' | 'revenue_total' | 'last_order_at' | 'last_activity_at'

const OPTIN_FR: Record<string, { label: string; cls: string }> = {
  subscribed: { label: 'Abonné', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  opted_out: { label: 'Désabonné', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  none: { label: '—', cls: 'bg-muted text-muted-foreground' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(v: number, currency: string | null): string {
  if (!v) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency || ''}`.trim()
  }
}

export function ContactsTableView({
  sessions,
}: {
  sessions: { id: string; instance_name: string; phone_number: string | null }[]
}) {
  const [rows, setRows] = useState<ContactTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_activity_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/contacts/table?session_id=${encodeURIComponent(sessionFilter)}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setRows(json.data || []) })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger le tableau des contacts') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q)
      || r.phone_number.toLowerCase().includes(q)
      || r.email.toLowerCase().includes(q)
      || r.stages.some((s) => s.name.toLowerCase().includes(q))
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' || key === 'phone_number' ? 'asc' : 'desc') }
  }

  // Export CSV : on récupère le fichier via fetch (conserve le cookie d'auth)
  // puis on déclenche le téléchargement côté client.
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/contacts/table?format=csv&session_id=${encodeURIComponent(sessionFilter)}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contacts-xeyo.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Échec de l’export CSV')
    } finally {
      setExporting(false)
    }
  }

  const SortHead = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        {sortKey === k
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, numéro, email, étape…)"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {sessions.length > 1 && (
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">Toutes les connexions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.instance_name}</option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {loading ? '…' : `${sorted.length} contact${sorted.length > 1 ? 's' : ''}`}
          </span>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || loading || rows.length === 0}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Exporter CSV
          </Button>
        </div>
      </div>

      {/* Tableau */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Aucun contact à afficher.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <SortHead label="Nom" k="name" />
                <SortHead label="Numéro" k="phone_number" />
                <TableHead>État du lead</TableHead>
                <SortHead label="Opt-in" k="opt_in_status" />
                <SortHead label="Messages" k="messages_total" align="right" />
                <SortHead label="Envoyés" k="messages_out" align="right" />
                <SortHead label="Par IA" k="messages_ai" align="right" />
                <SortHead label="Vues" k="messages_read" align="right" />
                <SortHead label="Cmd." k="orders_count" align="right" />
                <SortHead label="CA" k="revenue_total" align="right" />
                <SortHead label="Dern. cmd." k="last_order_at" align="right" />
                <SortHead label="Activité" k="last_activity_at" align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const optin = OPTIN_FR[r.opt_in_status] || OPTIN_FR.none
                return (
                  <TableRow key={r.contact_id}>
                    <TableCell className="font-medium">
                      {r.name || <span className="text-muted-foreground">—</span>}
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{r.phone_number}</TableCell>
                    <TableCell>
                      {r.stages.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.stages.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ backgroundColor: `${s.color}22`, color: s.color }}
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${optin.cls}`}>
                        {optin.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages_total}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages_out}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.messages_ai}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages_read}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.orders_count || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.revenue_total ? fmtMoney(r.revenue_total, r.currency) : '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">{fmtDate(r.last_order_at)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">{fmtDate(r.last_activity_at)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
