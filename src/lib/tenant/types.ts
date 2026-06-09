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
  logoUrl: '/logo-xeyo.svg',
  faviconUrl: null,
  primaryColor: '#7DC2A5',
  accentColor: '#40E9BE',
  sidebarColor: '#2D3E48',
  bgColor: null,
  textColor: null,
  supportEmail: null,
  themeConfig: null,
}
