'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search, Loader2, Columns3, Filter, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import type { ContactTableRow } from '@/app/api/contacts/table/route'

// ─── Définition des colonnes (source unique : entête + cellule + CSV) ──────
type ColKey =
  | 'name' | 'phone_number' | 'stages' | 'opt_in_status'
  | 'messages_total' | 'messages_out' | 'messages_ai' | 'messages_read'
  | 'orders_count' | 'revenue_total' | 'last_order_at' | 'last_activity_at'

type SortKey = Exclude<ColKey, 'stages'>

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
  } catch { return `${v.toFixed(2)} ${currency || ''}`.trim() }
}

type Col = {
  key: ColKey
  label: string
  align: 'left' | 'right'
  sortable: boolean
  // Valeur brute pour le CSV (chaîne simple).
  csv: (r: ContactTableRow) => string
}

const COLUMNS: Col[] = [
  { key: 'name', label: 'Nom', align: 'left', sortable: true, csv: (r) => r.name },
  { key: 'phone_number', label: 'Numéro', align: 'left', sortable: true, csv: (r) => r.phone_number },
  { key: 'stages', label: 'État du lead', align: 'left', sortable: false, csv: (r) => r.stages.map((s) => s.name).join(' / ') },
  { key: 'opt_in_status', label: 'Opt-in', align: 'left', sortable: true, csv: (r) => OPTIN_FR[r.opt_in_status]?.label || r.opt_in_status },
  { key: 'messages_total', label: 'Messages', align: 'right', sortable: true, csv: (r) => String(r.messages_total) },
  { key: 'messages_out', label: 'Envoyés', align: 'right', sortable: true, csv: (r) => String(r.messages_out) },
  { key: 'messages_ai', label: 'Par IA', align: 'right', sortable: true, csv: (r) => String(r.messages_ai) },
  { key: 'messages_read', label: 'Vues', align: 'right', sortable: true, csv: (r) => String(r.messages_read) },
  { key: 'orders_count', label: 'Cmd.', align: 'right', sortable: true, csv: (r) => String(r.orders_count) },
  { key: 'revenue_total', label: 'CA', align: 'right', sortable: true, csv: (r) => (r.revenue_total ? String(r.revenue_total) : '') },
  { key: 'last_order_at', label: 'Dern. cmd.', align: 'right', sortable: true, csv: (r) => (r.last_order_at ? r.last_order_at.slice(0, 10) : '') },
  { key: 'last_activity_at', label: 'Activité', align: 'right', sortable: true, csv: (r) => (r.last_activity_at ? r.last_activity_at.slice(0, 10) : '') },
]

// Emails "email" pour le CSV, ajouté en dur après le nom (pas une colonne visible séparée).
function csvHeaderFor(cols: Col[]): string {
  return cols.map((c) => `"${c.label}"`).join(',')
}
function csvCell(v: string): string {
  return `"${(v ?? '').replace(/"/g, '""')}"`
}

type OptinFilter = 'all' | 'subscribed' | 'opted_out' | 'none'
type OrdersFilter = 'all' | 'with' | 'without'

export function ContactsTableView({
  sessions,
}: {
  sessions: { id: string; instance_name: string; phone_number: string | null }[]
}) {
  const [rows, setRows] = useState<ContactTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [optinFilter, setOptinFilter] = useState<OptinFilter>('all')
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_activity_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // Colonnes visibles (toutes par défaut).
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColKey, boolean>
  )

  const reload = () => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/contacts/table?session_id=${encodeURIComponent(sessionFilter)}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setRows(json.data || []) })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger le tableau des contacts') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }
  useEffect(reload, [sessionFilter])

  // Liste des étapes présentes dans les données (pour le filtre par étape).
  const allStages = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) for (const s of r.stages) map.set(s.id, s.name)
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !(
        r.name.toLowerCase().includes(q)
        || r.phone_number.toLowerCase().includes(q)
        || r.email.toLowerCase().includes(q)
        || r.stages.some((s) => s.name.toLowerCase().includes(q))
      )) return false
      if (optinFilter !== 'all' && r.opt_in_status !== optinFilter) return false
      if (ordersFilter === 'with' && r.orders_count === 0) return false
      if (ordersFilter === 'without' && r.orders_count > 0) return false
      if (stageFilter !== 'all') {
        if (stageFilter === 'none') { if (r.stages.length > 0) return false }
        else if (!r.stages.some((s) => s.id === stageFilter)) return false
      }
      return true
    })
  }, [rows, search, optinFilter, ordersFilter, stageFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' || key === 'phone_number' ? 'asc' : 'desc') }
  }

  const visibleCols = COLUMNS.filter((c) => visible[c.key])
  const activeFilterCount =
    (optinFilter !== 'all' ? 1 : 0) + (ordersFilter !== 'all' ? 1 : 0) + (stageFilter !== 'all' ? 1 : 0)

  const resetFilters = () => { setOptinFilter('all'); setOrdersFilter('all'); setStageFilter('all'); setSearch('') }

  // Export CSV côté client : respecte les lignes filtrées ET les colonnes visibles.
  const handleExport = () => {
    if (sorted.length === 0) { toast.error('Aucune ligne à exporter'); return }
    const header = csvHeaderFor(visibleCols)
    const lines = sorted.map((r) => visibleCols.map((c) => csvCell(c.csv(r))).join(','))
    const csv = '﻿' + [header, ...lines].join('\r\n') // BOM UTF-8 pour Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts-xeyo.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Synchronise l'historique des commandes Shopify (remplit nb commandes + CA).
  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/shopify/backfill-orders', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Échec')
      toast.success(`${json.saved} commande(s) synchronisée(s), ${json.linkedToContact} liée(s) à un contact.`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la synchronisation')
    } finally {
      setSyncing(false)
    }
  }

  const renderCell = (c: Col, r: ContactTableRow) => {
    switch (c.key) {
      case 'name':
        return (
          <TableCell key={c.key} className="font-medium">
            {r.name || <span className="text-muted-foreground">—</span>}
            {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
          </TableCell>
        )
      case 'phone_number':
        return <TableCell key={c.key} className="whitespace-nowrap tabular-nums">{r.phone_number}</TableCell>
      case 'stages':
        return (
          <TableCell key={c.key}>
            {r.stages.length === 0 ? <span className="text-muted-foreground">—</span> : (
              <div className="flex flex-wrap gap-1">
                {r.stages.map((s) => (
                  <span key={s.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${s.color}22`, color: s.color }}>{s.name}</span>
                ))}
              </div>
            )}
          </TableCell>
        )
      case 'opt_in_status': {
        const o = OPTIN_FR[r.opt_in_status] || OPTIN_FR.none
        return (
          <TableCell key={c.key}>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>
          </TableCell>
        )
      }
      case 'messages_total': return <TableCell key={c.key} className="text-right tabular-nums">{r.messages_total}</TableCell>
      case 'messages_out': return <TableCell key={c.key} className="text-right tabular-nums">{r.messages_out}</TableCell>
      case 'messages_ai': return <TableCell key={c.key} className="text-right tabular-nums text-muted-foreground">{r.messages_ai}</TableCell>
      case 'messages_read': return <TableCell key={c.key} className="text-right tabular-nums">{r.messages_read}</TableCell>
      case 'orders_count': return <TableCell key={c.key} className="text-right tabular-nums">{r.orders_count || '—'}</TableCell>
      case 'revenue_total':
        return <TableCell key={c.key} className="text-right tabular-nums font-medium">{r.revenue_total ? fmtMoney(r.revenue_total, r.currency) : '—'}</TableCell>
      case 'last_order_at':
        return <TableCell key={c.key} className="text-right whitespace-nowrap text-muted-foreground">{fmtDate(r.last_order_at)}</TableCell>
      case 'last_activity_at':
        return <TableCell key={c.key} className="text-right whitespace-nowrap text-muted-foreground">{fmtDate(r.last_activity_at)}</TableCell>
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[180px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, numéro, email, étape…)"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {sessions.length > 1 && (
          <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <option value="all">Toutes les connexions</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.instance_name}</option>)}
          </select>
        )}

        {/* Filtres riches */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Filter className="mr-1.5 h-4 w-4" />
              Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Opt-in</DropdownMenuLabel>
            {(['all', 'subscribed', 'opted_out', 'none'] as OptinFilter[]).map((v) => (
              <DropdownMenuCheckboxItem key={v} checked={optinFilter === v} onCheckedChange={() => setOptinFilter(v)}>
                {v === 'all' ? 'Tous' : OPTIN_FR[v]?.label || v}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Commandes</DropdownMenuLabel>
            {([['all', 'Toutes'], ['with', 'Avec commande'], ['without', 'Sans commande']] as [OrdersFilter, string][]).map(([v, label]) => (
              <DropdownMenuCheckboxItem key={v} checked={ordersFilter === v} onCheckedChange={() => setOrdersFilter(v)}>
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            {allStages.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Étape du lead</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={stageFilter === 'all'} onCheckedChange={() => setStageFilter('all')}>Toutes</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={stageFilter === 'none'} onCheckedChange={() => setStageFilter('none')}>Sans étape</DropdownMenuCheckboxItem>
                {allStages.map((s) => (
                  <DropdownMenuCheckboxItem key={s.id} checked={stageFilter === s.id} onCheckedChange={() => setStageFilter(s.id)}>{s.name}</DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={resetFilters} className="text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" /> Réinitialiser
          </Button>
        )}

        {/* Sélecteur de colonnes */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Columns3 className="mr-1.5 h-4 w-4" /> Colonnes
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={visible[c.key]}
                onCheckedChange={(v) => setVisible((prev) => ({ ...prev, [c.key]: !!v }))}
                // Empêche de tout masquer : garde au moins 1 colonne.
                disabled={visible[c.key] && visibleCols.length === 1}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {loading ? '…' : `${sorted.length}${sorted.length !== rows.length ? `/${rows.length}` : ''} contact${rows.length > 1 ? 's' : ''}`}
          </span>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} title="Récupère l'historique des commandes Shopify">
            {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Sync. commandes
          </Button>
          <Button size="sm" onClick={handleExport} disabled={loading || sorted.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Exporter CSV
          </Button>
        </div>
      </div>

      {/* Tableau */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…</div>
        ) : sorted.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">Aucun contact à afficher.</div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {visibleCols.map((c) => (
                  <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                    {c.sortable ? (
                      <button
                        onClick={() => toggleSort(c.key as SortKey)}
                        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {c.label}
                        {sortKey === c.key
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.contact_id}>
                  {visibleCols.map((c) => renderCell(c, r))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
