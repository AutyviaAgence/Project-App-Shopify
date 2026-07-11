export type ThemePalette = {
  primary?: string
  accent?: string
  sidebar?: string
  background?: string
  foreground?: string
  card?: string
  muted?: string
  border?: string
}

export type ThemeConfig = {
  light?: ThemePalette
  dark?: ThemePalette
}

export type TenantConfig = {
  id: string
  slug: string
  appName: string
  logoUrl: string
  faviconUrl: string | null
  primaryColor: string
  accentColor: string
  sidebarColor: string
  bgColor: string | null
  textColor: string | null
  supportEmail: string | null
  themeConfig: ThemeConfig | null
}

export const DEFAULT_TENANT: TenantConfig = {
  id: '',
  slug: 'xeyo',
  appName: 'Xeyo',
  logoUrl: '/xeyo-logo.png',
  faviconUrl: null,
  // Bleu Xeyo (aligné sur theme_config du tenant en base) — évite un flash de
  // couleur verte héritée d'Autyvia au chargement, avant l application du thème.
  primaryColor: '#3B82F6',
  accentColor: '#3B82F6',
  // Palette « Xeyo dark » (style Framer) : sidebar quasi-noire. On laisse
  // bgColor/textColor à null pour que globals.css (.dark) reste la source de
  // vérité des fonds/bordures (sinon adjustColor éclaircirait les cartes).
  sidebarColor: '#0a0a0c',
  bgColor: null,
  textColor: null,
  supportEmail: null,
  themeConfig: null,
}
