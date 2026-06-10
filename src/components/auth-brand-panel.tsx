'use client'

import Image from 'next/image'
import { useTenant } from '@/lib/tenant/context'
import { MessageSquare, ShoppingBag, Sparkles } from 'lucide-react'

/**
 * Panneau de marque (côté gauche des écrans d'auth).
 * Dégradé Xeyo (noir → bleu) + logo + 3 arguments clés.
 * Masqué sur mobile (le formulaire prend toute la largeur).
 */
export function AuthBrandPanel() {
  const tenant = useTenant()

  const args = [
    { icon: Sparkles, title: 'IA qui répond 24/7', desc: 'Un agent intelligent qui gère vos conversations WhatsApp en continu.' },
    { icon: ShoppingBag, title: 'Connecté à Shopify', desc: 'Catalogue, commandes et SAV synchronisés automatiquement.' },
    { icon: MessageSquare, title: 'WhatsApp + Email', desc: 'Tous vos canaux clients dans un seul inbox.' },
  ]

  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Dégradé Xeyo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#365EFF] via-[#1e2a78] to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(54,94,255,0.35),transparent_55%)]" />

      {/* Logo + nom */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={28} height={28} className="h-7 w-7" />
        </div>
        <span className="text-xl font-semibold text-white">{tenant.appName}</span>
      </div>

      {/* Arguments */}
      <div className="relative space-y-6">
        <h2 className="text-3xl font-bold leading-tight text-white">
          Le support client e-commerce,<br />automatisé par l&apos;IA.
        </h2>
        <div className="space-y-4">
          {args.map((a) => {
            const Icon = a.icon
            return (
              <div key={a.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="font-medium text-white">{a.title}</div>
                  <div className="text-sm text-white/70">{a.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="relative text-xs text-white/50">
        © {tenant.appName} — Tous droits réservés.
      </div>
    </div>
  )
}
