import { LegalPageLayout } from '@/components/legal-page-layout'

export default function LegalPage() {
  return (
    <LegalPageLayout
      title="Mentions L\u00e9gales"
      description="Informations l\u00e9gales concernant l&apos;\u00e9diteur du site et de l&apos;application Autyvia."
      lastUpdated="04 f\u00e9vrier 2026"
    >
      <h2>\u00c9diteur du site</h2>
      <p>
        Le site Autyvia (<a href="https://autyvia.fr" target="_blank" rel="noopener noreferrer">autyvia.fr</a>) et l&apos;application Autyvia sont \u00e9dit\u00e9s par :
      </p>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Julian TOURAILLE-TRAN</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Micro-entreprise - Profession lib\u00e9rale</p>
        <div className="mt-3 grid gap-1 text-sm text-slate-600 dark:text-slate-400">
          <p><strong>SIRET :</strong> 992 684 829 00011</p>
          <p><strong>SIREN :</strong> 992 684 829</p>
          <p><strong>Code APE :</strong> 62.02A \u2013 Conseil en syst\u00e8mes et logiciels informatiques</p>
          <p><strong>Adresse :</strong> 778 routes des barthes</p>
          <p><strong>Email :</strong> <a href="mailto:autyviaagence@gmail.com" className="text-primary hover:underline">autyviaagence@gmail.com</a></p>
          <p><strong>T\u00e9l\u00e9phone :</strong> <a href="tel:+33636006808" className="text-primary hover:underline">06 36 00 68 08</a></p>
        </div>
      </div>

      <h2>Directeur de la publication</h2>
      <p>Julian TOURAILLE-TRAN, en qualit\u00e9 de g\u00e9rant.</p>

      <h2>H\u00e9bergeur</h2>
      <h3>Site et application</h3>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">OVH SAS</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">2 rue Kellermann, 59100 Roubaix, France</p>
        <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          www.ovhcloud.com
        </a>
      </div>

      <h3>Base de donn\u00e9es</h3>
      <div className="not-prose rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
        <p className="font-semibold text-slate-900 dark:text-white">Supabase Inc.</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">970 Toa Payoh North #07-04, Singapore 318992</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">R\u00e9gion des donn\u00e9es : Europe</p>
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          supabase.com
        </a>
      </div>

      <h2>Propri\u00e9t\u00e9 intellectuelle</h2>
      <p>
        L&apos;ensemble du contenu du Site et de l&apos;Application (textes, images, logos, ic\u00f4nes, logiciels, base de donn\u00e9es) est la propri\u00e9t\u00e9 exclusive d&apos;Autyvia et est prot\u00e9g\u00e9 par les lois fran\u00e7aises et internationales relatives \u00e0 la propri\u00e9t\u00e9 intellectuelle.
      </p>
      <p>
        Toute reproduction, repr\u00e9sentation, modification, publication ou transmission sans autorisation pr\u00e9alable \u00e9crite est interdite et constitue une contrefa\u00e7on sanctionn\u00e9e par les articles L.335-2 et suivants du Code de la propri\u00e9t\u00e9 intellectuelle.
      </p>

      <h2>Donn\u00e9es personnelles</h2>
      <p>
        Le traitement des donn\u00e9es personnelles est d\u00e9crit dans notre <a href="/privacy">Politique de Confidentialit\u00e9</a>.
      </p>
      <p>
        Conform\u00e9ment au RGPD, vous disposez d&apos;un droit d&apos;acc\u00e8s, de rectification, de suppression et de portabilit\u00e9 de vos donn\u00e9es.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les pr\u00e9sentes mentions l\u00e9gales sont r\u00e9gies par le droit fran\u00e7ais. En cas de litige, les tribunaux fran\u00e7ais seront seuls comp\u00e9tents.
      </p>
    </LegalPageLayout>
  )
}
