import type { WorkflowTemplate } from '@/lib/workflow/types'

export const leadsTemplate: WorkflowTemplate = {
  id: 'leads',
  name: 'Qualification de leads',
  description: 'Identifie et qualifie automatiquement les prospects selon votre critères.',
  category: 'leads',
  icon: '🎯',
  nodes: [
    {
      id: 'trigger-1',
      type: 'triggerNode',
      position: { x: 300, y: 50 },
      data: {
        label: 'Nouveau contact',
        description: 'Déclenché à chaque premier message',
      },
    },
    {
      id: 'message-1',
      type: 'messageNode',
      position: { x: 300, y: 200 },
      data: {
        label: 'Message d\'accueil',
        message: 'Bonjour ! 👋 Merci de nous contacter. Pour mieux vous accompagner, j\'ai quelques questions rapides.',
      },
    },
    {
      id: 'ai-1',
      type: 'aiNode',
      position: { x: 300, y: 360 },
      data: {
        label: 'Agent Qualification',
        shortPrompt: 'Qualifie le prospect en posant 3-4 questions clés sur son besoin, son budget et son délai de décision.',
        systemPrompt: "Tu es un agent de qualification commerciale. Ton objectif est d'identifier si ce prospect correspond à notre cible. Pose des questions naturelles et conversationnelles sur : 1) Son besoin principal, 2) Son budget approximatif, 3) Son délai de décision, 4) Sa taille d'entreprise. Sois naturel, pas robotique. Note les réponses mentalement pour qualifier le lead.",
        model: 'gpt-4o-mini',
        temperature: 0.7,
        useKnowledge: false,
      },
    },
    {
      id: 'condition-1',
      type: 'conditionNode',
      position: { x: 300, y: 540 },
      data: {
        label: 'Lead qualifié ?',
        condition: 'ai_qualified',
        value: 'budget|projet|maintenant|urgent',
      },
    },
    {
      id: 'tag-1',
      type: 'tagNode',
      position: { x: 100, y: 700 },
      data: {
        label: 'Tag: Lead chaud',
        tagName: 'lead-chaud',
        action: 'add',
      },
    },
    {
      id: 'escalade-1',
      type: 'escaladeNode',
      position: { x: 100, y: 860 },
      data: {
        label: 'Transférer au commercial',
        message: 'Excellent ! Je vous mets en relation avec un de nos conseillers qui va vous contacter très rapidement 🚀',
      },
    },
    {
      id: 'tag-2',
      type: 'tagNode',
      position: { x: 500, y: 700 },
      data: {
        label: 'Tag: Lead froid',
        tagName: 'lead-froid',
        action: 'add',
      },
    },
    {
      id: 'relance-1',
      type: 'relanceNode',
      position: { x: 500, y: 860 },
      data: {
        label: 'Nurturing',
        delayHours: 72,
        maxRelances: 3,
        message: 'Bonjour ! Votre projet a-t-il évolué depuis notre dernière discussion ? Nous avons peut-être une solution qui vous correspond 😊',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'message-1', type: 'smoothstep' },
    { id: 'e2', source: 'message-1', target: 'ai-1', type: 'smoothstep' },
    { id: 'e3', source: 'ai-1', target: 'condition-1', type: 'smoothstep' },
    { id: 'e4', source: 'condition-1', target: 'tag-1', sourceHandle: 'yes', label: 'Qualifié', type: 'smoothstep' },
    { id: 'e5', source: 'tag-1', target: 'escalade-1', type: 'smoothstep' },
    { id: 'e6', source: 'condition-1', target: 'tag-2', sourceHandle: 'no', label: 'Pas encore', type: 'smoothstep' },
    { id: 'e7', source: 'tag-2', target: 'relance-1', type: 'smoothstep' },
  ],
}
