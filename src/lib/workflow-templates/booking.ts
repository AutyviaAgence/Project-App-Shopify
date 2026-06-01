import type { WorkflowTemplate } from '@/lib/workflow/types'

export const bookingTemplate: WorkflowTemplate = {
  id: 'booking',
  name: 'Prise de rendez-vous',
  description: 'Qualifie le besoin du client et propose un créneau de rendez-vous automatiquement.',
  category: 'booking',
  icon: '📅',
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
        label: 'Agent RDV',
        shortPrompt: 'Aide le client à prendre un rendez-vous. Demande son besoin, ses disponibilités, et propose le lien de réservation.',
        systemPrompt: "Tu es un assistant spécialisé dans la prise de rendez-vous. Accueille chaleureusement le client, identifie son besoin en 1-2 questions, et propose-lui de réserver directement un créneau via le lien de réservation. Sois enthousiaste et efficace.",
        model: 'gpt-4o-mini',
        temperature: 0.6,
        useKnowledge: false,
        useBookingLink: true,
      },
    },
    {
      id: 'booking-1',
      type: 'bookingNode',
      position: { x: 300, y: 380 },
      data: {
        label: 'Lien de réservation',
        message: '📅 Réservez votre créneau directement ici :',
      },
    },
    {
      id: 'relance-1',
      type: 'relanceNode',
      position: { x: 300, y: 530 },
      data: {
        label: 'Relance si pas réservé',
        delayHours: 48,
        maxRelances: 2,
        message: 'Bonjour ! Avez-vous pu prendre votre rendez-vous ? Je suis là si vous avez besoin d\'aide 😊',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'ai-1', type: 'smoothstep' },
    { id: 'e2', source: 'ai-1', target: 'booking-1', type: 'smoothstep' },
    { id: 'e3', source: 'booking-1', target: 'relance-1', type: 'smoothstep' },
  ],
}
