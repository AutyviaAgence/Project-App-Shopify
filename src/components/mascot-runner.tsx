'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Mini-jeu « runner » (façon dino Chrome) pour habiller les temps d'attente.
 * Espace / clic / tap = sauter. Score au temps survécu, vitesse croissante.
 *
 * Mascotte : par défaut dessinée en canvas (blob blanc à cornes, clin d'œil à
 * la mascotte Xeyo). Dès que des frames PNG sont fournies via `frames`
 * (animation de course, ordre = cycle), elles remplacent le dessin — rien
 * d'autre à changer.
 */
export function MascotRunner({ frames = [], height = 180 }: { frames?: string[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)

  // état mutable du jeu (hors React pour la boucle rAF)
  const g = useRef({
    y: 0, vy: 0, onGround: true,
    obstacles: [] as { x: number; w: number; h: number }[],
    speed: 4.2, t: 0, nextSpawn: 0, raf: 0, running: false,
    imgs: [] as HTMLImageElement[], frame: 0,
  })

  useEffect(() => {
    if (!frames.length) return
    g.current.imgs = frames.map((src) => { const i = new Image(); i.src = src; return i })
  }, [frames])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const groundY = H - 28
    const MASCOT = { x: 46, w: 34, h: 38 }

    function drawMascot(y: number, t: number) {
      const s = g.current
      const imgs = s.imgs.filter((i) => i.complete && i.naturalWidth > 0)
      if (imgs.length > 0) {
        const img = imgs[Math.floor(t / 6) % imgs.length]
        ctx!.drawImage(img, MASCOT.x, y - MASCOT.h, MASCOT.w, MASCOT.h)
        return
      }
      // Placeholder : petit blob blanc à cornes (mascotte de substitution)
      const cx = MASCOT.x + MASCOT.w / 2
      const bob = s.onGround ? Math.sin(t / 4) * 1.5 : 0
      const top = y - MASCOT.h + bob
      ctx!.fillStyle = '#f4f4f5'
      ctx!.beginPath()
      ctx!.moveTo(cx - 15, y)
      ctx!.quadraticCurveTo(cx - 17, top + 8, cx - 8, top + 3)
      ctx!.quadraticCurveTo(cx, top - 2, cx + 8, top + 3)
      ctx!.quadraticCurveTo(cx + 17, top + 8, cx + 15, y)
      ctx!.closePath()
      ctx!.fill()
      // cornes
      ctx!.beginPath(); ctx!.moveTo(cx - 9, top + 4); ctx!.lineTo(cx - 13, top - 5); ctx!.lineTo(cx - 5, top + 1); ctx!.closePath(); ctx!.fill()
      ctx!.beginPath(); ctx!.moveTo(cx + 9, top + 4); ctx!.lineTo(cx + 13, top - 5); ctx!.lineTo(cx + 5, top + 1); ctx!.closePath(); ctx!.fill()
      // yeux
      ctx!.fillStyle = '#18181b'
      ctx!.fillRect(cx - 8, top + 12, 5, 2.5)
      ctx!.fillRect(cx + 3, top + 12, 5, 2.5)
    }

    function loop() {
      const s = g.current
      if (!s.running) return
      s.t++

      // physique
      if (!s.onGround) {
        s.vy += 0.55
        s.y += s.vy
        if (s.y >= 0) { s.y = 0; s.vy = 0; s.onGround = true }
      }

      // obstacles
      if (s.t >= s.nextSpawn) {
        const h = 16 + Math.random() * 18
        s.obstacles.push({ x: W + 20, w: 12 + Math.random() * 10, h })
        s.nextSpawn = s.t + 55 + Math.random() * 70 - Math.min(30, s.speed * 3)
      }
      s.speed = Math.min(9, 4.2 + s.t / 900)
      for (const o of s.obstacles) o.x -= s.speed
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10)

      // collision
      const my = groundY + s.y
      for (const o of s.obstacles) {
        const hitX = o.x < MASCOT.x + MASCOT.w - 8 && o.x + o.w > MASCOT.x + 8
        const hitY = my > groundY - o.h
        if (hitX && hitY) {
          s.running = false
          setGameOver(true)
          setBest((b) => Math.max(b, Math.floor(s.t / 6)))
          return
        }
      }

      // rendu
      ctx!.clearRect(0, 0, W, H)
      // sol
      ctx!.strokeStyle = 'rgba(148,163,184,0.5)'
      ctx!.lineWidth = 1.5
      ctx!.beginPath(); ctx!.moveTo(0, groundY + 1); ctx!.lineTo(W, groundY + 1); ctx!.stroke()
      // pointillés du sol qui défilent
      ctx!.fillStyle = 'rgba(148,163,184,0.35)'
      for (let i = 0; i < 8; i++) {
        const x = ((i * 90 - (s.t * s.speed) % 90) + W) % W
        ctx!.fillRect(x, groundY + 8, 18, 2)
      }
      // obstacles (cartons e-commerce 📦 stylisés)
      for (const o of s.obstacles) {
        ctx!.fillStyle = 'rgba(96,165,250,0.85)'
        ctx!.fillRect(o.x, groundY - o.h, o.w, o.h)
        ctx!.strokeStyle = 'rgba(30,64,175,0.6)'
        ctx!.strokeRect(o.x, groundY - o.h, o.w, o.h)
      }
      drawMascot(my, s.t)
      // score
      setScore(Math.floor(s.t / 6))

      s.raf = requestAnimationFrame(loop)
    }

    function jump() {
      const s = g.current
      if (!s.running) return
      if (s.onGround) { s.vy = -9.2; s.onGround = false }
    }

    function start() {
      const s = g.current
      s.y = 0; s.vy = 0; s.onGround = true
      s.obstacles = []; s.speed = 4.2; s.t = 0; s.nextSpawn = 40
      s.running = true
      setGameOver(false)
      setStarted(true)
      cancelAnimationFrame(s.raf)
      s.raf = requestAnimationFrame(loop)
    }

    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return
      e.preventDefault()
      if (!g.current.running) start()
      else jump()
    }
    function onPointer() {
      if (!g.current.running) start()
      else jump()
    }

    window.addEventListener('keydown', onKey)
    canvas.addEventListener('pointerdown', onPointer)
    const s = g.current
    return () => {
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('pointerdown', onPointer)
      s.running = false
      cancelAnimationFrame(s.raf)
    }
  }, [])

  return (
    <div className="relative select-none rounded-xl border border-dashed bg-muted/20">
      <canvas ref={canvasRef} width={640} height={height} className="h-auto w-full cursor-pointer" />
      <div className="pointer-events-none absolute right-3 top-2 font-mono text-xs text-muted-foreground">
        {score}{best > 0 ? ` · record ${best}` : ''}
      </div>
      {(!started || gameOver) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <p className="text-sm font-medium">{gameOver ? 'Aïe, un colis ! 📦' : 'Un petit jeu en attendant ?'}</p>
          <p className="text-xs text-muted-foreground">Espace ou clic pour {gameOver ? 'rejouer' : 'sauter'}</p>
        </div>
      )}
    </div>
  )
}
