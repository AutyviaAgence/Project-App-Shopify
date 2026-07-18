'use client'

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  BarChart3,
  LogOut,
  Settings,
  ScrollText,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CreditCard,
  Workflow,
  ShieldCheck,
  Store,
  Lock,
  Megaphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardTopBar } from '@/components/dashboard-topbar'
import { identifyMerchant, resetAnalytics } from '@/lib/posthog/events'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BlobLoaderScreen } from '@/components/blob-loader'
import dynamic from 'next/dynamic'

const TourProvider = dynamic(() => import('@/components/guided-tour').then(m => ({ default: m.TourProvider })), {
  ssr: false,
})

// ── KEEP-ALIVE : pages principales gardées MONTÉES entre les navigations ──────
//
// On importe leur composant dynamiquement (le bundle ne charge qu'à la 1re
// visite, comme le routing normal), et le KeepAliveOutlet les garde vivantes.
// Voir keep-alive-outlet pour le pourquoi. Les pages NON listées (Admin, Logs,
// Réglages…) restent sur le routing normal (via `children`) et se remontent.
import { KeepAliveOutlet, isKeepAlivePath, type KeepAlivePage } from '@/components/keep-alive-outlet'
const KEEP_ALIVE_PAGES: KeepAlivePage[] = [
  { path: '/dashboard', Component: dynamic(() => import('./dashboard/page'), { ssr: false }) },
  { path: '/conversations', Component: dynamic(() => import('./conversations/page'), { ssr: false }) },
  { path: '/agents', Component: dynamic(() => import('./agents/page'), { ssr: false }) },
  { path: '/templates', Component: dynamic(() => import('./templates/page'), { ssr: false }) },
  { path: '/automations', Component: dynamic(() => import('./automations/page'), { ssr: false }) },
  { path: '/stats', Component: dynamic(() => import('./stats/page'), { ssr: false }) },
]
import { SubscriptionBanner } from '@/components/subscription-banner'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { useSubscription } from '@/hooks/use-subscription'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import { SupportBubble } from '@/components/support-bubble'

const NAV_ITEMS_KEYS = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/conversations', labelKey: 'nav.conversations', icon: MessageSquare },
  { href: '/agents', labelKey: 'nav.agents', icon: Bot },
  { href: '/templates', labelKey: 'nav.templates', icon: FileText },
  // Groupe accordéon : ouvre 2 sous-entrées dans la sidebar (pas des onglets
  // en haut de page). Le href du parent sert d'ancre de route active.
  {
    href: '/automations', labelKey: 'nav.automations', label: 'Automatisations', icon: Workflow,
    children: [
      { href: '/automations?tab=marketing', label: 'Campagnes', icon: Megaphone },
      // « Transactionnel » et non « Automatisations » : sinon le libellé se
      // répète avec l'entrée parente, c'est déroutant.
      { href: '/automations?tab=transactional', label: 'Transactionnel', icon: Workflow },
    ],
  },
  { href: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
]

// Le parrainage vit dans les PARAMÈTRES (section dédiée), pas dans la navigation :
// c'est un réglage de compte, pas un espace de travail quotidien.
// L'AIDE vit elle aussi dans les paramètres (même raison) : on la consulte
// ponctuellement, et la bulle d'assistance couvre déjà le besoin immédiat.
const BOTTOM_NAV_KEYS = [
  { href: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

// Pages accessibles même sans abonnement actif
const ALLOWED_WITHOUT_SUBSCRIPTION = ['/subscription', '/settings', '/admin', '/help']

// Pages BLOQUÉES tant qu'aucune boutique Shopify n'est connectée : toutes les
// données de l'app en découlent (conversations, agents, modèles, stats…).
// Le dashboard reste accessible : c'est là qu'on reconnecte la boutique.
const STORE_REQUIRED_PATHS = ['/conversations', '/agents', '/templates', '/automations', '/stats', '/campaigns', '/lifecycle']

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pinned, setPinned] = useState(true)   // sidebar épinglée ouverte par défaut (desktop)
  const [hovered, setHovered] = useState(false)  // survol → élargissement temporaire
  // Menus accordéon dépliés manuellement (par href). Cliquer sur un item à
  // sous-menu le DÉPLIE sans naviguer ; il reste ouvert jusqu'à re-clic.
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<{ full_name?: string | null; avatar_url?: string | null } | null>(null)
  // Sur desktop, la sidebar est « large » si épinglée ou survolée.
  const expanded = pinned || hovered
  const { subscription, loading: subscriptionLoading, refetch: refetchSubscription } = useSubscription()
  const { t } = useTranslation()
  const tenant = useTenant()

  const plan = subscription?.plan ?? null
  const isAdmin = subscription?.role === 'admin'

  const NAV_ITEMS = useMemo(() =>
    NAV_ITEMS_KEYS
      .map(item => ({ ...item, label: (item as { label?: string }).label || t(item.labelKey) })),
    [t]
  )
  const BOTTOM_NAV_ITEMS = useMemo(() => {
    const isAdminRole = subscription?.role === 'admin'
    // Logs reserve aux admins
    const items = BOTTOM_NAV_KEYS
      .filter(item => item.href !== '/logs' || isAdminRole)
      .map(item => ({ ...item, label: (item as { label?: string }).label || t(item.labelKey) }))
    if (isAdminRole) {
      items.unshift({ href: '/admin', labelKey: 'nav.admin', label: 'Admin', icon: ShieldCheck })
    }
    return items
  }, [t, subscription?.role])

  // Vérifier si la page actuelle est accessible sans abonnement
  const isAllowedPage = ALLOWED_WITHOUT_SUBSCRIPTION.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )

  // Nouveau modèle : accès direct (essai libre). Plus de redirection forcée
  // vers le configurateur/welcome-v2. Les limites (conversations/tokens IA)
  // sont gérées au cas par cas ; l'abonnement se gère depuis /subscription.
  // Blocage niveau 2 : a un plan PAYANT mais subscription inactive
  // (past_due/canceled). Le plan Gratuit garde l'accès (sans IA) → jamais bloqué.
  const isBlocked = !isAdmin && subscription && !!plan && plan !== 'free' && !subscription.isActive && !isAllowedPage

  // Feature gating : Lifecycle est désormais universel (remplace Tags). Seule
  // l'analyse IA dedans est gated par plan (géré dans la page elle-même).
  const isPlanBlocked = false

  // Close sidebar on route change (mobile) + escape key
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Rafraîchir l'abonnement au changement de page
  useEffect(() => {
    refetchSubscription()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Boutique Shopify active ? Sans elle, les pages de données sont bloquées.
  // FAIL-OPEN : champ absent (admin, failOpen) ou erreur réseau → on ne bloque pas.
  const [storeLinked, setStoreLinked] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/onboarding/state')
      .then((r) => r.json())
      .then((j) => { if (active) setStoreLinked(typeof j?.shopifyLinked === 'boolean' ? j.shopifyLinked : true) })
      .catch(() => { if (active) setStoreLinked(true) })
    return () => { active = false }
  }, [pathname])

  const isStoreGated =
    storeLinked === false &&
    STORE_REQUIRED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  // Profil (avatar du bas de sidebar) + identification PostHog du marchand.
  useEffect(() => {
    let active = true
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!active || !json?.data) return
        setProfile(json.data)
        if (json.data.id) {
          identifyMerchant(json.data.id, {
            email: json.data.email || undefined,
            name: json.data.full_name || undefined,
            plan: subscription?.plan || undefined,
          })
        }
      })
      .catch(() => {})
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // GRAND ONBOARDING BLOQUANT : tant que le marchand n'a pas terminé
  // l'onboarding (Shopify obligatoire → pack → abonnement), toutes les pages
  // du dashboard redirigent vers /onboarding (page plein écran hors layout).
  // Les admins et comptes existants (grandfathered) sont `completed`.
  useEffect(() => {
    let active = true
    fetch('/api/onboarding/state')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (active && json && json.completed === false) router.replace('/onboarding')
      })
      .catch(() => {})
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error(t('nav.signout_error'))
      return
    }
    resetAnalytics()  // dissocie la session PostHog au logout
    router.push('/login')
    router.refresh()
  }, [router, t])

  // Lien de nav. Mobile : pleine largeur + libellé. Desktop : carré 56px replié,
  // ou pleine largeur + libellé quand la sidebar est élargie (épinglée/survolée).
  // Quand la sidebar est épinglée (collée au panneau), l'onglet actif prend le
  // fond du panneau (--background) et se raccorde via des coins inversés.
  const NavLink = ({ item }: { item: typeof NAV_ITEMS[0] }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    // Verrouillé tant qu'aucune boutique n'est connectée (le clic reste
    // possible : la page affiche l'écran « Reconnecter ma boutique »).
    const locked = storeLinked === false && STORE_REQUIRED_PATHS.includes(item.href)
    // Sous-entrées (accordéon) : déployées quand la route parente est active
    // ET la sidebar élargie. `tab` courant lu dans l'URL pour surligner.
    const children = (item as { children?: { href: string; label: string; icon: typeof item.icon }[] }).children
    const currentTab = searchParams.get('tab')
    // Un menu à sous-entrées est déplié s'il a été ouvert manuellement OU si sa
    // route est active (on arrive dessus par lien direct → sous-menu visible).
    const menuOpen = !!children && (openMenus.has(item.href) || isActive)
    const toggleMenu = () => setOpenMenus((prev) => {
      const next = new Set(prev)
      if (next.has(item.href)) next.delete(item.href)
      else next.add(item.href)
      return next
    })

    // Contenu commun (icône + libellé), qu'on soit un Link ou un bouton toggle.
    const inner = (
      <>
        <item.icon className="h-[22px] w-[22px] shrink-0" />
        <span className={cn(expanded ? 'md:inline' : 'md:hidden')}>{item.label}</span>
        {locked && <Lock className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-white/40', expanded ? 'md:inline' : 'md:hidden')} />}
        {children && !locked && (
          <ChevronDown className={cn(
            'ml-auto h-4 w-4 shrink-0 text-white/40 transition-transform',
            expanded ? 'md:inline' : 'md:hidden',
            menuOpen && 'rotate-180',
          )} />
        )}
      </>
    )
    const rowClass = cn(
      'group relative flex w-full items-center gap-3 text-[15px] font-medium transition-all duration-200',
      'rounded-xl px-3 py-3',
      expanded
        ? 'md:w-full md:justify-start md:px-3 md:py-2.5'
        : 'md:h-12 md:w-12 md:justify-center md:gap-0 md:px-0 md:py-0',
      isActive
        ? 'rounded-xl bg-white/10 text-white ring-1 ring-white/15'
        : 'rounded-xl text-white/55 hover:bg-white/[0.06] hover:text-white',
      locked && 'opacity-45'
    )
    return (
      <>
        {children ? (
          // Item à sous-menu : le clic DÉPLIE/replie, il ne navigue pas. Quand la
          // sidebar est repliée (icônes seules), on ne peut pas montrer le
          // sous-menu → le clic navigue vers la route parente comme avant.
          <button
            type="button"
            title={!expanded ? item.label : undefined}
            onClick={() => { if (expanded) toggleMenu(); else router.push(item.href) }}
            className={rowClass}
          >
            {inner}
          </button>
        ) : (
          <Link
            href={item.href}
            title={!expanded ? item.label : locked ? 'Connectez votre boutique pour y accéder' : undefined}
            className={rowClass}
          >
            {inner}
          </Link>
        )}

        {/* Sous-menu déployé : sidebar élargie + menu ouvert (manuel ou actif). */}
        {children && menuOpen && expanded && (
          <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
            {children.map((c) => {
              // Actif = on est SUR la route parente ET le tab correspond (défaut
              // transactional). Sur une autre page, aucun sous-onglet surligné
              // (sinon « Transactionnel » paraîtrait sélectionné à tort).
              const cTab = new URLSearchParams(c.href.split('?')[1] || '').get('tab')
              const childActive = isActive && (currentTab || 'transactional') === cTab
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
                    childActive ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  {c.label}
                </Link>
              )
            })}
          </div>
        )}
      </>
    )
  }

  return (
    <TourProvider plan={plan ?? undefined}>
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--sidebar)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar, carte flottante (style Framer). Repliée : 81px (icônes).
          Élargie (épinglée ou survolée) : 240px avec libellés. Mobile : drawer. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          // Largeurs en REM (et non px) : la sidebar suit la police racine fluide
          // → sa proportion par rapport au contenu reste constante quelle que soit
          // la taille d'écran (16.25rem ≈ 260px à 16px, mais rétrécit/grandit avec
          // l'échelle globale).
          'group/sidebar fixed inset-y-0 left-0 z-50 flex w-[16.25rem] max-w-[80vw] flex-col bg-[var(--sidebar)] transition-all duration-300',
          'md:relative md:inset-y-auto md:m-2 md:mr-0 md:h-[calc(100dvh-1rem)] md:max-w-none md:p-2',
          // Épinglée : colle au panneau (pas d'arrondi à droite). Sinon : carte arrondie.
          'md:rounded-[10px]',
          expanded ? 'md:w-[15rem]' : 'md:w-[5.0625rem]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo & Close + flèche pin (desktop) */}
        <div className={cn(
          'relative flex h-[60px] items-center px-5 md:h-auto md:px-0 md:pb-2 md:pt-1',
          expanded ? 'justify-between md:px-2' : 'justify-between md:justify-center'
        )}>
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={40} height={40} className="h-10 w-10 md:h-9 md:w-9" />
            <span className={cn('text-2xl font-bold text-white', expanded ? 'md:inline' : 'md:hidden')}>{tenant.appName}</span>
          </Link>

          {/* Mobile : fermer */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Desktop : flèche pour épingler/ouvrir la sidebar */}
          <button
            onClick={() => setPinned(p => !p)}
            title={pinned ? 'Réduire le menu' : 'Agrandir le menu'}
            className={cn(
              'hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-all hover:bg-white/15 hover:text-white md:flex',
              expanded ? '' : 'md:absolute md:-right-1 md:top-1/2 md:-translate-y-1/2 md:opacity-0 md:group-hover/sidebar:opacity-100'
            )}
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn(
          'flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-3 py-2 md:flex md:flex-col md:gap-2 md:space-y-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'md:items-stretch md:px-2' : 'md:items-center md:px-0'
        )}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {/* Bas : nav secondaire + déconnexion + avatar */}
        <div className={cn(
          'space-y-1.5 px-3 py-2 md:flex md:flex-col md:gap-2 md:space-y-0',
          expanded ? 'md:items-stretch md:px-2' : 'md:items-center md:px-0'
        )}>
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          <button
            onClick={handleSignOut}
            title={!expanded ? t('nav.signout') : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl text-[15px] font-medium text-white/55 transition-all duration-200 hover:bg-white/[0.06] hover:text-white',
              'px-3 py-3',
              expanded ? 'md:w-full md:justify-start md:px-3 md:py-2.5' : 'md:h-12 md:w-12 md:justify-center md:gap-0 md:px-0 md:py-0'
            )}
          >
            <LogOut className="h-[22px] w-[22px] shrink-0" />
            <span className={cn(expanded ? 'md:inline' : 'md:hidden')}>{t('nav.signout')}</span>
          </button>

          {/* Avatar */}
          <Link
            href="/settings"
            title={profile?.full_name || 'Profil'}
            className={cn(
              'mt-1 flex items-center gap-3 rounded-xl px-3 py-2',
              expanded ? 'md:justify-start md:px-3' : 'md:justify-center md:px-0'
            )}
          >
            <Avatar size="default" className="ring-1 ring-white/15">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || 'Profil'} />}
              <AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white">
                {(profile?.full_name || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·'}
              </AvatarFallback>
            </Avatar>
            <span className={cn('text-sm font-medium text-white/80', expanded ? 'md:inline' : 'md:hidden')}>{profile?.full_name || 'Profil'}</span>
          </Link>
        </div>
      </aside>

      {/* Main content, panneau. Collé à la sidebar quand elle est épinglée
          (l'onglet actif s'y raccorde via la languette), sinon flottant. */}
      <div className={cn(
        'relative flex flex-1 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:shadow-2xl',
        // Anneau seulement quand le panneau flotte (non épinglé) : sinon il dessine
        // un liseré sur le bord gauche, juste là où la languette doit fusionner.
        'md:ml-2 md:rounded-[20px] md:ring-1 md:ring-black/5 dark:md:ring-white/10'
      )}>
        {/* Bannière d'impersonation (admin agissant « en tant que » un client).
            En haut de tout : impossible à rater, retour en un clic. */}
        <ImpersonationBanner />

        {/* Topbar globale : menu mobile (gauche) + cloche/réglages/profil (droite) */}
        <DashboardTopBar onOpenSidebar={() => setSidebarOpen(true)} />

        {/* Subscription banner */}
        <SubscriptionBanner subscription={subscription} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-transparent">
          {subscriptionLoading ? (
            <BlobLoaderScreen />
          ) : isPlanBlocked ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <CreditCard className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Upgrade requis</h2>
                  <p className="text-muted-foreground">
                    {pathname.startsWith('/campaigns')
                      ? 'Les campagnes broadcast sont disponibles uniquement avec le plan Scale.'
                      : 'Le module Lifecycle est disponible à partir du plan Pro.'}
                  </p>
                </div>
                <Link
                  href="/subscription"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <CreditCard className="h-5 w-5" />
                  Voir les plans
                </Link>
              </div>
            </div>
          ) : isStoreGated ? (
            /* Aucune boutique Shopify connectée : les données de l'app en
               découlent toutes → on bloque cette section avec un CTA clair. */
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
                  <Store className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Connectez votre boutique Shopify</h2>
                  <p className="text-muted-foreground">
                    {tenant.appName} fonctionne à partir de votre boutique : sans elle, les conversations,
                    agents, modèles, automatisations et statistiques sont en pause.
                  </p>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Store className="h-5 w-5" />
                  Reconnecter ma boutique
                </Link>
              </div>
            </div>
          ) : isBlocked ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">{t('blocked.title')}</h2>
                  <p className="text-muted-foreground">
                    {subscription?.status === 'canceled'
                      ? t('blocked.cancelled')
                      : subscription?.status === 'past_due'
                        ? t('blocked.expired', { appName: tenant.appName })
                        : t('blocked.trial_ended', { appName: tenant.appName })}
                  </p>
                </div>
                <Link
                  href="/subscription"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <CreditCard className="h-5 w-5" />
                  {t('blocked.manage_subscription')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="h-full w-full">
              {/* Pages persistantes (montées une fois, gardées vivantes) + le
                  routing normal pour les autres. On ne rend `children` QUE si le
                  chemin n'est pas géré par le keep-alive, sinon double affichage. */}
              <KeepAliveOutlet pages={KEEP_ALIVE_PAGES} />
              {!isKeepAlivePath(pathname, KEEP_ALIVE_PAGES) && (
                <div className="animate-fade-in-up h-full w-full">{children}</div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t bg-background safe-area-bottom md:hidden">
        {[
          { href: '/dashboard', icon: LayoutDashboard, label: t('nav.home') },
          { href: '/conversations', icon: MessageSquare, label: t('nav.chat') },
          { href: '/agents', icon: Bot, label: t('common.agents') },
          { href: '/settings', icon: Settings, label: t('nav.config') },
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Spacer for mobile bottom nav */}
      <div className="h-16 md:hidden" />

      {/* Assistant d'aide : il répond ET montre où aller (il surligne l'élément
          sur la page). S'il ne sait pas, il propose de basculer sur WhatsApp. */}
      <SupportBubble />
    </div>
    </TourProvider>
  )
}

// `useSearchParams` (sous-menu accordéon) exige un Suspense boundary en Next 16.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BlobLoaderScreen />}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  )
}
