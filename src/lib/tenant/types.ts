export type TenantConfig = {
  id: string
  slug: string
  appName: string
  logoUrl: string
  faviconUrl: string | null
  primaryColor: string
  accentColor: string
  sidebarColor: string
  supportEmail: string | null
}

export const DEFAULT_TENANT: TenantConfig = {
  id: '',
  slug: 'autyvia',
  appName: 'Autyvia',
  logoUrl: '/logo.svg',
  faviconUrl: null,
  primaryColor: '#7DC2A5',
  accentColor: '#40E9BE',
  sidebarColor: '#2D3E48',
  supportEmail: null,
}
