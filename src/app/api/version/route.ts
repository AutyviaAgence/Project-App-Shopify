import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * GET /api/version
 * Expose le commit déployé + l'horodatage de build, pour vérifier rapidement
 * QUELLE version tourne réellement en prod (utile quand un déploiement Dokploy
 * semble ne pas prendre le dernier commit).
 *
 * Lit public/version.json, écrit au build (Dockerfile). Tu peux aussi ouvrir
 * directement https://app.xeyo.io/version.json (fichier statique).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  let build: { commit?: string; builtAt?: string } = {}
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'version.json'), 'utf8')
    build = JSON.parse(raw)
  } catch {
    build = { commit: 'unknown', builtAt: 'unknown' }
  }

  return NextResponse.json({
    commit: build.commit || 'unknown',
    builtAt: build.builtAt || 'unknown',
    // Marqueur des fonctionnalités récentes (présentes = cette version les a).
    features: {
      refundLineItemsFix: true,   // fix remboursement total (articles) — 012bc2b
      refundMethodForm: true,     // formulaire motif/montant/méthode — 21347f0
      clickableTags: true,        // étapes cliquables dans la liste — 38f4278
    },
  })
}
