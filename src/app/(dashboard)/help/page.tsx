'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, Bot, FileText, Megaphone, Bell, CreditCard,
  Plug, ChevronDown, LifeBuoy, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Article = { q: string; a: React.ReactNode }
type Category = { id: string; title: string; icon: React.ElementType; articles: Article[] }

const CATEGORIES: Category[] = [
  {
    id: 'demarrage',
    title: 'Démarrage',
    icon: Plug,
    articles: [
      {
        q: 'Comment connecter mon numéro WhatsApp ?',
        a: <>Depuis le <strong>Dashboard</strong>, utilisez le bloc « Connexion WhatsApp ». Renseignez votre <em>Phone Number ID</em>, <em>Business Account ID</em> et <em>Access Token</em> issus de votre app Meta (WhatsApp → API Setup). La session passe en « Connecté » une fois validée.</>,
      },
      {
        q: 'Pourquoi mes messages reçus n’apparaissent-ils pas ?',
        a: <>Vérifiez dans Meta (WhatsApp → Configuration → Webhooks) que l’URL de rappel est <code>https://app.xeyo.io/api/webhook/waba</code>, que le <em>verify token</em> correspond, et surtout que le champ <strong>messages</strong> est bien abonné. L’<em>App Secret</em> de votre app Meta doit aussi être correctement configuré.</>,
      },
      {
        q: 'Connecter une boîte email',
        a: <>Sur le Dashboard, le bloc « Connexion Email » permet de relier Gmail en un clic ou un compte SMTP. Vos emails arrivent alors dans la même boîte de réception que WhatsApp.</>,
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agents IA',
    icon: Bot,
    articles: [
      {
        q: 'Créer mon premier agent IA',
        a: <>Allez dans <Link href="/agents" className="text-primary underline">Agents IA</Link>. Choisissez « Je débute » pour un guide pas-à-pas, ou « Je suis à l’aise » pour la configuration manuelle. L’agent répond automatiquement à vos clients selon ses instructions.</>,
      },
      {
        q: 'Comment fonctionne la condition d’arrêt ?',
        a: <>Vous pouvez définir une condition (ex : « le client demande un humain ») qui désactive l’agent automatiquement sur la conversation et vous envoie une alerte.</>,
      },
      {
        q: 'Suggestion IA dans le chat',
        a: <>Dans une conversation, le bouton ✨ génère un brouillon de réponse à partir de l’historique. Vous le relisez et l’ajustez avant d’envoyer.</>,
      },
    ],
  },
  {
    id: 'templates',
    title: 'Modèles (Templates)',
    icon: FileText,
    articles: [
      {
        q: 'Pourquoi dois-je utiliser un modèle ?',
        a: <>Hors de la fenêtre de 24h (le client n’a pas écrit récemment), WhatsApp n’autorise que les <strong>modèles approuvés par Meta</strong>. C’est le seul moyen d’initier ou de relancer une conversation.</>,
      },
      {
        q: 'Créer un modèle avec image et boutons',
        a: <>Dans <Link href="/templates" className="text-primary underline">Modèles</Link>, choisissez un en-tête (Texte/Image/Vidéo/Document), rédigez le corps (avec variables {'{{1}}'}, mise en forme), un pied de page, et ajoutez jusqu’à 3 boutons (visiter le site, appeler, copier un code). Soumettez ensuite à Meta pour approbation.</>,
      },
      {
        q: 'Combien de temps pour l’approbation Meta ?',
        a: <>Généralement quelques minutes à 24h. Le statut passe de « En attente » à « Approuvé » ou « Refusé » (avec le motif).</>,
      },
    ],
  },
  {
    id: 'campagnes',
    title: 'Campagnes',
    icon: Megaphone,
    articles: [
      {
        q: 'Campagne manuelle vs automatique',
        a: <>Une campagne <strong>manuelle</strong> est lancée par vous. Une campagne <strong>automatique</strong> se déclenche seule selon un paramètre : date planifiée, inactivité d’un contact, ou un événement Shopify (ex : commande expédiée).</>,
      },
      {
        q: 'Respect de l’opt-in',
        a: <>Les campagnes ne sont envoyées qu’aux contacts ayant donné leur accord (opt-in). Un client peut se désabonner à tout moment en répondant <strong>STOP</strong>.</>,
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & Shopify',
    icon: Bell,
    articles: [
      {
        q: 'Notifier automatiquement après une commande',
        a: <>Une fois votre boutique Shopify connectée, Xeyo envoie une notification (ex : « Commande expédiée ») sur le canal choisi par le client (WhatsApp ou email). Le message apparaît aussi dans votre boîte de réception.</>,
      },
      {
        q: 'Le contact est-il créé automatiquement ?',
        a: <>Oui. Lors d’une commande, si le client n’existe pas encore dans Xeyo, sa fiche (nom, téléphone, email) est créée automatiquement depuis les données Shopify. L’envoi reste conditionné à son opt-in.</>,
      },
    ],
  },
  {
    id: 'abonnement',
    title: 'Abonnement & facturation',
    icon: CreditCard,
    articles: [
      {
        q: 'Gérer mon abonnement',
        a: <>Rendez-vous dans <Link href="/subscription" className="text-primary underline">Abonnement</Link> pour changer de formule ou accéder au portail de facturation Stripe (factures, moyen de paiement, annulation).</>,
      },
      {
        q: 'Que se passe-t-il si j’atteins ma limite ?',
        a: <>Chaque formule a des limites de conversations et de tokens IA. À l’approche de la limite, une alerte s’affiche. Vous pouvez passer à une formule supérieure à tout moment.</>,
      },
    ],
  },
]

export default function HelpPage() {
  return <HelpContent />
}

/** Contenu du centre d'aide, réutilisable (page /help ET onglet Paramètres). */
export function HelpContent({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES
      .map((cat) => ({
        ...cat,
        articles: cat.articles.filter((a) =>
          a.q.toLowerCase().includes(q) ||
          (typeof a.a === 'string' && a.a.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.articles.length > 0)
  }, [query])

  return (
    <div className={cn('space-y-6', embedded ? '' : 'mx-auto max-w-3xl p-6')}>
      {/* En-tête (masqué en mode embarqué : l'onglet a déjà son titre) */}
      {!embedded && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Centre d&apos;aide</h1>
          <p className="mt-1 text-muted-foreground">Trouvez rapidement une réponse à vos questions.</p>
        </div>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher dans l'aide…"
          className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {/* Catégories + articles */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucun résultat pour « {query} ».</p>
      ) : (
        <div className="space-y-6">
          {filtered.map((cat) => {
            const Icon = cat.icon
            return (
              <div key={cat.id}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Icon className="h-4 w-4" /> {cat.title}
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
                          {art.q}
                          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                        </button>
                        {open && (
                          <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{art.a}</div>
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

      {/* Contact support */}
      <div className="rounded-xl border bg-muted/30 p-5 text-center">
        <p className="text-sm font-medium">Vous ne trouvez pas votre réponse ?</p>
        <p className="mt-1 text-sm text-muted-foreground">Notre équipe est là pour vous aider.</p>
        <a
          href="mailto:contact@autyvia.fr"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Mail className="h-4 w-4" /> Contacter le support
        </a>
      </div>
    </div>
  )
}
