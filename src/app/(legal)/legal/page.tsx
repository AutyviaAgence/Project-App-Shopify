'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LegalPage() {
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
          <h1>Mentions Légales</h1>

          <h2>Éditeur du site</h2>
          <p>
            Le site Autyvia (<a href="https://autyvia.fr" target="_blank" rel="noopener noreferrer">https://autyvia.fr</a>)
            et l&apos;application Autyvia sont édités par :
          </p>
          <p>
            <strong>Julian TOURAILLE-TRAN</strong><br />
            Micro-entreprise - Profession libérale<br />
            SIRET : 992 684 829 00011<br />
            SIREN : 992 684 829<br />
            Code APE : 62.02A – Conseil en systèmes et logiciels informatiques<br />
            Adresse : 778 routes des barthes<br />
            Email : <a href="mailto:autyviaagence@gmail.com">autyviaagence@gmail.com</a><br />
            Téléphone : 06 36 00 68 08
          </p>

          <h2>Directeur de la publication</h2>
          <p>Julian TOURAILLE-TRAN, en qualité de gérant.</p>

          <h2>Hébergeur</h2>
          <p>Site et application hébergés par :</p>
          <p>
            <strong>OVH SAS</strong><br />
            2 rue Kellermann, 59100 Roubaix, France<br />
            Site web : <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer">https://www.ovhcloud.com</a>
          </p>
          <p>Base de données hébergée par :</p>
          <p>
            <strong>Supabase Inc.</strong><br />
            970 Toa Payoh North #07-04, Singapore 318992<br />
            Site web : <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">https://supabase.com</a><br />
            Région des données : Europe
          </p>

          <h2>Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble du contenu du Site et de l&apos;Application (textes, images, logos, icônes, logiciels, base de données)
            est la propriété exclusive d&apos;Autyvia et est protégé par les lois françaises et internationales relatives
            à la propriété intellectuelle.
          </p>
          <p>
            Toute reproduction, représentation, modification, publication ou transmission sans autorisation préalable
            écrite est interdite et constitue une contrefaçon sanctionnée par les articles L.335-2 et suivants
            du Code de la propriété intellectuelle.
          </p>

          <h2>Données personnelles</h2>
          <p>
            Le traitement des données personnelles est décrit dans notre{' '}
            <Link href="/privacy">Politique de Confidentialité</Link>.
          </p>
          <p>
            Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, de suppression et de portabilité
            de vos données.
          </p>

          <h2>Droit applicable</h2>
          <p>
            Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux
            français seront seuls compétents.
          </p>

          <hr />
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : 04 février 2026
          </p>
        </article>

        {/* Footer links */}
        <div className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm text-muted-foreground">
          <Link href="/legal" className="hover:underline font-medium text-foreground">Mentions légales</Link>
          <Link href="/cgu" className="hover:underline">CGU</Link>
          <Link href="/cgv" className="hover:underline">CGV</Link>
          <Link href="/privacy" className="hover:underline">Politique de confidentialité</Link>
        </div>
      </div>
    </div>
  )
}
