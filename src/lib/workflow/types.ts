import type { Node, Edge } from '@xyflow/react'

// ─── Types de blocs disponibles ───────────────────────────────────────────────

export type WorkflowNodeType =
  | 'triggerNode'
  | 'aiNode'
  | 'messageNode'
  | 'mediaNode'
  | 'conditionNode'
  | 'relanceNode'
  | 'escaladeNode'
  | 'bookingNode'
  | 'tagNode'
  | 'stopNode'

// ─── Data par type de bloc ─────────────────────────────────────────────────────

export interface TriggerNodeData {
  label: string
  description?: string
}

export interface AiNodeData {
  label: string
  shortPrompt: string         // Affiché dans l'UI simple
  systemPrompt: string        // Prompt complet (section Avancé)
  model: string
  temperature: number
  useKnowledge: boolean
  useBookingLink?: boolean
}

export interface MessageNodeData {
  label: string
  message: string
}

export interface MediaNodeData {
  label: string
  message?: string
  imageRef?: string            // ref de knowledge_images
}

export interface ConditionNodeData {
  label: string
  condition: 'contains' | 'ai_qualified' | 'tag_has' | 'no_reply'
  value: string
}

export interface RelanceNodeData {
  label: string
  delayHours: number
  maxRelances: number
  message: string
}

export interface EscaladeNodeData {
  label: string
  message: string
}

export interface BookingNodeData {
  label: string
  message?: string
}

export interface TagNodeData {
  label: string
  tagName: string
  action: 'add' | 'remove'
}

export interface StopNodeData {
  label: string
}

// ─── Union type pour les données de nœuds ─────────────────────────────────────

export type WorkflowNodeData =
  | TriggerNodeData
  | AiNodeData
  | MessageNodeData
  | MediaNodeData
  | ConditionNodeData
  | RelanceNodeData
  | EscaladeNodeData
  | BookingNodeData
  | TagNodeData
  | StopNodeData

// ─── Nœud typé React Flow ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkflowNode = Node<any, WorkflowNodeType>
export type WorkflowEdge = Edge

// ─── Template de workflow ──────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'support' | 'booking' | 'leads' | 'sales' | 'general'
  icon: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ─── Workflow sauvegardé en DB ─────────────────────────────────────────────────

export interface AgentWorkflow {
  id: string
  agent_id: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  created_at: string
  updated_at: string
}

// ─── Config des types de blocs (pour la palette) ──────────────────────────────

export interface NodeTypeConfig {
  type: WorkflowNodeType
  label: string
  description: string
  iconName: string    // nom de l'icône Lucide
  color: string       // classe Tailwind bg-*
  borderColor: string // classe Tailwind border-*
  iconColor: string   // classe Tailwind text-*
  canHaveMultiple: boolean
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: 'triggerNode',
    label: 'Déclencheur',
    description: 'Point d\'entrée du workflow',
    iconName: 'Zap',
    color: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500',
    iconColor: 'text-emerald-600',
    canHaveMultiple: false,
  },
  {
    type: 'aiNode',
    label: 'Agent IA',
    description: 'Répond intelligemment avec l\'IA',
    iconName: 'Bot',
    color: 'bg-violet-500/10',
    borderColor: 'border-violet-500',
    iconColor: 'text-violet-600',
    canHaveMultiple: true,
  },
  {
    type: 'messageNode',
    label: 'Message fixe',
    description: 'Envoie un texte statique',
    iconName: 'MessageSquare',
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
    iconColor: 'text-blue-600',
    canHaveMultiple: true,
  },
  {
    type: 'mediaNode',
    label: 'Image / Média',
    description: 'Envoie une image ou un document',
    iconName: 'Image',
    color: 'bg-orange-500/10',
    borderColor: 'border-orange-500',
    iconColor: 'text-orange-600',
    canHaveMultiple: true,
  },
  {
    type: 'conditionNode',
    label: 'Condition',
    description: 'Branche le flux selon une règle',
    iconName: 'GitBranch',
    color: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500',
    iconColor: 'text-yellow-600',
    canHaveMultiple: true,
  },
  {
    type: 'relanceNode',
    label: 'Relance',
    description: 'Message auto après silence',
    iconName: 'Clock',
    color: 'bg-amber-500/10',
    borderColor: 'border-amber-500',
    iconColor: 'text-amber-600',
    canHaveMultiple: true,
  },
  {
    type: 'escaladeNode',
    label: 'Escalade humaine',
    description: 'Transfère à un agent humain',
    iconName: 'UserCheck',
    color: 'bg-rose-500/10',
    borderColor: 'border-rose-500',
    iconColor: 'text-rose-600',
    canHaveMultiple: true,
  },
  {
    type: 'bookingNode',
    label: 'Rendez-vous',
    description: 'Propose un lien de réservation',
    iconName: 'CalendarCheck',
    color: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500',
    iconColor: 'text-cyan-600',
    canHaveMultiple: true,
  },
  {
    type: 'tagNode',
    label: 'Tag contact',
    description: 'Ajoute ou retire un tag',
    iconName: 'Tag',
    color: 'bg-pink-500/10',
    borderColor: 'border-pink-500',
    iconColor: 'text-pink-600',
    canHaveMultiple: true,
  },
  {
    type: 'stopNode',
    label: 'Stop',
    description: 'Fin du workflow',
    iconName: 'OctagonX',
    color: 'bg-slate-500/10',
    borderColor: 'border-slate-500',
    iconColor: 'text-slate-500',
    canHaveMultiple: false,
  },
]
