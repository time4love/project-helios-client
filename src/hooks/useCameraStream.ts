import { useState, useEffect, useRef, useCallback } from 'react'

interface CameraStreamState {
  stream: MediaStream | null
  error: string | null
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

  return { stream, error }
}
