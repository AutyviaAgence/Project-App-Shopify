'use client'

import React, { useEffect, useState, useCallback, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2, Trash2, Workflow, GitBranch, ChevronLeft, ChevronRight, Folder, FolderPlus, GripVertical, Sparkles, Megaphone, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import type { WhatsAppTemplate } from '@/types/database'
import { WorkflowBuilder } from '@/components/automations/builder/workflow-builder'
import { WorkflowWizard } from '@/components/automations/workflow-wizard'
import { WorkflowChat } from '@/components/automations/workflow-chat'
import { PerformancePanel } from '@/components/automations/performance-panel'
import { defaultGraph, validateGraph, triggerNode, type WorkflowGraph } from '@/lib/automations/graph-types'
import { isBuildableTemplate, isSendableTemplate } from '@/lib/templates/status'
import { kindForTrigger, type TriggerEvent } from '@/lib/automations/types'

type AutomationKind = 'transactional' | 'marketing'

type Automation = {
  id: string
  name: string
  trigger_event: string
  template_id: string | null
  delay_minutes: number
  is_active: boolean
  graph?: WorkflowGraph | null
  builder_mode?: boolean
  folder_id?: string | null
  kind?: AutomationKind
}

type Folder = { id: string; name: string; color: string | null; position: number }

function AutomationsPageInner() {
  // Onglet actif, piloté par la sidebar via ?tab= (marketing | transactional).
  const searchParams = useSearchParams()
  const urlTab: AutomationKind = searchParams.get('tab') === 'marketing' ? 'marketing' : 'transactional'
  // ?id= : automatisation à ouvrir directement (lien depuis un message envoyé,
  // dans les conversations). Prime sur ?tab= — on déduit l'onglet de l'automatisation.
  const urlId = searchParams.get('id')
  const [tab, setTab] = useState<AutomationKind>(urlTab)
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [storeName] = useState('Votre boutique')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  // Assistant IA conversationnel (funnel complet) — 3e voie de création.
  const [showChat, setShowChat] = useState(false)
  // Écran de choix « Guidé (wizard) ou Manuel (builder) » avant la création.
  const [showChoose, setShowChoose] = useState(false)
  // Saisie inline du nom de dossier (au lieu d'un window.prompt).
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  // Dossier en cours de renommage (id), au clic sur son nom.
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  // Dossier survolé pendant un drag (surbrillance) + workflow en cours de drag.
  const [dragOverFolder, setDragOverFolder] = useState<string | null | 'none'>(null)

  // Automatisation actuellement ouverte dans le builder (au centre).
  const [current, setCurrent] = useState<Automation | null>(null)
  const [graph, setGraph] = useState<WorkflowGraph | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  // Panneau « Performance » ouvert (slide-over droit) pour l'automatisation courante.
  const [showPerf, setShowPerf] = useState(false)

  const load = useCallback(async () => {
    try {
      const [aRes, tRes, fRes] = await Promise.all([
        fetch('/api/automations').then((r) => r.json()),
        fetch('/api/templates').then((r) => r.json()),
        fetch('/api/automation-folders').then((r) => r.json()),
      ])
      const autos: Automation[] = aRes.data || []
      setAutomations(autos)
      setTemplates((tRes.data || []).filter(isBuildableTemplate))
      setFolders(fRes.data || [])
      // Ouvre la 1re automatisation de l'onglet courant (ou rien).
      setCurrent((c) => c || autos.find((a) => (a.kind === 'marketing' ? 'marketing' : 'transactional') === tab) || null)
    } finally {
      setLoading(false)
    }
    // `tab` lu au montage seulement (ouverture initiale) ; le suivi d'URL gère
    // le reste. On ne recharge pas la liste à chaque changement d'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Créer un dossier depuis la saisie inline (nom déjà tapé dans la sidebar).
  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); return }
    const res = await fetch('/api/automation-folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json()
    if (res.ok && json.data) { setFolders((prev) => [...prev, json.data]); setNewFolderName(''); setCreatingFolder(false) }
    else toast.error(json.error || 'Erreur')
  }

  /**
   * Renomme un dossier. Optimiste : le nom change tout de suite à l'écran, et on
   * revient en arrière si le serveur refuse — un aller-retour réseau pour une
   * frappe donnerait une impression de latence sur une action triviale.
   */
  async function renameFolder(f: Folder, raw: string) {
    setRenamingFolder(null)
    const name = raw.trim()
    // Vide ou inchangé : rien à faire. Un nom vide n'est pas une intention, c'est
    // un champ qu'on a effacé sans valider — on garde l'ancien.
    if (!name || name === f.name) return

    setFolders((prev) => prev.map((x) => x.id === f.id ? { ...x, name } : x))
    const res = await fetch(`/api/automation-folders/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      setFolders((prev) => prev.map((x) => x.id === f.id ? { ...x, name: f.name } : x))
      toast.error('Renommage échoué')
    }
  }

  async function deleteFolder(f: Folder) {
    if (!window.confirm(`Supprimer le dossier « ${f.name} » ? Les workflows dedans repasseront en « Non classés ».`)) return
    const res = await fetch(`/api/automation-folders/${f.id}`, { method: 'DELETE' })
    if (res.ok) {
      setFolders((prev) => prev.filter((x) => x.id !== f.id))
      setAutomations((prev) => prev.map((a) => a.folder_id === f.id ? { ...a, folder_id: null } : a))
    } else toast.error('Erreur')
  }

  // Déplacer un workflow vers un dossier (null = non classés). Optimiste.
  async function moveToFolder(autoId: string, folderId: string | null) {
    setAutomations((prev) => prev.map((a) => a.id === autoId ? { ...a, folder_id: folderId } : a))
    const res = await fetch(`/api/automations/${autoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    })
    if (!res.ok) { toast.error('Déplacement échoué'); load() }
  }

  useEffect(() => { load() }, [load])

  // Re-synchronise les modèles au retour sur l'onglet : un modèle édité dans la
  // page Modèles (statut, boutons) est reflété dans le builder sans recharger.
  // On ne rafraîchit QUE `templates` (pas le graphe en cours d'édition).
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const tRes = await fetch('/api/templates').then((r) => r.json())
        setTemplates((tRes.data || []).filter(isBuildableTemplate))
      } catch { /* silencieux */ }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Kind effectif d'une automatisation (les anciennes lignes sans kind, ou les
  // brouillons non encore sauvés, sont transactionnelles par défaut).
  /**
   * Onglet d'une automatisation.
   *
   * ⚠️ LE DÉCLENCHEUR FAIT FOI, PAS LA COLONNE `kind`.
   *
   * `kind` est posé À LA CRÉATION avec l'onglet courant (`kind: tab`) : créer une
   * relance de panier depuis l'onglet Transactionnel l'y enfermait pour toujours,
   * alors que c'est une campagne. Le déclencheur, lui, dit toujours la vérité —
   * et c'est déjà ce que fait l'onboarding (`kindForTrigger`).
   *
   * On ne se fie donc à `kind` que si le déclencheur est ambigu (inconnu, ou
   * automatisation encore sans trigger).
   */
  const kindOf = (a: Automation): AutomationKind => {
    const byTrigger = a.trigger_event
      ? kindForTrigger(a.trigger_event as TriggerEvent)
      : null
    if (byTrigger) return byTrigger
    return a.kind === 'marketing' ? 'marketing' : 'transactional'
  }
  // Liste filtrée par l'onglet actif : c'est elle qui alimente la sidebar,
  // les dossiers, « tout activer », etc.
  const visibleAutomations = automations.filter((a) => kindOf(a) === tab)
  // Vocabulaire selon l'onglet (campagne vs workflow) — un seul endroit.
  const NOUN = tab === 'marketing'
    ? { plural: 'Campagnes', newOne: 'Nouvelle campagne' }
    : { plural: 'Workflows', newOne: 'Nouveau workflow' }

  // Suivre l'onglet piloté par la sidebar (?tab=) : bascule le state, referme
  // le builder, et lâche l'automatisation courante si elle n'est pas du bon kind.
  //
  // ⚠️ Sauf si l'URL cible une automatisation précise (?id=, depuis une bulle de
  // conversation) : cet effet remettrait `current` à null et on retomberait sur
  // la liste, alors que le marchand a cliqué pour voir CETTE automatisation.
  useEffect(() => {
    if (urlId) return
    setTab(urlTab)
    setShowChoose(false); setShowWizard(false)
    setCurrent((c) => (c && kindOf(c) === urlTab) ? c : null)
  }, [urlTab, urlId])

  // Ouvrir l'automatisation ciblée par ?id= (lien « voir l'automatisation »
  // depuis un message envoyé). On bascule aussi sur SON onglet : sans ça elle
  // serait chargée mais invisible dans la liste, ce qui donne l'impression d'un
  // lien cassé. On attend que la liste soit chargée pour la retrouver.
  useEffect(() => {
    if (!urlId || automations.length === 0) return
    const target = automations.find((a) => a.id === urlId)
    if (!target) return
    setTab(kindOf(target))
    setCurrent(target)
    setShowChoose(false); setShowWizard(false)
  }, [urlId, automations])

  // Quand l'automatisation courante change, (re)charge son graphe + nom.
  useEffect(() => {
    if (!current) { setGraph(null); setNameDraft(''); return }
    setGraph(current.graph || defaultGraph((current.trigger_event as never) || 'order_fulfilled', current.template_id))
    setNameDraft(current.name || '')
  }, [current])

  function openNew() {
    // On demande d'abord : création guidée (wizard) ou manuelle (builder) ?
    setShowChoose(true); setShowWizard(false); setCurrent(null)
  }
  /** Assistant IA conversationnel : construit un funnel complet (plusieurs
   *  messages, délais, conditions, A/B) à partir de quelques questions. Voie
   *  unique de création assistée — l'ancien wizard « guidé » (formulaire figé,
   *  1 message) a été retiré de l'écran de choix. */
  function startChat() { setShowChoose(false); setShowWizard(false); setShowChat(true); setCurrent(null) }
  function startManual() {
    setShowChoose(false); setShowWizard(false); setShowChat(false)
    // Trigger de départ selon l'onglet : marketing → campagne planifiée.
    const trig = tab === 'marketing' ? 'scheduled_date' : 'order_fulfilled'
    setCurrent({ id: '', name: '', trigger_event: trig, template_id: null, delay_minutes: 0, is_active: true, kind: tab })
  }
  function selectAuto(a: Automation) { setShowChoose(false); setShowWizard(false); setShowChat(false); setCurrent(a) }

  // Le wizard a fini : on crée l'automatisation AVEC son graphe, puis on l'ouvre
  // dans le builder pour affiner.
  async function onWizardComplete(data: { name: string; graph: WorkflowGraph; trigger: string }) {
    setBusyId('save')
    try {
      const res = await fetch('/api/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // ⚠️ CRÉÉE DÉSACTIVÉE (is_active: false).
        //
        // Un parcours généré par l'IA partait ACTIF : dès « Créer », il envoyait
        // à de vrais clients, sans que le marchand ait relu quoi que ce soit. Or
        // l'IA se trompe — ordre des messages discutable, délais à ajuster,
        // modèle manquant. Le coût d'un mauvais envoi n'est pas rattrapable : le
        // message est parti, et la réputation du numéro trinque.
        //
        // Il relit, corrige, puis active lui-même. Un clic de plus contre des
        // messages irrattrapables : le choix est vite fait.
        //
        // Le kind vient du DÉCLENCHEUR, pas de l'onglet courant : créer une
        // relance de panier depuis Transactionnel l'y enfermait, alors que c'est
        // une campagne. C'est déjà ce que fait l'onboarding.
        body: JSON.stringify({ name: data.name, trigger_event: data.trigger, graph: data.graph, builder_mode: true, is_active: false, kind: kindForTrigger(data.trigger as TriggerEvent) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      track('automation_created', { trigger: data.trigger, via: 'wizard', kind: kindForTrigger(data.trigger as TriggerEvent) })
      await load()
      // Sortir de TOUS les écrans de création (wizard OU assistant IA) et ouvrir
      // l'automatisation dans le builder — sinon on restait bloqué sur le chat.
      setShowWizard(false)
      setShowChat(false)
      setShowChoose(false)
      if (json.data) setCurrent(json.data as Automation)
      // On DIT qu'elle est inactive : un parcours créé et silencieusement
      // endormi serait pire que le problème qu'on corrige — le marchand
      // croirait qu'il tourne, et se demanderait pourquoi rien ne part.
      toast.success('Créée et mise en pause — relisez-la, puis activez-la avec le bouton en haut.', { duration: 7000 })
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setBusyId(null) }
  }

  // Modèles NON approuvés (en revue / refusés) utilisés par un graphe : on
  // interdit l'activation tant qu'ils ne sont pas validés par Meta (sinon les
  // envois échoueraient). Renvoie les noms fautifs (vide = tout est bon).
  /**
   * Modèles du parcours que Meta n'accepterait pas à l'envoi.
   *
   * On construit AVEC des brouillons (attendre 24 h d'approbation avant même de
   * dessiner son parcours serait absurde), mais on ne peut pas activer : le
   * dispatch ne prend que l'approuvé, et l'automatisation ne partirait jamais —
   * silencieusement.
   */
  function unapprovedTemplatesOf(a: Automation): { name: string; status: string }[] {
    const g = (a.id === current?.id ? graph : (a as { graph?: WorkflowGraph }).graph) || null
    if (!g) return []
    const ids = new Set(
      g.nodes.filter((n) => n.type === 'action' && n.templateId).map((n) => (n as { templateId: string }).templateId)
    )
    const bad: { name: string; status: string }[] = []
    ids.forEach((id) => {
      const t = templates.find((x) => x.id === id)
      // Modèle introuvable = probablement supprimé/non chargé → on ne bloque pas
      // là-dessus (l'API le rejettera). On ne bloque que sur un statut connu.
      if (t && !isSendableTemplate(t)) bad.push({ name: t.name, status: t.status })
    })
    return bad
  }

  async function toggleActive(a: Automation) {
    // Garde : activer un workflow qui envoie un modèle non approuvé échouerait.
    if (!a.is_active) {
      const bad = unapprovedTemplatesOf(a)
      if (bad.length > 0) {
        // Le motif exact compte : un brouillon n'a jamais été soumis (il faut
        // agir), un « en revue » s'approuvera tout seul (il faut attendre).
        // Dire « en attente d'approbation » pour un brouillon ferait attendre
        // le marchand pour rien.
        const drafts = bad.filter((b) => b.status === 'draft').map((b) => b.name)
        const others = bad.filter((b) => b.status !== 'draft').map((b) => b.name)
        if (drafts.length > 0) {
          toast.error(
            `Impossible d’activer : ${drafts.join(', ')} ${drafts.length > 1 ? 'sont des brouillons' : 'est un brouillon'} non soumis à Meta. Soumettez-le${drafts.length > 1 ? 's' : ''} depuis Modèles.`,
            { duration: 7000 }
          )
        } else {
          toast.error(`Impossible d’activer : ${others.join(', ')} ${others.length > 1 ? 'sont' : 'est'} en attente d’approbation Meta.`)
        }
        return
      }
    }
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !a.is_active }),
      })
      if (!res.ok) throw new Error()
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x))
      if (current?.id === a.id) setCurrent({ ...a, is_active: !a.is_active })
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  // Active (ou désactive) TOUS les workflows d'un coup. Si au moins un est
  // inactif → on active tout ; sinon on désactive tout. Optimiste, en parallèle.
  async function toggleAll() {
    // N'agit que sur l'onglet actif (les campagnes et le transactionnel se
    // gèrent séparément).
    const scope = visibleAutomations
    if (scope.length === 0) return
    const target = scope.some((a) => !a.is_active) // true = on active tout
    const scopeIds = new Set(scope.map((a) => a.id))
    setBusyId('bulk')
    setAutomations((prev) => prev.map((a) => scopeIds.has(a.id) ? { ...a, is_active: target } : a))
    if (current && scopeIds.has(current.id)) setCurrent((c) => (c ? { ...c, is_active: target } : c))
    try {
      const results = await Promise.allSettled(
        scope.map((a) =>
          fetch(`/api/automations/${a.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: target }),
          }).then((r) => { if (!r.ok) throw new Error() })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) { toast.error(`${failed} workflow(s) non ${target ? 'activé' : 'désactivé'}(s)`); load() }
      else {
        if (target) track('automation_activated', { bulk: true, count: scope.length, kind: tab })
        toast.success(target ? 'Tous les workflows activés' : 'Tous les workflows désactivés')
      }
    } finally { setBusyId(null) }
  }

  async function remove(a: Automation) {
    if (!a.id) { setCurrent(automations[0] || null); return }
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const next = automations.filter((x) => x.id !== a.id)
      setAutomations(next)
      if (current?.id === a.id) setCurrent(next[0] || null)
      toast.success('Automatisation supprimée')
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  async function save() {
    if (!current || !graph) return
    if (!nameDraft.trim()) { toast.error('Donnez un nom à l’automatisation'); return }
    const errors = validateGraph(graph)
    if (errors.length) { toast.error(errors[0]); return }
    // Si le workflow est actif mais qu'un modèle utilisé n'est pas (ou plus)
    // approuvé — typiquement après ajout de boutons → « en revue » —, on le
    // désactive à l'enregistrement pour éviter des envois voués à l'échec.
    let keepActive = current.is_active
    if (keepActive) {
      const bad = unapprovedTemplatesOf({ ...current, graph } as Automation)
      if (bad.length > 0) {
        keepActive = false
        toast.warning(`Workflow désactivé : ${bad.join(', ')} en attente d'approbation Meta. Réactivez-le une fois approuvé.`)
      }
    }
    setBusyId('save')
    try {
      const isNew = !current.id
      const trig = triggerNode(graph)
      const res = await fetch(isNew ? '/api/automations' : `/api/automations/${current.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameDraft.trim(),
          trigger_event: trig?.event || current.trigger_event,
          graph, builder_mode: true, is_active: keepActive,
          // ⚠️ Le kind SUIT le déclencheur, à la création comme à la mise à jour.
          //
          // Il était figé sur l'onglet courant à la création : une relance de
          // panier créée depuis Transactionnel y restait pour toujours, alors que
          // c'est une campagne. Et changer le déclencheur d'une automatisation
          // existante ne la déplaçait jamais dans le bon onglet.
          ...(() => {
            const ev = (trig?.event || current.trigger_event) as TriggerEvent | undefined
            return ev ? { kind: kindForTrigger(ev) } : {}
          })(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await load()
      if (json.data?.id) setCurrent(json.data as Automation)
      if (isNew) track('automation_created', { trigger: trig?.event || undefined })
      if (current.is_active) track('automation_activated', { id: json.data?.id })
      toast.success('Workflow enregistré')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setBusyId(null) }
  }

  if (loading) return <BlobLoaderScreen />

  return (
    // `pb-16` en mobile : la barre d'onglets fixe du bas recouvrait sinon le bas
    // du canvas (elle apparaissait comme un bandeau noir sous le workflow).
    <div className="flex h-full flex-col pb-16 md:pb-0">
      {/* En-tête. Mobile : titre puis actions dessous, sur une seule ligne, le
          bouton « Enregistrer » sortait de l'écran. */}
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="min-w-0">
          {/* Le choix Campagnes/Automatisations se fait dans la SIDEBAR
              (sous-menu). Ici on rappelle juste l'onglet courant. */}
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {tab === 'marketing' ? <Megaphone className="h-5 w-5 shrink-0" /> : <Workflow className="h-5 w-5 shrink-0" />}
            {tab === 'marketing' ? 'Campagnes' : 'Transactionnel'}
          </h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {tab === 'marketing'
              ? 'Campagnes marketing : parcours à boutons, promotions, A/B test.'
              : 'Automatisations transactionnelles : événement → délai → condition → message.'}
          </p>
        </div>
        {current && (
          <div className="flex items-center gap-2 sm:shrink-0">
            {current.id && (
              <button
                onClick={() => toggleActive(current)} disabled={busyId === current.id}
                title={current.is_active ? 'Cliquez pour désactiver' : 'Cliquez pour activer'}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-all sm:flex-none',
                  current.is_active
                    ? 'border-green-500 bg-green-500 text-white hover:bg-green-600'
                    : 'border-border bg-muted text-muted-foreground hover:bg-muted/70'
                )}
              >
                {/* Interrupteur visuel (on/off) */}
                <span className={cn('relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
                  current.is_active ? 'bg-white/30' : 'bg-foreground/20')}>
                  <span className={cn('inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform',
                    current.is_active ? 'translate-x-3.5' : 'translate-x-0.5')} />
                </span>
                {current.is_active ? 'Activé' : 'Désactivé'}
              </button>
            )}
            {current.id && (
              <button
                onClick={() => setShowPerf(true)}
                title="Voir les performances"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted sm:flex-none"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Performance</span>
              </button>
            )}
            <Button className="flex-1 sm:flex-none" onClick={save} disabled={busyId === 'save'}>
              {busyId === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        )}
      </div>

      {/* Sélecteur mobile : la sidebar est `hidden md:flex`, donc sans lui on ne
          pouvait ni changer ni créer de workflow sur un petit écran. */}
      {visibleAutomations.length > 0 && (
        <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
          <select
            value={current?.id || ''}
            onChange={(e) => {
              const a = visibleAutomations.find((x) => x.id === e.target.value)
              if (a) selectAuto(a)
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
          >
            {!current?.id && <option value="">{NOUN.newOne}…</option>}
            {visibleAutomations.map((a) => (
              <option key={a.id} value={a.id}>{a.is_active ? '● ' : '○ '}{a.name || 'Sans nom'}</option>
            ))}
          </select>
          <button onClick={openNew} title={NOUN.newOne}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 3 colonnes : sidebar | timeline | iPhone, tout sur la même page */}
      <div className={cn('grid min-h-0 flex-1 grid-cols-1', sidebarCollapsed ? 'md:grid-cols-[52px_1fr]' : 'md:grid-cols-[280px_1fr]')}>
        {/* Sidebar repliée : juste + et flèche pour rouvrir */}
        {sidebarCollapsed ? (
          <aside className="hidden flex-col items-center gap-2 border-r bg-muted/20 p-2 md:flex">
            <button onClick={() => setSidebarCollapsed(false)} title={`Afficher les ${NOUN.plural.toLowerCase()}`}
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-primary">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={openNew} title={NOUN.newOne}
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4" />
            </button>
          </aside>
        ) : (
        <aside className="hidden flex-col overflow-y-auto border-r bg-muted/20 p-2 md:flex">
          {/* En-tête sidebar : titre + flèche replier + bouton + */}
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NOUN.plural}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { setCreatingFolder(true); setNewFolderName('') }} title="Nouveau dossier"
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <FolderPlus className="h-4 w-4" />
              </button>
              {/* Ancre de l'assistant d'aide : « comment créer une automatisation ? »
                  amène ici et surligne ce bouton. */}
              <button data-tour="automation-new-btn" onClick={openNew} title={NOUN.newOne}
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => setSidebarCollapsed(true)} title="Réduire"
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-primary">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
          <button
            onClick={openNew}
            className={cn('mb-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors hover:bg-muted',
              current && !current.id ? 'border-primary text-primary' : 'text-muted-foreground')}
          >
            <Plus className="h-4 w-4" /> {NOUN.newOne}
          </button>
          {/* Bascule groupée : active tout si au moins un est OFF, sinon désactive tout. */}
          {visibleAutomations.length > 1 && (() => {
            const willActivate = visibleAutomations.some((a) => !a.is_active)
            return (
              <button
                onClick={toggleAll}
                disabled={busyId === 'bulk'}
                title={willActivate ? 'Activer tous les workflows' : 'Désactiver tous les workflows'}
                className={cn('mb-2 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                  willActivate
                    ? 'border-green-500/40 bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400'
                    : 'border-border bg-muted text-muted-foreground hover:bg-muted/70')}
              >
                {busyId === 'bulk'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <span className={cn('relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors', willActivate ? 'bg-foreground/20' : 'bg-green-500/60')}>
                      <span className={cn('inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform', willActivate ? 'translate-x-0.5' : 'translate-x-3')} />
                    </span>}
                {willActivate ? 'Tout activer' : 'Tout désactiver'}
              </button>
            )
          })()}
          {/* Saisie inline d'un nouveau dossier (remplace window.prompt). */}
          {creatingFolder && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1.5">
              <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
                onBlur={createFolder}
                placeholder="Nom du dossier…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          )}
          {/* Entrée fantôme : brouillon en cours de création (pas encore sauvegardé).
              Donne un retour visuel immédiat au clic sur « + Nouveau workflow ». */}
          {current && !current.id && (
            <div className="mb-1 flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm text-primary">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary/40" />
              <span className="flex-1 truncate italic">{nameDraft.trim() || NOUN.newOne}</span>
              <span className="text-[10px] uppercase tracking-wide text-primary/60">brouillon</span>
            </div>
          )}
          {/* Ligne de workflow (draggable → glisser dans un dossier). */}
          {(() => {
            const renderRow = (a: Automation) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => selectAuto(a)}
                className={cn('group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  current?.id === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/30 group-hover:text-muted-foreground/60" />
                <span className={cn('h-2 w-2 shrink-0 rounded-full', a.is_active ? 'bg-green-500' : 'bg-muted-foreground/40')} />
                <span className="flex-1 truncate">{a.name || 'Sans nom'}</span>
                <button onClick={(e) => { e.stopPropagation(); remove(a) }} title="Supprimer"
                  className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )

            // Zone de dépôt (dossier ou « non classés »).
            const dropProps = (folderId: string | null) => ({
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverFolder(folderId ?? 'none') },
              onDragLeave: () => setDragOverFolder((cur) => cur === (folderId ?? 'none') ? null : cur),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                setDragOverFolder(null)
                if (id) moveToFolder(id, folderId)
              },
            })

            const unfiled = visibleAutomations.filter((a) => !a.folder_id)

            return (
              <>
                {/* Dossiers */}
                {folders.map((f) => {
                  const items = visibleAutomations.filter((a) => a.folder_id === f.id)
                  const hot = dragOverFolder === f.id
                  return (
                    <div key={f.id} {...dropProps(f.id)}
                      className={cn('mb-1 rounded-lg border border-transparent', hot && 'border-primary/50 bg-primary/5')}>
                      <div className="group flex items-center gap-1.5 px-2 py-1.5">
                        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: f.color || undefined }} />
                        {/* Renommage au clic : le nom d'un dossier se corrige
                            souvent (faute de frappe, campagne renommée). Passer
                            par une suppression + recréation ferait perdre le
                            classement des workflows qu'il contient. */}
                        {renamingFolder === f.id ? (
                          <Input
                            autoFocus
                            defaultValue={f.name}
                            onBlur={(e) => renameFolder(f, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameFolder(f, e.currentTarget.value)
                              // Échap = annuler : on ne veut pas qu'une frappe
                              // malheureuse renomme le dossier sans retour possible.
                              if (e.key === 'Escape') setRenamingFolder(null)
                            }}
                            className="h-6 flex-1 px-1.5 text-xs font-semibold uppercase tracking-wide"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRenamingFolder(f.id)}
                            title="Renommer le dossier"
                            className="flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {f.name}
                          </button>
                        )}
                        <span className="text-[10px] text-muted-foreground/50">{items.length}</span>
                        <button onClick={() => deleteFolder(f)} title="Supprimer le dossier"
                          className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-colors hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="pl-2">
                        {items.map(renderRow)}
                        {items.length === 0 && (
                          <p className="px-3 py-2 text-[11px] italic text-muted-foreground/50">Glissez un workflow ici</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Non classés */}
                <div {...dropProps(null)}
                  className={cn('rounded-lg border border-transparent', dragOverFolder === 'none' && 'border-primary/50 bg-primary/5')}>
                  {folders.length > 0 && unfiled.length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Non classés</div>
                  )}
                  {unfiled.map(renderRow)}
                </div>

                {visibleAutomations.length === 0 && !(current && !current.id) && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {tab === 'marketing' ? 'Aucune campagne. Créez la première.' : 'Aucun workflow. Créez le premier.'}
                  </p>
                )}
              </>
            )
          })()}
        </aside>
        )}

        {/* Zone centrale : choix création → wizard/builder, sinon builder, sinon vide. */}
        {showChoose ? (
          <div className="flex min-h-0 flex-col p-6">
            <div className="mb-6 flex items-center gap-2">
              <button onClick={() => { setShowChoose(false); setCurrent(visibleAutomations[0] || null) }} className="text-xs text-muted-foreground hover:text-foreground">← Retour</button>
              <span className="text-sm font-semibold">{tab === 'marketing' ? 'Nouvelle campagne' : 'Nouvelle automatisation'}</span>
            </div>
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
              <h2 className="mb-1 text-xl font-semibold">Comment voulez-vous la créer ?</h2>
              <p className="mb-6 text-sm text-muted-foreground">Choisissez votre méthode de création.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* ASSISTANT IA : construit un vrai funnel (plusieurs messages,
                    délais, conditions, A/B) en discutant, façon assistant des
                    Modèles. Voie principale — l'ancienne « création guidée »
                    (formulaire figé, 1 message) a été retirée : elle faisait
                    doublon et produisait des parcours trop pauvres. */}
                <button onClick={startChat}
                  className="group flex flex-col rounded-2xl border p-6 text-left transition-all hover:border-primary hover:bg-primary/5 hover:shadow-lg">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-6 w-6 text-primary" /></div>
                  <p className="text-base font-semibold">Assistant IA</p>
                  <p className="mt-1 text-sm text-muted-foreground">Discutez avec l’IA : elle construit un parcours complet (plusieurs messages, délais, conditions, test A/B).</p>
                  <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Recommandé</span>
                </button>
                <button onClick={startManual}
                  className="group flex flex-col rounded-2xl border p-6 text-left transition-all hover:border-primary hover:bg-primary/5 hover:shadow-lg">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted"><GitBranch className="h-6 w-6 text-violet-600" /></div>
                  <p className="text-base font-semibold">Création manuelle</p>
                  <p className="mt-1 text-sm text-muted-foreground">Construisez le parcours vous-même, bloc par bloc, dans l’éditeur visuel.</p>
                  <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Avancé</span>
                </button>
              </div>
            </div>
          </div>
        ) : showChat ? (
          <div className="min-h-0 overflow-hidden">
            <WorkflowChat
              kind={tab}
              onComplete={onWizardComplete}
              onCancel={() => { setShowChat(false); setShowChoose(true) }}
            />
          </div>
        ) : showWizard ? (
          <div className="min-h-0 overflow-y-auto">
            <WorkflowWizard
              templates={templates}
              onComplete={onWizardComplete}
              onCancel={() => { setShowWizard(false); setShowChoose(true) }}
              kind={tab}
            />
          </div>
        ) : current && graph ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <GitBranch className="h-4 w-4 text-violet-600" />
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Nom du workflow" className="h-8 max-w-xs border-0 bg-transparent px-0 text-sm font-medium focus-visible:ring-0" />
            </div>
            <div className="min-h-0 flex-1 p-4">
              <WorkflowBuilder graph={graph} templates={templates} storeName={storeName} onChange={setGraph} automationId={current?.id ?? null} kind={current ? kindOf(current) : tab} onTemplatesChanged={load} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <Workflow className="h-10 w-10 opacity-40" />
            <p className="text-sm">Sélectionnez un workflow ou créez-en un.</p>
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nouveau workflow</Button>
          </div>
        )}
      </div>

      {/* Panneau Performance (slide-over) */}
      <AnimatePresence>
        {showPerf && current?.id && (
          <PerformancePanel automationId={current.id} name={current.name} onClose={() => setShowPerf(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// `useSearchParams` (onglet piloté par la sidebar) exige un Suspense en Next 16.
export default function AutomationsPage() {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <AutomationsPageInner />
    </Suspense>
  )
}
