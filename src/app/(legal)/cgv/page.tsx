import { LegalPageLayout } from '@/components/legal-page-layout'

export default function CGVPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales de Vente"
      description="Conditions commerciales, tarifs, paiement et résiliation des services Xeyo."
      lastUpdated="1 mai 2026"
      titleEn="Terms of Sale"
      descriptionEn="Commercial terms, pricing, payment, and termination of Xeyo services."
      lastUpdatedEn="May 1, 2026"
      childrenEn={
        <>
          <h2>Article 1 &ndash; Purpose</h2>
          <p>
            These Terms of Sale (ToS) define the conditions under which Xeyo
            (TOURAILLE-TRAN Julian, trading as Autyvia, sole proprietorship (micro-entreprise)) offers its Services to its business customers.
          </p>
          <p>
            Any subscription implies the full and unreserved acceptance of these ToS and of the
            Terms of Use (ToU).
          </p>

          <h2>Article 2 &ndash; Services and pricing</h2>

          <h3>2.1 Description</h3>
          <p>
            Xeyo offers a WhatsApp automation platform powered by artificial intelligence, accessible via a
            monthly subscription. The Services include:
          </p>
          <ul>
            <li>Connection of WhatsApp accounts (Baileys or Meta Cloud API)</li>
            <li>Customizable AI agents with a knowledge base</li>
            <li>Conversation and team management</li>
            <li>Statistics and dashboard</li>
            <li>Customer support by email</li>
          </ul>

          <h3>2.2 Pricing plans</h3>
          <p>
            Xeyo is offered as monthly subscriptions. Each plan includes a defined volume of AI conversations
            and tokens. The prices in force and the limits of each plan are indicated on the application&apos;s
            pricing page.
          </p>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            VAT not applicable, article 293 B of the French General Tax Code (micro-entreprise).
          </p>

          <h3>2.3 Trial and subscription</h3>
          <p>
            Access to the platform is open from the moment the account is created (trial period). Beyond the
            trial, an active subscription is required to continue using the Services. The customer configures
            the platform themselves and is solely responsible for the results obtained. Xeyo cannot be held
            liable for the results obtained under the configuration carried out by the customer.
          </p>

          <h3>2.4 Token quota overage</h3>
          <p>
            The AI token quota is reset at each monthly renewal. In the event of an overage,
            access to automated replies is suspended until renewal, in accordance with the limits of the
            subscribed plan indicated on the pricing page.
          </p>

          <h3>2.5 Price changes</h3>
          <p>Xeyo reserves the right to modify its prices with 30 days&apos; notice by email.</p>

          <h2>Article 3 &ndash; Payment</h2>

          <h3>3.1 Terms</h3>
          <p>
            Payment is made by credit card via the secure Stripe platform. The subscription is
            billed monthly, on the anniversary date of the subscription.
          </p>

          <h3>3.2 Payment failure</h3>
          <p>
            In the event of a payment failure, access to the Service is suspended immediately. Stripe makes
            several automatic attempts before final termination.
          </p>

          <h3>3.3 Invoicing</h3>
          <p>An invoice is issued for each payment and is accessible from the customer area and the Stripe portal.</p>

          <h3>3.4 Late payment penalties</h3>
          <p>
            In the event of late payment, penalties at the rate of <strong>3 times the statutory interest rate in force</strong> apply automatically, as from the day following the due date, without prior formal notice. A <strong>fixed recovery indemnity of &euro;40</strong> is also due, in accordance with article D.441-5 of the French Commercial Code.
          </p>

          <h2>Article 4 &ndash; Term and termination</h2>

          <h3>4.1 Term</h3>
          <p>The subscription is entered into for an indefinite term, with no minimum commitment.</p>

          <h3>4.2 Termination by the Customer</h3>
          <p>
            The Customer may terminate at any time from their customer area (Subscription section) or by email to{' '}
            <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a>.
          </p>
          <p>
            Termination takes effect at the end of the current billing period. No pro-rata
            refund will be granted. Unused tokens are non-refundable.
          </p>

          <h3>4.3 Termination by Xeyo</h3>
          <p>
            Xeyo may terminate the subscription in the event of a breach of the ToU or the ToS, with immediate effect
            and without refund.
          </p>

          <h3>4.4 Post-termination data and reversibility</h3>
          <p>
            Upon termination, the customer&apos;s data (conversations, agents, documents) is retained for
            <strong> 30 days</strong>, then permanently deleted, in accordance with the GDPR. No recovery is possible
            after this period.
          </p>
          <p>
            During this 30-day period, the customer may request the export of their data (conversations,
            documents, agent configuration) by email to{' '}
            <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a>. Xeyo undertakes to provide
            this export in a readable format (JSON or CSV) within 7 business days.
          </p>

          <h2>Article 5 &ndash; Mandatory acceptance</h2>
          <div className="not-prose my-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
            <p className="font-medium text-slate-900 dark:text-white">Prerequisite for any payment</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Acceptance of these ToS is mandatory before any subscription. The acceptance checkbox
              must be ticked on the pricing page before being redirected to payment. Without this
              acceptance, no subscription is possible.
            </p>
          </div>

          <h2>Article 6 &ndash; Right of withdrawal</h2>
          <div className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
            <p className="font-medium text-slate-900 dark:text-white">Professional services: no withdrawal</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Since the Services are intended for professionals, the 14-day right of withdrawal does not apply,
              in accordance with article L.221-3 of the French Consumer Code.
            </p>
          </div>

          <h2>Article 7 &ndash; Liability</h2>
          <p>
            In the event of a proven malfunction attributable to Xeyo, the Customer may request a free
            extension proportional to the duration of unavailability.
          </p>
          <p>
            Xeyo&apos;s liability is limited to the amount of the sums received over the last 12 months.
            Xeyo cannot be held liable for the Customer&apos;s use of the Services or for the
            consequences of messages sent via the platform.
          </p>

          <h2>Article 8 &ndash; Disputes</h2>
          <p>These ToS are governed by French law.</p>
          <p>
            In the event of a dispute, the parties shall seek an amicable solution. Failing that, the French courts
            shall have jurisdiction.
          </p>

          <div className="not-prose mt-8 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <div className="grid gap-2 text-sm">
              <p>
                <strong className="text-slate-900 dark:text-white">Customer support:</strong>{' '}
                <a href="mailto:contact@autyvia.fr" className="text-primary hover:underline">
                  contact@autyvia.fr
                </a>
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">Stripe billing:</strong>{' '}
                Accessible from your customer area → Subscription → Manage my subscription
              </p>
            </div>
          </div>
        </>
      }
    >
      <h2>Article 1 – Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente (CGV) définissent les conditions dans lesquelles Xeyo
        (TOURAILLE-TRAN Julian, auto-entrepreneur) propose ses Services à ses clients professionnels.
      </p>
      <p>
        Toute souscription implique l&apos;acceptation pleine et entière des présentes CGV et des Conditions
        Générales d&apos;Utilisation (CGU).
      </p>

      <h2>Article 2 – Services et tarifs</h2>

      <h3>2.1 Description</h3>
      <p>
        Xeyo propose une plateforme d&apos;automatisation WhatsApp par intelligence artificielle, accessible via un
        abonnement mensuel. Les Services comprennent :
      </p>
      <ul>
        <li>Connexion de comptes WhatsApp (Baileys ou Meta Cloud API)</li>
        <li>Agents IA personnalisables avec base de connaissances</li>
        <li>Gestion des conversations et des équipes</li>
        <li>Statistiques et tableau de bord</li>
        <li>Support client par email</li>
      </ul>

      <h3>2.2 Plans tarifaires</h3>
      <p>
        Xeyo est proposé sous forme d&apos;abonnements mensuels. Chaque forfait inclut un volume de conversations
        IA et de tokens défini. Les tarifs en vigueur et les limites de chaque forfait sont indiqués sur la page
        de tarification de l&apos;application.
      </p>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        TVA non applicable, article 293 B du CGI (micro-entreprise).
      </p>

      <h3>2.3 Essai et abonnement</h3>
      <p>
        L&apos;accès à la plateforme est ouvert dès la création du compte (période d&apos;essai). Au-delà de
        l&apos;essai, un abonnement actif est requis pour continuer à utiliser les Services. Le client configure
        lui-même la plateforme et est seul responsable des résultats obtenus. Xeyo ne peut être tenu responsable
        des résultats obtenus dans le cadre de la configuration réalisée par le client.
      </p>

      <h3>2.4 Dépassement de quota tokens</h3>
      <p>
        Le quota de tokens IA est réinitialisé à chaque renouvellement mensuel. En cas de dépassement,
        l&apos;accès aux réponses automatisées est suspendu jusqu&apos;au renouvellement, selon les limites du
        forfait souscrit indiquées sur la page de tarification.
      </p>

      <h3>2.5 Modifications tarifaires</h3>
      <p>Xeyo se réserve le droit de modifier ses tarifs avec un préavis de 30 jours par email.</p>

      <h2>Article 3 – Paiement</h2>

      <h3>3.1 Modalités</h3>
      <p>
        Le paiement s&apos;effectue par carte bancaire via la plateforme sécurisée Stripe. L&apos;abonnement est
        facturé mensuellement, à la date anniversaire de la souscription.
      </p>

      <h3>3.2 Échec de paiement</h3>
      <p>
        En cas d&apos;échec de paiement, l&apos;accès au Service est suspendu immédiatement. Stripe procède à
        plusieurs tentatives automatiques avant résiliation définitive.
      </p>

      <h3>3.3 Facturation</h3>
      <p>Une facture est émise à chaque paiement et accessible depuis l&apos;espace client et le portail Stripe.</p>

      <h3>3.4 Pénalités de retard</h3>
      <p>
        En cas de retard de paiement, des pénalités au taux de <strong>3 fois le taux d&apos;intérêt légal en vigueur</strong> sont applicables de plein droit, à compter du lendemain de la date d&apos;échéance, sans mise en demeure préalable. Une <strong>indemnité forfaitaire de recouvrement de 40 €</strong> est également due, conformément à l&apos;article D.441-5 du Code de commerce.
      </p>

      <h2>Article 4 – Durée et résiliation</h2>

      <h3>4.1 Durée</h3>
      <p>L&apos;abonnement est souscrit pour une durée indéterminée, sans engagement minimum.</p>

      <h3>4.2 Résiliation par le Client</h3>
      <p>
        Le Client peut résilier à tout moment depuis son espace client (rubrique Abonnement) ou par email à{' '}
        <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a>.
      </p>
      <p>
        La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement au
        prorata ne sera accordé. Les tokens non consommés ne sont pas remboursables.
      </p>

      <h3>4.3 Résiliation par Xeyo</h3>
      <p>
        Xeyo peut résilier l&apos;abonnement en cas de violation des CGU ou des CGV, avec effet immédiat
        et sans remboursement.
      </p>

      <h3>4.4 Données post-résiliation et réversibilité</h3>
      <p>
        À la résiliation, les données du client (conversations, agents, documents) sont conservées pendant
        <strong> 30 jours</strong>, puis définitivement supprimées, conformément au RGPD. Aucune récupération n&apos;est possible
        après ce délai.
      </p>
      <p>
        Pendant cette période de 30 jours, le client peut demander l&apos;export de ses données (conversations,
        documents, configuration des agents) par email à{' '}
        <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a>. Xeyo s&apos;engage à fournir
        cet export dans un format lisible (JSON ou CSV) dans un délai de 7 jours ouvrés.
      </p>

      <h2>Article 5 – Acceptation obligatoire</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Condition préalable à tout paiement</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          L&apos;acceptation des présentes CGV est obligatoire avant toute souscription. La case d&apos;acceptation
          doit être cochée sur la page de tarification avant d&apos;être redirigé vers le paiement. Sans cette
          acceptation, aucune souscription n&apos;est possible.
        </p>
      </div>

      <h2>Article 6 – Droit de rétractation</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Services professionnels : pas de rétractation</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Les Services étant destinés aux professionnels, le droit de rétractation de 14 jours ne s&apos;applique
          pas, conformément à l&apos;article L.221-3 du Code de la consommation.
        </p>
      </div>

      <h2>Article 7 – Responsabilité</h2>
      <p>
        En cas de dysfonctionnement avéré imputable à Xeyo, le Client peut demander une prolongation
        gratuite proportionnelle à la durée d&apos;indisponibilité.
      </p>
      <p>
        La responsabilité d&apos;Xeyo est limitée au montant des sommes perçues au cours des 12 derniers mois.
        Xeyo ne saurait être tenu responsable de l&apos;utilisation des Services par le Client ni des
        conséquences des messages envoyés via la plateforme.
      </p>

      <h2>Article 8 – Litiges</h2>
      <p>Les présentes CGV sont régies par le droit français.</p>
      <p>
        En cas de litige, les parties rechercheront une solution amiable. À défaut, les tribunaux français
        seront compétents.
      </p>

      <div className="not-prose mt-8 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <div className="grid gap-2 text-sm">
          <p>
            <strong className="text-slate-900 dark:text-white">Service client :</strong>{' '}
            <a href="mailto:contact@autyvia.fr" className="text-primary hover:underline">
              contact@autyvia.fr
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
