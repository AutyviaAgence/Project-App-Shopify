import { LegalPageLayout } from '@/components/legal-page-layout'

export default function CGVPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales de Vente"
      description="Conditions commerciales, tarifs, paiement et résiliation des services Autyvia."
      lastUpdated="23 avril 2026"
    >
      <h2>Article 1 – Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente (CGV) définissent les conditions dans lesquelles Autyvia
        (Julian TOURAILLE-TRAN, auto-entrepreneur) propose ses Services à ses clients professionnels.
      </p>
      <p>Toute souscription implique l&apos;acceptation pleine et entière des présentes CGV et des Conditions
        Générales d&apos;Utilisation (CGU).</p>

      <h2>Article 2 – Services et tarifs</h2>

      <h3>2.1 Description</h3>
      <p>Autyvia propose une plateforme d&apos;automatisation WhatsApp par intelligence artificielle, accessible via un
        abonnement mensuel. Les Services comprennent :</p>
      <ul>
        <li>Connexion de comptes WhatsApp (Baileys ou Meta Cloud API)</li>
        <li>Agents IA personnalisables avec base de connaissances</li>
        <li>Gestion des conversations et des équipes</li>
        <li>Statistiques et tableau de bord</li>
        <li>Support client par email</li>
      </ul>

      <h3>2.2 Plans tarifaires</h3>
      <p>Les abonnements sont proposés selon trois niveaux :</p>

      <div className="not-prose my-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Plan</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Prix mensuel (HT)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Quota de tokens IA</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Sessions WhatsApp</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Fonctionnalités</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            <tr>
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">Starter</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">39 €</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">500 000</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">1</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Conversations, Agents, Sessions, Connaissances</td>
            </tr>
            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">Pro</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">79 €</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">1 500 000</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">3</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Starter + Lifecycle (relances automatiques)</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">Scale</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">150 €</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4 000 000</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Illimité</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Pro + Campagnes broadcast, Support prioritaire</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        TVA non applicable, article 293 B du CGI (micro-entreprise).
      </p>

      <h3>2.3 Frais d&apos;onboarding (optionnels)</h3>
      <p>
        Un accompagnement au démarrage peut être proposé pour un montant de <strong>1 500 € HT</strong>,
        payable en deux versements de 750 € chacun. Ces frais couvrent la configuration complète de la
        plateforme, l&apos;intégration des agents IA et un suivi personnalisé.
      </p>

      <h3>2.4 Dépassement de quota</h3>
      <p>
        Le quota de tokens IA est réinitialisé à chaque renouvellement mensuel. En cas de dépassement,
        l&apos;accès aux réponses automatisées est suspendu jusqu&apos;au renouvellement ou jusqu&apos;à l&apos;achat
        de tokens supplémentaires (500 000 tokens pour 50 €).
      </p>

      <h3>2.5 Modifications tarifaires</h3>
      <p>Autyvia se réserve le droit de modifier ses tarifs avec un préavis de 30 jours par email.</p>

      <h2>Article 3 – Essai gratuit</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950/30">
        <p className="font-medium text-slate-900 dark:text-white">14 jours d&apos;essai gratuit — 200 000 tokens</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          À l&apos;issue de la période d&apos;essai, le Client peut souscrire un abonnement payant ou cesser
          d&apos;utiliser les Services sans frais ni engagement.
        </p>
      </div>

      <h2>Article 4 – Paiement</h2>

      <h3>4.1 Modalités</h3>
      <p>Le paiement s&apos;effectue par carte bancaire via la plateforme sécurisée Stripe.</p>
      <p>L&apos;abonnement est facturé mensuellement, à la date anniversaire de la souscription.</p>

      <h3>4.2 Échec de paiement</h3>
      <p>
        En cas d&apos;échec de paiement, l&apos;accès au Service est suspendu immédiatement.
        Stripe procède à plusieurs tentatives automatiques avant résiliation définitive.
      </p>

      <h3>4.3 Facturation</h3>
      <p>Une facture est émise à chaque paiement et accessible depuis l&apos;espace client et le portail Stripe.</p>

      <h2>Article 5 – Durée et résiliation</h2>

      <h3>5.1 Durée</h3>
      <p>L&apos;abonnement est souscrit pour une durée indéterminée, sans engagement minimum.</p>

      <h3>5.2 Résiliation par le Client</h3>
      <p>
        Le Client peut résilier à tout moment depuis son espace client (rubrique Abonnement) ou par email à{' '}
        <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>.
      </p>
      <p>
        La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement
        au prorata ne sera accordé.
      </p>

      <h3>5.3 Résiliation par Autyvia</h3>
      <p>
        Autyvia peut résilier l&apos;abonnement en cas de violation des CGU ou des CGV, avec effet immédiat
        et sans remboursement.
      </p>

      <h2>Article 6 – Acceptation obligatoire</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Condition préalable à tout paiement</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          L&apos;acceptation des présentes CGV est obligatoire avant toute souscription. La case d&apos;acceptation
          doit être cochée sur la page de tarification avant d&apos;être redirigé vers le paiement. Sans cette
          acceptation, aucune souscription n&apos;est possible.
        </p>
      </div>

      <h2>Article 7 – Droit de rétractation</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Services professionnels — pas de rétractation</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Les Services étant destinés aux professionnels, le droit de rétractation de 14 jours ne s&apos;applique
          pas, conformément à l&apos;article L.221-3 du Code de la consommation.
        </p>
      </div>

      <h2>Article 8 – Responsabilité</h2>
      <p>
        En cas de dysfonctionnement avéré imputable à Autyvia, le Client peut demander une prolongation
        gratuite proportionnelle à la durée d&apos;indisponibilité.
      </p>
      <p>
        La responsabilité d&apos;Autyvia est limitée au montant des sommes perçues au cours des 12 derniers mois.
        Autyvia ne saurait être tenu responsable de l&apos;utilisation des Services par le Client ni des
        conséquences des messages envoyés via la plateforme.
      </p>

      <h2>Article 9 – Litiges</h2>
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
            <strong className="text-slate-900 dark:text-white">Facturation Stripe :</strong>{' '}
            Accessible depuis votre espace client → Abonnement → Gérer mon abonnement
          </p>
        </div>
      </div>
    </LegalPageLayout>
  )
}
