'use client'

/**
 * Animation d'attente : une barre lumineuse balaie verticalement une zone
 * douce, avec quelques points qui pulsent. Remplace l'ancien mini-jeu.
 * Sobre, ne chevauche aucun texte, respecte prefers-reduced-motion.
 *
 * (Le nom du fichier/composant est conservé pour ne pas casser les imports.)
 */
export function MascotRunner({ height = 140 }: { frames?: string[]; height?: number }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-dashed bg-muted/20"
      style={{ height }}
      aria-hidden="true"
    >
      {/* Lignes horizontales discrètes en fond */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 22px, color-mix(in oklab, var(--border) 60%, transparent) 22px 23px)',
        }}
      />
      {/* Barre lumineuse qui balaie de haut en bas */}
      <div
        className="animate-vscan pointer-events-none absolute inset-x-0 h-16 motion-reduce:hidden"
        style={{
          background: 'linear-gradient(to bottom, transparent, color-mix(in oklab, var(--primary) 35%, transparent), transparent)',
        }}
      />
      {/* Ligne centrale nette qui suit le balayage */}
      <div
        className="animate-vscan pointer-events-none absolute inset-x-8 h-px bg-primary/70 shadow-[0_0_12px_2px] shadow-primary/40 motion-reduce:hidden"
      />
      {/* 3 points qui pulsent au centre */}
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-primary/60 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  )
}
