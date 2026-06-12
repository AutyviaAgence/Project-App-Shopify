'use client'

import { useEffect, useRef } from 'react'
import { useInView, useMotionValue, useSpring } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * NumberTicker (Magic UI) — anime un nombre qui défile jusqu'à sa valeur.
 */
export function NumberTicker({
  value,
  direction = 'up',
  delay = 0,
  className,
  decimalPlaces = 0,
}: {
  value: number
  direction?: 'up' | 'down'
  className?: string
  delay?: number
  decimalPlaces?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === 'down' ? value : 0)
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 })
  const isInView = useInView(ref, { once: true, margin: '0px' })

  useEffect(() => {
    if (isInView) {
      const t = setTimeout(() => motionValue.set(direction === 'down' ? 0 : value), delay * 1000)
      return () => clearTimeout(t)
    }
  }, [motionValue, isInView, delay, value, direction])

  useEffect(() => {
    return springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat('fr-FR', {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(Number(latest.toFixed(decimalPlaces)))
      }
    })
  }, [springValue, decimalPlaces])

  return <span ref={ref} className={cn('inline-block tabular-nums tracking-wider', className)}>0</span>
}
