import { useState, useEffect, useRef, useCallback } from 'react'

interface ExposureCapabilities {
  supported: boolean
  min: number
  max: number
  step: number
}

interface CameraStreamState {
  stream: MediaStream | null
  error: string | null
  setExposure: (level: number) => Promise<boolean>
  resetExposure: () => Promise<boolean>
  getExposureCapabilities: () => ExposureCapabilities | null
  isDarkened: boolean
}

/**
 * Hook to access the device camera stream using MediaDevices API.
 * Uses the rear camera (environment facing mode) for AR experiences.
 * Handles cleanup of tracks on unmount.
 * Automatically restarts the camera when the tab regains focus.
 */
export function useCameraStream(): CameraStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDarkened, setIsDarkened] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)

  // Stop all tracks on the current stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setStream(null)
    }
  }, [])

  // Initialize or reinitialize the camera
  const initCamera = useCallback(async () => {
    // Stop existing stream first
    stopStream()

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Rear camera for AR
        },
        audio: false,
      })

      if (mountedRef.current) {
        streamRef.current = mediaStream
        setStream(mediaStream)
        setError(null)
      } else {
        // Component unmounted before we got the stream - clean up
        mediaStream.getTracks().forEach((track) => track.stop())
      }
    } catch (err) {
      if (mountedRef.current) {
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Camera permission denied')
          } else if (err.name === 'NotFoundError') {
            setError('No camera found')
          } else {
            setError(err.message)
          }
        } else {
          setError('Failed to access camera')
        }
      }
    }
  }, [stopStream])

  // Initialize camera on mount
  useEffect(() => {
    mountedRef.current = true
    initCamera()

    // Cleanup: stop all tracks when unmounting
    return () => {
      mountedRef.current = false
      stopStream()
    }
  }, [initCamera, stopStream])

  // Handle visibility changes (tab focus/blur)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if stream is still active
        const currentStream = streamRef.current
        if (!currentStream) {
          // No stream, reinitialize
          initCamera()
        } else {
          // Check if any track has ended
          const tracks = currentStream.getVideoTracks()
          const hasActiveTrack = tracks.some((track) => track.readyState === 'live')
          if (!hasActiveTrack) {
            // Stream is stale, reinitialize
            initCamera()
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [initCamera])

  // Get exposure capabilities from the active video track
  const getExposureCapabilities = useCallback((): ExposureCapabilities | null => {
    const currentStream = streamRef.current
    if (!currentStream) return null

    const track = currentStream.getVideoTracks()[0]
    if (!track) return null

    try {
      // TypeScript doesn't have full types for ImageCapture API capabilities
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capabilities = track.getCapabilities() as any

      if (capabilities.exposureCompensation) {
        return {
          supported: true,
          min: capabilities.exposureCompensation.min ?? -2,
          max: capabilities.exposureCompensation.max ?? 2,
          step: capabilities.exposureCompensation.step ?? 0.1,
        }
      }

      return { supported: false, min: 0, max: 0, step: 0 }
    } catch {
      return { supported: false, min: 0, max: 0, step: 0 }
    }
  }, [])

  // Set camera exposure level
  // level: typically -2 (dark) to +2 (bright), we want negative for sun viewing
  const setExposure = useCallback(async (level: number): Promise<boolean> => {
    const currentStream = streamRef.current
    if (!currentStream) return false

    const track = currentStream.getVideoTracks()[0]
    if (!track) return false

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capabilities = track.getCapabilities() as any

      // Check if exposure compensation is supported
      if (!capabilities.exposureCompensation) {
        console.warn('Exposure compensation not supported on this device')
        return false
      }

      // Clamp level to supported range
      const minExposure = capabilities.exposureCompensation.min ?? -2
      const maxExposure = capabilities.exposureCompensation.max ?? 2
      const clampedLevel = Math.max(minExposure, Math.min(maxExposure, level))

      // Build constraints - also lock white balance if supported
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const advancedConstraints: any = {
        exposureCompensation: clampedLevel,
      }

      // Lock exposure mode to manual if supported
      if (capabilities.exposureMode?.includes('manual')) {
        advancedConstraints.exposureMode = 'manual'
      }

      // Lock white balance to prevent camera from fighting back
      if (capabilities.whiteBalanceMode?.includes('manual')) {
        advancedConstraints.whiteBalanceMode = 'manual'
      }

      await track.applyConstraints({
        advanced: [advancedConstraints],
      })

      setIsDarkened(level < 0)
      console.log(`Exposure set to ${clampedLevel}`, advancedConstraints)
      return true
    } catch (err) {
      console.error('Failed to set exposure:', err)
      return false
    }
  }, [])

  // Reset exposure to default (auto)
  const resetExposure = useCallback(async (): Promise<boolean> => {
    const currentStream = streamRef.current
    if (!currentStream) return false

    const track = currentStream.getVideoTracks()[0]
    if (!track) return false

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capabilities = track.getCapabilities() as any

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const advancedConstraints: any = {}

      // Reset to auto exposure if supported
      if (capabilities.exposureMode?.includes('continuous')) {
        advancedConstraints.exposureMode = 'continuous'
      }

      // Reset exposure compensation to 0 (neutral)
      if (capabilities.exposureCompensation) {
        advancedConstraints.exposureCompensation = 0
      }

      // Reset white balance to auto
      if (capabilities.whiteBalanceMode?.includes('continuous')) {
        advancedConstraints.whiteBalanceMode = 'continuous'
      }

      if (Object.keys(advancedConstraints).length > 0) {
        await track.applyConstraints({
          advanced: [advancedConstraints],
        })
      }

      setIsDarkened(false)
      console.log('Exposure reset to auto')
      return true
    } catch (err) {
      console.error('Failed to reset exposure:', err)
      return false
    }
  }, [])

  return { stream, error, setExposure, resetExposure, getExposureCapabilities, isDarkened }
}
