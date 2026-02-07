import { useState, useMemo, useEffect, useCallback } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, type SunPosition } from '@/services/api'
import { normalizeOrientation } from '@/utils/sensorMath'

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
}

const LOCK_THRESHOLD = 5 // degrees

/**
 * Guidance HUD component - shows directional arrows to guide user to target
 */
function GuidanceHUD({ guidance }: { guidance: GuidanceState }) {
  const { needsRight, needsLeft, needsUp, needsDown, azimuthLocked, altitudeLocked, fullyLocked } = guidance

  return (
    <div className="flex flex-col items-center my-6">
      {/* Targeting Ring */}
      <div
        className={`
          relative w-40 h-40 rounded-full border-4 flex items-center justify-center
          transition-all duration-300
          ${fullyLocked
            ? 'border-green-400 shadow-lg shadow-green-500/40 animate-pulse'
            : 'border-orange-400 shadow-lg shadow-orange-500/20'
          }
        `}
      >
        {/* Center Icon */}
        <Crosshair
          className={`w-12 h-12 transition-colors duration-300 ${
            fullyLocked ? 'text-green-400' : 'text-orange-400'
          }`}
        />

        {/* Direction Arrows */}
        {/* Up Arrow */}
        {needsUp && !altitudeLocked && (
          <ChevronUp
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce"
          />
        )}

        {/* Down Arrow */}
        {needsDown && !altitudeLocked && (
          <ChevronDown
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 text-orange-400 animate-bounce"
          />
        )}

        {/* Left Arrow */}
        {needsLeft && !azimuthLocked && (
          <ChevronLeft
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 text-orange-400 animate-pulse"
          />
        )}

        {/* Right Arrow */}
        {needsRight && !azimuthLocked && (
          <ChevronRight
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 text-orange-400 animate-pulse"
          />
        )}
      </div>

      {/* Status Text */}
      <p className={`mt-4 text-sm font-semibold tracking-wide ${
        fullyLocked ? 'text-green-400' : 'text-orange-400'
      }`}>
        {fullyLocked ? 'TARGET ACQUIRED' : 'ACQUIRING TARGET...'}
      </p>

      {/* Delta Display */}
      <div className="flex gap-6 mt-2 text-xs">
        <span className={azimuthLocked ? 'text-green-400' : 'text-slate-400'}>
          Az: {guidance.azimuthDelta >= 0 ? '+' : ''}{guidance.azimuthDelta.toFixed(1)}°
        </span>
        <span className={altitudeLocked ? 'text-green-400' : 'text-slate-400'}>
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

    const azimuthDelta = normalizedSensor.azimuth - targetPosition.azimuth
    const altitudeDelta = normalizedSensor.altitude - targetPosition.altitude

    const azimuthLocked = Math.abs(azimuthDelta) <= LOCK_THRESHOLD
    const altitudeLocked = Math.abs(altitudeDelta) <= LOCK_THRESHOLD

    return {
      azimuthDelta,
      altitudeDelta,
      needsRight: azimuthDelta < -LOCK_THRESHOLD, // Sensor < Target -> turn right
      needsLeft: azimuthDelta > LOCK_THRESHOLD,   // Sensor > Target -> turn left
      needsUp: altitudeDelta < -LOCK_THRESHOLD,   // Sensor < Target -> look up
      needsDown: altitudeDelta > LOCK_THRESHOLD,  // Sensor > Target -> look down
      azimuthLocked,
      altitudeLocked,
      fullyLocked: azimuthLocked && altitudeLocked,
    }
  }, [normalizedSensor, targetPosition])

  const isReady = permissionGranted && coordinates && normalizedSensor

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
          disabled={!isReady || isCapturing}
          className={`
            w-20 h-20 rounded-full border-4 flex items-center justify-center
            transition-all duration-200 cursor-pointer
            ${isReady && !isCapturing
              ? guidance?.fullyLocked
                ? 'bg-green-500 border-green-300 hover:bg-green-400 hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30'
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
          {!coordinates ? 'Waiting for GPS...' : !permissionGranted ? 'Enable sensors first' : 'Tap to capture'}
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
