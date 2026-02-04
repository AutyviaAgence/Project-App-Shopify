'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PrivacyPage() {
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
          <h1>Politique de Confidentialité</h1>

          <p className="lead">
            La présente Politique de Confidentialité décrit comment Autyvia (ci-après « nous », « notre » ou « Autyvia »)
            collecte, utilise, stocke et protège vos données personnelles lorsque vous utilisez notre site web autyvia.fr
            et notre application.
          </p>

          <p>
            Nous nous engageons à protéger votre vie privée conformément au Règlement Général sur la Protection des Données
            (RGPD) et à la loi Informatique et Libertés.
          </p>

          <h2>Responsable du traitement</h2>
          <p>
            <strong>Julian TOURAILLE-TRAN</strong><br />
            Micro-entreprise Autyvia<br />
            SIRET : 992 684 829 00011<br />
            Adresse : 778 routes des barthes<br />
            Email : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>
          </p>

          <h2>Délégué à la Protection des Données (DPO)</h2>
          <p>
            Autyvia n&apos;a pas désigné de Délégué à la Protection des Données, cette désignation n&apos;étant pas obligatoire
            pour les micro-entreprises ne traitant pas de données sensibles à grande échelle.
          </p>
          <p>
            Pour toute question relative à la protection de vos données, vous pouvez contacter directement le responsable
            du traitement : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a>
          </p>

          <h2>Registre des traitements</h2>
          <p>
            Conformément à l&apos;article 30 du RGPD, Autyvia tient un registre des activités de traitement.
            Ce registre est disponible sur demande auprès du responsable du traitement.
          </p>

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
            <li><strong>Données de connexion</strong> : adresse IP, type de navigateur, système d&apos;exploitation</li>
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
            <li>Répondre automatiquement à vos messages WhatsApp via l&apos;intelligence artificielle</li>
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
            Nos Services utilisent l&apos;intelligence artificielle (OpenAI GPT-4) pour générer des réponses
            automatiques à vos messages WhatsApp.
          </p>

          <h3>Fonctionnement</h3>
          <ul>
            <li>Les messages reçus sur votre WhatsApp sont transmis de manière sécurisée à l&apos;API OpenAI</li>
            <li>L&apos;IA génère une réponse basée sur vos paramètres et votre base de connaissances</li>
            <li>La réponse est envoyée au destinataire via WhatsApp</li>
          </ul>

          <h3>Garanties</h3>
          <ul>
            <li>OpenAI ne conserve pas vos données au-delà du traitement de la requête</li>
            <li>Vos données ne sont PAS utilisées pour entraîner les modèles d&apos;IA</li>
            <li>Les échanges sont chiffrés en transit (TLS) et au repos (AES-256)</li>
          </ul>
          <p>
            Pour plus d&apos;informations : <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">https://openai.com/policies/privacy-policy</a>
          </p>

          <h2>Sous-traitants et destinataires des données</h2>
          <p>
            Vos données peuvent être partagées avec les sous-traitants suivants, avec lesquels nous avons conclu
            des accords de traitement des données (DPA) :
          </p>

          <h3>Hébergement et stockage (Europe)</h3>
          <ul>
            <li><strong>OVH SAS</strong> (France, Roubaix) : hébergement du serveur applicatif - DPA signé - Données en France</li>
            <li><strong>Supabase Inc.</strong> (Région Europe) : base de données PostgreSQL - DPA signé - Données en Europe (eu-west)</li>
          </ul>

          <h3>Services tiers</h3>
          <ul>
            <li><strong>OpenAI Inc.</strong> (USA) : traitement IA des messages - DPA signé - Données non conservées, non utilisées pour l&apos;entraînement</li>
            <li><strong>Stripe Inc.</strong> (USA/Europe) : traitement des paiements - DPA signé - Certifié PCI-DSS</li>
          </ul>

          <h3>Autres destinataires</h3>
          <ul>
            <li><strong>Autorités compétentes</strong> : uniquement si requis par la loi</li>
          </ul>
          <p>
            <strong>Nous ne vendons jamais vos données personnelles à des tiers.</strong>
          </p>
          <p>
            Vos données principales (compte, conversations, documents) sont stockées exclusivement en France (OVH)
            et en Europe (Supabase). Seul le traitement IA transite temporairement vers les serveurs OpenAI.
          </p>

          <h2>Transferts hors UE</h2>
          <p>
            Certains de nos sous-traitants sont situés aux États-Unis (OpenAI, Stripe). Ces transferts sont encadrés par :
          </p>
          <ul>
            <li>Les Clauses Contractuelles Types (CCT) de la Commission Européenne</li>
            <li>Le Data Privacy Framework UE-États-Unis (certification Stripe et OpenAI)</li>
            <li>Des mesures de sécurité supplémentaires (chiffrement, minimisation des données)</li>
          </ul>
          <p>Vos données principales restent stockées en France et en Europe.</p>

          <h2>Durée de conservation</h2>
          <ul>
            <li><strong>Données de compte</strong> : durée de l&apos;inscription + 3 ans après suppression</li>
            <li><strong>Messages WhatsApp</strong> : 2 ans à compter de leur réception</li>
            <li><strong>Documents uploadés</strong> : jusqu&apos;à suppression par l&apos;utilisateur + 30 jours</li>
            <li><strong>Logs techniques</strong> : 6 mois</li>
            <li><strong>Données de facturation</strong> : 10 ans (obligation légale)</li>
          </ul>
          <p>
            Après suppression de votre compte, vos données sont anonymisées ou supprimées dans un délai de 30 jours.
          </p>

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
          <p>
            Commission Nationale de l&apos;Informatique et des Libertés<br />
            3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07<br />
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">https://www.cnil.fr</a>
          </p>

          <h2>Sécurité des données</h2>
          <ul>
            <li>Chiffrement des données en transit (TLS 1.3) et au repos (AES-256)</li>
            <li>Authentification sécurisée avec hachage des mots de passe</li>
            <li>Contrôle d&apos;accès strict aux données</li>
            <li>Surveillance et journalisation des accès</li>
            <li>Sauvegardes régulières</li>
            <li>Hébergement en France (OVH)</li>
          </ul>

          <h2>Contact</h2>
          <p>Pour toute question concernant vos données personnelles :</p>
          <p>
            Email : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a><br />
            Adresse : 778 routes des barthes
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
          <Link href="/cgv" className="hover:underline">CGV</Link>
          <Link href="/privacy" className="hover:underline font-medium text-foreground">Politique de confidentialité</Link>
        </div>
      </div>
    </div>
  )
}
