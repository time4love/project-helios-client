import { useState, useEffect, useCallback } from 'react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition, type SunPosition } from '@/services/api'

/**
 * Main dashboard component comparing device sensors with calculated sun position.
 * Features glassmorphism UI, auto-refresh every 30 seconds.
 */
export function SolarTracker() {
  const { data: sensorData, permissionGranted, requestAccess, error: sensorError } = useDeviceOrientation()
  const { coordinates, error: geoError } = useGeoLocation()
  const [serverData, setServerData] = useState<SunPosition | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const refreshSolarData = useCallback(async () => {
    if (!coordinates) return

    setLoading(true)
    setApiError(null)

    try {
      const data = await fetchSunPosition(coordinates.latitude, coordinates.longitude)
      setServerData(data)
      setLastUpdated(new Date())
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to fetch solar position')
    } finally {
      setLoading(false)
    }
  }, [coordinates])

  // Fetch on coordinates change and set up 30-second refresh interval
  useEffect(() => {
    if (!coordinates) return

    // Initial fetch
    refreshSolarData()

    // Set up auto-refresh every 30 seconds
    const intervalId = setInterval(() => {
      refreshSolarData()
    }, 30000)

    return () => clearInterval(intervalId)
  }, [coordinates, refreshSolarData])

  // Calculate deltas (sensor - model)
  const deltaAzimuth = sensorData && serverData
    ? sensorData.alpha - serverData.azimuth
    : null
  const deltaAltitude = sensorData && serverData
    ? sensorData.beta - serverData.altitude
    : null

  const formatValue = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—'
    return `${value.toFixed(2)}°`
  }

  const formatTime = (date: Date | null): string => {
    if (!date) return '—'
    return date.toLocaleTimeString()
  }

  // Glassmorphism card styles
  const cardBase = "backdrop-blur-md bg-white/30 border border-white/40 rounded-2xl p-5 shadow-lg"

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">
            Solar Tracker
          </h1>
          {coordinates && (
            <p className="text-white/80 mt-2">
              📍 {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
            </p>
          )}
          {lastUpdated && (
            <p className="text-white/60 text-sm mt-1">
              Last updated: {formatTime(lastUpdated)}
            </p>
          )}
        </div>

        {/* Permission Request */}
        {!permissionGranted && (
          <div className={`${cardBase} text-center`}>
            <p className="text-white mb-3">Sensor access required for orientation data</p>
            <button
              onClick={requestAccess}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-xl border border-white/40 transition-all cursor-pointer"
            >
              Enable Sensors
            </button>
          </div>
        )}

        {/* Error States */}
        {(sensorError || geoError || apiError) && (
          <div className={`${cardBase} bg-red-500/20 border-red-300/40`}>
            {sensorError && <p className="text-white text-sm">⚠️ Sensor: {sensorError}</p>}
            {geoError && <p className="text-white text-sm">⚠️ GPS: {geoError}</p>}
            {apiError && <p className="text-white text-sm">⚠️ API: {apiError}</p>}
          </div>
        )}

        {/* 3-Column Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: My Sensors */}
          <div className={`${cardBase} bg-blue-500/20`}>
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              My Sensors
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/70">Alpha</span>
                <span className="font-mono text-xl text-white font-bold">
                  {formatValue(sensorData?.alpha)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">Beta</span>
                <span className="font-mono text-xl text-white font-bold">
                  {formatValue(sensorData?.beta)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: NASA Model */}
          <div className={`${cardBase} bg-green-500/20`}>
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              NASA Model
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/70">Azimuth</span>
                <span className="font-mono text-xl text-white font-bold">
                  {loading ? '...' : formatValue(serverData?.azimuth)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">Altitude</span>
                <span className="font-mono text-xl text-white font-bold">
                  {loading ? '...' : formatValue(serverData?.altitude)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Delta */}
          <div className={`${cardBase} bg-purple-500/20`}>
            <h3 className="text-lg font-semibold text-white mb-4 text-center">
              Delta (Δ)
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/70">Δ Azimuth</span>
                <span className="font-mono text-xl text-white font-bold">
                  {formatValue(deltaAzimuth)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">Δ Altitude</span>
                <span className="font-mono text-xl text-white font-bold">
                  {formatValue(deltaAltitude)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={refreshSolarData}
            disabled={!coordinates || loading}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-xl border border-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
