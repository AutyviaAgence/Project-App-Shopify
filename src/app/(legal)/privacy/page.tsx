import { LegalPageLayout } from '@/components/legal-page-layout'

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Politique de Confidentialit\u00e9"
      description="D\u00e9couvrez comment nous collectons, utilisons et prot\u00e9geons vos donn\u00e9es personnelles."
      lastUpdated="04 f\u00e9vrier 2026"
    >
      <p className="lead text-lg">
        La pr\u00e9sente Politique de Confidentialit\u00e9 d\u00e9crit comment Autyvia collecte, utilise, stocke et prot\u00e8ge vos donn\u00e9es personnelles lorsque vous utilisez notre site web et notre application.
      </p>

      <p>
        Nous nous engageons \u00e0 prot\u00e9ger votre vie priv\u00e9e conform\u00e9ment au R\u00e8glement G\u00e9n\u00e9ral sur la Protection des Donn\u00e9es (RGPD) et \u00e0 la loi Informatique et Libert\u00e9s.
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

      <h2>Donn\u00e9es collect\u00e9es</h2>

      <h3>Donn\u00e9es que vous nous fournissez</h3>
      <ul>
        <li><strong>Donn\u00e9es d&apos;identification</strong> : nom, pr\u00e9nom, adresse email</li>
        <li><strong>Donn\u00e9es de connexion</strong> : mot de passe (chiffr\u00e9)</li>
        <li><strong>Donn\u00e9es de profil</strong> : avatar, fuseau horaire, pr\u00e9f\u00e9rences</li>
        <li><strong>Donn\u00e9es de facturation</strong> : adresse, informations de paiement</li>
      </ul>

      <h3>Donn\u00e9es collect\u00e9es automatiquement</h3>
      <ul>
        <li><strong>Donn\u00e9es techniques</strong> : adresse IP, type de navigateur, syst\u00e8me d&apos;exploitation</li>
        <li><strong>Donn\u00e9es d&apos;utilisation</strong> : pages visit\u00e9es, fonctionnalit\u00e9s utilis\u00e9es, horodatages</li>
        <li>Cookies et technologies similaires</li>
      </ul>

      <h3>Donn\u00e9es li\u00e9es \u00e0 l&apos;utilisation du service</h3>
      <ul>
        <li><strong>Messages WhatsApp</strong> : contenus des conversations trait\u00e9es par nos Services</li>
        <li><strong>Contacts</strong> : num\u00e9ros de t\u00e9l\u00e9phone et noms des contacts WhatsApp</li>
        <li><strong>Documents</strong> : fichiers upload\u00e9s dans la base de connaissances</li>
        <li><strong>Configurations</strong> : param\u00e8tres des agents IA, prompts, horaires</li>
      </ul>

      <h2>Finalit\u00e9s du traitement</h2>
      <p>Nous utilisons vos donn\u00e9es personnelles pour :</p>
      <ul>
        <li>Fournir et maintenir nos Services</li>
        <li>G\u00e9rer votre compte utilisateur</li>
        <li>Traiter vos paiements</li>
        <li>R\u00e9pondre automatiquement \u00e0 vos messages WhatsApp via l&apos;IA</li>
        <li>Am\u00e9liorer et personnaliser nos Services</li>
        <li>Vous envoyer des communications relatives \u00e0 votre compte</li>
        <li>Assurer la s\u00e9curit\u00e9 de nos Services</li>
        <li>Respecter nos obligations l\u00e9gales</li>
      </ul>

      <h2>Bases l\u00e9gales du traitement</h2>
      <ul>
        <li><strong>Ex\u00e9cution du contrat</strong> : pour fournir nos Services</li>
        <li><strong>Consentement</strong> : pour les communications marketing</li>
        <li><strong>Int\u00e9r\u00eat l\u00e9gitime</strong> : pour am\u00e9liorer nos Services et assurer leur s\u00e9curit\u00e9</li>
        <li><strong>Obligation l\u00e9gale</strong> : pour respecter nos obligations comptables et fiscales</li>
      </ul>

      <h2>Traitement par intelligence artificielle</h2>
      <p>
        Nos Services utilisent l&apos;intelligence artificielle (OpenAI GPT-4) pour g\u00e9n\u00e9rer des r\u00e9ponses automatiques \u00e0 vos messages WhatsApp.
      </p>

      <div className="not-prose my-4 rounded-lg border-l-4 border-primary bg-primary/5 p-4">
        <p className="font-medium text-slate-900 dark:text-white">Garanties importantes</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>\u2022 OpenAI ne conserve pas vos donn\u00e9es au-del\u00e0 du traitement</li>
          <li>\u2022 Vos donn\u00e9es ne sont PAS utilis\u00e9es pour entra\u00eener les mod\u00e8les d&apos;IA</li>
          <li>\u2022 Les \u00e9changes sont chiffr\u00e9s en transit (TLS) et au repos (AES-256)</li>
        </ul>
      </div>

      <h2>Sous-traitants et h\u00e9bergement</h2>

      <h3>H\u00e9bergement (Europe)</h3>
      <ul>
        <li><strong>OVH SAS</strong> (France) : h\u00e9bergement du serveur applicatif</li>
        <li><strong>Supabase Inc.</strong> (R\u00e9gion Europe) : base de donn\u00e9es PostgreSQL</li>
      </ul>

      <h3>Services tiers</h3>
      <ul>
        <li><strong>OpenAI Inc.</strong> (USA) : traitement IA des messages</li>
        <li><strong>Stripe Inc.</strong> (USA/Europe) : traitement des paiements - Certifi\u00e9 PCI-DSS</li>
      </ul>

      <p><strong>Nous ne vendons jamais vos donn\u00e9es personnelles \u00e0 des tiers.</strong></p>

      <h2>Dur\u00e9e de conservation</h2>
      <ul>
        <li><strong>Donn\u00e9es de compte</strong> : dur\u00e9e de l&apos;inscription + 3 ans apr\u00e8s suppression</li>
        <li><strong>Messages WhatsApp</strong> : 2 ans \u00e0 compter de leur r\u00e9ception</li>
        <li><strong>Documents upload\u00e9s</strong> : jusqu&apos;\u00e0 suppression par l&apos;utilisateur + 30 jours</li>
        <li><strong>Logs techniques</strong> : 6 mois</li>
        <li><strong>Donn\u00e9es de facturation</strong> : 10 ans (obligation l\u00e9gale)</li>
      </ul>

      <h2>Vos droits</h2>
      <p>Conform\u00e9ment au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;acc\u00e8s</strong> : obtenir une copie de vos donn\u00e9es</li>
        <li><strong>Droit de rectification</strong> : corriger vos donn\u00e9es inexactes</li>
        <li><strong>Droit \u00e0 l&apos;effacement</strong> : supprimer vos donn\u00e9es</li>
        <li><strong>Droit \u00e0 la limitation</strong> : restreindre le traitement</li>
        <li><strong>Droit \u00e0 la portabilit\u00e9</strong> : recevoir vos donn\u00e9es dans un format structur\u00e9</li>
        <li><strong>Droit d&apos;opposition</strong> : vous opposer au traitement</li>
        <li><strong>Droit de retirer votre consentement</strong> : \u00e0 tout moment</li>
      </ul>

      <h3>Exercer vos droits</h3>
      <ul>
        <li>Depuis votre compte : Param\u00e8tres &gt; Donn\u00e9es personnelles</li>
        <li>Par email : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a></li>
        <li>Par courrier : 778 routes des barthes</li>
      </ul>
      <p>Nous r\u00e9pondrons dans un d\u00e9lai de 30 jours.</p>

      <h3>R\u00e9clamation CNIL</h3>
      <p>Si vous estimez que vos droits ne sont pas respect\u00e9s :</p>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Commission Nationale de l&apos;Informatique et des Libert\u00e9s</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07</p>
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          www.cnil.fr
        </a>
      </div>

      <h2>S\u00e9curit\u00e9 des donn\u00e9es</h2>
      <ul>
        <li>Chiffrement des donn\u00e9es en transit (TLS 1.3) et au repos (AES-256)</li>
        <li>Authentification s\u00e9curis\u00e9e avec hachage des mots de passe</li>
        <li>Contr\u00f4le d&apos;acc\u00e8s strict aux donn\u00e9es</li>
        <li>Surveillance et journalisation des acc\u00e8s</li>
        <li>Sauvegardes r\u00e9guli\u00e8res</li>
        <li>H\u00e9bergement en France (OVH)</li>
      </ul>
    </LegalPageLayout>
  )
}
