import { useState } from 'react'
import { SolarTracker } from '@/features/astronomy/components/SolarTracker'
import { GlobalMap } from '@/features/astronomy/components/GlobalMap'

type AppMode = 'measure' | 'map'

function App() {
  const [mode, setMode] = useState<AppMode>('measure')

  return (
    <div className="relative">
      {/* Main content */}
      {mode === 'measure' ? <SolarTracker /> : <GlobalMap />}

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
        </div>
      </nav>
    </div>
  )
}

export default App
