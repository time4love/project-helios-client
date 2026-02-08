import { useEffect, useRef } from 'react'
import { useCameraStream } from '@/hooks/useCameraStream'

interface ExposureCapabilities {
  supported: boolean
  min: number
  max: number
  step: number
}

interface CameraControls {
  setExposure: (level: number) => Promise<boolean>
  resetExposure: () => Promise<boolean>
  getExposureCapabilities: () => ExposureCapabilities | null
  isDarkened: boolean
}

interface CameraBackgroundProps {
  onControlsReady?: (controls: CameraControls) => void
}

/**
 * Full-screen camera background for AR experience.
 * Falls back to a dark background if camera access is denied or unavailable.
 * Optionally exposes camera controls (exposure, white balance) to parent.
 */
export function CameraBackground({ onControlsReady }: CameraBackgroundProps) {
  const { stream, error, setExposure, resetExposure, getExposureCapabilities, isDarkened } = useCameraStream()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsReportedRef = useRef(false)

  // Attach stream to video element when available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Report camera controls to parent when stream is ready
  useEffect(() => {
    if (stream && onControlsReady && !controlsReportedRef.current) {
      controlsReportedRef.current = true
      onControlsReady({
        setExposure,
        resetExposure,
        getExposureCapabilities,
        isDarkened,
      })
    }
  }, [stream, onControlsReady, setExposure, resetExposure, getExposureCapabilities, isDarkened])

  // Update parent when isDarkened changes
  useEffect(() => {
    if (stream && onControlsReady && controlsReportedRef.current) {
      onControlsReady({
        setExposure,
        resetExposure,
        getExposureCapabilities,
        isDarkened,
      })
    }
  }, [isDarkened, stream, onControlsReady, setExposure, resetExposure, getExposureCapabilities])

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
