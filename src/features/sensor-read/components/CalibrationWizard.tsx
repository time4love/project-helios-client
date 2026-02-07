import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Compass } from 'lucide-react'

type CalibrationStep = 'intro' | 'calibrating' | 'done'

const STORAGE_KEY = 'helios_calibrated'

// Energy multiplier - tuned so vigorous Figure-8 motion takes ~3-5 seconds
const ENERGY_MULTIPLIER = 0.015

/**
 * One-time calibration wizard overlay.
 * Guides users through a Figure-8 motion to calibrate the device compass.
 * Uses real device motion data to track progress.
 * Only shown once per device (persisted in localStorage).
 */
export function CalibrationWizard() {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem(STORAGE_KEY)
  })
  const [step, setStep] = useState<CalibrationStep>('intro')
  const [progress, setProgress] = useState(0)

  // Motion event handler
  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    const rotationRate = event.rotationRate
    if (!rotationRate) return

    // Calculate rotation energy from all axes
    const alpha = Math.abs(rotationRate.alpha ?? 0)
    const beta = Math.abs(rotationRate.beta ?? 0)
    const gamma = Math.abs(rotationRate.gamma ?? 0)

    const energy = alpha + beta + gamma

    // Accumulate progress based on motion energy
    setProgress((prev) => {
      const newProgress = Math.min(100, prev + energy * ENERGY_MULTIPLIER)
      return newProgress
    })
  }, [])

  // Listen to device motion during calibrating step
  useEffect(() => {
    if (step !== 'calibrating') return

    // Reset progress when entering calibration
    setProgress(0)

    // Add motion listener
    window.addEventListener('devicemotion', handleMotion)

    return () => {
      window.removeEventListener('devicemotion', handleMotion)
    }
  }, [step, handleMotion])

  // Auto-advance when progress reaches 100
  useEffect(() => {
    if (progress >= 100 && step === 'calibrating') {
      setStep('done')
    }
  }, [progress, step])

  const handleStartCalibration = () => {
    setStep('calibrating')
  }

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsVisible(false)
  }

  // Dynamic instruction text based on progress
  const getInstructionText = () => {
    if (progress < 10) return 'Start waving your phone...'
    if (progress < 80) return 'Keep moving in Figure 8...'
    return 'Almost there...'
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-sm w-full mx-4 text-center">
        {/* Intro Step */}
        {step === 'intro' && (
          <div className="animate-fade-in">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-500/20 border-2 border-blue-400/50 flex items-center justify-center">
              <Compass className="w-10 h-10 text-blue-400" />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">
              Sensor Calibration
            </h1>

            {/* Description */}
            <p className="text-slate-300 mb-8 leading-relaxed">
              For scientific accuracy, we need to calibrate your device compass.
              This only takes a few seconds.
            </p>

            {/* CTA Button */}
            <button
              onClick={handleStartCalibration}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Start Calibration
            </button>
          </div>
        )}

        {/* Calibrating Step */}
        {step === 'calibrating' && (
          <div className="animate-fade-in">
            {/* Circular Progress Ring */}
            <div className="w-40 h-40 mx-auto mb-6 relative flex items-center justify-center">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="6"
                />
                {/* Progress arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 2.64} 264`}
                  className="transition-all duration-100"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white font-mono">
                  {Math.round(progress)}%
                </span>
                <span className="text-xs text-slate-400 mt-1">calibrating</span>
              </div>
            </div>

            {/* Figure-8 hint animation */}
            <div className="w-24 h-12 mx-auto mb-4 relative">
              <svg viewBox="0 0 100 50" className="w-full h-full opacity-50">
                <path
                  d="M 25 25 C 25 10, 50 10, 50 25 C 50 40, 75 40, 75 25 C 75 10, 50 10, 50 25 C 50 40, 25 40, 25 25"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                />
              </svg>
              <div className="absolute w-3 h-3 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50 animate-figure-eight-move top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Dynamic Instructions */}
            <h2 className="text-xl font-semibold text-white mb-2">
              Wave Your Phone
            </h2>
            <p className="text-slate-300 text-sm">
              {getInstructionText()}
            </p>
          </div>
        )}

        {/* Done Step */}
        {step === 'done' && (
          <div className="animate-fade-in">
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 border-2 border-green-400/50 flex items-center justify-center animate-success-pop">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">
              Sensors Calibrated!
            </h1>

            {/* Description */}
            <p className="text-slate-300 mb-8">
              Your device is ready for accurate measurements.
            </p>

            {/* CTA Button */}
            <button
              onClick={handleComplete}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-green-600/30 cursor-pointer"
            >
              Start Measuring
            </button>
          </div>
        )}
      </div>

      {/* Custom animations via style tag */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }

        @keyframes figure-eight-move {
          0%, 100% { transform: translate(-24px, 0); }
          25% { transform: translate(0, -12px); }
          50% { transform: translate(24px, 0); }
          75% { transform: translate(0, 12px); }
        }
        .animate-figure-eight-move {
          animation: figure-eight-move 2s ease-in-out infinite;
        }

        @keyframes success-pop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-success-pop {
          animation: success-pop 0.4s ease-out;
        }
      `}</style>
    </div>
  )
}
