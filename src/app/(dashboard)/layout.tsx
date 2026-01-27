'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  MessageSquare,
  Smartphone,
  Bot,
  Link2,
  BarChart3,
  LogOut,
} from 'lucide-react'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sessions', label: 'Sessions', icon: Smartphone },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/agents', label: 'Agents IA', icon: Bot },
  { href: '/links', label: 'Liens WA', icon: Link2 },
  { href: '/stats', label: 'Statistiques', icon: BarChart3 },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

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

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-muted/30">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-bold">Autyvia</span>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
