'use client'

import React, { useRef } from 'react'
import { Clock } from 'lucide-react'
import { AnimatedBeam } from '@/components/ui/animated-beam'

/**
 * Flow d'automatisation : logo Shopify (événement) → horloge (délai) →
 * logo WhatsApp (message), reliés par des faisceaux lumineux (AnimatedBeam).
 */

const ShopifyIcon = () => (
  <svg width="22" height="22" viewBox="0 0 256 292" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46" />
    <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E" />
    <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg width="22" height="22" viewBox="0 0 360 362" xmlns="http://www.w3.org/2000/svg" fill="none">
    <path fill="#25D366" fillRule="evenodd" d="M307.546 52.566C273.709 18.684 228.706.017 180.756 0 81.951 0 1.538 80.404 1.504 179.235c-.017 31.594 8.242 62.432 23.928 89.609L0 361.736l95.024-24.925c26.179 14.285 55.659 21.805 85.655 21.814h.077c98.788 0 179.21-80.413 179.244-179.244.017-47.898-18.608-92.926-52.454-126.807v-.008Zm-126.79 275.788h-.06c-26.73-.008-52.952-7.194-75.831-20.765l-5.44-3.231-56.391 14.791 15.05-54.981-3.542-5.638c-14.912-23.721-22.793-51.139-22.776-79.286.035-82.14 66.867-148.973 149.051-148.973 39.793.017 77.198 15.53 105.328 43.695 28.131 28.157 43.61 65.596 43.593 105.398-.035 82.149-66.867 148.982-148.982 148.982v.008Zm81.719-111.577c-4.478-2.243-26.497-13.073-30.606-14.568-4.108-1.496-7.09-2.243-10.073 2.243-2.982 4.487-11.568 14.577-14.181 17.559-2.613 2.991-5.226 3.361-9.704 1.117-4.477-2.243-18.908-6.97-36.02-22.226-13.313-11.878-22.304-26.54-24.916-31.027-2.613-4.486-.275-6.91 1.959-9.136 2.011-2.011 4.478-5.234 6.721-7.847 2.244-2.613 2.983-4.486 4.478-7.469 1.496-2.991.748-5.603-.369-7.847-1.118-2.243-10.073-24.289-13.812-33.253-3.636-8.732-7.331-7.546-10.073-7.692-2.613-.13-5.595-.155-8.586-.155-2.991 0-7.839 1.118-11.947 5.604-4.108 4.486-15.677 15.324-15.677 37.361s16.047 43.344 18.29 46.335c2.243 2.991 31.585 48.225 76.51 67.632 10.684 4.615 19.029 7.374 25.535 9.437 10.727 3.412 20.49 2.931 28.208 1.779 8.604-1.289 26.498-10.838 30.228-21.298 3.73-10.46 3.73-19.433 2.613-21.298-1.117-1.865-4.108-2.991-8.586-5.234l.008-.017Z" clipRule="evenodd" />
  </svg>
)

function Circle({ innerRef, children }: { innerRef: React.Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div ref={innerRef} className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
      {children}
    </div>
  )
}

export function ConstellationFlow({
  active,
  stars,
}: {
  active: boolean
  stars: { label: string; sub?: string; color: string }[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fromRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)

  const [eventStar, delayStar, msgStar] = stars

  return (
    <div ref={containerRef} className="relative mt-3 w-full">
      <div className="flex items-start justify-between gap-3">
        {/* Événement → logo Shopify */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <Circle innerRef={fromRef}><ShopifyIcon /></Circle>
          <span className="text-center text-[13px] font-semibold leading-snug text-foreground">{eventStar?.label}</span>
        </div>

        {/* Délai → horloge */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <Circle innerRef={midRef}>
            <Clock className="h-5 w-5 text-amber-500" />
          </Circle>
          <span className="text-center text-[13px] font-semibold leading-snug text-foreground">{delayStar?.label}</span>
          {delayStar?.sub && <span className="text-[11px] text-muted-foreground">{delayStar.sub}</span>}
        </div>

        {/* Message → logo WhatsApp */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <Circle innerRef={toRef}><WhatsAppIcon /></Circle>
          <span className="text-center text-[13px] font-semibold leading-snug text-foreground">{msgStar?.label}</span>
        </div>
      </div>

      {active && (
        <>
          <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={midRef} duration={3} gradientStartColor="#7DA0FF" gradientStopColor="#F59E0B" startYOffset={-22} endYOffset={-22} curvature={-14} />
          <AnimatedBeam containerRef={containerRef} fromRef={midRef} toRef={toRef} duration={3} delay={0.6} gradientStartColor="#F59E0B" gradientStopColor="#22C55E" startYOffset={-22} endYOffset={-22} curvature={-14} />
        </>
      )}
    </div>
  )
}
