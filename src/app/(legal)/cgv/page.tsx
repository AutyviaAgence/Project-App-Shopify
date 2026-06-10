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
          <p>Subscriptions are offered across three tiers:</p>

          <div className="not-prose my-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Feature</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Starter</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Pro</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Monthly price (excl. tax)</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">&euro;39</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">&euro;79</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">&euro;150</td>
                </tr>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">WhatsApp sessions</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">AI agents</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">5</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
                </tr>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">AI token quota</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">500,000</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">1,500,000</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4,000,000</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">RAG documents</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">5</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">30</td>
                </tr>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Teams</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Lifecycle</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-500">&ndash;</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
                </tr>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Broadcast campaigns</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-500">&ndash;</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-500">&ndash;</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            VAT not applicable, article 293 B of the French General Tax Code (micro-entreprise).
          </p>

          <h3>2.3 Access paths</h3>
          <p><strong>Guided path (recommended)</strong></p>
          <p>
            Onboarding assistance is available for <strong>&euro;990 excl. tax</strong>, payable in two installments:
          </p>
          <ul>
            <li>&euro;445 upon signing: non-refundable deposit in all cases</li>
            <li>&euro;445 upon delivery of the configured and validated agent</li>
          </ul>
          <p>
            These fees cover the process audit, the complete configuration of the platform, the integration
            of the AI agents, and personalized support over 30 days.
          </p>

          <p><strong>Self-service path</strong></p>
          <p>
            The customer may subscribe directly to a monthly subscription without assistance. In this case, the
            configuration of the platform is entirely the customer&apos;s responsibility. Xeyo cannot be held
            liable for the results obtained under a self-managed configuration.
          </p>

          <h3>2.4 Customer obligations, guided path</h3>
          <p>Under the guided path, the customer undertakes to:</p>
          <ul>
            <li>Complete the onboarding configurator within 14 calendar days following payment of the deposit</li>
            <li>Be available for a minimum of 2 scheduled work sessions (45 minutes each)</li>
            <li>Respond to Xeyo&apos;s requests for clarification within 48 business hours: any delay suspends the delivery deadline accordingly</li>
            <li>Any modification of choices after submission of the configurator results in an additional delay not attributable to Xeyo</li>
          </ul>
          <p>The balance of &euro;445 is not due only if:</p>
          <ul>
            <li>The delivered agent does not match the choices validated in the configurator</li>
            <li>Xeyo did not meet the 30-day delivery deadline for reasons not attributable to the customer</li>
          </ul>
          <p>
            The deposit of &euro;445 is non-refundable in all cases, including if the customer has not fulfilled
            their onboarding obligations.
          </p>

          <div className="not-prose my-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
            <p className="font-medium text-slate-900 dark:text-white">Conditions for refund of the &euro;445 balance</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              The balance is not due only if the following two conditions are met
              <strong> simultaneously</strong>: (1) the customer has fulfilled all of their onboarding obligations
              listed in this article, and (2) the delivered agent does not match the choices validated in the
              signed configurator. Any request for a refund of the balance must be made in writing within
              <strong> 7 days following delivery</strong>. After this period, delivery is deemed accepted.
            </p>
          </div>

          <h3>2.5 Token quota overage</h3>
          <p>
            The AI token quota is reset at each monthly renewal. In the event of an overage,
            access to automated replies is suspended until renewal or until the purchase
            of additional tokens (1,000,000 tokens for &euro;50).
          </p>

          <h3>2.6 Price changes</h3>
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

          <h3>3.4 Payment deadlines</h3>
          <p>
            For the guided path, the balance of &euro;445 is payable within <strong>30 days following delivery of the validated agent</strong>, unless otherwise agreed in writing within the limit of 60 days in accordance with law no. 2008-776.
          </p>

          <h3>3.5 Late payment penalties</h3>
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
      <p>Les abonnements sont proposés selon trois niveaux :</p>

      <div className="not-prose my-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Caractéristique</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Starter</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Pro</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">Scale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            <tr>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Prix mensuel (HT)</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">39 €</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">79 €</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">150 €</td>
            </tr>
            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Sessions WhatsApp</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Agents IA</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">5</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
            </tr>
            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Quota tokens IA</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">500 000</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">1 500 000</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4 000 000</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Documents RAG</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">5</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">30</td>
            </tr>
            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Équipes</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">2</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">4</td>
              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">10</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Lifecycle</td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-500">—</td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
            </tr>
            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Campagnes broadcast</td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-500">—</td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-500">—</td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400">✓</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        TVA non applicable, article 293 B du CGI (micro-entreprise).
      </p>

      <h3>2.3 Parcours d&apos;accès</h3>
      <p><strong>Parcours accompagné (recommandé)</strong></p>
      <p>
        Un accompagnement au démarrage est disponible pour <strong>990 € HT</strong>, payable en deux versements :
      </p>
      <ul>
        <li>445 € à la signature — acompte non remboursable dans tous les cas</li>
        <li>445 € à la livraison de l&apos;agent configuré et validé</li>
      </ul>
      <p>
        Ces frais couvrent l&apos;audit des processus, la configuration complète de la plateforme, l&apos;intégration
        des agents IA et un suivi personnalisé sur 30 jours.
      </p>

      <p><strong>Parcours self-service</strong></p>
      <p>
        Le client peut souscrire directement à un abonnement mensuel sans accompagnement. Dans ce cas, la
        configuration de la plateforme est entièrement à la charge du client. Xeyo ne peut être tenu
        responsable des résultats obtenus dans le cadre d&apos;une configuration autonome.
      </p>

      <h3>2.4 Obligations du client — parcours accompagné</h3>
      <p>Dans le cadre du parcours accompagné, le client s&apos;engage à :</p>
      <ul>
        <li>Compléter le configurateur d&apos;onboarding dans les 14 jours calendaires suivant le paiement de l&apos;acompte</li>
        <li>Être disponible pour un minimum de 2 sessions de travail planifiées (45 minutes chacune)</li>
        <li>Répondre aux demandes de clarification d&apos;Xeyo dans les 48 heures ouvrées — tout dépassement suspend le délai de livraison d&apos;autant</li>
        <li>Toute modification des choix après soumission du configurateur entraîne un délai supplémentaire non imputable à Xeyo</li>
      </ul>
      <p>Le solde de 445 € n&apos;est pas dû uniquement si :</p>
      <ul>
        <li>L&apos;agent livré ne correspond pas aux choix validés dans le configurateur</li>
        <li>Xeyo n&apos;a pas respecté le délai de livraison de 30 jours sans motif imputable au client</li>
      </ul>
      <p>
        L&apos;acompte de 445 € est non remboursable dans tous les cas, y compris si le client n&apos;a pas rempli
        ses obligations d&apos;onboarding.
      </p>

      <div className="not-prose my-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Conditions de remboursement du solde de 445 €</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Le solde n&apos;est pas dû uniquement si les deux conditions suivantes sont réunies
          <strong> simultanément</strong> : (1) le client a rempli toutes ses obligations d&apos;onboarding
          listées au présent article, et (2) l&apos;agent livré ne correspond pas aux choix validés dans le
          configurateur signé. Toute demande de remboursement du solde doit être formulée par écrit dans les
          <strong> 7 jours suivant la livraison</strong>. Passé ce délai, la livraison est réputée acceptée.
        </p>
      </div>

      <h3>2.5 Dépassement de quota tokens</h3>
      <p>
        Le quota de tokens IA est réinitialisé à chaque renouvellement mensuel. En cas de dépassement,
        l&apos;accès aux réponses automatisées est suspendu jusqu&apos;au renouvellement ou jusqu&apos;à l&apos;achat
        de tokens supplémentaires (1 000 000 tokens pour 50 €).
      </p>

      <h3>2.6 Modifications tarifaires</h3>
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

      <h3>3.4 Délais de paiement</h3>
      <p>
        Pour le parcours accompagné, le solde de 445 € est exigible dans les <strong>30 jours suivant la livraison de l&apos;agent</strong> validé, sauf accord écrit contraire dans la limite de 60 jours conformément à la loi n° 2008-776.
      </p>

      <h3>3.5 Pénalités de retard</h3>
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
        <p className="font-medium text-slate-900 dark:text-white">Services professionnels — pas de rétractation</p>
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
