import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SensorData } from '@/types/sensors'

const LEVEL_CALIBRATION_KEY = 'helios_level_calibration'

interface LevelCalibrationData {
  offsetBeta: number
  offsetGamma: number
  calibratedAt: string
}

/**
 * Extended DeviceOrientationEvent with iOS-specific compass heading
 */
interface DeviceOrientationEventWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

/**
 * iOS 13+ permission API type declaration
 */
interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Read level calibration offsets from localStorage
 */
function getLevelOffsets(): { offsetBeta: number; offsetGamma: number } {
  try {
    const stored = localStorage.getItem(LEVEL_CALIBRATION_KEY)
    if (!stored) return { offsetBeta: 0, offsetGamma: 0 }
    const data = JSON.parse(stored) as LevelCalibrationData
    return { offsetBeta: data.offsetBeta, offsetGamma: data.offsetGamma }
  } catch {
    return { offsetBeta: 0, offsetGamma: 0 }
  }
}

/**
 * Hook for accessing device orientation sensor data.
 * Handles iOS 13+ permission requests and prefers True North compass heading when available.
 * Applies level calibration offsets to beta/gamma for accurate tilt measurement.
 */
export function useDeviceOrientation() {
  const [rawData, setRawData] = useState<SensorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  // Read level calibration offsets once on mount
  const [levelOffsets] = useState(() => getLevelOffsets())

  const requestAccess = useCallback(async () => {
    try {
      const DeviceOrientationEventTyped =
        DeviceOrientationEvent as unknown as DeviceOrientationEventStatic

      // iOS 13+ requires explicit permission request (must be triggered by user gesture)
      if (typeof DeviceOrientationEventTyped.requestPermission === 'function') {
        const permission = await DeviceOrientationEventTyped.requestPermission()
        if (permission === 'granted') {
          setPermissionGranted(true)
          setError(null)
        } else {
          setError('Permission denied for device orientation')
        }
      } else {
        // Non-iOS browsers: grant permission immediately
        setPermissionGranted(true)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request permission')
    }
  }, [])

  useEffect(() => {
    if (!permissionGranted) return

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const e = event as DeviceOrientationEventWithCompass

      // Prefer webkitCompassHeading for True North on iOS Safari
      // Falls back to standard alpha value on other browsers
      const alpha = e.webkitCompassHeading ?? e.alpha ?? 0

      setRawData({
        alpha,
        beta: e.beta ?? 0,
        gamma: e.gamma ?? 0,
        absolute: e.absolute,
      })
    }

    window.addEventListener('deviceorientation', handleOrientation)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [permissionGranted])

  // Apply level calibration offsets to beta and gamma
  const data = useMemo<SensorData | null>(() => {
    if (!rawData) return null
    return {
      alpha: rawData.alpha,
      beta: rawData.beta - levelOffsets.offsetBeta,
      gamma: rawData.gamma - levelOffsets.offsetGamma,
      absolute: rawData.absolute,
    }
  }, [rawData, levelOffsets])

  // Check if calibration exists
  const isLevelCalibrated = levelOffsets.offsetBeta !== 0 || levelOffsets.offsetGamma !== 0

  return { data, error, permissionGranted, requestAccess, isLevelCalibrated }
}
