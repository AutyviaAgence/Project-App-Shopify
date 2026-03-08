import { cookies } from 'next/headers'
import { DEFAULT_TENANT, type TenantConfig } from './types'

/** Read tenant config from the x-tenant cookie (server-side) */
export async function getTenantFromCookies(): Promise<TenantConfig> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('x-tenant')?.value
    if (!raw) return DEFAULT_TENANT
    const parsed = JSON.parse(decodeURIComponent(raw)) as TenantConfig
    return parsed.slug ? parsed : DEFAULT_TENANT
  } catch {
    return DEFAULT_TENANT
  }
}
