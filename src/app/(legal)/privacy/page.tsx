import { LegalPageLayout } from '@/components/legal-page-layout'

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Politique de Confidentialité"
      description="Découvrez comment nous collectons, utilisons et protégeons vos données personnelles."
      lastUpdated="04 février 2026"
    >
      <p className="lead text-lg">
        La présente Politique de Confidentialité décrit comment Autyvia collecte, utilise, stocke et protège vos données personnelles lorsque vous utilisez notre site web et notre application.
      </p>

      <p>
        Nous nous engageons à protéger votre vie privée conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>Responsable du traitement</h2>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Julian TOURAILLE-TRAN</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Micro-entreprise Autyvia</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">SIRET : 992 684 829 00011</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">778 routes des barthes</p>
        <a href="mailto:autyviaagence@gmail.com" className="text-sm text-primary hover:underline">
          autyviaagence@gmail.com
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
        <li><strong>Messages WhatsApp</strong> : contenus des conversations traitées par nos Services</li>
        <li><strong>Contacts</strong> : numéros de téléphone et noms des contacts WhatsApp</li>
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
        <li><strong>OpenAI Inc.</strong> (USA) : traitement IA des messages</li>
        <li><strong>Stripe Inc.</strong> (USA/Europe) : traitement des paiements - Certifié PCI-DSS</li>
      </ul>

      <p><strong>Nous ne vendons jamais vos données personnelles à des tiers.</strong></p>

      <h2>Durée de conservation</h2>
      <ul>
        <li><strong>Données de compte</strong> : durée de l&apos;inscription + 3 ans après suppression</li>
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
        <li>Par email : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a></li>
        <li>Par courrier : 778 routes des barthes</li>
      </ul>
      <p>Nous répondrons dans un délai de 30 jours.</p>

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
