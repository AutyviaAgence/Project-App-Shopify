import { LegalPageLayout } from '@/components/legal-page-layout'

export default function LegalPage() {
  return (
    <LegalPageLayout
      title="Mentions Légales"
      description="Informations légales concernant l'éditeur du site et de l'application Xeyo."
      lastUpdated="04 février 2026"
    >
      <h2>Éditeur du site</h2>
      <p>
        Le site Xeyo (<a href="https://autyvia.fr" target="_blank" rel="noopener noreferrer">autyvia.fr</a>) et l&apos;application Xeyo sont édités par :
      </p>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Julian TOURAILLE-TRAN</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Micro-entreprise - Profession libérale</p>
        <div className="mt-3 grid gap-1 text-sm text-slate-600 dark:text-slate-400">
          <p><strong>SIRET :</strong> 992 684 829 00011</p>
          <p><strong>SIREN :</strong> 992 684 829</p>
          <p><strong>Code APE :</strong> 62.02A – Conseil en systèmes et logiciels informatiques</p>
          <p><strong>Adresse :</strong> 778 routes des barthes</p>
          <p><strong>Email :</strong> <a href="mailto:contact@autyvia.fr" className="text-primary hover:underline">contact@autyvia.fr</a></p>
          <p><strong>Téléphone :</strong> <a href="tel:+33636006808" className="text-primary hover:underline">06 36 00 68 08</a></p>
        </div>
      </div>

      <h2>Directeur de la publication</h2>
      <p>Julian TOURAILLE-TRAN, en qualité de gérant.</p>

      <h2>Hébergeur</h2>
      <h3>Site et application</h3>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">OVH SAS</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">2 rue Kellermann, 59100 Roubaix, France</p>
        <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          www.ovhcloud.com
        </a>
      </div>

      <h3>Base de données</h3>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Supabase Inc.</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">970 Toa Payoh North #07-04, Singapore 318992</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Région des données : Europe</p>
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          supabase.com
        </a>
      </div>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble du contenu du Site et de l&apos;Application (textes, images, logos, icônes, logiciels, base de données) est la propriété exclusive d&apos;Xeyo et est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.
      </p>
      <p>
        Toute reproduction, représentation, modification, publication ou transmission sans autorisation préalable écrite est interdite et constitue une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la propriété intellectuelle.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans notre <a href="/privacy">Politique de Confidentialité</a>.
      </p>
      <p>
        Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, de suppression et de portabilité de vos données.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux français seront seuls compétents.
      </p>
    </LegalPageLayout>
  )
}
