import { useState, useCallback } from 'react'
import { Scale, Check, X } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'

const STORAGE_KEY = 'helios_level_calibration'

export interface LevelCalibrationData {
  offsetBeta: number
  offsetGamma: number
  calibratedAt: string
}

/**
 * Read stored level calibration from localStorage
 */
export function getLevelCalibration(): LevelCalibrationData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as LevelCalibrationData
  } catch {
    return null
  }
}

/**
 * Save level calibration to localStorage
 */
export function saveLevelCalibration(offsetBeta: number, offsetGamma: number): void {
  const data: LevelCalibrationData = {
    offsetBeta,
    offsetGamma,
    calibratedAt: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/**
 * Clear level calibration from localStorage
 */
export function clearLevelCalibration(): void {
  localStorage.removeItem(STORAGE_KEY)
}

interface LevelCalibrationProps {
  isOpen: boolean
  onClose: () => void
  onCalibrated?: () => void
}

/**
 * Full-screen overlay for calibrating the phone's level position.
 * Captures beta/gamma offsets when phone is placed on a flat surface.
 */
export function LevelCalibration({ isOpen, onClose, onCalibrated }: LevelCalibrationProps) {
  const { data: sensorData, permissionGranted } = useDeviceOrientation()
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibrationSuccess, setCalibrationSuccess] = useState(false)

  const handleCalibrate = useCallback(() => {
    if (!sensorData) return

    setIsCalibrating(true)

    // Small delay to ensure stable reading
    setTimeout(() => {
      // Capture current beta and gamma as the "flat" reference
      saveLevelCalibration(sensorData.beta, sensorData.gamma)

      setIsCalibrating(false)
      setCalibrationSuccess(true)

      // Auto-close after showing success
      setTimeout(() => {
        setCalibrationSuccess(false)
        onCalibrated?.()
        onClose()
      }, 1500)
    }, 500)
  }, [sensorData, onCalibrated, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success State */}
        {calibrationSuccess ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-green-400 mb-2">Calibrated!</h2>
            <p className="text-white/60 text-sm">Level reference saved successfully</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center">
                <Scale className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Level Calibration</h2>
              <p className="text-white/60 text-sm">
                Place your phone on a flat, level surface (like a table)
              </p>
            </div>

            {/* Live Sensor Preview */}
            {permissionGranted && sensorData && (
              <div className="bg-black/40 rounded-xl p-4 mb-6">
                <p className="text-white/40 text-xs text-center mb-3">CURRENT SENSOR VALUES</p>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-white/60 text-xs mb-1">BETA (tilt F/B)</p>
                    <p className="text-2xl font-mono font-bold text-white">
                      {sensorData.beta.toFixed(1)}°
                    </p>
                  </div>
                  <div>
                    <p className="text-white/60 text-xs mb-1">GAMMA (tilt L/R)</p>
                    <p className="text-2xl font-mono font-bold text-white">
                      {sensorData.gamma.toFixed(1)}°
                    </p>
                  </div>
                </div>
                <p className="text-white/40 text-xs text-center mt-3">
                  These values should stabilize when phone is flat
                </p>
              </div>
            )}

            {/* Calibrate Button */}
            <button
              onClick={handleCalibrate}
              disabled={!permissionGranted || !sensorData || isCalibrating}
              className={`
                w-full py-4 rounded-xl font-semibold text-lg transition-all
                ${permissionGranted && sensorData && !isCalibrating
                  ? 'bg-blue-500 hover:bg-blue-400 text-white cursor-pointer'
                  : 'bg-slate-700 text-white/50 cursor-not-allowed'
                }
              `}
            >
              {isCalibrating ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calibrating...
                </span>
              ) : !permissionGranted ? (
                'Enable sensors first'
              ) : (
                'Set as Level Reference'
              )}
            </button>

            {/* Existing Calibration Info */}
            {(() => {
              const existing = getLevelCalibration()
              if (!existing) return null
              return (
                <p className="text-white/40 text-xs text-center mt-4">
                  Last calibrated: {new Date(existing.calibratedAt).toLocaleDateString()}
                </p>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
