'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap, Clock, GitBranch, MessageSquare, FlaskConical, Reply } from 'lucide-react'
import type { WhatsAppTemplate, TemplateButton } from '@/types/database'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS } from './field-labels'
import { buttonBranch, variantBranch, type WorkflowNode } from '@/lib/automations/graph-types'

/**
 * Nœuds custom du canvas horizontal React Flow (campagnes marketing).
 *
 * Chaque nœud porte un handle CIBLE à gauche (sauf le trigger) et un ou
 * plusieurs handles SOURCE à droite. L'`id` du handle = la BRANCHE de l'arête
 * (`yes`/`no`, `variant:X`, `button:<libellé>`) → onConnect recrée la bonne
 * WorkflowEdge.
 *
 * ⚠️ Gardes défensives : `data.node` peut arriver undefined au premier rendu ;
 * on ne fait JAMAIS `node.type` sans garde (une exception ferait rendre du vide).
 * Dimensions en style inline (pas seulement Tailwind) pour garantir une taille.
 */

export type FlowNodeData = {
  node: WorkflowNode
  templates: WhatsAppTemplate[]
}

const HANDLE_STYLE: React.CSSProperties = { width: 12, height: 12, border: '2px solid #0a0f1e' }
const CARD: React.CSSProperties = {
  width: 240, borderRadius: 16, background: '#0e1626', color: '#e5edf7',
  border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)',
}

function getNode(data: unknown): WorkflowNode | null {
  const d = data as FlowNodeData | undefined
  return d && d.node ? d.node : null
}
function getTemplates(data: unknown): WhatsAppTemplate[] {
  const d = data as FlowNodeData | undefined
  return d?.templates || []
}

export function quickReplyLabels(t: WhatsAppTemplate | undefined): string[] {
  if (!t) return []
  return ((t.buttons ?? []) as TemplateButton[])
    .filter((b) => b.type === 'QUICK_REPLY')
    .map((b) => b.text)
}

function Header({ icon: Icon, title, color }: { icon: React.ComponentType<{ size?: number }>; title: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', color }}>
      <Icon size={16} /> <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
    </div>
  )
}

export function TriggerFlowNode({ data }: NodeProps) {
  const node = getNode(data)
  if (!node || node.type !== 'trigger') return null
  const label = TRIGGER_EVENTS.find((e) => e.value === node.event)?.label ?? 'Déclencheur'
  return (
    <div style={{ ...CARD, borderColor: 'rgba(56,189,248,0.4)' }}>
      <Header icon={Zap} title="Quand" color="#7dd3fc" />
      <div style={{ padding: '10px 12px', fontSize: 13 }}>{label}</div>
      <Handle type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#38bdf8' }} />
    </div>
  )
}

export function DelayFlowNode({ data }: NodeProps) {
  const node = getNode(data)
  if (!node || node.type !== 'delay') return null
  const m = node.minutes || 0
  const human = m >= 1440 ? `${Math.round(m / 1440)} j` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`
  return (
    <div style={{ ...CARD, borderColor: 'rgba(251,191,36,0.4)' }}>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE_STYLE, background: 'rgba(255,255,255,0.6)' }} />
      <Header icon={Clock} title="Attendre" color="#fcd34d" />
      <div style={{ padding: '10px 12px', fontSize: 13, color: '#fcd34d' }}>{m === 0 ? 'Immédiat' : human}</div>
      <Handle type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#fbbf24' }} />
    </div>
  )
}

export function ConditionFlowNode({ data }: NodeProps) {
  const node = getNode(data)
  if (!node || node.type !== 'condition') return null
  const f = CONDITION_FIELDS.find((x) => x.value === node.rule.field)
  return (
    <div style={{ ...CARD, borderColor: 'rgba(167,139,250,0.4)' }}>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE_STYLE, background: 'rgba(255,255,255,0.6)' }} />
      <Header icon={GitBranch} title="Condition" color="#c4b5fd" />
      <div style={{ padding: '10px 12px', fontSize: 13 }}>{f?.label} {node.rule.op} {String(node.rule.value)}</div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, fontSize: 11, color: '#34d399', position: 'relative', height: 22 }}>
          Oui <Handle id="yes" type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#34d399', position: 'relative', transform: 'none', top: 'auto' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, fontSize: 11, color: '#f87171', position: 'relative', height: 22 }}>
          Non <Handle id="no" type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#f87171', position: 'relative', transform: 'none', top: 'auto' }} />
        </div>
      </div>
    </div>
  )
}

export function ABTestFlowNode({ data }: NodeProps) {
  const node = getNode(data)
  if (!node || node.type !== 'ab_test') return null
  return (
    <div style={{ ...CARD, borderColor: 'rgba(232,121,249,0.4)' }}>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE_STYLE, background: 'rgba(255,255,255,0.6)' }} />
      <Header icon={FlaskConical} title="Test A/B" color="#f0abfc" />
      <div style={{ padding: '6px 12px' }}>
        {(node.variants || []).map((v) => (
          <div key={v.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, height: 22, position: 'relative' }}>
            <span>Variante {v.key} · {v.weight}%</span>
            <Handle id={variantBranch(v.key)} type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#e879f9', position: 'relative', transform: 'none', top: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActionFlowNode({ data }: NodeProps) {
  const node = getNode(data)
  if (!node || node.type !== 'action') return null
  const tpl = getTemplates(data).find((t) => t.id === node.templateId)
  const labels = quickReplyLabels(tpl)
  const body = (tpl?.body_text || '').slice(0, 130)
  return (
    <div style={{ ...CARD, width: 280, borderColor: 'rgba(52,211,153,0.4)' }}>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE_STYLE, background: 'rgba(255,255,255,0.6)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(7,94,84,0.35)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a7f3d0' }}>
        <MessageSquare size={16} /> <span style={{ fontSize: 14, fontWeight: 600 }}>Message</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {tpl ? (
          <div style={{ background: '#202c33', borderRadius: 8, borderTopLeftRadius: 0, padding: '8px 10px', fontSize: 12, lineHeight: 1.4, color: '#e9edef' }}>
            {body}{(tpl.body_text || '').length > 130 ? '…' : ''}
          </div>
        ) : (
          <p style={{ fontSize: 12, fontStyle: 'italic', color: 'rgba(255,255,255,0.4)' }}>Aucun modèle sélectionné</p>
        )}
      </div>
      {labels.length > 0 ? (
        <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {labels.map((text) => (
            <div key={text} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'rgba(37,211,102,0.1)', borderRadius: 6, padding: '4px 8px', margin: '4px 0', fontSize: 11, fontWeight: 500, color: '#25d366', position: 'relative' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Reply size={12} /> {text}</span>
              <Handle id={buttonBranch(text)} type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#25d366', position: 'relative', transform: 'none', top: 'auto' }} />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} style={{ ...HANDLE_STYLE, background: '#34d399' }} />
      )}
    </div>
  )
}

export const flowNodeTypes = {
  trigger: TriggerFlowNode,
  delay: DelayFlowNode,
  condition: ConditionFlowNode,
  ab_test: ABTestFlowNode,
  action: ActionFlowNode,
}
