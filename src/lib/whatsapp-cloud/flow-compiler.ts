import type { FlowScreen, FlowField } from '@/types/database'

/**
 * Compile nos écrans (modèle simple) en Flow JSON Meta, mode "navigate".
 *
 * Mode navigate = formulaire statique : chaque écran a un bouton qui navigue
 * vers l'écran suivant ; le dernier écran "complete" renvoie toutes les données
 * d'un coup (pas d'endpoint chiffré). On utilise Flow JSON version 5.1.
 *
 * Réf : composants Form/TextInput/TextArea/RadioButtonsGroup/CheckboxGroup/Dropdown,
 * Footer avec action navigate / complete.
 */

function dataKey(screenId: string, fieldName: string): string {
  return `${screenId}_${fieldName}`
}

/** Un champ de notre modèle → composant Flow JSON Meta. */
function fieldToComponent(f: FlowField): Record<string, unknown> {
  const base = { name: f.name, label: f.label, required: f.required }
  switch (f.type) {
    case 'textarea':
      return { type: 'TextArea', ...base }
    case 'radio':
      return {
        type: 'RadioButtonsGroup', ...base,
        'data-source': (f.options || []).map((o, i) => ({ id: String(i), title: o })),
      }
    case 'checkbox':
      return {
        type: 'CheckboxGroup', ...base,
        'data-source': (f.options || []).map((o, i) => ({ id: String(i), title: o })),
      }
    case 'dropdown':
      return {
        type: 'Dropdown', ...base,
        'data-source': (f.options || []).map((o, i) => ({ id: String(i), title: o })),
      }
    case 'text':
    default:
      return { type: 'TextInput', 'input-type': 'text', ...base }
  }
}

export function compileFlowJSON(screens: FlowScreen[]): Record<string, unknown> {
  const valid = screens.filter((s) => s.fields.length > 0)
  const metaScreens = valid.map((screen, idx) => {
    const isLast = idx === valid.length - 1
    const nextScreenId = isLast ? null : valid[idx + 1].id

    const formChildren: Record<string, unknown>[] = screen.fields.map(fieldToComponent)

    // Footer : navigue vers l'écran suivant, ou termine le flow (complete).
    // Le payload "complete" agrège toutes les valeurs saisies (référencées via
    // ${form.<name>}) pour qu'elles reviennent dans nfm_reply.
    const payload: Record<string, string> = {}
    for (const s of valid) {
      for (const f of s.fields) payload[dataKey(s.id, f.name)] = `\${form.${f.name}}`
    }

    formChildren.push({
      type: 'Footer',
      label: isLast ? 'Envoyer' : 'Suivant',
      'on-click-action': isLast
        ? { name: 'complete', payload }
        : { name: 'navigate', next: { type: 'screen', name: nextScreenId }, payload: {} },
    })

    return {
      id: screen.id,
      title: screen.title,
      terminal: isLast,
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [{ type: 'Form', name: 'form', children: formChildren }],
      },
    }
  })

  return {
    version: '5.1',
    screens: metaScreens,
  }
}
