import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X, Sun, Glasses, Timer } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, saveMeasurement, RateLimitError, type SunPosition } from '@/services/api'
import { normalizeOrientation, getShortestAngle } from '@/utils/sensorMath'
import { getTrueNorth } from '@/utils/magnetic'
import { CameraBackground } from '@/features/sensor-read/components/CameraBackground'
import { GuidanceHUD, type GuidanceState } from './GuidanceHUD'

interface Snapshot {
  sensor: { azimuth: number; altitude: number }
  nasa: { azimuth: number; altitude: number }
  delta: { azimuth: number; altitude: number }
  timestamp: Date
}

const LOCK_THRESHOLD = 5 // degrees - fully locked
const FINE_THRESHOLD = 15 // degrees - switch to fine guidance
const CAPTURE_THRESHOLD = 20 // degrees - enable capture button

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

  // Hidden dev feature: tap header 5 times to reset calibration
  const [devTapCount, setDevTapCount] = useState(0)
  const [lastTapTime, setLastTapTime] = useState(0)

  // Sun mode for glare reduction (visual overlay only)
  const [isSunModeActive, setIsSunModeActive] = useState(false)

  // Self-timer for shake-free capture
  const [isTimerEnabled, setIsTimerEnabled] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  // Audio context for countdown beeps (initialized on first user interaction)
  const audioContextRef = useRef<AudioContext | null>(null)

  // Initialize AudioContext on first user interaction (browser policy)
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  // Play a beep sound using Web Audio API
  const playBeep = useCallback((frequency: number, duration: number) => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    // Fade out to avoid click
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)
  }, [])

  // Normalize raw sensor data to astronomical coordinates
  const normalizedSensor = useMemo(() => {
    if (!sensorData) return null
    return normalizeOrientation(sensorData.alpha, sensorData.beta, sensorData.gamma)
  }, [sensorData])

  // Apply magnetic declination correction to get True North azimuth
  const magneticCorrection = useMemo(() => {
    if (!normalizedSensor || !coordinates) return null
    return getTrueNorth(
      normalizedSensor.azimuth,
      coordinates.latitude,
      coordinates.longitude
    )
  }, [normalizedSensor, coordinates])

  // The corrected sensor values (True North)
  const correctedSensor = useMemo(() => {
    if (!normalizedSensor) return null
    if (!magneticCorrection) return normalizedSensor // Fallback if no GPS
    return {
      azimuth: magneticCorrection.trueAzimuth,
      altitude: normalizedSensor.altitude, // Altitude unchanged
    }
  }, [normalizedSensor, magneticCorrection])

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
    if (!correctedSensor || !targetPosition) return null

    // Use shortest angle for azimuth to handle 0-360 wrap-around
    // Positive = need to turn RIGHT, Negative = need to turn LEFT
    const azimuthDelta = getShortestAngle(targetPosition.azimuth, correctedSensor.azimuth)
    const altitudeDelta = targetPosition.altitude - correctedSensor.altitude

    const absAzimuth = Math.abs(azimuthDelta)
    const absAltitude = Math.abs(altitudeDelta)
    const maxDelta = Math.max(absAzimuth, absAltitude)

    const azimuthLocked = absAzimuth <= LOCK_THRESHOLD
    const altitudeLocked = absAltitude <= LOCK_THRESHOLD

    return {
      azimuthDelta,
      altitudeDelta,
      needsRight: azimuthDelta > FINE_THRESHOLD, // Only show in coarse mode
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
  }, [correctedSensor, targetPosition])

  const isReady = permissionGranted && coordinates && correctedSensor
  // Always enable capture when sensors are ready - no accuracy threshold required
  const canCapture = isReady

  // Check if sun is below horizon (night mode)
  const isNightMode = targetPosition && targetPosition.altitude < 0

  const handleMeasure = async () => {
    if (!coordinates || !correctedSensor || !normalizedSensor) {
      setError('GPS and sensors must be ready before capturing')
      return
    }

    setIsCapturing(true)
    setError(null)

    // Freeze current sensor values at moment of capture
    // device_azimuth = True North (corrected)
    // magnetic_azimuth = raw sensor value (magnetic north)
    const capturedSensor = {
      azimuth: correctedSensor.azimuth, // True North
      altitude: correctedSensor.altitude,
      magneticAzimuth: normalizedSensor.azimuth, // Raw magnetic
      magneticDeclination: magneticCorrection?.declination ?? 0,
    }

    try {
      // Save measurement to backend with both true and magnetic values
      const result = await saveMeasurement(
        coordinates.latitude,
        coordinates.longitude,
        capturedSensor.azimuth,
        capturedSensor.altitude,
        capturedSensor.magneticAzimuth,
        capturedSensor.magneticDeclination
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

  // Handle capture button click - either immediate or start countdown
  const handleCaptureClick = () => {
    // Initialize audio on user gesture (browser policy)
    initAudioContext()

    if (countdown !== null) {
      // Cancel ongoing countdown
      setCountdown(null)
      return
    }

    if (isTimerEnabled) {
      // Start 5-second countdown
      setCountdown(5)
    } else {
      // Immediate capture
      handleMeasure()
    }
  }

  // Countdown timer effect with audio cues
  useEffect(() => {
    if (countdown === null) return

    // Play audio cues
    if (countdown <= 3 && countdown > 0) {
      // High-pitched beep for 3, 2, 1
      playBeep(880, 100)
    } else if (countdown === 0) {
      // Lower, longer "shutter" sound for capture
      playBeep(440, 300)
      // Timer finished - take the shot
      handleMeasure()
      setCountdown(null)
      return
    }

    // Decrement every second
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, playBeep])

  // Hidden dev feature: tap header 5 times within 2 seconds to reset calibration
  const handleHeaderTap = () => {
    const now = Date.now()
    // Reset counter if more than 2 seconds since last tap
    if (now - lastTapTime > 2000) {
      setDevTapCount(1)
    } else {
      setDevTapCount((c) => c + 1)
    }
    setLastTapTime(now)

    // Trigger reset on 5th tap
    if (devTapCount >= 4) {
      localStorage.removeItem('helios_calibrated')
      setDevTapCount(0)
      window.location.reload()
    }
  }

  return (
    <div className="w-full min-h-screen p-4 flex flex-col relative">
      {/* AR Camera Background - z-0 */}
      <CameraBackground />

      {/* Sun Mode Overlay - "Sniper Scope" effect with very dark edges */}
      {isSunModeActive && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          {/* Dark overlay with tiny peephole */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, transparent 6%, rgba(255, 0, 0, 0.5) 6%, rgba(255, 0, 0, 0.5) 8%, rgba(0, 0, 0, 0.98) 8%, black 100%)',
            }}
          />
          {/* Sunglasses instruction - bottom of screen */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 px-4 py-2 bg-amber-900/90 backdrop-blur-sm border border-amber-400/50 rounded-full shadow-lg">
            <Glasses className="w-5 h-5 text-amber-300" />
            <span className="text-amber-200 text-sm font-medium">Place sunglasses over camera lens</span>
          </div>
        </div>
      )}

      {/* Countdown UI - top center number + border flash (doesn't block view) */}
      {countdown !== null && (
        <>
          {/* Flashing red border around screen */}
          <div
            className="fixed inset-0 z-[55] pointer-events-none border-4 border-red-500 animate-pulse"
            style={{
              boxShadow: 'inset 0 0 30px rgba(239, 68, 68, 0.4)',
            }}
          />
          {/* Countdown number at top center */}
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
            <span
              className="text-5xl font-bold text-red-500 drop-shadow-lg animate-pulse"
              style={{
                textShadow: '0 0 20px rgba(239, 68, 68, 0.6), 0 2px 10px rgba(0,0,0,0.8)',
              }}
            >
              {countdown}
            </span>
          </div>
        </>
      )}

      {/* Sun Mode Toggle Button - top left corner */}
      <button
        onClick={() => setIsSunModeActive((prev) => !prev)}
        className={`
          absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full
          backdrop-blur-sm border transition-all cursor-pointer shadow-lg
          ${isSunModeActive
            ? 'bg-amber-500/50 border-amber-400/70 text-amber-200'
            : 'bg-black/50 border-white/20 text-white/70 hover:border-white/40'
          }
        `}
      >
        <Sun className={`w-4 h-4 ${isSunModeActive ? 'animate-pulse' : ''}`} />
        <span className="text-xs font-medium">
          {isSunModeActive ? 'SUN MODE ON' : 'Sun Mode'}
        </span>
      </button>

      {/* Header Badge - tap 5 times to reset calibration */}
      <div className="text-center mb-4 z-50 relative">
        <button
          onClick={handleHeaderTap}
          className="inline-flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-sm border border-blue-400/30 rounded-full text-blue-300 text-sm font-medium shadow-lg cursor-pointer"
        >
          <Compass className="w-4 h-4" />
          PROJECT HELIOS
        </button>
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
      <div className="flex-1 flex flex-col items-center justify-center z-50 relative">
        <div className={`
          text-center mb-4 backdrop-blur-md rounded-2xl px-6 py-4 shadow-xl border
          ${isSunModeActive
            ? 'bg-black/95 border-cyan-400/50'
            : 'bg-black/50 border-white/10'
          }
        `}>
          <span className={`
            inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider mb-4 border
            ${isSunModeActive
              ? 'bg-cyan-500/30 border-cyan-400/40 text-cyan-400'
              : 'bg-green-500/30 border-green-400/40 text-green-400'
            }
          `}>
            LIVE SENSOR
          </span>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className={`text-sm mb-1 ${isSunModeActive ? 'text-cyan-300/80' : 'text-white/60'}`}>
                AZIMUTH (TRUE N)
              </p>
              <p
                className={`text-4xl font-mono font-bold drop-shadow-lg ${isSunModeActive ? 'text-cyan-400' : 'text-white'}`}
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
              >
                {correctedSensor ? formatValue(correctedSensor.azimuth) : '—'}
              </p>
            </div>
            <div>
              <p className={`text-sm mb-1 ${isSunModeActive ? 'text-cyan-300/80' : 'text-white/60'}`}>
                ALTITUDE
              </p>
              <p
                className={`text-4xl font-mono font-bold drop-shadow-lg ${isSunModeActive ? 'text-cyan-400' : 'text-white'}`}
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
              >
                {correctedSensor ? formatValue(correctedSensor.altitude) : '—'}
              </p>
            </div>
          </div>
          {magneticCorrection && (
            <p className={`text-xs mt-2 font-mono ${isSunModeActive ? 'text-lime-400/80' : 'text-amber-400/80'}`}>
              Magnetic Declination: {magneticCorrection.declination >= 0 ? '+' : ''}
              {magneticCorrection.declination.toFixed(1)}°
            </p>
          )}
          <p className={`text-xs mt-1 ${isSunModeActive ? 'text-cyan-300/40' : 'text-white/40'}`}>
            (Assumes Portrait Mode)
          </p>
        </div>

        {/* Target Info */}
        {targetPosition && (
          <div className={`
            text-center mb-2 backdrop-blur-sm rounded-xl px-4 py-2 border
            ${isSunModeActive ? 'bg-black/95 border-lime-400/50' : 'bg-black/40 border-white/10'}
          `}>
            <span className={`
              inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider mb-2 border
              ${isSunModeActive
                ? 'bg-lime-500/30 border-lime-400/40 text-lime-300'
                : 'bg-blue-500/30 border-blue-400/40 text-blue-300'
              }
            `}>
              TARGET (SUN)
            </span>
            <div className="flex gap-6 text-sm">
              <span className={`font-mono drop-shadow-md ${isSunModeActive ? 'text-lime-300' : 'text-blue-200'}`}>
                Az: {formatValue(targetPosition.azimuth)}
              </span>
              <span className={`font-mono drop-shadow-md ${isSunModeActive ? 'text-lime-300' : 'text-blue-200'}`}>
                Alt: {formatValue(targetPosition.altitude)}
              </span>
            </div>
          </div>
        )}

        {/* Guidance HUD */}
        {guidance && <GuidanceHUD guidance={guidance} isNightMode={!!isNightMode} isSunMode={isSunModeActive} />}

        {/* Capture Controls - Timer toggle + Capture button */}
        <div className="flex items-center gap-3">
          {/* Timer Toggle Button */}
          <button
            onClick={() => setIsTimerEnabled((prev) => !prev)}
            disabled={countdown !== null}
            className={`
              w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center
              transition-all duration-200 cursor-pointer
              ${isTimerEnabled
                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40'
                : 'bg-black/50 border-white/30 text-white/70 hover:border-white/50'
              }
              ${countdown !== null ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            title={isTimerEnabled ? 'Timer enabled (5s)' : 'Enable 5s timer'}
          >
            <Timer className="w-5 h-5" />
            <span className="text-[10px] font-bold">5s</span>
          </button>

          {/* Main Capture Button */}
          <button
            onClick={handleCaptureClick}
            disabled={!canCapture || isCapturing}
            className={`
              w-20 h-20 rounded-full border-4 flex items-center justify-center
              transition-all duration-200 cursor-pointer
              ${
                countdown !== null
                  ? 'bg-red-500 border-red-300 hover:bg-red-400 shadow-lg shadow-red-500/50'
                  : canCapture && !isCapturing
                    ? isSunModeActive
                      ? 'bg-cyan-500 border-cyan-300 hover:bg-cyan-400 hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/50 animate-pulse'
                      : guidance?.fullyLocked
                        ? 'bg-green-500 border-green-300 hover:bg-green-400 hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30 animate-pulse'
                        : 'bg-blue-500 border-blue-300 hover:bg-blue-400 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30 animate-[pulse_2s_ease-in-out_infinite]'
                    : 'bg-slate-700 border-slate-600 cursor-not-allowed opacity-50'
              }
            `}
          >
            {isCapturing ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : countdown !== null ? (
              <X className="w-8 h-8 text-white" />
            ) : (
              <Camera className={`w-8 h-8 ${isSunModeActive ? 'text-black' : 'text-white'}`} />
            )}
          </button>
        </div>

        <p className="text-white/70 text-sm mt-2 drop-shadow-md" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {countdown !== null
            ? 'Tap to cancel'
            : !coordinates
              ? 'Waiting for GPS...'
              : !permissionGranted
              ? 'Enable sensors first'
              : 'Tap to capture measurement'}
        </p>
      </div>

      {/* Results Card */}
      {snapshot && (
        <div className="mt-4 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-4 max-w-md mx-auto w-full shadow-xl">
          <h3 className="text-white text-sm font-semibold mb-3 text-center">MEASUREMENT RESULTS</h3>

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
              <div className="text-center font-mono text-white text-sm">{formatValue(snapshot.sensor.azimuth)}</div>
              <div className="text-center font-mono text-blue-300 text-sm">{formatValue(snapshot.nasa.azimuth)}</div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.azimuth)}`}>
                {formatDelta(snapshot.delta.azimuth)}
              </div>
            </div>

            {/* Altitude Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-white/10 rounded-lg p-2">
              <div className="text-white/70 text-sm">Altitude</div>
              <div className="text-center font-mono text-white text-sm">{formatValue(snapshot.sensor.altitude)}</div>
              <div className="text-center font-mono text-blue-300 text-sm">{formatValue(snapshot.nasa.altitude)}</div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.altitude)}`}>
                {formatDelta(snapshot.delta.altitude)}
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-white/50 text-xs text-center mt-3">Captured at {snapshot.timestamp.toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  )
}
