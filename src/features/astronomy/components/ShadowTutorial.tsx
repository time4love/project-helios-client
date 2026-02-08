import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

const STORAGE_KEY = 'helios_shadow_tutorial_seen'

interface ShadowTutorialProps {
  /** External control to force open the tutorial */
  forceOpen?: boolean
  /** Callback when tutorial is closed */
  onClose?: () => void
}

/**
 * Visual tutorial teaching users the Shadow Method for sun alignment.
 * Shows automatically on first visit, can be reopened via help button.
 */
export function ShadowTutorial({ forceOpen = false, onClose }: ShadowTutorialProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)

  // Check if tutorial has been seen before
  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true)
      setCurrentSlide(0)
      return
    }

    const seen = localStorage.getItem(STORAGE_KEY)
    if (!seen) {
      setIsOpen(true)
    }
  }, [forceOpen])

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsOpen(false)
    setCurrentSlide(0)
    onClose?.()
  }

  const nextSlide = () => {
    if (currentSlide < 2) {
      setCurrentSlide((prev) => prev + 1)
    } else {
      handleClose()
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-white/20 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">How to Measure with Shadows</h2>
          <p className="text-white/80 text-sm mt-1">The safe & accurate method</p>
        </div>

        {/* Slide Content */}
        <div className="p-6 min-h-[320px]">
          {currentSlide === 0 && <SlideOne />}
          {currentSlide === 1 && <SlideTwo />}
          {currentSlide === 2 && <SlideThree />}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {/* Slide Indicators */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentSlide ? 'bg-amber-500' : 'bg-white/30'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-2">
            {currentSlide > 0 && (
              <button
                onClick={prevSlide}
                className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              onClick={nextSlide}
              className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-lg transition-colors"
            >
              {currentSlide === 2 ? "Got it, let's measure!" : 'Next'}
              {currentSlide < 2 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Slide 1: The Concept
 */
function SlideOne() {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-white mb-4">The Concept</h3>
      <p className="text-white/80 mb-6">
        <span className="text-red-400 font-semibold">Don't look at the sun!</span>
        <br />
        Use your phone's shadow instead.
      </p>

      {/* SVG: Sun -> Phone -> Shadow */}
      <svg viewBox="0 0 300 150" className="w-full max-w-xs mx-auto">
        {/* Sun */}
        <circle cx="50" cy="40" r="25" fill="none" stroke="#fbbf24" strokeWidth="2" />
        <line x1="50" y1="10" x2="50" y2="0" stroke="#fbbf24" strokeWidth="2" />
        <line x1="50" y1="70" x2="50" y2="80" stroke="#fbbf24" strokeWidth="2" />
        <line x1="20" y1="40" x2="10" y2="40" stroke="#fbbf24" strokeWidth="2" />
        <line x1="80" y1="40" x2="90" y2="40" stroke="#fbbf24" strokeWidth="2" />
        <line x1="28" y1="18" x2="21" y2="11" stroke="#fbbf24" strokeWidth="2" />
        <line x1="72" y1="62" x2="79" y2="69" stroke="#fbbf24" strokeWidth="2" />
        <line x1="28" y1="62" x2="21" y2="69" stroke="#fbbf24" strokeWidth="2" />
        <line x1="72" y1="18" x2="79" y2="11" stroke="#fbbf24" strokeWidth="2" />

        {/* Arrow */}
        <line x1="100" y1="40" x2="140" y2="60" stroke="white" strokeWidth="2" strokeDasharray="4" />
        <polygon points="140,60 132,55 135,63" fill="white" />

        {/* Phone */}
        <rect x="150" y="30" width="40" height="70" rx="4" fill="none" stroke="white" strokeWidth="2" />
        <circle cx="170" cy="90" r="4" fill="none" stroke="white" strokeWidth="1" />
        <rect x="165" y="35" width="10" height="3" rx="1" fill="white" opacity="0.5" />

        {/* Arrow to shadow */}
        <line x1="200" y1="70" x2="230" y2="90" stroke="white" strokeWidth="2" strokeDasharray="4" />
        <polygon points="230,90 222,88 225,95" fill="white" />

        {/* Shadow */}
        <ellipse cx="260" cy="110" rx="30" ry="10" fill="white" opacity="0.3" />
        <text x="260" y="135" textAnchor="middle" fill="white" fontSize="12" opacity="0.7">Shadow</text>
      </svg>

      <p className="text-white/60 text-sm mt-4">
        When aligned, the phone's shadow becomes minimal
      </p>
    </div>
  )
}

/**
 * Slide 2: The Technique
 */
function SlideTwo() {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-white mb-4">The Technique</h3>
      <p className="text-white/80 mb-6">
        Hold your hand about <span className="text-amber-400 font-semibold">10cm behind the phone</span>
        <br />
        as a "screen" to see the shadow clearly.
      </p>

      {/* SVG: Hand behind phone */}
      <svg viewBox="0 0 200 160" className="w-full max-w-xs mx-auto">
        {/* Hand outline (simplified) */}
        <path
          d="M 130 140
             L 130 80
             Q 130 60, 145 55
             L 150 55
             Q 160 55, 160 65
             L 160 50
             Q 160 40, 170 40
             Q 180 40, 180 50
             L 180 45
             Q 180 35, 190 35
             Q 200 35, 200 45
             L 200 120
             Q 200 145, 175 150
             L 130 150
             Z"
          fill="none"
          stroke="white"
          strokeWidth="2"
          opacity="0.6"
        />

        {/* Phone */}
        <rect x="60" y="40" width="50" height="90" rx="6" fill="none" stroke="white" strokeWidth="2" />
        <circle cx="85" cy="115" r="5" fill="none" stroke="white" strokeWidth="1.5" />
        <rect x="78" y="48" width="14" height="4" rx="2" fill="white" opacity="0.5" />

        {/* Shadow on hand */}
        <rect x="135" y="70" width="35" height="50" rx="2" fill="white" opacity="0.2" />

        {/* Distance indicator */}
        <line x1="110" y1="85" x2="130" y2="85" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3" />
        <text x="120" y="78" textAnchor="middle" fill="#fbbf24" fontSize="10">10cm</text>

        {/* Sun rays from top-left */}
        <line x1="20" y1="20" x2="55" y2="45" stroke="#fbbf24" strokeWidth="1.5" opacity="0.6" />
        <line x1="30" y1="10" x2="60" y2="35" stroke="#fbbf24" strokeWidth="1.5" opacity="0.6" />
        <line x1="10" y1="30" x2="50" y2="55" stroke="#fbbf24" strokeWidth="1.5" opacity="0.6" />
      </svg>

      <p className="text-white/60 text-sm mt-4">
        Your hand catches the phone's shadow
      </p>
    </div>
  )
}

/**
 * Slide 3: Good vs Bad alignment
 */
function SlideThree() {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-white mb-4">Good vs Bad Alignment</h3>
      <p className="text-white/80 mb-4">
        Minimize the shadow for the best measurement
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Bad alignment */}
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
          <svg viewBox="0 0 100 100" className="w-full max-w-[100px] mx-auto mb-2">
            {/* Tilted phone */}
            <rect
              x="20"
              y="15"
              width="30"
              height="55"
              rx="4"
              fill="none"
              stroke="white"
              strokeWidth="2"
              transform="rotate(-20, 35, 42)"
            />
            {/* Large shadow */}
            <ellipse cx="65" cy="80" rx="25" ry="12" fill="white" opacity="0.4" />
          </svg>
          <p className="text-red-400 font-semibold text-sm">Bad Alignment</p>
          <p className="text-white/50 text-xs mt-1">Large, fuzzy shadow</p>
        </div>

        {/* Good alignment */}
        <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4">
          <svg viewBox="0 0 100 100" className="w-full max-w-[100px] mx-auto mb-2">
            {/* Straight phone (edge-on) */}
            <rect x="45" y="15" width="10" height="55" rx="2" fill="none" stroke="white" strokeWidth="2" />
            {/* Thin shadow (just a line) */}
            <line x1="45" y1="80" x2="55" y2="80" stroke="white" strokeWidth="3" opacity="0.4" />
          </svg>
          <p className="text-green-400 font-semibold text-sm">Perfect Alignment</p>
          <p className="text-white/50 text-xs mt-1">Thin, sharp line</p>
        </div>
      </div>

      <p className="text-amber-400/80 text-sm mt-4 font-medium">
        Listen for the lock-on tone when aligned!
      </p>
    </div>
  )
}
