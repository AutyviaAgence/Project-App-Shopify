import React, { CSSProperties, ReactNode } from 'react'

type IPhoneModel = '14' | '14-pro' | '15' | '15-pro' | 'x' | 'plain'
type Orientation = 'portrait' | 'landscape'
type WallpaperFit = 'cover' | 'contain' | 'fill'

export interface IPhoneMockupProps {
  model?: IPhoneModel
  color?: 'black' | 'midnight' | 'silver' | 'starlight' | 'space-black' | 'gold' | 'blue' | 'pink' | 'titanium' | 'natural-titanium' | 'green' | 'red' | string
  orientation?: Orientation
  scale?: number
  bezel?: number
  radius?: number
  shadow?: boolean | string
  screenBg?: string
  wallpaper?: string
  wallpaperFit?: WallpaperFit
  wallpaperPosition?: string
  showDynamicIsland?: boolean
  showNotch?: boolean
  islandWidth?: number
  islandHeight?: number
  islandRadius?: number
  notchWidth?: number
  notchHeight?: number
  notchRadius?: number
  safeArea?: boolean
  safeAreaOverrides?: Partial<{ top: number; bottom: number; left: number; right: number }>
  showHomeIndicator?: boolean
  innerShadow?: boolean
  /** Reflet "liquid glass" sur l'écran (diagonal glossy). */
  glass?: boolean
  style?: CSSProperties
  className?: string
  frameStyle?: CSSProperties
  screenStyle?: CSSProperties
  children?: ReactNode
}

const DEVICE_SPECS: Record<IPhoneModel, {
  w: number; h: number; radius: number; bezel: number
  topSafe: number; bottomSafe: number
  notch?: { w: number; h: number; r: number }
  island?: { w: number; h: number; r: number }
}> = {
  x: { w: 375, h: 812, radius: 50, bezel: 12, topSafe: 47, bottomSafe: 34, notch: { w: 210, h: 35, r: 18 } },
  '14': { w: 390, h: 844, radius: 56, bezel: 12, topSafe: 47, bottomSafe: 34, notch: { w: 225, h: 33, r: 18 } },
  '14-pro': { w: 393, h: 852, radius: 56, bezel: 12, topSafe: 59, bottomSafe: 34, island: { w: 126, h: 37, r: 20 } },
  '15': { w: 393, h: 852, radius: 56, bezel: 12, topSafe: 59, bottomSafe: 34, island: { w: 126, h: 37, r: 20 } },
  '15-pro': { w: 393, h: 852, radius: 56, bezel: 12, topSafe: 59, bottomSafe: 34, island: { w: 126, h: 37, r: 20 } },
  plain: { w: 390, h: 844, radius: 56, bezel: 12, topSafe: 16, bottomSafe: 16 },
}

const PRESET_COLORS: Record<string, string> = {
  black: '#0b0b0d', midnight: '#0b0c10', silver: '#d7d8dc', starlight: '#f1eee9',
  'space-black': '#1c1e22', gold: '#f2dfb3', blue: '#2b4fa8', pink: '#ffbfd1',
  titanium: '#837a72', 'natural-titanium': '#a69a8a', green: '#2b622e', red: '#c81f2f',
}

function shade(hex: string, pct: number): string {
  const h = hex.trim()
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)
  if (!m) return hex
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  const k = (100 + pct) / 100
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${to(r).toString(16).padStart(2, '0')}${to(g).toString(16).padStart(2, '0')}${to(b).toString(16).padStart(2, '0')}`
}

export const IPhoneMockup: React.FC<IPhoneMockupProps> = ({
  model = '15-pro', color = 'natural-titanium', orientation = 'portrait', scale = 1,
  bezel, radius, shadow = true,
  screenBg = '#000', wallpaper, wallpaperFit = 'cover', wallpaperPosition = 'center',
  showDynamicIsland, showNotch, islandWidth, islandHeight, islandRadius,
  notchWidth, notchHeight, notchRadius,
  safeArea = false, safeAreaOverrides,
  showHomeIndicator = true, innerShadow = true, glass = true,
  style, className, frameStyle, screenStyle, children,
}) => {
  const spec = DEVICE_SPECS[model]
  const W = spec.w, H = spec.h
  const useIsland = typeof showDynamicIsland === 'boolean' ? showDynamicIsland : Boolean(spec.island)
  const useNotch = typeof showNotch === 'boolean' ? showNotch : Boolean(spec.notch) && !useIsland
  const resolvedRadius = radius ?? spec.radius
  const resolvedBezel = bezel ?? spec.bezel
  const isLandscape = orientation === 'landscape'
  const screenWidth = isLandscape ? H : W
  const screenHeight = isLandscape ? W : H
  const outerWidth = screenWidth + resolvedBezel * 2
  const outerHeight = screenHeight + resolvedBezel * 2
  const outerRadius = resolvedRadius + resolvedBezel
  const colorHex = PRESET_COLORS[color] ?? color
  // Cadre titane : conic-gradient simulant les reflets métalliques sur les 4
  // arêtes (clair en haut/bas, plus sombre sur les côtés) → effet brossé réel.
  const hi = shade(colorHex, 26)
  const lo = shade(colorHex, -22)
  const frameGradient = `conic-gradient(from 90deg at 50% 50%, ${hi} 0deg, ${colorHex} 30deg, ${lo} 90deg, ${colorHex} 150deg, ${hi} 180deg, ${colorHex} 210deg, ${lo} 270deg, ${colorHex} 330deg, ${hi} 360deg)`
  const outerShadow = typeof shadow === 'string' ? shadow : shadow ? `0 30px 70px -18px rgba(0,0,0,0.6), 0 10px 24px rgba(0,0,0,0.35)` : 'none'
  const innerShadowCss = innerShadow ? 'inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 10px 20px rgba(0,0,0,0.35), inset 0 -8px 16px rgba(0,0,0,0.28)' : 'none'

  const notchSpec = spec.notch, islandSpec = spec.island
  const finalNotchW = notchWidth ?? notchSpec?.w ?? 0
  const finalNotchH = notchHeight ?? notchSpec?.h ?? 0
  const finalNotchR = notchRadius ?? notchSpec?.r ?? 0
  const finalIslandW = islandWidth ?? islandSpec?.w ?? 0
  const finalIslandH = islandHeight ?? islandSpec?.h ?? 0
  const finalIslandR = islandRadius ?? islandSpec?.r ?? 0

  const insets = {
    top: safeAreaOverrides?.top ?? spec.topSafe,
    bottom: safeAreaOverrides?.bottom ?? spec.bottomSafe,
    left: safeAreaOverrides?.left ?? 0,
    right: safeAreaOverrides?.right ?? 0,
  }

  const wrapperStyle: CSSProperties = { boxSizing: 'border-box', display: 'inline-block', transform: `scale(${scale})`, transformOrigin: 'top center', ...style }
  const frameBoxStyle: CSSProperties = { width: outerWidth, height: outerHeight, borderRadius: outerRadius, background: frameGradient, padding: resolvedBezel, boxSizing: 'border-box', boxShadow: outerShadow, position: 'relative', overflow: 'hidden', ...frameStyle }
  // Fine bordure noire entre le métal et la dalle (caractéristique iPhone).
  const screenBoxStyle: CSSProperties = { width: '100%', height: '100%', borderRadius: resolvedRadius, position: 'relative', overflow: 'hidden', background: screenBg, border: '3px solid #050505', boxSizing: 'border-box', boxShadow: innerShadowCss + ', 0 0 0 1px rgba(0,0,0,0.6)', ...screenStyle }
  const wallpaperStyle: CSSProperties | undefined = wallpaper ? { position: 'absolute', inset: 0, backgroundImage: `url(${wallpaper})`, backgroundSize: wallpaperFit, backgroundPosition: wallpaperPosition, backgroundRepeat: 'no-repeat', zIndex: 0 } : undefined
  const cutoutCommon: CSSProperties = { position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#000', zIndex: 4, boxShadow: '0 1px 2px rgba(0,0,0,0.7)' }
  const homeIndicatorStyle: CSSProperties = { position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: Math.round(screenWidth * 0.34), maxWidth: 140, height: 5, borderRadius: 3, background: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.25))', opacity: 0.5, zIndex: 5, pointerEvents: 'none' }
  const contentStyle: CSSProperties = safeArea
    ? { position: 'absolute', top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left, overflow: 'hidden', zIndex: 1, display: 'flex', flexDirection: 'column' }
    : { position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, display: 'flex', flexDirection: 'column' }

  // Reflet liquid glass : diagonale lumineuse + léger highlight de bord.
  const glassStyle: CSSProperties = {
    position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', borderRadius: resolvedRadius,
    background: 'linear-gradient(125deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 18%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05) 100%)',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25)',
    mixBlendMode: 'screen',
  }

  return (
    <div className={className} style={wrapperStyle}>
      <div style={frameBoxStyle} aria-label={`iPhone mockup (${model})`}>
        {/* Boutons latéraux */}
        <span aria-hidden style={{ position: 'absolute', left: -2, top: '22%', width: 3, height: 28, borderRadius: 3, background: shade(colorHex, -20) }} />
        <span aria-hidden style={{ position: 'absolute', left: -2, top: '32%', width: 3, height: 46, borderRadius: 3, background: shade(colorHex, -20) }} />
        <span aria-hidden style={{ position: 'absolute', left: -2, top: '44%', width: 3, height: 46, borderRadius: 3, background: shade(colorHex, -20) }} />
        <span aria-hidden style={{ position: 'absolute', right: -2, top: '30%', width: 3, height: 64, borderRadius: 3, background: shade(colorHex, -20) }} />

        <div style={screenBoxStyle}>
          {wallpaper && <div aria-hidden style={wallpaperStyle} />}

          {useIsland && finalIslandW > 0 && finalIslandH > 0 && (
            <div aria-hidden style={{ ...cutoutCommon, top: 12, width: finalIslandW, height: finalIslandH, borderRadius: finalIslandR, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10, gap: 6 }}>
              {/* Capteur de proximité (cerclé) + caméra avant */}
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #2b3a4a 0%, #0a0f14 70%)', boxShadow: 'inset 0 0 1px rgba(120,160,200,0.5)' }} />
            </div>
          )}
          {!useIsland && useNotch && finalNotchW > 0 && finalNotchH > 0 && (
            <div aria-hidden style={{ ...cutoutCommon, top: 8, width: finalNotchW, height: finalNotchH, borderRadius: finalNotchR }} />
          )}

          <div style={contentStyle}>{children}</div>

          {glass && <div aria-hidden style={glassStyle} />}
          {showHomeIndicator && <div aria-hidden style={homeIndicatorStyle} />}
        </div>

        {/* Reflet métallique sur le pourtour du cadre (highlight de bord) */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: outerRadius, pointerEvents: 'none',
          boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -1.5px 1px rgba(255,255,255,0.18), inset 1.5px 0 1px rgba(255,255,255,0.12), inset -1.5px 0 1px rgba(255,255,255,0.12)',
        }} />
      </div>
    </div>
  )
}

export default IPhoneMockup
