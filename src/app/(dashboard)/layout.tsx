'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  MessageSquare,
  Smartphone,
  Bot,
  Link2,
  BarChart3,
  LogOut,
  BookOpen,
  Settings,
  ScrollText,
  Users,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Tag,
  AlertTriangle,
  CreditCard,
  Loader2,
  Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertsDropdown } from '@/components/alerts-dropdown'
import dynamic from 'next/dynamic'

const TourProvider = dynamic(() => import('@/components/guided-tour').then(m => ({ default: m.TourProvider })), {
  ssr: false,
})
import { SubscriptionBanner } from '@/components/subscription-banner'
import { useSubscription } from '@/hooks/use-subscription'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

const NAV_ITEMS_KEYS = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/conversations', labelKey: 'nav.conversations', icon: MessageSquare },
  { href: '/sessions', labelKey: 'nav.sessions', icon: Smartphone },
  { href: '/agents', labelKey: 'nav.agents', icon: Bot },
  { href: '/campaigns', labelKey: 'nav.campaigns', icon: Megaphone },
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen },
  { href: '/links', labelKey: 'nav.links', icon: Link2 },
  { href: '/tags', labelKey: 'nav.tags', icon: Tag },
  { href: '/lifecycle', labelKey: 'nav.lifecycle', icon: Workflow },
  { href: '/teams', labelKey: 'nav.teams', icon: Users },
  { href: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
]

const BOTTOM_NAV_KEYS = [
  { href: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

// Pages accessibles même sans abonnement actif
const ALLOWED_WITHOUT_SUBSCRIPTION = ['/subscription', '/settings']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const { t } = useTranslation()
  const tenant = useTenant()

  const NAV_ITEMS = useMemo(() => NAV_ITEMS_KEYS.map(item => ({ ...item, label: t(item.labelKey) })), [t])
  const BOTTOM_NAV_ITEMS = useMemo(() => BOTTOM_NAV_KEYS.map(item => ({ ...item, label: t(item.labelKey) })), [t])

  // Vérifier si la page actuelle est accessible sans abonnement
  const isAllowedPage = ALLOWED_WITHOUT_SUBSCRIPTION.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
  const isBlocked = subscription && !subscription.isActive && !isAllowedPage

  // Close sidebar on route change (mobile) + escape key
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error(t('nav.signout_error'))
      return
    }
    router.push('/login')
    router.refresh()
  }, [router, t])

  const NavLink = ({ item, showLabel = true }: { item: typeof NAV_ITEMS[0]; showLabel?: boolean }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
        title={!showLabel ? item.label : undefined}
      >
        <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-white')} />
        {showLabel && (
          <span className={cn(
            'transition-all duration-200',
            collapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'
          )}>
            {item.label}
          </span>
        )}
      </Link>
    )
  }

  return (
    <TourProvider>
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--sidebar)] transition-all duration-300 md:relative',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Logo & Close */}
        <div className={cn(
          'flex h-16 items-center border-b border-white/10 px-4',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image src={tenant.logoUrl} alt={tenant.appName} width={32} height={32} className="h-8 w-8" />
              <span className="text-lg font-semibold text-white">{tenant.appName}</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard">
              <Image src={tenant.logoUrl} alt={tenant.appName} width={32} height={32} className="h-8 w-8" />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} showLabel={!collapsed} />
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/10 p-3 space-y-1">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} showLabel={!collapsed} />
          ))}

          <button
            onClick={handleSignOut}
            className={cn(
              'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white',
              collapsed && 'justify-center'
            )}
            title={collapsed ? t('nav.signout') : undefined}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{t('nav.signout')}</span>}
          </button>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 hidden h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[var(--sidebar)] text-white/70 shadow-sm transition-colors hover:bg-white/10 hover:text-white md:flex"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title */}
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {NAV_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'))?.label ||
                 BOTTOM_NAV_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'))?.label ||
                 tenant.appName}
              </h1>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <AlertsDropdown />
          </div>
        </header>

        {/* Subscription banner */}
        <SubscriptionBanner subscription={subscription} />

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-[#F5F7FA] dark:bg-[#1A252C]">
          {subscriptionLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                    {subscription?.status === 'cancelled'
                      ? t('blocked.cancelled')
                      : subscription?.status === 'expired'
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
            <div className="animate-fade-in-up">
              {children}
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
          { href: '/sessions', icon: Smartphone, label: t('nav.sessions') },
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
    </div>
    </TourProvider>
  )
}
