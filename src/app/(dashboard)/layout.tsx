'use client'

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertsDropdown } from '@/components/alerts-dropdown'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/sessions', label: 'Sessions', icon: Smartphone },
  { href: '/agents', label: 'Agents IA', icon: Bot },
  { href: '/campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/knowledge', label: 'Base de connaissances', icon: BookOpen },
  { href: '/links', label: 'Liens WhatsApp', icon: Link2 },
  { href: '/teams', label: 'Équipes', icon: Users },
  { href: '/stats', label: 'Statistiques', icon: BarChart3 },
]

const BOTTOM_NAV_ITEMS = [
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Handle escape key to close sidebar
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Erreur lors de la déconnexion')
      return
    }
    router.push('/login')
    router.refresh()
  }

  const NavLink = ({ item, showLabel = true }: { item: typeof NAV_ITEMS[0]; showLabel?: boolean }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-[#7DC2A5] text-white shadow-sm'
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
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-[#2D3E48] transition-all duration-300 md:relative',
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
              <Image src="/logo.svg" alt="Autyvia" width={32} height={32} className="h-8 w-8" />
              <span className="text-lg font-semibold text-white">Autyvia</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard">
              <Image src="/logo.svg" alt="Autyvia" width={32} height={32} className="h-8 w-8" />
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
            title={collapsed ? 'Déconnexion' : undefined}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 hidden h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[#2D3E48] text-white/70 shadow-sm transition-colors hover:bg-[#3D4E58] hover:text-white md:flex"
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
                 'Autyvia'}
              </h1>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <AlertsDropdown />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-[#F5F7FA] dark:bg-[#1A252C]">
          <div className="animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t bg-background safe-area-bottom md:hidden">
        {[
          { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
          { href: '/conversations', icon: MessageSquare, label: 'Chat' },
          { href: '/agents', icon: Bot, label: 'Agents' },
          { href: '/sessions', icon: Smartphone, label: 'Sessions' },
          { href: '/settings', icon: Settings, label: 'Config' },
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                isActive ? 'text-[#7DC2A5]' : 'text-muted-foreground'
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
  )
}
