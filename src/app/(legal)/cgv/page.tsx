'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CGVPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Autyvia" width={32} height={32} className="h-8 w-8" />
            <span className="text-lg font-semibold">Autyvia</span>
          </Link>
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>

        {/* Content */}
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1>Conditions Générales de Vente</h1>

          <h2>Article 1 – Objet</h2>
          <p>
            Les présentes Conditions Générales de Vente (CGV) définissent les conditions dans lesquelles Autyvia
            propose ses Services à ses clients professionnels.
          </p>
          <p>Toute souscription implique l&apos;acceptation pleine et entière des présentes CGV.</p>

          <h2>Article 2 – Services et tarifs</h2>

          <h3>2.1 Description</h3>
          <p>Autyvia propose un abonnement mensuel donnant accès à :</p>
          <ul>
            <li>Connexion de comptes WhatsApp</li>
            <li>Agents IA personnalisables</li>
            <li>Base de connaissances</li>
            <li>Gestion d&apos;équipe</li>
            <li>Tableau de bord et statistiques</li>
            <li>Support client</li>
          </ul>

          <h3>2.2 Tarifs</h3>
          <p>
            <strong>Abonnement mensuel : 250€ HT / mois</strong>
          </p>
          <p>TVA non applicable, article 293 B du CGI (micro-entreprise).</p>
          <p>Autyvia se réserve le droit de modifier ses tarifs avec un préavis de 30 jours.</p>

          <h3>2.3 Période d&apos;essai</h3>
          <p>
            Une période d&apos;essai gratuite de 14 jours est proposée. À l&apos;issue, le Client peut souscrire un abonnement
            ou cesser d&apos;utiliser les Services sans frais.
          </p>

          <h2>Article 3 – Paiement</h2>

          <h3>3.1 Modalités</h3>
          <p>Le paiement s&apos;effectue par carte bancaire ou virement bancaire.</p>
          <p>L&apos;abonnement est facturé mensuellement, à date anniversaire.</p>

          <h3>3.2 Coordonnées bancaires</h3>
          <p>
            IBAN : FR76 2823 3000 0108 5763 7187 757<br />
            Titulaire : Julian TOURAILLE-TRAN
          </p>

          <h3>3.3 Facturation</h3>
          <p>Une facture est émise à chaque paiement et accessible depuis l&apos;espace client.</p>

          <h2>Article 4 – Durée et résiliation</h2>

          <h3>4.1 Durée</h3>
          <p>L&apos;abonnement est souscrit pour une durée indéterminée, sans engagement minimum.</p>

          <h3>4.2 Résiliation par le Client</h3>
          <p>
            Le Client peut résilier à tout moment depuis son espace client ou par email à{' '}
            <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>.
          </p>
          <p>La résiliation prend effet à la fin de la période en cours. Aucun remboursement au prorata.</p>

          <h3>4.3 Résiliation par Autyvia</h3>
          <p>Autyvia peut résilier en cas de violation des CGU/CGV, avec effet immédiat.</p>

          <h2>Article 5 – Droit de rétractation</h2>
          <p>
            Les Services étant destinés aux professionnels, le droit de rétractation ne s&apos;applique pas conformément
            à l&apos;article L.221-3 du Code de la consommation.
          </p>

          <h2>Article 6 – Garanties</h2>
          <p>
            En cas de dysfonctionnement avéré, le Client peut demander une prolongation gratuite proportionnelle.
          </p>
          <p>
            La responsabilité d&apos;Autyvia est limitée au montant des sommes perçues au cours des 12 derniers mois.
          </p>

          <h2>Article 7 – Litiges</h2>
          <p>Les présentes CGV sont régies par le droit français.</p>
          <p>
            En cas de litige, les parties rechercheront une solution amiable. À défaut, les tribunaux français
            seront compétents.
          </p>

          <h2>Contact</h2>
          <p>
            Service client : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a><br />
            Facturation : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>
          </p>

          <hr />
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : 04 février 2026
          </p>
        </article>

        {/* Footer links */}
        <div className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm text-muted-foreground">
          <Link href="/legal" className="hover:underline">Mentions légales</Link>
          <Link href="/cgu" className="hover:underline">CGU</Link>
          <Link href="/cgv" className="hover:underline font-medium text-foreground">CGV</Link>
          <Link href="/privacy" className="hover:underline">Politique de confidentialité</Link>
        </div>
      </div>
    </div>
  )
}
