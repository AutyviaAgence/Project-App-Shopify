import { LegalPageLayout } from '@/components/legal-page-layout'

export default function CGUPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales d'Utilisation"
      description="Modalités d'utilisation des services Autyvia, droits et obligations des utilisateurs."
      lastUpdated="04 février 2026"
    >
      <h2>Article 1 – Objet</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (CGU) définissent les modalités d&apos;utilisation des services
        proposés par Autyvia, ainsi que les droits et obligations des utilisateurs.
      </p>
      <p>
        L&apos;inscription et l&apos;utilisation des Services impliquent l&apos;acceptation pleine et entière des présentes CGU.
      </p>

      <h2>Article 2 – Description des Services</h2>
      <p>Autyvia propose une plateforme SaaS permettant :</p>
      <ul>
        <li>La connexion de comptes WhatsApp (personnel ou business)</li>
        <li>L&apos;automatisation des réponses via des agents d&apos;intelligence artificielle</li>
        <li>La gestion centralisée des conversations WhatsApp</li>
        <li>La gestion collaborative en équipe</li>
        <li>Le suivi et l&apos;analyse des conversations</li>
      </ul>

      <h2>Article 3 – Accès aux Services</h2>

      <h3>3.1 Inscription</h3>
      <p>
        L&apos;accès aux Services nécessite la création d&apos;un compte utilisateur. L&apos;Utilisateur s&apos;engage à fournir
        des informations exactes et à jour.
      </p>
      <p>
        L&apos;Utilisateur doit être âgé d&apos;au moins 18 ans et avoir la capacité juridique de contracter.
      </p>

      <h3>3.2 Identifiants</h3>
      <p>
        L&apos;Utilisateur est responsable de la confidentialité de ses identifiants de connexion. Toute utilisation
        depuis son compte est réputée avoir été faite par lui.
      </p>
      <p>
        En cas d&apos;utilisation frauduleuse, l&apos;Utilisateur doit informer Autyvia immédiatement :{' '}
        <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>
      </p>

      <h2>Article 4 – Utilisation des Services</h2>

      <h3>4.1 Usages autorisés</h3>
      <p>
        Les Services sont destinés à un usage professionnel pour automatiser et gérer les communications
        WhatsApp dans le cadre d&apos;une activité commerciale légitime.
      </p>

      <h3>4.2 Usages interdits</h3>
      <p>L&apos;Utilisateur s&apos;interdit notamment de :</p>
      <ul>
        <li>Utiliser les Services à des fins illégales ou frauduleuses</li>
        <li>Envoyer des messages non sollicités (spam)</li>
        <li>Usurper l&apos;identité d&apos;un tiers</li>
        <li>Collecter des données personnelles sans consentement</li>
        <li>Diffuser des contenus illicites, diffamatoires, haineux ou pornographiques</li>
        <li>Tenter de contourner les mesures de sécurité</li>
        <li>Violer les conditions d&apos;utilisation de WhatsApp</li>
        <li>Revendre ou sous-licencier l&apos;accès aux Services</li>
      </ul>

      <h2>Article 5 – Intelligence artificielle</h2>
      <div className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Important</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          L&apos;Utilisateur reconnaît et accepte les points suivants concernant l&apos;utilisation de l&apos;IA :
        </p>
      </div>
      <ul>
        <li>Les réponses générées par l&apos;IA peuvent contenir des erreurs</li>
        <li>Il reste responsable des messages envoyés depuis son compte WhatsApp</li>
        <li>Il doit superviser et paramétrer correctement ses agents IA</li>
        <li>Autyvia ne garantit pas l&apos;exactitude des réponses générées</li>
      </ul>

      <h2>Article 6 – Connexion WhatsApp et responsabilité Meta</h2>
      <p>L&apos;Utilisateur reconnaît et accepte que :</p>
      <ul>
        <li>La connexion de son compte WhatsApp à Autyvia s&apos;effectue via des API tierces (Evolution API)</li>
        <li>L&apos;utilisation de WhatsApp reste soumise aux Conditions d&apos;Utilisation de Meta/WhatsApp</li>
        <li>Meta/WhatsApp peut à tout moment suspendre ou fermer un compte en cas de violation de ses règles</li>
        <li>L&apos;envoi de messages automatisés, de spam ou de contenus non sollicités peut entraîner le bannissement du compte WhatsApp par Meta</li>
      </ul>

      <p>L&apos;Utilisateur s&apos;engage à :</p>
      <ul>
        <li>Respecter les Conditions d&apos;Utilisation de WhatsApp Business</li>
        <li>Ne pas utiliser les Services pour envoyer des messages non sollicités (spam)</li>
        <li>Obtenir le consentement préalable des destinataires pour les communications automatisées</li>
        <li>Respecter les limites de volume de messages imposées par WhatsApp</li>
      </ul>

      <div className="not-prose my-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-950/30">
        <p className="font-medium text-slate-900 dark:text-white">Clause de non-responsabilité</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Autyvia ne saurait être tenue responsable de la suspension, limitation ou fermeture d&apos;un compte
          WhatsApp par Meta, quelle qu&apos;en soit la raison. Aucun remboursement ne sera effectué dans ce cas.
        </p>
      </div>

      <h2>Article 7 – Propriété intellectuelle</h2>
      <p>Autyvia conserve tous les droits de propriété intellectuelle sur les Services.</p>
      <p>L&apos;Utilisateur conserve tous les droits sur les contenus qu&apos;il crée ou uploade.</p>

      <h2>Article 8 – Responsabilité</h2>
      <p>Autyvia s&apos;engage à fournir les Services avec diligence (obligation de moyens).</p>
      <p>Autyvia ne saurait être tenue responsable :</p>
      <ul>
        <li>Des interruptions de service indépendantes de sa volonté</li>
        <li>Des contenus générés par l&apos;intelligence artificielle</li>
        <li>De la suspension ou fermeture de comptes WhatsApp par Meta</li>
        <li>Des préjudices indirects (perte de chiffre d&apos;affaires, etc.)</li>
      </ul>

      <h2>Article 9 – Suspension et résiliation</h2>
      <p>Autyvia peut suspendre ou résilier l&apos;accès aux Services, sans préavis, en cas de :</p>
      <ul>
        <li>Violation des présentes CGU</li>
        <li>Utilisation frauduleuse ou abusive</li>
        <li>Non-paiement</li>
        <li>Demande des autorités compétentes</li>
      </ul>

      <h2>Article 10 – Droit applicable</h2>
      <p>Les présentes CGU sont régies par le droit français.</p>
      <p>
        En cas de litige, les parties rechercheront une solution amiable. À défaut, les tribunaux français
        seront compétents.
      </p>
    </LegalPageLayout>
  )
}
