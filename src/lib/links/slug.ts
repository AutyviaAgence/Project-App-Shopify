import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Transforme un nom en slug URL-safe (minuscules, tirets). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Génère un slug unique pour la table wa_links à partir d'un nom (boutique,
 * instance…). Si le slug est déjà pris, ajoute un suffixe aléatoire court.
 * Fallback aléatoire si le nom ne produit aucun slug valide.
 */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  name: string | null | undefined
): Promise<string> {
  const base = slugify(name || '') || randomBytes(4).toString('hex')

  // Le slug de base est-il libre ?
  const { data: existing } = await supabase
    .from('wa_links')
    .select('id')
    .eq('slug', base)
    .maybeSingle()
  if (!existing) return base

  // Sinon, on tente quelques suffixes courts.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomBytes(2).toString('hex')}`
    const { data: taken } = await supabase
      .from('wa_links')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!taken) return candidate
  }
  // Dernier recours
  return `${base}-${randomBytes(4).toString('hex')}`
}
