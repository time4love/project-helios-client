import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { CrosshairReticle } from './CrosshairReticle'

export interface GuidanceState {
  azimuthDelta: number
  altitudeDelta: number
  needsRight: boolean
  needsLeft: boolean
  needsUp: boolean
  needsDown: boolean
  azimuthLocked: boolean
  altitudeLocked: boolean
  fullyLocked: boolean
  isCoarse: boolean // >15° - show arrows
  isFine: boolean // <15° - hide arrows, visual align
  canCapture: boolean // <20° - enable capture button
}

/**
 * Guidance HUD component - shows directional arrows to guide user to target.
 * Provides directional guidance text instead of "acquiring" language.
 */
export function GuidanceHUD({
  guidance,
  isNightMode,
}: {
  guidance: GuidanceState
  isNightMode: boolean
}) {
  const { needsRight, needsLeft, needsUp, needsDown, fullyLocked, isCoarse, isFine } = guidance

  // Determine ring color based on state
  const getRingColor = () => {
    if (fullyLocked) return 'border-green-400 shadow-green-500/40'
    if (isFine) return 'border-yellow-400 shadow-yellow-500/30'
    return 'border-orange-400 shadow-orange-500/20'
  }

  const getReticleColor = () => {
    if (fullyLocked) return '#4ade80' // green-400
    if (isFine) return '#facc15' // yellow-400
    return '#fb923c' // orange-400
  }

  // Build directional guidance text
  const getStatusText = () => {
    if (fullyLocked) return 'ON TARGET'

    // Build direction hints
    const directions: string[] = []
    if (needsUp) directions.push('Above')
    if (needsDown) directions.push('Below')
    if (needsLeft) directions.push('Left')
    if (needsRight) directions.push('Right')

    if (directions.length === 0) {
      // Fine mode - close but not locked
      return 'Almost there...'
    }

    return `Sun is ${directions.join(' & ')}`
  }

  const getTextColor = () => {
    if (fullyLocked) return 'text-green-400'
    if (isFine) return 'text-yellow-400'
    return 'text-orange-400'
  }

  return (
    <div className="flex flex-col items-center my-6">
      {/* Night Mode Warning Badge */}
      {isNightMode && (
        <div className="mb-3 px-3 py-1.5 bg-indigo-900/70 backdrop-blur-sm border border-indigo-400/40 rounded-full flex items-center gap-2">
          <span className="text-indigo-300 text-xs font-semibold">NIGHT MODE</span>
          <span className="text-indigo-400/70 text-xs">Sun Below Horizon</span>
        </div>
      )}

      {/* Targeting Ring with backdrop */}
      <div
        className={`
          relative w-40 h-40 rounded-full border-4 flex items-center justify-center
          transition-all duration-300 shadow-xl bg-black/30 backdrop-blur-sm
          ${getRingColor()}
          ${fullyLocked ? 'animate-pulse' : ''}
        `}
      >
        {/* Professional Crosshair Reticle */}
        <CrosshairReticle color={getReticleColor()} />

        {/* Direction Arrows - only show in coarse mode */}
        {isCoarse && (
          <>
            {needsUp && (
              <ChevronUp
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 0 2px black)' }}
              />
            )}
            {needsDown && (
              <ChevronDown
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 0 2px black)' }}
              />
            )}
            {needsLeft && (
              <ChevronLeft
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 text-orange-400 animate-pulse drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 0 2px black)' }}
              />
            )}
            {needsRight && (
              <ChevronRight
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 text-orange-400 animate-pulse drop-shadow-lg"
                style={{ filter: 'drop-shadow(0 0 2px black)' }}
              />
            )}
          </>
        )}
      </div>

      {/* Status Text with backdrop */}
      <p
        className={`mt-4 text-sm font-semibold tracking-wide ${getTextColor()} drop-shadow-lg`}
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
      >
        {getStatusText()}
      </p>

      {/* Delta Display */}
      <div className="flex gap-6 mt-2 text-xs bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
        <span className={guidance.azimuthLocked ? 'text-green-400' : 'text-white/70'}>
          Az: {guidance.azimuthDelta >= 0 ? '+' : ''}
          {guidance.azimuthDelta.toFixed(1)}°
        </span>
        <span className={guidance.altitudeLocked ? 'text-green-400' : 'text-white/70'}>
          Alt: {guidance.altitudeDelta >= 0 ? '+' : ''}
          {guidance.altitudeDelta.toFixed(1)}°
        </span>
      </div>
    </div>
  )
}
