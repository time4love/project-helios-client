import { useState, useMemo, useEffect, useCallback } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, type SunPosition } from '@/services/api'
import { normalizeOrientation, getShortestAngle } from '@/utils/sensorMath'

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
 * Professional crosshair reticle - thin white lines with gap in center
 */
function CrosshairReticle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      {/* Horizontal lines with gap */}
      <line x1="0" y1="50" x2="35" y2="50" stroke={color} strokeWidth="1.5" />
      <line x1="65" y1="50" x2="100" y2="50" stroke={color} strokeWidth="1.5" />
      {/* Vertical lines with gap */}
      <line x1="50" y1="0" x2="50" y2="35" stroke={color} strokeWidth="1.5" />
      <line x1="50" y1="65" x2="50" y2="100" stroke={color} strokeWidth="1.5" />
      {/* Center dot */}
      <circle cx="50" cy="50" r="3" fill={color} />
    </svg>
  )
}

/**
 * Guidance HUD component - shows directional arrows to guide user to target
 * Coarse mode (>15°): arrows + orange ring
 * Fine mode (<15°): no arrows, yellow/green ring, "ALIGN VISUALLY"
 */
function GuidanceHUD({ guidance }: { guidance: GuidanceState }) {
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

  const getStatusText = () => {
    if (fullyLocked) return 'TARGET ACQUIRED'
    if (isFine) return 'ALIGN VISUALLY WITH SUN'
    return 'ACQUIRING TARGET...'
  }

  const getTextColor = () => {
    if (fullyLocked) return 'text-green-400'
    if (isFine) return 'text-yellow-400'
    return 'text-orange-400'
  }

  return (
    <div className="flex flex-col items-center my-6">
      {/* Targeting Ring */}
      <div
        className={`
          relative w-40 h-40 rounded-full border-4 flex items-center justify-center
          transition-all duration-300 shadow-lg
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
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce"
              />
            )}
            {needsDown && (
              <ChevronDown
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce"
              />
            )}
            {needsLeft && (
              <ChevronLeft
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 text-orange-400 animate-pulse"
              />
            )}
            {needsRight && (
              <ChevronRight
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 text-orange-400 animate-pulse"
              />
            )}
          </>
        )}
      </div>

      {/* Status Text */}
      <p className={`mt-4 text-sm font-semibold tracking-wide ${getTextColor()}`}>
        {getStatusText()}
      </p>

      {/* Delta Display */}
      <div className="flex gap-6 mt-2 text-xs">
        <span className={guidance.azimuthLocked ? 'text-green-400' : 'text-slate-400'}>
          Az: {guidance.azimuthDelta >= 0 ? '+' : ''}{guidance.azimuthDelta.toFixed(1)}°
        </span>
        <span className={guidance.altitudeLocked ? 'text-green-400' : 'text-slate-400'}>
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
  // Enable capture when sensors ready AND within capture threshold (or always ready if no guidance yet)
  const canCapture = isReady && (!guidance || guidance.canCapture)

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
      const nasa = await fetchSunPosition(coordinates.latitude, coordinates.longitude)

      const delta = {
        azimuth: capturedSensor.azimuth - nasa.azimuth,
        altitude: capturedSensor.altitude - nasa.altitude,
      }

      setSnapshot({
        sensor: capturedSensor,
        nasa,
        delta,
        timestamp: new Date(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch solar position')
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
    <div className="w-full min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col">
      {/* Header Badge */}
      <div className="text-center mb-4">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-300 text-sm font-medium">
          <Compass className="w-4 h-4" />
          PROJECT HELIOS
        </span>
        {coordinates && (
          <p className="text-slate-500 text-xs mt-2 flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" />
            {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
          </p>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="mb-4 mx-auto max-w-sm bg-red-500/20 border border-red-400/30 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm flex-1">{error}</p>
          <button onClick={dismissError} className="text-red-400 hover:text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Permission Request */}
      {!permissionGranted && (
        <div className="mb-4 mx-auto max-w-sm bg-slate-800/50 border border-slate-600/50 rounded-xl p-4 text-center">
          <p className="text-slate-300 mb-3 text-sm">Enable sensors to measure orientation</p>
          <button
            onClick={requestAccess}
            className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Enable Sensors
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {(sensorError || geoError) && (
        <div className="mb-4 mx-auto max-w-sm text-center space-y-1">
          {sensorError && <p className="text-amber-400 text-xs">Sensor: {sensorError}</p>}
          {geoError && <p className="text-amber-400 text-xs">GPS: {geoError}</p>}
        </div>
      )}

      {/* Live Sensor Feed */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-4">
          <span className="inline-block px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full text-green-400 text-xs font-semibold tracking-wider mb-4">
            LIVE SENSOR
          </span>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-slate-500 text-sm mb-1">AZIMUTH</p>
              <p className="text-4xl font-mono font-bold text-white">
                {normalizedSensor ? formatValue(normalizedSensor.azimuth) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-sm mb-1">ALTITUDE</p>
              <p className="text-4xl font-mono font-bold text-white">
                {normalizedSensor ? formatValue(normalizedSensor.altitude) : '—'}
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-xs mt-2">(Assumes Portrait Mode)</p>
        </div>

        {/* Target Info */}
        {targetPosition && (
          <div className="text-center mb-2">
            <span className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-400 text-xs font-semibold tracking-wider mb-2">
              TARGET (SUN)
            </span>
            <div className="flex gap-6 text-sm">
              <span className="text-blue-300 font-mono">Az: {formatValue(targetPosition.azimuth)}</span>
              <span className="text-blue-300 font-mono">Alt: {formatValue(targetPosition.altitude)}</span>
            </div>
          </div>
        )}

        {/* Guidance HUD */}
        {guidance && <GuidanceHUD guidance={guidance} />}

        {/* Capture Button */}
        <button
          onClick={handleMeasure}
          disabled={!canCapture || isCapturing}
          className={`
            w-20 h-20 rounded-full border-4 flex items-center justify-center
            transition-all duration-200 cursor-pointer
            ${canCapture && !isCapturing
              ? guidance?.fullyLocked
                ? 'bg-green-500 border-green-300 hover:bg-green-400 hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30'
                : guidance?.isFine
                  ? 'bg-yellow-500 border-yellow-300 hover:bg-yellow-400 hover:scale-105 active:scale-95 shadow-lg shadow-yellow-500/30'
                  : 'bg-blue-500 border-blue-300 hover:bg-blue-400 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30'
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
        <p className="text-slate-500 text-sm mt-2">
          {!coordinates
            ? 'Waiting for GPS...'
            : !permissionGranted
              ? 'Enable sensors first'
              : !canCapture
                ? 'Get closer to target (<20°)'
                : 'Capture what YOU see'
          }
        </p>
      </div>

      {/* Results Card */}
      {snapshot && (
        <div className="mt-4 bg-slate-800/70 border border-slate-600/50 rounded-2xl p-4 max-w-md mx-auto w-full">
          <h3 className="text-slate-300 text-sm font-semibold mb-3 text-center">
            MEASUREMENT RESULTS
          </h3>

          {/* Results Grid */}
          <div className="space-y-2">
            {/* Header Row */}
            <div className="grid grid-cols-4 gap-2 text-xs text-slate-500 font-medium">
              <div></div>
              <div className="text-center">YOUR</div>
              <div className="text-center">NASA</div>
              <div className="text-center">DELTA</div>
            </div>

            {/* Azimuth Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-slate-700/50 rounded-lg p-2">
              <div className="text-slate-400 text-sm">Azimuth</div>
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
            <div className="grid grid-cols-4 gap-2 items-center bg-slate-700/50 rounded-lg p-2">
              <div className="text-slate-400 text-sm">Altitude</div>
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
          <p className="text-slate-500 text-xs text-center mt-3">
            Captured at {snapshot.timestamp.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  )
}
