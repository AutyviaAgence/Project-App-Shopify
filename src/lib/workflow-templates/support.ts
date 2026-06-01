import type { WorkflowTemplate } from '@/lib/workflow/types'

export const supportTemplate: WorkflowTemplate = {
  id: 'support',
  name: 'Support client FAQ',
  description: 'Répond automatiquement aux questions fréquentes de vos clients 24h/24.',
  category: 'support',
  icon: '🎧',
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
        label: 'Agent Support',
        shortPrompt: 'Réponds aux questions fréquentes de manière claire et professionnelle. Si tu ne connais pas la réponse, propose de transférer à un humain.',
        systemPrompt: "Tu es un agent de support client professionnel. Réponds aux questions des clients de manière claire, concise et bienveillante. Utilise la base de connaissances pour répondre précisément. Si une question dépasse tes capacités, informe le client que tu vas le transférer à un conseiller humain.",
        model: 'gpt-4o-mini',
        temperature: 0.5,
        useKnowledge: true,
      },
    },
    {
      id: 'condition-1',
      type: 'conditionNode',
      position: { x: 300, y: 380 },
      data: {
        label: 'Escalade demandée ?',
        condition: 'contains',
        value: 'humain|conseiller|parler à quelqu\'un|agent',
      },
    },
    {
      id: 'escalade-1',
      type: 'escaladeNode',
      position: { x: 500, y: 530 },
      data: {
        label: 'Transférer à un humain',
        message: "Je vous transfère immédiatement à l'un de nos conseillers. Un instant s'il vous plaît 🙏",
      },
    },
    {
      id: 'relance-1',
      type: 'relanceNode',
      position: { x: 100, y: 530 },
      data: {
        label: 'Relance satisfaction',
        delayHours: 24,
        maxRelances: 1,
        message: "Bonjour ! Avez-vous obtenu réponse à votre question ? N'hésitez pas si vous avez besoin d'autre chose 😊",
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'ai-1', type: 'smoothstep' },
    { id: 'e2', source: 'ai-1', target: 'condition-1', type: 'smoothstep' },
    { id: 'e3', source: 'condition-1', target: 'escalade-1', sourceHandle: 'yes', label: 'Oui', type: 'smoothstep' },
    { id: 'e4', source: 'condition-1', target: 'relance-1', sourceHandle: 'no', label: 'Non', type: 'smoothstep' },
  ],
}
