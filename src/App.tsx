import { useState } from 'react'
import { SolarTracker } from '@/features/astronomy/components/SolarTracker'
import { GlobalMap } from '@/features/astronomy/components/GlobalMap'
import { StatsDashboard } from '@/features/astronomy/components/StatsDashboard'

type AppMode = 'measure' | 'map' | 'stats'

function App() {
  const [mode, setMode] = useState<AppMode>('measure')

  return (
    <div className="relative">
      {/* Main content */}
      {mode === 'measure' && <SolarTracker />}
      {mode === 'map' && <GlobalMap />}
      {mode === 'stats' && <StatsDashboard />}

      {/* Navigation toggle */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001]">
        <div className="flex bg-black/80 backdrop-blur-md rounded-full p-1 shadow-lg border border-white/20">
          <button
            onClick={() => setMode('measure')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              mode === 'measure'
                ? 'bg-amber-600 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Measure
          </button>
          <button
            onClick={() => setMode('map')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              mode === 'map'
                ? 'bg-amber-600 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setMode('stats')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              mode === 'stats'
                ? 'bg-amber-600 text-white'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Stats
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
