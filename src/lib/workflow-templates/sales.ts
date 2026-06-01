import type { WorkflowTemplate } from '@/lib/workflow/types'

export const salesTemplate: WorkflowTemplate = {
  id: 'sales',
  name: 'Vente & catalogue',
  description: 'Présente vos produits, répond aux questions et guide le client vers l\'achat.',
  category: 'sales',
  icon: '🛍️',
  nodes: [
    {
      id: 'trigger-1',
      type: 'triggerNode',
      position: { x: 300, y: 50 },
      data: {
        label: 'Nouveau message',
        description: 'Déclenché à chaque message entrant',
      },
    },
    {
      id: 'ai-1',
      type: 'aiNode',
      position: { x: 300, y: 200 },
      data: {
        label: 'Agent Commercial',
        shortPrompt: 'Présente les produits, réponds aux questions sur les prix et caractéristiques, et guide vers l\'achat.',
        systemPrompt: "Tu es un conseiller commercial enthousiaste et bienveillant. Ton rôle est d'aider les clients à trouver le produit parfait pour leurs besoins. Utilise la base de connaissances pour les informations produits. Mets en valeur les bénéfices plutôt que les caractéristiques techniques. Propose des recommandations personnalisées. Si le client est prêt à acheter, guide-le vers la commande.",
        model: 'gpt-4o-mini',
        temperature: 0.7,
        useKnowledge: true,
      },
    },
    {
      id: 'condition-1',
      type: 'conditionNode',
      position: { x: 300, y: 380 },
      data: {
        label: 'Intéressé par un achat ?',
        condition: 'contains',
        value: 'commander|acheter|prix|tarif|disponible|stock',
      },
    },
    {
      id: 'media-1',
      type: 'mediaNode',
      position: { x: 100, y: 530 },
      data: {
        label: 'Catalogue produits',
        message: '📋 Voici notre catalogue complet :',
      },
    },
    {
      id: 'booking-1',
      type: 'bookingNode',
      position: { x: 500, y: 530 },
      data: {
        label: 'Demo / Devis',
        message: '🎯 Réservez une démo gratuite ou obtenez un devis personnalisé :',
      },
    },
    {
      id: 'relance-1',
      type: 'relanceNode',
      position: { x: 300, y: 700 },
      data: {
        label: 'Relance panier abandonné',
        delayHours: 24,
        maxRelances: 2,
        message: '👋 Avez-vous eu le temps de consulter nos produits ? Je suis là pour répondre à vos questions et vous trouver la meilleure offre 😊',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'ai-1', type: 'smoothstep' },
    { id: 'e2', source: 'ai-1', target: 'condition-1', type: 'smoothstep' },
    { id: 'e3', source: 'condition-1', target: 'media-1', sourceHandle: 'no', label: 'Explore', type: 'smoothstep' },
    { id: 'e4', source: 'condition-1', target: 'booking-1', sourceHandle: 'yes', label: 'Prêt à acheter', type: 'smoothstep' },
    { id: 'e5', source: 'media-1', target: 'relance-1', type: 'smoothstep' },
  ],
}
