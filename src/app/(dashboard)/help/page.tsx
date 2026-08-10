'use client'

import { useState, useMemo } from 'react'
import {
  Search, Bot, FileText, Megaphone, Bell, CreditCard,
  Plug, ChevronDown, LifeBuoy, MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'

/** Le numéro du support (public). Même source que la bulle d'aide. */
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '33636006808'

/**
 * Contenu 100 % piloté par i18n. Chaque `title`, `q`, `a` est une CLÉ résolue
 * au rendu via t(). Les réponses (`a`) sont des chaînes HTML (elles contiennent
 * <strong>/<em>/<code> et des liens internes) rendues via dangerouslySetInnerHTML.
 */
type Article = { q: string; a: string }
type Category = { id: string; title: string; icon: React.ElementType; articles: Article[] }

const CATEGORIES: Category[] = [
  {
    id: 'demarrage',
    title: 'help.cat_start_title',
    icon: Plug,
    articles: [
      { q: 'help.q_connect_wa', a: 'help.a_connect_wa' },
      { q: 'help.q_no_messages', a: 'help.a_no_messages' },
    ],
  },
  {
    id: 'agents',
    title: 'help.cat_agents_title',
    icon: Bot,
    articles: [
      { q: 'help.q_first_agent', a: 'help.a_first_agent' },
      { q: 'help.q_stop_condition', a: 'help.a_stop_condition' },
      { q: 'help.q_ai_suggestion', a: 'help.a_ai_suggestion' },
    ],
  },
  {
    id: 'templates',
    title: 'help.cat_templates_title',
    icon: FileText,
    articles: [
      { q: 'help.q_why_template', a: 'help.a_why_template' },
      { q: 'help.q_template_image_buttons', a: 'help.a_template_image_buttons' },
      { q: 'help.q_meta_approval_time', a: 'help.a_meta_approval_time' },
    ],
  },
  {
    id: 'campagnes',
    title: 'help.cat_campaigns_title',
    icon: Megaphone,
    articles: [
      { q: 'help.q_manual_vs_auto', a: 'help.a_manual_vs_auto' },
      { q: 'help.q_optin', a: 'help.a_optin' },
    ],
  },
  {
    id: 'notifications',
    title: 'help.cat_notifications_title',
    icon: Bell,
    articles: [
      { q: 'help.q_notify_after_order', a: 'help.a_notify_after_order' },
      { q: 'help.q_contact_auto_created', a: 'help.a_contact_auto_created' },
    ],
  },
  {
    id: 'abonnement',
    title: 'help.cat_billing_title',
    icon: CreditCard,
    articles: [
      { q: 'help.q_manage_subscription', a: 'help.a_manage_subscription' },
      { q: 'help.q_reach_limit', a: 'help.a_reach_limit' },
    ],
  },
]

export default function HelpPage() {
  return <HelpContent />
}

/** Contenu du centre d'aide, réutilisable (page /help ET onglet Paramètres). */
export function HelpContent({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES
      .map((cat) => ({
        ...cat,
        articles: cat.articles.filter((a) =>
          t(a.q).toLowerCase().includes(q) ||
          t(a.a).toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.articles.length > 0)
  }, [query, t])

  return (
    <div className={cn('space-y-6', embedded ? '' : 'mx-auto max-w-3xl p-6')}>
      {/* En-tête (masqué en mode embarqué : l'onglet a déjà son titre) */}
      {!embedded && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">{t('help.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('help.subtitle')}</p>
        </div>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.search_ph')}
          className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {/* Catégories + articles */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('help.no_results', { query })}</p>
      ) : (
        <div className="space-y-6">
          {filtered.map((cat) => {
            const Icon = cat.icon
            return (
              <div key={cat.id}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Icon className="h-4 w-4" /> {t(cat.title)}
                </div>
                <div className="overflow-hidden rounded-xl border">
                  {cat.articles.map((art, i) => {
                    const key = `${cat.id}-${i}`
                    const open = openKey === key
                    return (
                      <div key={key} className="border-b last:border-b-0">
                        <button
                          onClick={() => setOpenKey(open ? null : key)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50"
                        >
                          {t(art.q)}
                          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                        </button>
                        {open && (
                          <div
                            className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground"
                            dangerouslySetInnerHTML={{ __html: t(art.a) }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Contact support — WhatsApp, comme la bulle d'aide. On vend WhatsApp :
          répondre par mail serait incohérent, et le marchand a déjà l'app ouverte
          sur son téléphone. Un <a> plutôt qu'un window.open : dans l'iframe
          Shopify, window.open déclenche « Autorisez les pop-ups ». */}
      <div className="rounded-xl border bg-muted/30 p-5 text-center">
        <p className="text-sm font-medium">{t('help.not_found')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('help.team_help')}</p>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t('help.wa_prefill'))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" /> {t('help.contact_support')}
        </a>
      </div>
    </div>
  )
}
