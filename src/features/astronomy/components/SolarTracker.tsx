import { useState } from 'react'
import { Camera, MapPin, Compass, AlertCircle, X } from 'lucide-react'
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { fetchSunPosition } from '@/services/api'

interface Snapshot {
  sensor: { azimuth: number; altitude: number }
  nasa: { azimuth: number; altitude: number }
  delta: { azimuth: number; altitude: number }
  timestamp: Date
}

/**
 * Manual capture solar tracker - compares device orientation with calculated sun position.
 * Features a camera-shutter style capture button for taking measurements.
 */
export function SolarTracker() {
  const { data: sensorData, permissionGranted, requestAccess, error: sensorError } = useDeviceOrientation()
  const { coordinates, error: geoError } = useGeoLocation()
  const [isCapturing, setIsCapturing] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isReady = permissionGranted && coordinates && sensorData

  const handleMeasure = async () => {
    if (!coordinates || !sensorData) {
      setError('GPS and sensors must be ready before capturing')
      return
    }

    setIsCapturing(true)
    setError(null)

    // Freeze current sensor values at moment of capture
    const capturedSensor = {
      azimuth: sensorData.alpha,
      altitude: sensorData.beta,
    }

    try {
      const nasa = await fetchSunPosition(coordinates.latitude, coordinates.longitude)

      const delta = {
        azimuth: capturedSensor.azimuth - nasa.azimuth,
        altitude: capturedSensor.altitude - nasa.altitude,
      }

      setSnapshot({
        sensor: capturedSensor,
        nasa,
        delta,
        timestamp: new Date(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch solar position')
    } finally {
      setIsCapturing(false)
    }
  }

  const formatValue = (value: number): string => {
    return `${value.toFixed(2)}°`
  }

  const formatDelta = (value: number): string => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}°`
  }

  const getDeltaColor = (value: number): string => {
    return Math.abs(value) > 5 ? 'text-red-400' : 'text-green-400'
  }

  const dismissError = () => setError(null)

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col">
      {/* Header Badge */}
      <div className="text-center mb-4">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-300 text-sm font-medium">
          <Compass className="w-4 h-4" />
          PROJECT HELIOS
        </span>
        {coordinates && (
          <p className="text-slate-500 text-xs mt-2 flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" />
            {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
          </p>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="mb-4 mx-auto max-w-sm bg-red-500/20 border border-red-400/30 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm flex-1">{error}</p>
          <button onClick={dismissError} className="text-red-400 hover:text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Permission Request */}
      {!permissionGranted && (
        <div className="mb-4 mx-auto max-w-sm bg-slate-800/50 border border-slate-600/50 rounded-xl p-4 text-center">
          <p className="text-slate-300 mb-3 text-sm">Enable sensors to measure orientation</p>
          <button
            onClick={requestAccess}
            className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Enable Sensors
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {(sensorError || geoError) && (
        <div className="mb-4 mx-auto max-w-sm text-center space-y-1">
          {sensorError && <p className="text-amber-400 text-xs">Sensor: {sensorError}</p>}
          {geoError && <p className="text-amber-400 text-xs">GPS: {geoError}</p>}
        </div>
      )}

      {/* Live Sensor Feed */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full text-green-400 text-xs font-semibold tracking-wider mb-4">
            LIVE SENSOR
          </span>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-slate-500 text-sm mb-1">AZIMUTH</p>
              <p className="text-5xl font-mono font-bold text-white">
                {sensorData ? formatValue(sensorData.alpha) : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-sm mb-1">ALTITUDE</p>
              <p className="text-5xl font-mono font-bold text-white">
                {sensorData ? formatValue(sensorData.beta) : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Capture Button */}
        <button
          onClick={handleMeasure}
          disabled={!isReady || isCapturing}
          className={`
            w-24 h-24 rounded-full border-4 flex items-center justify-center
            transition-all duration-200 cursor-pointer
            ${isReady && !isCapturing
              ? 'bg-blue-500 border-blue-300 hover:bg-blue-400 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30'
              : 'bg-slate-700 border-slate-600 cursor-not-allowed opacity-50'
            }
          `}
        >
          {isCapturing ? (
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Camera className="w-10 h-10 text-white" />
          )}
        </button>
        <p className="text-slate-500 text-sm mt-3">
          {!coordinates ? 'Waiting for GPS...' : !permissionGranted ? 'Enable sensors first' : 'Tap to capture'}
        </p>
      </div>

      {/* Results Card */}
      {snapshot && (
        <div className="mt-6 bg-slate-800/70 border border-slate-600/50 rounded-2xl p-5 max-w-md mx-auto w-full">
          <h3 className="text-slate-300 text-sm font-semibold mb-4 text-center">
            MEASUREMENT RESULTS
          </h3>

          {/* Results Grid */}
          <div className="space-y-3">
            {/* Header Row */}
            <div className="grid grid-cols-4 gap-2 text-xs text-slate-500 font-medium">
              <div></div>
              <div className="text-center">YOUR</div>
              <div className="text-center">NASA</div>
              <div className="text-center">DELTA</div>
            </div>

            {/* Azimuth Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-slate-700/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Azimuth</div>
              <div className="text-center font-mono text-white">
                {formatValue(snapshot.sensor.azimuth)}
              </div>
              <div className="text-center font-mono text-blue-300">
                {formatValue(snapshot.nasa.azimuth)}
              </div>
              <div className={`text-center font-mono font-semibold ${getDeltaColor(snapshot.delta.azimuth)}`}>
                {formatDelta(snapshot.delta.azimuth)}
              </div>
            </div>

            {/* Altitude Row */}
            <div className="grid grid-cols-4 gap-2 items-center bg-slate-700/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Altitude</div>
              <div className="text-center font-mono text-white">
                {formatValue(snapshot.sensor.altitude)}
              </div>
              <div className="text-center font-mono text-blue-300">
                {formatValue(snapshot.nasa.altitude)}
              </div>
              <div className={`text-center font-mono font-semibold ${getDeltaColor(snapshot.delta.altitude)}`}>
                {formatDelta(snapshot.delta.altitude)}
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-slate-500 text-xs text-center mt-4">
            Captured at {snapshot.timestamp.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  )
}
