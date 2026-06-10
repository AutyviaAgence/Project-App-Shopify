import { LegalPageLayout } from '@/components/legal-page-layout'

export const metadata = {
  title: 'Suppression des données — Xeyo',
  description: 'Comment demander la suppression de vos données personnelles auprès de Xeyo.',
}

export default function DataDeletionPage() {
  return (
    <LegalPageLayout
      title="Suppression des données"
      description="Comment demander la suppression de vos données personnelles auprès de Xeyo."
      lastUpdated="10 juin 2026"
    >
      <h2>Votre droit à la suppression</h2>
      <p>
        Conformément au Règlement Général sur la Protection des Données (RGPD) et aux
        exigences des plateformes que nous utilisons (Meta / WhatsApp Business, Shopify,
        Google), vous pouvez à tout moment demander la suppression des données
        personnelles que Xeyo détient à votre sujet.
      </p>

      <h2>Comment demander la suppression</h2>
      <p>
        Pour demander la suppression de vos données, envoyez un email à l&apos;adresse
        suivante depuis l&apos;adresse associée à votre compte :
      </p>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">
          <a href="mailto:autyviaagence@gmail.com" className="text-primary hover:underline">
            autyviaagence@gmail.com
          </a>
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Objet : « Demande de suppression de données »
        </p>
      </div>
      <p>Merci d&apos;indiquer dans votre message :</p>
      <ul>
        <li>votre nom et l&apos;adresse email de votre compte ;</li>
        <li>le cas échéant, le numéro WhatsApp ou la boutique Shopify concernés ;</li>
        <li>la nature de votre demande (suppression totale ou partielle).</li>
      </ul>

      <h2>Données concernées</h2>
      <p>La suppression couvre, selon votre situation :</p>
      <ul>
        <li>les informations de votre compte (nom, email, préférences) ;</li>
        <li>les conversations et messages échangés via WhatsApp Business et email ;</li>
        <li>les contacts et leurs informations de consentement (opt-in) ;</li>
        <li>les données de boutique Shopify synchronisées (le cas échéant) ;</li>
        <li>les documents de votre base de connaissances.</li>
      </ul>

      <h2>Délai de traitement</h2>
      <p>
        Nous traitons les demandes de suppression dans un délai maximum de
        <strong> 30 jours</strong> à compter de leur réception. Certaines données
        peuvent être conservées plus longtemps lorsque la loi nous y oblige
        (obligations comptables, fiscales ou de sécurité), puis sont supprimées à
        l&apos;expiration de ces obligations.
      </p>

      <h2>Suppression depuis l&apos;application</h2>
      <p>
        Si vous disposez d&apos;un compte Xeyo, vous pouvez également supprimer
        votre compte et l&apos;ensemble des données associées directement depuis
        <strong> Paramètres → Supprimer mon compte</strong>.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative à vos données personnelles, consultez notre{' '}
        <a href="/privacy">Politique de Confidentialité</a> ou contactez-nous à{' '}
        <a href="mailto:autyviaagence@gmail.com" className="text-primary hover:underline">
          autyviaagence@gmail.com
        </a>.
      </p>
    </LegalPageLayout>
  )
}
