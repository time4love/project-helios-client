import { useState, lazy, Suspense } from 'react'
import { SolarTracker } from '@/features/astronomy/components/SolarTracker'
import { StatsDashboard } from '@/features/astronomy/components/StatsDashboard'
import { CalibrationWizard } from '@/features/sensor-read/components/CalibrationWizard'
import { Loader2 } from 'lucide-react'

// Lazy load GlobalMap to prevent Leaflet from blocking the main thread on initial load
const GlobalMap = lazy(() => import('@/features/astronomy/components/GlobalMap').then(m => ({ default: m.GlobalMap })))

type AppMode = 'measure' | 'map' | 'stats'

interface NavButtonProps {
  label: string
  isActive: boolean
  onClick: () => void
}

function NavButton({ label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
        isActive ? 'bg-amber-600 text-white' : 'text-white/70 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

// Loading fallback for lazy-loaded components
function MapLoadingFallback() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900">
      <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
      <p className="text-white/70 text-lg">Loading Map...</p>
      <p className="text-white/40 text-sm mt-2">Initializing Leaflet</p>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<AppMode>('measure')

  return (
    <div className="relative">
      {/* One-time calibration overlay */}
      <CalibrationWizard />

      {/* Main content */}
      {mode === 'measure' && <SolarTracker />}
      {mode === 'map' && (
        <Suspense fallback={<MapLoadingFallback />}>
          <GlobalMap />
        </Suspense>
      )}
      {mode === 'stats' && <StatsDashboard />}

      {/* Navigation toggle */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001]">
        <div className="flex bg-black/80 backdrop-blur-md rounded-full p-1 shadow-lg border border-white/20">
          <NavButton label="Measure" isActive={mode === 'measure'} onClick={() => setMode('measure')} />
          <NavButton label="Map" isActive={mode === 'map'} onClick={() => setMode('map')} />
          <NavButton label="Stats" isActive={mode === 'stats'} onClick={() => setMode('stats')} />
        </div>
      </nav>
    </div>
  )
}

export default App
