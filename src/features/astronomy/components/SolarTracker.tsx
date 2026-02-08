import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X, Sun, Timer, Check, Trash2, Lightbulb, Scale, Navigation, Volume2, VolumeX, HelpCircle } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, saveMeasurement, RateLimitError, type SunPosition, type CollectionMethod } from '@/services/api'
import { normalizeOrientation, getShortestAngle } from '@/utils/sensorMath'
import { getTrueNorth } from '@/utils/magnetic'
import { CameraBackground } from '@/features/sensor-read/components/CameraBackground'
import { GuidanceHUD, type GuidanceState } from './GuidanceHUD'
import { LevelCalibration } from '@/features/sensor-read/components/LevelCalibration'
import { ShadowTutorial } from './ShadowTutorial'

interface Snapshot {
  sensor: { azimuth: number; altitude: number }
  nasa: { azimuth: number; altitude: number }
  delta: { azimuth: number; altitude: number }
  timestamp: Date
}

interface PendingMeasurement {
  deviceAzimuth: number
  deviceAltitude: number
  magneticAzimuth: number
  magneticDeclination: number
  targetAzimuth: number
  targetAltitude: number
  latitude: number
  longitude: number
  timestamp: Date
  collectionMethod: CollectionMethod
}

type ViewMode = 'SHADOW' | 'CAMERA'

interface SunQuality {
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  label: string
  color: string
  bgColor: string
}

const LOCK_THRESHOLD = 5 // degrees - fully locked
const FINE_THRESHOLD = 15 // degrees - switch to fine guidance
const CAPTURE_THRESHOLD = 20 // degrees - enable capture button

/**
 * Calculate sun quality based on altitude
 */
function getSunQuality(altitude: number): SunQuality {
  if (altitude < 15) {
    return { level: 'LOW', label: 'Sun too low', color: 'text-red-400', bgColor: 'bg-red-500/20' }
  } else if (altitude <= 45) {
    return { level: 'MEDIUM', label: 'Acceptable', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' }
  } else {
    return { level: 'HIGH', label: 'Optimal', color: 'text-green-400', bgColor: 'bg-green-500/20' }
  }
}

/**
 * Manual capture solar tracker with targeting system.
 * Features Shadow Mode (default) for scientifically robust measurements
 * and Camera Mode (pro) for visual alignment.
 */
export function SolarTracker() {
  const { data: sensorData, permissionGranted, requestAccess, error: sensorError, isLevelCalibrated } = useDeviceOrientation()
  const { coordinates, error: geoError } = useGeoLocation()
  const [isCapturing] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetPosition, setTargetPosition] = useState<SunPosition | null>(null)

  // View mode: Shadow (default) or Camera (pro)
  const [viewMode, setViewMode] = useState<ViewMode>('SHADOW')

  // Level calibration modal
  const [showLevelCalibration, setShowLevelCalibration] = useState(false)

  // Shadow tutorial modal (manual open via help button)
  const [showTutorial, setShowTutorial] = useState(false)

  // Audio feedback toggle
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)

  // Hidden dev feature: tap header 5 times to reset calibration
  const [devTapCount, setDevTapCount] = useState(0)
  const [lastTapTime, setLastTapTime] = useState(0)

  // Self-timer for shake-free capture
  const [isTimerEnabled, setIsTimerEnabled] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  // Review workflow state
  const [pendingMeasurement, setPendingMeasurement] = useState<PendingMeasurement | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Audio context for Geiger counter feedback
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const lastClickTimeRef = useRef<number>(0)

  // Initialize AudioContext on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  // Play a click sound for Geiger counter effect
  const playClick = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = 1000
    oscillator.type = 'square'

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.05)
  }, [])

  // Start continuous lock-on tone
  const startLockTone = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx || oscillatorRef.current) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = 880
    oscillator.type = 'sine'
    gainNode.gain.value = 0.1

    oscillator.start()

    oscillatorRef.current = oscillator
    gainNodeRef.current = gainNode
  }, [])

  // Stop continuous lock-on tone
  const stopLockTone = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop()
      oscillatorRef.current.disconnect()
      oscillatorRef.current = null
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
  }, [])

  // Play countdown beep
  const playBeep = useCallback((frequency: number, duration: number) => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

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
    if (!magneticCorrection) return normalizedSensor
    return {
      azimuth: magneticCorrection.trueAzimuth,
      altitude: normalizedSensor.altitude,
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

    fetchTarget()
    const intervalId = setInterval(fetchTarget, 60000)

    return () => clearInterval(intervalId)
  }, [coordinates, fetchTarget])

  // Calculate sun quality
  const sunQuality = useMemo<SunQuality | null>(() => {
    if (!targetPosition || targetPosition.altitude < 0) return null
    return getSunQuality(targetPosition.altitude)
  }, [targetPosition])

  // Calculate guidance state
  const guidance = useMemo<GuidanceState | null>(() => {
    if (!correctedSensor || !targetPosition) return null

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
      needsRight: azimuthDelta > FINE_THRESHOLD,
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

  // Geiger counter audio feedback effect
  useEffect(() => {
    if (!isAudioEnabled || !guidance || !audioContextRef.current) {
      stopLockTone()
      return
    }

    const totalDelta = Math.abs(guidance.azimuthDelta) + Math.abs(guidance.altitudeDelta)

    if (totalDelta < 3) {
      // Lock-on: continuous tone
      startLockTone()
    } else {
      stopLockTone()

      if (totalDelta <= 20) {
        // Variable clicking: faster as we get closer
        // Map delta 5-20 to interval 100ms-1000ms
        const interval = Math.max(100, Math.min(1000, (totalDelta / 20) * 900 + 100))
        const now = Date.now()

        if (now - lastClickTimeRef.current >= interval) {
          playClick()
          lastClickTimeRef.current = now
        }
      }
      // > 20 degrees: silence
    }

    return () => {
      stopLockTone()
    }
  }, [guidance, isAudioEnabled, playClick, startLockTone, stopLockTone])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopLockTone()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopLockTone])

  const isReady = permissionGranted && coordinates && correctedSensor
  const canCapture = isReady
  const isNightMode = targetPosition && targetPosition.altitude < 0

  // Capture measurement data WITHOUT calling API - goes to review modal
  const handleMeasure = () => {
    if (!coordinates || !correctedSensor || !normalizedSensor || !targetPosition) {
      setError('GPS, sensors, and target position must be ready before capturing')
      return
    }

    // Capture viewMode at the moment of measurement (not at submit time)
    const pending: PendingMeasurement = {
      deviceAzimuth: correctedSensor.azimuth,
      deviceAltitude: correctedSensor.altitude,
      magneticAzimuth: normalizedSensor.azimuth,
      magneticDeclination: magneticCorrection?.declination ?? 0,
      targetAzimuth: targetPosition.azimuth,
      targetAltitude: targetPosition.altitude,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timestamp: new Date(),
      collectionMethod: viewMode,
    }

    setPendingMeasurement(pending)
  }

  // Calculate quality assessment for pending measurement
  const getQualityAssessment = (pending: PendingMeasurement) => {
    const deltaAz = Math.abs(getShortestAngle(pending.targetAzimuth, pending.deviceAzimuth))
    const deltaAlt = Math.abs(pending.targetAltitude - pending.deviceAltitude)
    const maxDelta = Math.max(deltaAz, deltaAlt)

    if (maxDelta < 3) {
      return { level: 'excellent' as const, color: 'green', emoji: '🎯', text: 'High Precision!', deltaAz, deltaAlt }
    } else if (maxDelta < 10) {
      return { level: 'good' as const, color: 'yellow', emoji: '👌', text: 'Acceptable.', deltaAz, deltaAlt }
    } else {
      return { level: 'poor' as const, color: 'red', emoji: '⚠️', text: 'High Deviation Detected.', deltaAz, deltaAlt }
    }
  }

  const handleDiscard = () => {
    setPendingMeasurement(null)
  }

  const handleSubmit = async () => {
    if (!pendingMeasurement) return

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await saveMeasurement(
        pendingMeasurement.latitude,
        pendingMeasurement.longitude,
        pendingMeasurement.deviceAzimuth,
        pendingMeasurement.deviceAltitude,
        pendingMeasurement.magneticAzimuth,
        pendingMeasurement.magneticDeclination,
        pendingMeasurement.collectionMethod
      )

      setSnapshot({
        sensor: {
          azimuth: pendingMeasurement.deviceAzimuth,
          altitude: pendingMeasurement.deviceAltitude,
        },
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

      setPendingMeasurement(null)
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError('Please wait a moment before submitting.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save measurement')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatValue = (value: number): string => {
    return `${value.toFixed(1)}°`
  }

  const formatDelta = (value: number): string => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}°`
  }

  const getDeltaColor = (value: number): string => {
    return Math.abs(value) > 5 ? 'text-red-400' : 'text-green-400'
  }

  const dismissError = () => setError(null)

  const handleCaptureClick = () => {
    initAudioContext()

    if (countdown !== null) {
      setCountdown(null)
      return
    }

    if (isTimerEnabled) {
      setCountdown(5)
    } else {
      handleMeasure()
    }
  }

  // Countdown timer effect with audio cues
  useEffect(() => {
    if (countdown === null) return

    if (countdown <= 3 && countdown > 0) {
      playBeep(880, 100)
    } else if (countdown === 0) {
      playBeep(440, 300)
      handleMeasure()
      setCountdown(null)
      return
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, playBeep])

  // Hidden dev feature: tap header 5 times within 2 seconds to reset calibration
  const handleHeaderTap = () => {
    const now = Date.now()
    if (now - lastTapTime > 2000) {
      setDevTapCount(1)
    } else {
      setDevTapCount((c) => c + 1)
    }
    setLastTapTime(now)

    if (devTapCount >= 4) {
      localStorage.removeItem('helios_calibrated')
      localStorage.removeItem('helios_level_calibration')
      setDevTapCount(0)
      window.location.reload()
    }
  }

  // Calculate compass arrow rotation (pointing to where user should face)
  const compassRotation = useMemo(() => {
    if (!guidance) return 0
    // Arrow points toward target, so it should rotate by the azimuth delta
    return guidance.azimuthDelta
  }, [guidance])

  return (
    <div className="w-full min-h-screen flex flex-col relative">
      {/* Background: Camera (pro mode) or solid dark (shadow mode) */}
      {viewMode === 'CAMERA' ? (
        <CameraBackground />
      ) : (
        <div className="fixed inset-0 bg-slate-900 -z-10" />
      )}

      {/* Level Calibration Modal */}
      <LevelCalibration
        isOpen={showLevelCalibration}
        onClose={() => setShowLevelCalibration(false)}
        onCalibrated={() => window.location.reload()}
        sensorData={sensorData}
      />

      {/* Shadow Tutorial - auto-shows on first visit, can be reopened via help button */}
      <ShadowTutorial
        forceOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
      />

      {/* Countdown UI */}
      {countdown !== null && (
        <>
          <div
            className="fixed inset-0 z-[55] pointer-events-none border-4 border-red-500 animate-pulse"
            style={{ boxShadow: 'inset 0 0 30px rgba(239, 68, 68, 0.4)' }}
          />
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
            <span
              className="text-5xl font-bold text-red-500 drop-shadow-lg animate-pulse"
              style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.6), 0 2px 10px rgba(0,0,0,0.8)' }}
            >
              {countdown}
            </span>
          </div>
        </>
      )}

      {/* Review Modal */}
      {pendingMeasurement && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleDiscard} />
          <div className="relative bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold text-white text-center mb-4">Measurement Captured</h2>

            <div className="bg-black/40 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-white/60 text-xs mb-1">AZIMUTH</p>
                  <p className="text-2xl font-mono font-bold text-white">
                    {pendingMeasurement.deviceAzimuth.toFixed(2)}°
                  </p>
                </div>
                <div>
                  <p className="text-white/60 text-xs mb-1">ALTITUDE</p>
                  <p className="text-2xl font-mono font-bold text-white">
                    {pendingMeasurement.deviceAltitude.toFixed(2)}°
                  </p>
                </div>
              </div>
              <p className="text-white/40 text-xs text-center mt-2">
                {pendingMeasurement.timestamp.toLocaleTimeString()}
              </p>
            </div>

            {(() => {
              const quality = getQualityAssessment(pendingMeasurement)
              return (
                <>
                  <div className={`
                    rounded-xl p-4 mb-4 text-center border
                    ${quality.color === 'green' ? 'bg-green-500/20 border-green-400/40' : ''}
                    ${quality.color === 'yellow' ? 'bg-yellow-500/20 border-yellow-400/40' : ''}
                    ${quality.color === 'red' ? 'bg-red-500/20 border-red-400/40' : ''}
                  `}>
                    <p className={`text-lg font-semibold mb-1
                      ${quality.color === 'green' ? 'text-green-400' : ''}
                      ${quality.color === 'yellow' ? 'text-yellow-400' : ''}
                      ${quality.color === 'red' ? 'text-red-400' : ''}
                    `}>
                      {quality.emoji} {quality.text}
                    </p>
                    <p className="text-white/70 text-sm">
                      Est. Error: ~{Math.max(quality.deltaAz, quality.deltaAlt).toFixed(1)}°
                    </p>
                    <p className="text-white/50 text-xs mt-1">
                      (Az: ±{quality.deltaAz.toFixed(1)}°, Alt: ±{quality.deltaAlt.toFixed(1)}°)
                    </p>
                  </div>

                  {quality.level === 'poor' && (
                    <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-400/30 rounded-lg p-3 mb-4">
                      <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-amber-200 text-xs leading-relaxed">
                        Try using the timer, resting on a stable surface, or moving away from metal objects.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleDiscard}
                      disabled={isSubmitting}
                      className={`
                        flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all
                        ${quality.level === 'poor'
                          ? 'bg-red-500 hover:bg-red-400 text-white'
                          : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }
                        ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <Trash2 className="w-4 h-4" />
                      Discard
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className={`
                        flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all
                        ${quality.level !== 'poor'
                          ? 'bg-green-500 hover:bg-green-400 text-white'
                          : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }
                        ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {isSubmitting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="fixed top-4 left-4 right-4 z-[100] flex items-center justify-between">
        {/* Left: Calibrate Level + Audio Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLevelCalibration(true)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-sm border transition-all cursor-pointer shadow-lg
              ${isLevelCalibrated
                ? 'bg-green-500/30 border-green-400/50 text-green-300'
                : 'bg-black/50 border-white/20 text-white/70 hover:border-white/40'
              }
            `}
          >
            <Scale className="w-4 h-4" />
            <span className="text-xs font-medium">
              {isLevelCalibrated ? 'Level ✓' : 'Calibrate'}
            </span>
          </button>

          <button
            onClick={() => {
              initAudioContext()
              setIsAudioEnabled((prev) => !prev)
            }}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-sm border transition-all cursor-pointer shadow-lg
              ${isAudioEnabled
                ? 'bg-blue-500/30 border-blue-400/50 text-blue-300'
                : 'bg-black/50 border-white/20 text-white/70 hover:border-white/40'
              }
            `}
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Help button - only visible in Shadow mode */}
          {viewMode === 'SHADOW' && (
            <button
              onClick={() => setShowTutorial(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-sm border transition-all cursor-pointer shadow-lg bg-black/50 border-white/20 text-white/70 hover:border-white/40"
              title="How to use Shadow Method"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right: Mode Toggle */}
        <button
          onClick={() => setViewMode((prev) => (prev === 'SHADOW' ? 'CAMERA' : 'SHADOW'))}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-sm border transition-all cursor-pointer shadow-lg
            ${viewMode === 'CAMERA'
              ? 'bg-amber-500/30 border-amber-400/50 text-amber-300'
              : 'bg-black/50 border-white/20 text-white/70 hover:border-white/40'
            }
          `}
        >
          {viewMode === 'CAMERA' ? (
            <>
              <Camera className="w-4 h-4" />
              <span className="text-xs font-medium">Camera</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4" />
              <span className="text-xs font-medium">Shadow</span>
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 pt-20">
        {/* Header Badge */}
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

        {/* Shadow Mode: Big Data Display */}
        {viewMode === 'SHADOW' && (
          <>
            {/* Compass Arrow */}
            {guidance && (
              <div className="mb-6">
                <div
                  className="relative w-32 h-32 flex items-center justify-center"
                  style={{ transform: `rotate(${compassRotation}deg)`, transition: 'transform 0.3s ease-out' }}
                >
                  <Navigation
                    className={`w-24 h-24 ${guidance.fullyLocked ? 'text-green-400' : 'text-blue-400'}`}
                    style={{ filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.5))' }}
                  />
                </div>
                <p className="text-white/60 text-xs text-center mt-2">
                  {guidance.fullyLocked ? 'ON TARGET' : 'Point toward sun'}
                </p>
              </div>
            )}

            {/* Big Azimuth & Altitude Display */}
            <div className="text-center mb-6 backdrop-blur-md rounded-2xl px-4 sm:px-8 py-6 shadow-xl border bg-black/60 border-white/10 max-w-sm mx-auto">
              <div className="grid grid-cols-2 gap-4 sm:gap-8">
                <div>
                  <p className="text-white/60 text-sm mb-2">AZIMUTH</p>
                  <p
                    className="text-4xl sm:text-5xl font-mono font-bold text-white drop-shadow-lg"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    {correctedSensor ? formatValue(correctedSensor.azimuth) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-2">ALTITUDE</p>
                  <p
                    className="text-4xl sm:text-5xl font-mono font-bold text-white drop-shadow-lg"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    {correctedSensor ? formatValue(correctedSensor.altitude) : '—'}
                  </p>
                </div>
              </div>

              {/* Sun Quality Indicator */}
              {sunQuality && (
                <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full ${sunQuality.bgColor}`}>
                  <div className={`w-2 h-2 rounded-full ${sunQuality.level === 'HIGH' ? 'bg-green-400' : sunQuality.level === 'MEDIUM' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className={`text-sm font-medium ${sunQuality.color}`}>
                    {sunQuality.level}: {sunQuality.label}
                  </span>
                </div>
              )}

              {magneticCorrection && (
                <p className="text-amber-400/80 text-xs mt-3 font-mono">
                  Mag. Decl: {magneticCorrection.declination >= 0 ? '+' : ''}{magneticCorrection.declination.toFixed(1)}°
                </p>
              )}
            </div>

            {/* Instruction */}
            <p className="text-white/70 text-sm mb-4 text-center max-w-xs">
              {isAudioEnabled
                ? 'Minimize your shadow. Listen for the lock-on tone.'
                : 'Minimize your shadow on the ground.'}
            </p>
          </>
        )}

        {/* Camera Mode: Existing Guidance HUD */}
        {viewMode === 'CAMERA' && (
          <>
            {/* Live Sensor Feed (compact) */}
            <div className="text-center mb-4 backdrop-blur-md rounded-2xl px-6 py-4 shadow-xl border bg-black/50 border-white/10">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider mb-4 border bg-green-500/30 border-green-400/40 text-green-400">
                LIVE SENSOR
              </span>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-white/60 text-sm mb-1">AZIMUTH (TRUE N)</p>
                  <p className="text-4xl font-mono font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    {correctedSensor ? formatValue(correctedSensor.azimuth) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-1">ALTITUDE</p>
                  <p className="text-4xl font-mono font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    {correctedSensor ? formatValue(correctedSensor.altitude) : '—'}
                  </p>
                </div>
              </div>
              {magneticCorrection && (
                <p className="text-amber-400/80 text-xs mt-2 font-mono">
                  Magnetic Declination: {magneticCorrection.declination >= 0 ? '+' : ''}{magneticCorrection.declination.toFixed(1)}°
                </p>
              )}
            </div>

            {/* Target Info */}
            {targetPosition && (
              <div className="text-center mb-2 backdrop-blur-sm rounded-xl px-4 py-2 border bg-black/40 border-white/10">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider mb-2 border bg-blue-500/30 border-blue-400/40 text-blue-300">
                  TARGET (SUN)
                </span>
                <div className="flex gap-6 text-sm">
                  <span className="font-mono text-blue-200 drop-shadow-md">
                    Az: {formatValue(targetPosition.azimuth)}
                  </span>
                  <span className="font-mono text-blue-200 drop-shadow-md">
                    Alt: {formatValue(targetPosition.altitude)}
                  </span>
                </div>
              </div>
            )}

            {/* Guidance HUD */}
            {guidance && <GuidanceHUD guidance={guidance} isNightMode={!!isNightMode} isSunMode={false} />}
          </>
        )}

        {/* Capture Controls */}
        <div className="flex items-center gap-3 mt-4">
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
              ${countdown !== null
                ? 'bg-red-500 border-red-300 hover:bg-red-400 shadow-lg shadow-red-500/50'
                : canCapture && !isCapturing
                  ? guidance?.fullyLocked
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
              <Camera className="w-8 h-8 text-white" />
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
        <div className="mt-4 mb-20 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-4 max-w-md mx-auto w-full shadow-xl">
          <h3 className="text-white text-sm font-semibold mb-3 text-center">MEASUREMENT RESULTS</h3>

          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2 text-xs text-white/60 font-medium">
              <div></div>
              <div className="text-center">YOUR</div>
              <div className="text-center">NASA</div>
              <div className="text-center">DELTA</div>
            </div>

            <div className="grid grid-cols-4 gap-2 items-center bg-white/10 rounded-lg p-2">
              <div className="text-white/70 text-sm">Azimuth</div>
              <div className="text-center font-mono text-white text-sm">{formatValue(snapshot.sensor.azimuth)}</div>
              <div className="text-center font-mono text-blue-300 text-sm">{formatValue(snapshot.nasa.azimuth)}</div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.azimuth)}`}>
                {formatDelta(snapshot.delta.azimuth)}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 items-center bg-white/10 rounded-lg p-2">
              <div className="text-white/70 text-sm">Altitude</div>
              <div className="text-center font-mono text-white text-sm">{formatValue(snapshot.sensor.altitude)}</div>
              <div className="text-center font-mono text-blue-300 text-sm">{formatValue(snapshot.nasa.altitude)}</div>
              <div className={`text-center font-mono font-semibold text-sm ${getDeltaColor(snapshot.delta.altitude)}`}>
                {formatDelta(snapshot.delta.altitude)}
              </div>
            </div>
          </div>

          <p className="text-white/50 text-xs text-center mt-3">Captured at {snapshot.timestamp.toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  )
}
