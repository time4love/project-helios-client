import { useState, useEffect, useRef } from 'react'

interface CameraStreamState {
  stream: MediaStream | null
  error: string | null
}

/**
 * Hook to access the device camera stream using MediaDevices API.
 * Uses the rear camera (environment facing mode) for AR experiences.
 * Handles cleanup of tracks on unmount.
 */
export function useCameraStream(): CameraStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let mounted = true

    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Rear camera for AR
          },
          audio: false,
        })

        if (mounted) {
          streamRef.current = mediaStream
          setStream(mediaStream)
          setError(null)
        } else {
          // Component unmounted before we got the stream - clean up
          mediaStream.getTracks().forEach((track) => track.stop())
        }
      } catch (err) {
        if (mounted) {
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
    }

    initCamera()

    // Cleanup: stop all tracks when unmounting
    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  return { stream, error }
}
