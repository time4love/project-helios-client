import { useState, useMemo, useEffect, useCallback } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, saveMeasurement, RateLimitError, type SunPosition } from '@/services/api'
import { normalizeOrientation, getShortestAngle } from '@/utils/sensorMath'
import { CameraBackground } from '@/features/sensor-read/components/CameraBackground'

interface Snapshot {
  sensor: { azimuth: number; altitude: number }
  nasa: { azimuth: number; altitude: number }
  delta: { azimuth: number; altitude: number }
  timestamp: Date
}

interface GuidanceState {
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

const LOCK_THRESHOLD = 5 // degrees - fully locked
const FINE_THRESHOLD = 15 // degrees - switch to fine guidance
const CAPTURE_THRESHOLD = 20 // degrees - enable capture button

/**
 * Professional crosshair reticle - colored lines with black outline for visibility
 * against bright camera backgrounds
 */
function CrosshairReticle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      {/* Black outline/shadow layer for visibility against bright backgrounds */}
      <line x1="0" y1="50" x2="35" y2="50" stroke="black" strokeWidth="4" />
      <line x1="65" y1="50" x2="100" y2="50" stroke="black" strokeWidth="4" />
      <line x1="50" y1="0" x2="50" y2="35" stroke="black" strokeWidth="4" />
      <line x1="50" y1="65" x2="50" y2="100" stroke="black" strokeWidth="4" />
      <circle cx="50" cy="50" r="5" fill="black" />

      {/* Colored foreground layer */}
      <line x1="0" y1="50" x2="35" y2="50" stroke={color} strokeWidth="2" />
      <line x1="65" y1="50" x2="100" y2="50" stroke={color} strokeWidth="2" />
      <line x1="50" y1="0" x2="50" y2="35" stroke={color} strokeWidth="2" />
      <line x1="50" y1="65" x2="50" y2="100" stroke={color} strokeWidth="2" />
      <circle cx="50" cy="50" r="3" fill={color} />
    </svg>
  )
}

/**
 * Guidance HUD component - shows directional arrows to guide user to target
 * Provides directional guidance text instead of "acquiring" language
 */
function GuidanceHUD({ guidance, isNightMode }: { guidance: GuidanceState; isNightMode: boolean }) {
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
          <span className="text-indigo-300 text-xs font-semibold">🌙 NIGHT MODE</span>
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
          Az: {guidance.azimuthDelta >= 0 ? '+' : ''}{guidance.azimuthDelta.toFixed(1)}°
        </span>
        <span className={guidance.altitudeLocked ? 'text-green-400' : 'text-white/70'}>
          Alt: {guidance.altitudeDelta >= 0 ? '+' : ''}{guidance.altitudeDelta.toFixed(1)}°
        </span>
      </div>
    </div>
  )
}

/**
 * Manual capture solar tracker with targeting system.
 * Features real-time guidance HUD to help align with sun position.
 */
export function SolarTracker() {
  const { data: sensorData, permissionGranted, requestAccess, error: sensorError } = useDeviceOrientation()
  const { coordinates, error: geoError } = useGeoLocation()
  const [isCapturing, setIsCapturing] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetPosition, setTargetPosition] = useState<SunPosition | null>(null)

  // Normalize raw sensor data to astronomical coordinates
  const normalizedSensor = useMemo(() => {
    if (!sensorData) return null
    return normalizeOrientation(sensorData.alpha, sensorData.beta, sensorData.gamma)
  }, [sensorData])

  // Fetch target position when GPS is available
  const fetchTarget = useCallback(async () => {
    if (!coordinates) return

    try {
      const position = await fetchSunPosition(coordinates.latitude, coordinates.longitude)
      setTargetPosition(position)
    } catch (err) {
      console.error('Failed to fetch target position:', err)
    }
  }, [coordinates])

  // Auto-fetch target on GPS availability and every 60 seconds
  useEffect(() => {
    if (!coordinates) return

    // Initial fetch
    fetchTarget()

    // Refresh every 60 seconds
    const intervalId = setInterval(fetchTarget, 60000)

    return () => clearInterval(intervalId)
  }, [coordinates, fetchTarget])

  // Calculate guidance state
  const guidance = useMemo<GuidanceState | null>(() => {
    if (!normalizedSensor || !targetPosition) return null

    // Use shortest angle for azimuth to handle 0-360 wrap-around
    // Positive = need to turn RIGHT, Negative = need to turn LEFT
    const azimuthDelta = getShortestAngle(targetPosition.azimuth, normalizedSensor.azimuth)
    const altitudeDelta = targetPosition.altitude - normalizedSensor.altitude

    const absAzimuth = Math.abs(azimuthDelta)
    const absAltitude = Math.abs(altitudeDelta)
    const maxDelta = Math.max(absAzimuth, absAltitude)

    const azimuthLocked = absAzimuth <= LOCK_THRESHOLD
    const altitudeLocked = absAltitude <= LOCK_THRESHOLD

    return {
      azimuthDelta,
      altitudeDelta,
      needsRight: azimuthDelta > FINE_THRESHOLD,  // Only show in coarse mode
      needsLeft: azimuthDelta < -FINE_THRESHOLD,
      needsUp: altitudeDelta > FINE_THRESHOLD,
      needsDown: altitudeDelta < -FINE_THRESHOLD,
      azimuthLocked,
      altitudeLocked,
      fullyLocked: azimuthLocked && altitudeLocked,
      isCoarse: maxDelta > FINE_THRESHOLD,
      isFine: maxDelta <= FINE_THRESHOLD && maxDelta > LOCK_THRESHOLD,
      canCapture: maxDelta <= CAPTURE_THRESHOLD,
    }
  }, [normalizedSensor, targetPosition])

  const isReady = permissionGranted && coordinates && normalizedSensor
  // Always enable capture when sensors are ready - no accuracy threshold required
  const canCapture = isReady

  // Check if sun is below horizon (night mode)
  const isNightMode = targetPosition && targetPosition.altitude < 0

  const handleMeasure = async () => {
    if (!coordinates || !normalizedSensor) {
      setError('GPS and sensors must be ready before capturing')
      return
    }

    setIsCapturing(true)
    setError(null)

    // Freeze current normalized sensor values at moment of capture
    const capturedSensor = {
      azimuth: normalizedSensor.azimuth,
      altitude: normalizedSensor.altitude,
    }

    try {
      // Save measurement to backend (includes sensor data for DB storage)
      const result = await saveMeasurement(
        coordinates.latitude,
        coordinates.longitude,
        capturedSensor.azimuth,
        capturedSensor.altitude
      )

      // Use the response from backend (which includes NASA calculation and deltas)
      setSnapshot({
        sensor: capturedSensor,
        nasa: {
          azimuth: result.nasa_azimuth,
          altitude: result.nasa_altitude,
        },
        delta: {
          azimuth: result.delta_azimuth,
          altitude: result.delta_altitude,
        },
        timestamp: new Date(result.created_at),
      })
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError('Please wait a moment before measuring again.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save measurement')
      }
    } finally {
      setIsCapturing(false)
    }
  }

  const formatValue = (value: number): string => {
    return `${value.toFixed(2)}°`
  }

  const formatDelta = (value: number): string => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}°`
  }

  const getDeltaColor = (value: number): string => {
    return Math.abs(value) > 5 ? 'text-red-400' : 'text-green-400'
  }

  const dismissError = () => setError(null)

  return (
    <div className="w-full min-h-screen p-4 flex flex-col relative">
      {/* AR Camera Background */}
      <CameraBackground />

      {/* Header Badge */}
      <div className="text-center mb-4">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-sm border border-blue-400/30 rounded-full text-blue-300 text-sm font-medium shadow-lg">
          <Compass className="w-4 h-4" />
          PROJECT HELIOS
        </span>
        {coordinates && (
          <p className="text-white/70 text-xs mt-2 flex items-center justify-center gap-1 drop-shadow-md">
            <MapPin className="w-3 h-3" />
            {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
          </p>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="mb-4 mx-auto max-w-sm bg-red-900/70 backdrop-blur-sm border border-red-400/30 rounded-lg p-3 flex items-center gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-200 text-sm flex-1">{error}</p>
          <button onClick={dismissError} className="text-red-400 hover:text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Permission Request */}
      {!permissionGranted && (
        <div className="mb-4 mx-auto max-w-sm bg-black/60 backdrop-blur-md border border-slate-400/30 rounded-xl p-4 text-center shadow-xl">
          <p className="text-white mb-3 text-sm">Enable sensors to measure orientation</p>
          <button
            onClick={requestAccess}
            className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors cursor-pointer shadow-lg"
          >
            Enable Sensors
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {(sensorError || geoError) && (
        <div className="mb-4 mx-auto max-w-sm text-center space-y-1 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
          {sensorError && <p className="text-amber-300 text-xs drop-shadow-md">Sensor: {sensorError}</p>}
          {geoError && <p className="text-amber-300 text-xs drop-shadow-md">GPS: {geoError}</p>}
        </div>
      )}

      {/* Live Sensor Feed */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-4 bg-black/50 backdrop-blur-md rounded-2xl px-6 py-4 shadow-xl border border-white/10">
          <span className="inline-block px-3 py-1 bg-green-500/30 border border-green-400/40 rounded-full text-green-400 text-xs font-semibold tracking-wider mb-4">
            LIVE SENSOR
          </span>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-white/60 text-sm mb-1">AZIMUTH</p>
              <p className="text-4xl font-mono font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                {normalizedSensor ? formatValue(normalizedSensor.azimuth) : '—'}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-sm mb-1">ALTITUDE</p>
              <p className="text-4xl font-mono font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                {normalizedSensor ? formatValue(normalizedSensor.altitude) : '—'}
              </p>
            </div>
          </div>
          <p className="text-white/40 text-xs mt-2">(Assumes Portrait Mode)</p>
        </div>

        {/* Target Info */}
        {targetPosition && (
          <div className="text-center mb-2 bg-black/40 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10">
            <span className="inline-block px-3 py-1 bg-blue-500/30 border border-blue-400/40 rounded-full text-blue-300 text-xs font-semibold tracking-wider mb-2">
              TARGET (SUN)
            </span>
            <div className="flex gap-6 text-sm">
              <span className="text-blue-200 font-mono drop-shadow-md">Az: {formatValue(targetPosition.azimuth)}</span>
              <span className="text-blue-200 font-mono drop-shadow-md">Alt: {formatValue(targetPosition.altitude)}</span>
            </div>
          </div>
        )}

        {/* Guidance HUD */}
        {guidance && <GuidanceHUD guidance={guidance} isNightMode={!!isNightMode} />}

        {/* Capture Button - Always enabled when sensors ready, with inviting pulse */}
        <button
          onClick={handleMeasure}
          disabled={!canCapture || isCapturing}
          className={`
            w-20 h-20 rounded-full border-4 flex items-center justify-center
            transition-all duration-200 cursor-pointer
            ${canCapture && !isCapturing
              ? guidance?.fullyLocked
                ? 'bg-green-500 border-green-300 hover:bg-green-400 hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30 animate-pulse'
                : 'bg-blue-500 border-blue-300 hover:bg-blue-400 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30 animate-[pulse_2s_ease-in-out_infinite]'
              : 'bg-slate-700 border-slate-600 cursor-not-allowed opacity-50'
            }
          `}
        >
          {isCapturing ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Camera className="w-8 h-8 text-white" />
          )}
        </button>
        <p
          className="text-white/70 text-sm mt-2 drop-shadow-md"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {!coordinates
            ? 'Waiting for GPS...'
            : !permissionGranted
              ? 'Enable sensors first'
              : 'Tap to capture measurement'
          }
        </p>
      </div>

      {/* Results Card */}
      {snapshot && (
        <div className="mt-4 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-4 max-w-md mx-auto w-full shadow-xl">
          <h3 className="text-white text-sm font-semibold mb-3 text-center">
            MEASUREMENT RESULTS
          </h3>

          {/* Results Grid */}
          <div className="space-y-2">
            {/* Header Row */}
            <div className="grid grid-cols-4 gap-2 text-xs text-white/60 font-medium">
              <div></div>
              <div className="text-center">YOUR</div>
              <div className="text-center">NASA</div>
              <div className="text-center">DELTA</div>
            </div>

            {/* Azimuth Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-white/10 rounded-lg p-2">
              <div className="text-white/70 text-sm">Azimuth</div>
              <div className="text-center font-mono text-white text-sm">
                {formatValue(snapshot.sensor.azimuth)}
              </div>
              <div className="text-center font-mono text-blue-300 text-sm">
                {formatValue(snapshot.nasa.azimuth)}
              </div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.azimuth)}`}>
                {formatDelta(snapshot.delta.azimuth)}
              </div>
            </div>

            {/* Altitude Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-white/10 rounded-lg p-2">
              <div className="text-white/70 text-sm">Altitude</div>
              <div className="text-center font-mono text-white text-sm">
                {formatValue(snapshot.sensor.altitude)}
              </div>
              <div className="text-center font-mono text-blue-300 text-sm">
                {formatValue(snapshot.nasa.altitude)}
              </div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.altitude)}`}>
                {formatDelta(snapshot.delta.altitude)}
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-white/50 text-xs text-center mt-3">
            Captured at {snapshot.timestamp.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  )
}
