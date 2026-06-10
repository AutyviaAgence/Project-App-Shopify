import { LegalPageLayout } from '@/components/legal-page-layout'

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Politique de Confidentialité"
      description="Découvrez comment nous collectons, utilisons et protégeons vos données personnelles."
      lastUpdated="04 février 2026"
      titleEn="Privacy Policy"
      descriptionEn="Learn how we collect, use, and protect your personal data."
      lastUpdatedEn="February 04, 2026"
      childrenEn={
        <>
          <p className="lead text-lg">
            This Privacy Policy describes how Xeyo collects, uses, stores, and protects your personal data when you use our website and our application.
          </p>

          <p>
            We are committed to protecting your privacy in accordance with the General Data Protection Regulation (GDPR) and the French Data Protection Act (loi Informatique et Libertés).
          </p>

          <h2>Data controller</h2>
          <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white">TOURAILLE Julian</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Xeyo sole proprietorship (micro-entreprise)</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">SIRET: 992 684 829 00011</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">778 routes des barthes</p>
            <a href="mailto:contact@autyvia.fr" className="text-sm text-primary hover:underline">
              contact@autyvia.fr
            </a>
          </div>

          <h2>Data collected</h2>

          <h3>Data you provide to us</h3>
          <ul>
            <li><strong>Identification data</strong>: last name, first name, email address</li>
            <li><strong>Login data</strong>: password (encrypted)</li>
            <li><strong>Profile data</strong>: avatar, time zone, preferences</li>
            <li><strong>Billing data</strong>: address, payment information</li>
          </ul>

          <h3>Data collected automatically</h3>
          <ul>
            <li><strong>Technical data</strong>: IP address, browser type, operating system</li>
            <li><strong>Usage data</strong>: pages visited, features used, timestamps</li>
            <li>Cookies and similar technologies</li>
          </ul>

          <h3>Data related to use of the service</h3>
          <ul>
            <li><strong>WhatsApp messages</strong>: contents of conversations processed by our Services, via the official WhatsApp Business API (Meta Platforms)</li>
            <li><strong>Contacts</strong>: phone numbers and names of WhatsApp contacts</li>
            <li><strong>Store data (Shopify)</strong>: if you connect a Shopify store, we access in read-only mode your product catalog, your pages and policies, and — if you enable it — the status of your orders and certain customer information, so that the AI agent can answer questions (products, orders, customer support, returns)</li>
            <li><strong>Documents</strong>: files uploaded to the knowledge base</li>
            <li><strong>Configurations</strong>: AI agent settings, prompts, schedules</li>
          </ul>

          <h2>Purposes of processing</h2>
          <p>We use your personal data to:</p>
          <ul>
            <li>Provide and maintain our Services</li>
            <li>Manage your user account</li>
            <li>Process your payments</li>
            <li>Automatically reply to your WhatsApp messages via AI</li>
            <li>Improve and personalize our Services</li>
            <li>Send you communications relating to your account</li>
            <li>Ensure the security of our Services</li>
            <li>Comply with our legal obligations</li>
          </ul>

          <h2>Legal bases for processing</h2>
          <ul>
            <li><strong>Performance of the contract</strong>: to provide our Services</li>
            <li><strong>Consent</strong>: for marketing communications</li>
            <li><strong>Legitimate interest</strong>: to improve our Services and ensure their security</li>
            <li><strong>Legal obligation</strong>: to comply with our accounting and tax obligations</li>
          </ul>

          <h2>Processing by artificial intelligence</h2>
          <p>
            Our Services use artificial intelligence (OpenAI GPT-4) to generate automatic replies to your WhatsApp messages.
          </p>

          <div className="not-prose my-4 rounded-lg border-l-4 border-primary bg-primary/5 p-4">
            <p className="font-medium text-slate-900 dark:text-white">Important safeguards</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li>• OpenAI does not retain your data beyond processing</li>
              <li>• Your data is NOT used to train the AI models</li>
              <li>• Exchanges are encrypted in transit (TLS) and at rest (AES-256)</li>
            </ul>
          </div>

          <h2>Subprocessors and hosting</h2>

          <h3>Hosting (Europe)</h3>
          <ul>
            <li><strong>OVH SAS</strong> (France): hosting of the application server</li>
            <li><strong>Supabase Inc.</strong> (Europe region): PostgreSQL database</li>
          </ul>

          <h3>Third-party services</h3>
          <ul>
            <li><strong>Meta Platforms Ireland Ltd.</strong>: routing of messages via the WhatsApp Business API. Messages and numbers transit through Meta&apos;s infrastructure, subject to the <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">WhatsApp Business Policy</a> and Meta&apos;s privacy policy.</li>
            <li><strong>Shopify Inc.</strong> (Canada/EU): if you connect a store, read-only access to the store data required for the agent to operate (products, orders, customers according to the permissions granted).</li>
            <li><strong>OpenAI Inc.</strong> (USA): AI processing of messages</li>
            <li><strong>Google LLC</strong> (USA): only if you use the &ldquo;Sign in with Google&rdquo; connection (authentication), to retrieve your name, email address, and profile picture in order to create and manage your account.</li>
            <li><strong>Stripe Inc.</strong> (USA/Europe): payment processing - PCI-DSS certified</li>
          </ul>

          <p><strong>We never sell your personal data to third parties.</strong></p>

          <h2>Our role: technology provider and processor</h2>
          <p>
            Xeyo acts as a <strong>technology provider (Tech Provider)</strong> and a
            <strong> processor (data processor)</strong> within the meaning of the GDPR: we process data
            on behalf of our merchant customers, who remain the <strong>data controllers</strong>
            vis-à-vis their own customers (the end users).
          </p>
          <p>
            Within the framework of the WhatsApp Business API, we process the data of
            <strong> WhatsApp end users</strong> (the customers of our merchants) — numbers,
            names, message contents — solely to allow the merchant to reply to them.
            <strong> Meta Platforms</strong> acts as a processor for the routing of these messages.
          </p>

          <h2>Google connection (authentication)</h2>
          <p>
            Xeyo offers sign-in via Google (&ldquo;Sign in with Google&rdquo;). In this context, we
            receive your <strong>name, email address, and profile picture</strong> for the sole purpose of
            creating and managing your account. We do not access any other Google data (neither Gmail,
            nor Drive, nor Calendar).
          </p>
          <p>
            Xeyo&apos;s use and transfer of information received from Google APIs adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the <strong>Limited Use</strong> requirements.
          </p>

          <h2>Shopify compliance</h2>
          <p>
            When you connect a Shopify store, you are the data controller and Xeyo
            acts as a processor. In accordance with Shopify&apos;s requirements, we handle the
            mandatory compliance webhooks:
          </p>
          <ul>
            <li><strong>customers/data_request</strong>: upon a customer&apos;s request, provide the data held about them;</li>
            <li><strong>customers/redact</strong>: delete a customer&apos;s personal data for the relevant store;</li>
            <li><strong>shop/redact</strong>: 48 hours after the application is uninstalled, delete all personal data associated with the store.</li>
          </ul>

          <h2>Retention period</h2>
          <ul>
            <li><strong>Account data (email, name)</strong>: 3 years after account deletion</li>
            <li><strong>Conversations, agents, documents, configurations</strong>: 30 days after termination, then permanent deletion</li>
            <li><strong>WhatsApp messages</strong>: 2 years from their receipt</li>
            <li><strong>Uploaded documents</strong>: until deleted by the user + 30 days</li>
            <li><strong>Technical logs</strong>: 6 months</li>
            <li><strong>Billing data</strong>: 10 years (legal obligation)</li>
          </ul>

          <h2>Your rights</h2>
          <p>In accordance with the GDPR, you have the following rights:</p>
          <ul>
            <li><strong>Right of access</strong>: obtain a copy of your data</li>
            <li><strong>Right to rectification</strong>: correct your inaccurate data</li>
            <li><strong>Right to erasure</strong>: delete your data</li>
            <li><strong>Right to restriction</strong>: restrict processing</li>
            <li><strong>Right to portability</strong>: receive your data in a structured format</li>
            <li><strong>Right to object</strong>: object to processing</li>
            <li><strong>Right to withdraw your consent</strong>: at any time</li>
          </ul>

          <h3>Exercising your rights</h3>
          <ul>
            <li>From your account: Settings &gt; Personal data</li>
            <li>By email: <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a></li>
            <li>By post: 778 routes des barthes</li>
          </ul>
          <p>We will respond within 30 days.</p>

          <h3>Deletion of your data</h3>
          <p>
            You can permanently delete your account and all associated data
            (conversations, contacts, agents, documents) directly from <strong>Settings &gt; Delete my account</strong>.
            Deletion is immediate and irreversible. For any request to delete data processed
            via WhatsApp Business, contact us at <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a>;
            we will process the request as soon as possible.
          </p>

          <h3>Complaint to the CNIL</h3>
          <p>If you believe your rights are not being respected:</p>
          <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white">Commission Nationale de l&apos;Informatique et des Libertés</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07</p>
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
              www.cnil.fr
            </a>
          </div>

          <h2>Data security</h2>
          <ul>
            <li>Encryption of data in transit (TLS 1.3) and at rest (AES-256)</li>
            <li>Secure authentication with password hashing</li>
            <li>Strict access control to data</li>
            <li>Access monitoring and logging</li>
            <li>Regular backups</li>
            <li>Hosting in France (OVH)</li>
          </ul>
        </>
      }
    >
      <p className="lead text-lg">
        La présente Politique de Confidentialité décrit comment Xeyo collecte, utilise, stocke et protège vos données personnelles lorsque vous utilisez notre site web et notre application.
      </p>

      <p>
        Nous nous engageons à protéger votre vie privée conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>Responsable du traitement</h2>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">TOURAILLE Julian</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Micro-entreprise Xeyo</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">SIRET : 992 684 829 00011</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">778 routes des barthes</p>
        <a href="mailto:contact@autyvia.fr" className="text-sm text-primary hover:underline">
          contact@autyvia.fr
        </a>
      </div>

      <h2>Données collectées</h2>

      <h3>Données que vous nous fournissez</h3>
      <ul>
        <li><strong>Données d&apos;identification</strong> : nom, prénom, adresse email</li>
        <li><strong>Données de connexion</strong> : mot de passe (chiffré)</li>
        <li><strong>Données de profil</strong> : avatar, fuseau horaire, préférences</li>
        <li><strong>Données de facturation</strong> : adresse, informations de paiement</li>
      </ul>

      <h3>Données collectées automatiquement</h3>
      <ul>
        <li><strong>Données techniques</strong> : adresse IP, type de navigateur, système d&apos;exploitation</li>
        <li><strong>Données d&apos;utilisation</strong> : pages visitées, fonctionnalités utilisées, horodatages</li>
        <li>Cookies et technologies similaires</li>
      </ul>

      <h3>Données liées à l&apos;utilisation du service</h3>
      <ul>
        <li><strong>Messages WhatsApp</strong> : contenus des conversations traitées par nos Services, via l&apos;API officielle WhatsApp Business (Meta Platforms)</li>
        <li><strong>Contacts</strong> : numéros de téléphone et noms des contacts WhatsApp</li>
        <li><strong>Données de boutique (Shopify)</strong> : si vous connectez une boutique Shopify, nous accédons en lecture à votre catalogue de produits, vos pages et politiques, et — si vous l&apos;activez — au statut de vos commandes et à certaines informations clients, afin que l&apos;agent IA puisse répondre aux questions (produits, commandes, SAV, retours)</li>
        <li><strong>Documents</strong> : fichiers uploadés dans la base de connaissances</li>
        <li><strong>Configurations</strong> : paramètres des agents IA, prompts, horaires</li>
      </ul>

      <h2>Finalités du traitement</h2>
      <p>Nous utilisons vos données personnelles pour :</p>
      <ul>
        <li>Fournir et maintenir nos Services</li>
        <li>Gérer votre compte utilisateur</li>
        <li>Traiter vos paiements</li>
        <li>Répondre automatiquement à vos messages WhatsApp via l&apos;IA</li>
        <li>Améliorer et personnaliser nos Services</li>
        <li>Vous envoyer des communications relatives à votre compte</li>
        <li>Assurer la sécurité de nos Services</li>
        <li>Respecter nos obligations légales</li>
      </ul>

      <h2>Bases légales du traitement</h2>
      <ul>
        <li><strong>Exécution du contrat</strong> : pour fournir nos Services</li>
        <li><strong>Consentement</strong> : pour les communications marketing</li>
        <li><strong>Intérêt légitime</strong> : pour améliorer nos Services et assurer leur sécurité</li>
        <li><strong>Obligation légale</strong> : pour respecter nos obligations comptables et fiscales</li>
      </ul>

      <h2>Traitement par intelligence artificielle</h2>
      <p>
        Nos Services utilisent l&apos;intelligence artificielle (OpenAI GPT-4) pour générer des réponses automatiques à vos messages WhatsApp.
      </p>

      <div className="not-prose my-4 rounded-lg border-l-4 border-primary bg-primary/5 p-4">
        <p className="font-medium text-slate-900 dark:text-white">Garanties importantes</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>• OpenAI ne conserve pas vos données au-delà du traitement</li>
          <li>• Vos données ne sont PAS utilisées pour entraîner les modèles d&apos;IA</li>
          <li>• Les échanges sont chiffrés en transit (TLS) et au repos (AES-256)</li>
        </ul>
      </div>

      <h2>Sous-traitants et hébergement</h2>

      <h3>Hébergement (Europe)</h3>
      <ul>
        <li><strong>OVH SAS</strong> (France) : hébergement du serveur applicatif</li>
        <li><strong>Supabase Inc.</strong> (Région Europe) : base de données PostgreSQL</li>
      </ul>

      <h3>Services tiers</h3>
      <ul>
        <li><strong>Meta Platforms Ireland Ltd.</strong> : acheminement des messages via l&apos;API WhatsApp Business. Les messages et numéros transitent par l&apos;infrastructure de Meta, soumise à la <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">Politique commerciale WhatsApp</a> et à la politique de confidentialité de Meta.</li>
        <li><strong>Shopify Inc.</strong> (Canada/UE) : si vous connectez une boutique, accès en lecture aux données de boutique nécessaires au fonctionnement de l&apos;agent (produits, commandes, clients selon les autorisations accordées).</li>
        <li><strong>OpenAI Inc.</strong> (USA) : traitement IA des messages</li>
        <li><strong>Google LLC</strong> (USA) : uniquement si vous utilisez la connexion « Se connecter avec Google » (authentification), pour récupérer votre nom, adresse email et photo de profil afin de créer et gérer votre compte.</li>
        <li><strong>Stripe Inc.</strong> (USA/Europe) : traitement des paiements - Certifié PCI-DSS</li>
      </ul>

      <p><strong>Nous ne vendons jamais vos données personnelles à des tiers.</strong></p>

      <h2>Notre rôle : fournisseur de technologie et sous-traitant</h2>
      <p>
        Xeyo agit en qualité de <strong>fournisseur de technologie (Tech Provider)</strong> et de
        <strong> sous-traitant (data processor)</strong> au sens du RGPD : nous traitons les données
        pour le compte de nos clients marchands, qui restent les <strong>responsables de traitement</strong>
        (data controllers) vis-à-vis de leurs propres clients (les utilisateurs finaux).
      </p>
      <p>
        Dans le cadre de l&apos;API WhatsApp Business, nous traitons les données des
        <strong> utilisateurs finaux WhatsApp</strong> (les clients de nos marchands) — numéros,
        noms, contenus de messages — uniquement pour permettre au marchand de leur répondre.
        <strong> Meta Platforms</strong> intervient comme sous-traitant pour l&apos;acheminement de ces messages.
      </p>

      <h2>Connexion Google (authentification)</h2>
      <p>
        Xeyo propose la connexion via Google (« Se connecter avec Google »). Dans ce cadre, nous
        recevons votre <strong>nom, adresse email et photo de profil</strong> dans le seul but de
        créer et gérer votre compte. Nous n&apos;accédons à aucune autre donnée Google (ni Gmail,
        ni Drive, ni Agenda).
      </p>
      <p>
        L&apos;usage et le transfert par Xeyo des informations reçues des API Google adhèrent à la{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>, y compris les exigences <strong>Limited Use</strong>.
      </p>

      <h2>Conformité Shopify</h2>
      <p>
        Lorsque vous connectez une boutique Shopify, vous êtes responsable de traitement et Xeyo
        agit comme sous-traitant. Conformément aux exigences de Shopify, nous prenons en charge les
        webhooks de conformité obligatoires :
      </p>
      <ul>
        <li><strong>customers/data_request</strong> : sur demande d&apos;un client, fournir les données détenues le concernant ;</li>
        <li><strong>customers/redact</strong> : supprimer les données personnelles d&apos;un client pour la boutique concernée ;</li>
        <li><strong>shop/redact</strong> : 48h après désinstallation de l&apos;application, supprimer l&apos;ensemble des données personnelles associées à la boutique.</li>
      </ul>

      <h2>Durée de conservation</h2>
      <ul>
        <li><strong>Données de compte (email, nom)</strong> : 3 ans après suppression du compte</li>
        <li><strong>Conversations, agents, documents, configurations</strong> : 30 jours après résiliation, puis suppression définitive</li>
        <li><strong>Messages WhatsApp</strong> : 2 ans à compter de leur réception</li>
        <li><strong>Documents uploadés</strong> : jusqu&apos;à suppression par l&apos;utilisateur + 30 jours</li>
        <li><strong>Logs techniques</strong> : 6 mois</li>
        <li><strong>Données de facturation</strong> : 10 ans (obligation légale)</li>
      </ul>

      <h2>Vos droits</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données</li>
        <li><strong>Droit de rectification</strong> : corriger vos données inexactes</li>
        <li><strong>Droit à l&apos;effacement</strong> : supprimer vos données</li>
        <li><strong>Droit à la limitation</strong> : restreindre le traitement</li>
        <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré</li>
        <li><strong>Droit d&apos;opposition</strong> : vous opposer au traitement</li>
        <li><strong>Droit de retirer votre consentement</strong> : à tout moment</li>
      </ul>

      <h3>Exercer vos droits</h3>
      <ul>
        <li>Depuis votre compte : Paramètres &gt; Données personnelles</li>
        <li>Par email : <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a></li>
        <li>Par courrier : 778 routes des barthes</li>
      </ul>
      <p>Nous répondrons dans un délai de 30 jours.</p>

      <h3>Suppression de vos données</h3>
      <p>
        Vous pouvez supprimer définitivement votre compte et l&apos;ensemble des données associées
        (conversations, contacts, agents, documents) directement depuis <strong>Paramètres &gt; Supprimer mon compte</strong>.
        La suppression est immédiate et irréversible. Pour toute demande de suppression de données traitées
        via WhatsApp Business, contactez-nous à <a href="mailto:contact@autyvia.fr">contact@autyvia.fr</a> ;
        nous traiterons la demande dans les meilleurs délais.
      </p>

      <h3>Réclamation CNIL</h3>
      <p>Si vous estimez que vos droits ne sont pas respectés :</p>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Commission Nationale de l&apos;Informatique et des Libertés</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07</p>
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          www.cnil.fr
        </a>
      </div>

      <h2>Sécurité des données</h2>
      <ul>
        <li>Chiffrement des données en transit (TLS 1.3) et au repos (AES-256)</li>
        <li>Authentification sécurisée avec hachage des mots de passe</li>
        <li>Contrôle d&apos;accès strict aux données</li>
        <li>Surveillance et journalisation des accès</li>
        <li>Sauvegardes régulières</li>
        <li>Hébergement en France (OVH)</li>
      </ul>
    </LegalPageLayout>
  )
}
