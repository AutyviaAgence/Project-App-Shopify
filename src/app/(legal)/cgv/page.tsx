import { LegalPageLayout } from '@/components/legal-page-layout'

export default function CGVPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales de Vente"
      description="Conditions commerciales, tarifs, paiement et résiliation des services Autyvia."
      lastUpdated="04 février 2026"
    >
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
      <div className="not-prose my-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="text-2xl font-bold text-slate-900 dark:text-white">250€ HT / mois</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          TVA non applicable, article 293 B du CGI (micro-entreprise)
        </p>
      </div>
      <p>Autyvia se réserve le droit de modifier ses tarifs avec un préavis de 30 jours.</p>

      <h3>2.3 Période d&apos;essai</h3>
      <div className="not-prose my-4 rounded-lg border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950/30">
        <p className="font-medium text-slate-900 dark:text-white">14 jours d&apos;essai gratuit</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          À l&apos;issue, le Client peut souscrire un abonnement ou cesser d&apos;utiliser les Services sans frais.
        </p>
      </div>

      <h2>Article 3 – Paiement</h2>

      <h3>3.1 Modalités</h3>
      <p>Le paiement s&apos;effectue par carte bancaire ou virement bancaire.</p>
      <p>L&apos;abonnement est facturé mensuellement, à date anniversaire.</p>

      <h3>3.2 Coordonnées bancaires</h3>
      <div className="not-prose my-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-white">IBAN :</strong> FR76 2823 3000 0108 5763 7187 757
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-white">Titulaire :</strong> Julian TOURAILLE-TRAN
        </p>
      </div>

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
      <div className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Services professionnels</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Les Services étant destinés aux professionnels, le droit de rétractation ne s&apos;applique pas conformément
          à l&apos;article L.221-3 du Code de la consommation.
        </p>
      </div>

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
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <div className="grid gap-2 text-sm">
          <p>
            <strong className="text-slate-900 dark:text-white">Service client :</strong>{' '}
            <a href="mailto:autyviaagence@gmail.com" className="text-primary hover:underline">
              autyviaagence@gmail.com
            </a>
          </p>
          <p>
            <strong className="text-slate-900 dark:text-white">Facturation :</strong>{' '}
            <a href="mailto:autyviaagence@gmail.com" className="text-primary hover:underline">
              autyviaagence@gmail.com
            </a>
          </p>
        </div>
      </div>
    </LegalPageLayout>
  )
}
