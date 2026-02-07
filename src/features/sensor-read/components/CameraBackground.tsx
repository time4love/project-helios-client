import { useEffect, useRef } from 'react'
import { useCameraStream } from '@/hooks/useCameraStream'

/**
 * Full-screen camera background for AR experience.
 * Falls back to a dark background if camera access is denied or unavailable.
 */
export function CameraBackground() {
  const { stream, error } = useCameraStream()
  const videoRef = useRef<HTMLVideoElement>(null)

  // Attach stream to video element when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Fallback: dark background if camera unavailable
  if (error || !stream) {
    return (
      <div className="fixed top-0 left-0 w-full h-full -z-10 bg-gradient-to-b from-slate-900 to-slate-950" />
    )
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline // Critical for iOS - prevents fullscreen takeover
      muted
      className="fixed top-0 left-0 w-full h-full object-cover -z-10"
    />
  )
}
