export { supportTemplate } from './support'
export { bookingTemplate } from './booking'
export { leadsTemplate } from './leads'
export { salesTemplate } from './sales'

export const ALL_TEMPLATES = [
  () => import('./support').then(m => m.supportTemplate),
  () => import('./booking').then(m => m.bookingTemplate),
  () => import('./leads').then(m => m.leadsTemplate),
  () => import('./sales').then(m => m.salesTemplate),
]
