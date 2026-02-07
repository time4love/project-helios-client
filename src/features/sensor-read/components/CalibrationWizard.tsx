import { useState, useEffect } from 'react'
import { CheckCircle, Compass } from 'lucide-react'

type CalibrationStep = 'intro' | 'calibrating' | 'done'

const STORAGE_KEY = 'helios_calibrated'
const CALIBRATION_DURATION_MS = 5000

/**
 * One-time calibration wizard overlay.
 * Guides users through a Figure-8 motion to calibrate the device compass.
 * Only shown once per device (persisted in localStorage).
 */
export function CalibrationWizard() {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem(STORAGE_KEY)
  })
  const [step, setStep] = useState<CalibrationStep>('intro')

  // Auto-advance from calibrating to done after duration
  useEffect(() => {
    if (step !== 'calibrating') return

    const timer = setTimeout(() => {
      setStep('done')
    }, CALIBRATION_DURATION_MS)

    return () => clearTimeout(timer)
  }, [step])

  const handleStartCalibration = () => {
    setStep('calibrating')
  }

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsVisible(false)
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
            {/* Figure-8 Animation */}
            <div className="w-32 h-32 mx-auto mb-6 relative flex items-center justify-center">
              <svg
                viewBox="0 0 100 50"
                className="w-full h-full animate-figure-eight-draw"
              >
                <path
                  d="M 25 25 C 25 10, 50 10, 50 25 C 50 40, 75 40, 75 25 C 75 10, 50 10, 50 25 C 50 40, 25 40, 25 25"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="animate-dash"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Pulsing dot following the path */}
              <div className="absolute w-4 h-4 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50 animate-figure-eight-move" />
            </div>

            {/* Instructions */}
            <h2 className="text-xl font-semibold text-white mb-3">
              Wave Your Phone
            </h2>
            <p className="text-slate-300 mb-6">
              Move your device in a <span className="text-blue-400 font-semibold">Figure 8</span> motion
            </p>

            {/* Progress indicator */}
            <div className="w-48 h-1 mx-auto bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-calibration-progress"
              />
            </div>
            <p className="text-slate-500 text-sm mt-3">Calibrating sensors...</p>
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

        @keyframes dash {
          0% { stroke-dasharray: 0, 200; stroke-dashoffset: 0; }
          50% { stroke-dasharray: 100, 200; stroke-dashoffset: -50; }
          100% { stroke-dasharray: 0, 200; stroke-dashoffset: -200; }
        }
        .animate-dash {
          animation: dash 2s ease-in-out infinite;
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

        @keyframes calibration-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-calibration-progress {
          animation: calibration-progress ${CALIBRATION_DURATION_MS}ms linear forwards;
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
