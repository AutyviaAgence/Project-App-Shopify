'use client'

import Image from 'next/image'
import { useTenant } from '@/lib/tenant/context'

/**
 * Panneau de marque (côté gauche des écrans d'auth).
 * Dégradé Xeyo (noir → bleu) + logo + 3 arguments clés.
 * Masqué sur mobile (le formulaire prend toute la largeur).
 */
export function AuthBrandPanel() {
  const tenant = useTenant()

  return (
    // Cadre dégradé : marge autour, coins arrondis (pas plein bord)
    <div className="hidden p-3 lg:block">
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-12">
        {/* Dégradé Xeyo */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#365EFF] via-[#1e2a78] to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(54,94,255,0.4),transparent_55%)]" />

        {/* Logo + nom */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={28} height={28} className="h-7 w-7" />
          </div>
          <span className="text-xl font-semibold text-white">{tenant.appName}</span>
        </div>

        {/* Accroche (sans encadrés) */}
        <div className="relative space-y-3">
          <h2 className="text-4xl font-bold leading-tight text-white">
            Le support client e-commerce,<br />automatisé par l&apos;IA.
          </h2>
          <p className="max-w-sm text-white/70">
            WhatsApp, Email et Shopify réunis. Un agent qui répond à vos clients 24/7.
          </p>
        </div>

        <div className="relative text-xs text-white/50">
          © {tenant.appName} — Tous droits réservés.
        </div>
      </div>
    </div>
  )
}
