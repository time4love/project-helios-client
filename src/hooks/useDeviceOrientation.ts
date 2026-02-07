import { useState, useEffect, useCallback } from 'react'
import type { SensorData } from '@/types/sensors'

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
 * Hook for accessing device orientation sensor data.
 * Handles iOS 13+ permission requests and prefers True North compass heading when available.
 */
export function useDeviceOrientation() {
  const [data, setData] = useState<SensorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

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

      setData({
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

  return { data, error, permissionGranted, requestAccess }
}
