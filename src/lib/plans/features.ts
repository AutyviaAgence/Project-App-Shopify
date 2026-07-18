// =====================================================================
//  SOCLE DE GATING PAR PLAN — quelles fonctionnalités sont réservées
//
//  Fichier partagé client/serveur (aucun import Node). Une « feature » est
//  une capacité premium activée ou non selon le plan effectif du marchand.
//
//  Aujourd'hui : `multi_agents` (Pro/Scale). Extensible sans refonte — il
//  suffit d'ajouter une clé à Feature et de lister les plans qui l'ont.
//
//  Le plan effectif se résout côté serveur via getUserPlan()
//  (src/lib/shopify/plans.ts), puis on interroge hasFeature(plan, feature).
// =====================================================================

import { PLANS, type PlanId } from './index'

/** Capacités premium gérées par le gating. */
export type Feature =
  | 'multi_agents' // plusieurs agents IA (Starter = 1 seul)

/**
 * Table des features par plan. Un plan possède une feature s'il est listé ici.
 * 'free' ne possède rien (sentinelle « aucun abonnement »).
 */
export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  free: [],
  starter: [],
  pro: ['multi_agents'],
  scale: ['multi_agents'],
}

/** Ce plan a-t-il accès à cette feature ? */
export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLAN_FEATURES[plan]?.includes(feature) ?? false
}

/**
 * Libellé du plan minimum requis pour une feature (pour les messages d'upsell
 * du type « Passez au Pro pour… »). Renvoie le premier plan payant qui l'a.
 */
export function requiredPlanLabel(feature: Feature): string {
  const order: PlanId[] = ['starter', 'pro', 'scale']
  const first = order.find((p) => hasFeature(p, feature))
  return first ? PLANS[first].name : PLANS.scale.name
}
