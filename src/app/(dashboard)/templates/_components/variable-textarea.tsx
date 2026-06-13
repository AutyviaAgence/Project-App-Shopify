'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Éditeur de message avec variables affichées en PASTILLES.
 *
 * Meta n'accepte que des variables numériques ({{1}}, {{2}}…). En interne on
 * manipule donc toujours un texte numéroté, mais à l'écran chaque {{n}} est
 * rendu comme une pastille atomique non-éditable portant le LIBELLÉ de la
 * variable (« Prénom client »…).
 *
 * Implémentation : un div contenteditable. Le texte "modèle" (avec {{n}}) est la
 * source de vérité ; on le reconstruit depuis le DOM à chaque saisie (les
 * pastilles portent data-var="n"). On expose, via la ref, une interface
 * COMPATIBLE textarea (value / selectionStart / selectionEnd / setSelectionRange
 * / focus) pour que la logique existante (insertion de variable, formatage
 * *gras*…) fonctionne sans changement.
 */

export type VariableTextareaHandle = {
  value: string
  selectionStart: number
  selectionEnd: number
  setSelectionRange: (start: number, end: number) => void
  focus: () => void
}

type Props = {
  value: string
  onChange: (v: string) => void
  labels: string[]
  rows?: number
  placeholder?: string
  maxLength?: number
  className?: string
}

// ── Sérialisation DOM → texte modèle ({{n}}) ────────────────────────────────
function domToModel(root: HTMLElement): string {
  let out = ''
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || ''
    } else if (node instanceof HTMLElement) {
      const v = node.getAttribute('data-var')
      if (v) out += `{{${v}}}`
      else if (node.tagName === 'BR') out += '\n'
      else out += node.textContent || ''
    }
  })
  return out
}

// Position du caret en index "modèle" (les pastilles comptent pour leur longueur {{n}}).
function caretModelOffset(root: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  let offset = 0
  let done = false
  const walk = (node: ChildNode) => {
    if (done) return
    if (node === range.endContainer && node.nodeType === Node.TEXT_NODE) {
      offset += range.endOffset
      done = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent || '').length
    } else if (node instanceof HTMLElement) {
      // Si le caret est juste après cette pastille (endContainer = root, endOffset pointe dessus)
      const v = node.getAttribute('data-var')
      if (range.endContainer === root) {
        const idx = Array.prototype.indexOf.call(root.childNodes, node)
        if (idx < range.endOffset) {
          offset += v ? `{{${v}}}`.length : (node.textContent || '').length
        }
        return
      }
      if (v) {
        if (node.contains(range.endContainer)) { offset += `{{${v}}}`.length; done = true; return }
        offset += `{{${v}}}`.length
      } else {
        node.childNodes.forEach(walk)
      }
    }
  }
  root.childNodes.forEach(walk)
  return offset
}

// Construit les nœuds DOM (texte + pastilles) à partir du texte modèle.
function modelToNodes(model: string, labels: string[]): Node[] {
  const nodes: Node[] = []
  const re = /\{\{\s*(\d+)\s*\}\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(model)) !== null) {
    if (m.index > last) nodes.push(document.createTextNode(model.slice(last, m.index)))
    const n = parseInt(m[1], 10)
    const pill = document.createElement('span')
    pill.setAttribute('data-var', String(n))
    pill.setAttribute('contenteditable', 'false')
    pill.className = 'mx-0.5 inline-block rounded bg-primary/15 px-1.5 py-0.5 align-baseline text-[0.85em] font-medium text-primary select-none'
    pill.textContent = labels[n - 1] || `{{${n}}}`
    nodes.push(pill)
    last = m.index + m[0].length
  }
  if (last < model.length) nodes.push(document.createTextNode(model.slice(last)))
  return nodes
}

// Replace le caret à l'index "modèle" donné.
function setCaretModel(root: HTMLElement, target: number) {
  const sel = window.getSelection()
  if (!sel) return
  let remaining = target
  const range = document.createRange()
  let placed = false
  for (const node of Array.from(root.childNodes)) {
    if (placed) break
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length
      if (remaining <= len) { range.setStart(node, remaining); placed = true; break }
      remaining -= len
    } else if (node instanceof HTMLElement && node.getAttribute('data-var')) {
      const len = `{{${node.getAttribute('data-var')}}}`.length
      if (remaining < len) { range.setStartBefore(node); placed = true; break }
      if (remaining === len) { range.setStartAfter(node); placed = true; break }
      remaining -= len
    }
  }
  if (!placed) {
    range.selectNodeContents(root); range.collapse(false)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

export const VariableTextarea = forwardRef<VariableTextareaHandle, Props>(function VariableTextarea(
  { value, onChange, labels, rows = 5, placeholder, maxLength, className },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef(labels)
  labelsRef.current = labels

  // (Re)rend le DOM quand la value EXTERNE change (et diffère du DOM courant) —
  // ex : insertion d'une variable via le menu, formatage, chargement d'un modèle.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (domToModel(el) === value) return
    el.replaceChildren(...modelToNodes(value, labelsRef.current))
  }, [value, labels])

  // Expose une interface compatible textarea.
  useImperativeHandle(ref, () => ({
    get value() { return elRef.current ? domToModel(elRef.current) : value },
    get selectionStart() { return elRef.current ? caretModelOffset(elRef.current) : 0 },
    get selectionEnd() { return elRef.current ? caretModelOffset(elRef.current) : 0 },
    setSelectionRange(start: number) { if (elRef.current) { elRef.current.focus(); setCaretModel(elRef.current, start) } },
    focus() { elRef.current?.focus() },
  }), [value])

  function handleInput() {
    const el = elRef.current
    if (!el) return
    let model = domToModel(el)
    if (maxLength && model.length > maxLength) model = model.slice(0, maxLength)
    onChange(model)
  }

  const isEmpty = value === ''

  return (
    <div className={cn('relative', className)}>
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onInput={handleInput}
        className={cn(
          'w-full whitespace-pre-wrap break-words rounded-md border bg-background px-3 py-2 text-sm leading-relaxed',
          'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ minHeight: `calc(${rows} * 1.625em + 1rem + 2px)` }}
      />
      {isEmpty && placeholder && (
        <span className="pointer-events-none absolute left-3 top-2 text-sm leading-relaxed text-muted-foreground">
          {placeholder}
        </span>
      )}
    </div>
  )
})
