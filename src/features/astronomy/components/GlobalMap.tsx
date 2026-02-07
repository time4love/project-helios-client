import { useCallback, useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getMeasurements, type MeasurementResult } from '@/services/api'
import { RefreshCw } from 'lucide-react'

// Fix for default marker icons in react-leaflet
const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Center on Israel
const ISRAEL_CENTER: [number, number] = [31.0461, 34.8516]
const DEFAULT_ZOOM = 7

/** Get today's date in YYYY-MM-DD format */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

function shortenDeviceId(deviceId: string | null): string {
  if (!deviceId) return 'Unknown'
  return deviceId.length > 8 ? `${deviceId.slice(0, 8)}...` : deviceId
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calculateTotalDelta(measurement: MeasurementResult): number {
  return Math.sqrt(
    measurement.delta_azimuth ** 2 + measurement.delta_altitude ** 2
  )
}

export function GlobalMap() {
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString())

  const fetchData = useCallback(async (date: string) => {
    try {
      setLoading(true)
      setError(null)
      const data = await getMeasurements(date)
      setMeasurements(data)
    } catch (err) {
      setError('Failed to load measurements')
      console.error('Error fetching measurements:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch data when selectedDate changes
  useEffect(() => {
    fetchData(selectedDate)
  }, [selectedDate, fetchData])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value)
  }

  const handleRefresh = () => {
    fetchData(selectedDate)
  }

  return (
    <div className="h-screen w-screen relative">
      {/* Header overlay with date picker */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-black/70 backdrop-blur-sm p-4">
        <h1 className="text-white text-xl font-bold text-center mb-3">
          Global Measurements
        </h1>

        {/* Date picker and controls */}
        <div className="flex items-center justify-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            max={getTodayString()}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white
                       focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50
                       transition-colors"
            title="Refresh data"
          >
            <RefreshCw
              className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Counter */}
        <p className="text-white/70 text-sm text-center mt-2">
          {loading ? (
            'Loading...'
          ) : error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            `Showing ${measurements.length} measurement${measurements.length !== 1 ? 's' : ''}`
          )}
        </p>
      </div>

      {/* Map */}
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        style={{ background: '#1a1a2e' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MarkerClusterGroup chunkedLoading>
          {measurements.map((measurement) => {
            const totalDelta = calculateTotalDelta(measurement)
            const isAccurate = totalDelta < 10

            return (
              <Marker
                key={measurement.id}
                position={[measurement.latitude, measurement.longitude]}
                icon={markerIcon}
              >
                <Popup>
                  <div className="min-w-[180px] text-sm">
                    <div className="font-semibold border-b pb-1 mb-2">
                      Measurement #{measurement.id}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">User:</span>
                        <span className="font-mono">
                          {shortenDeviceId(measurement.device_id)}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-gray-600">Time:</span>
                        <span>{formatTime(measurement.created_at)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-gray-600">Delta:</span>
                        <span
                          className={`font-bold ${
                            isAccurate ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {totalDelta.toFixed(2)}°
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 pt-1 border-t mt-2">
                        <div>Az: {measurement.delta_azimuth.toFixed(2)}°</div>
                        <div>Alt: {measurement.delta_altitude.toFixed(2)}°</div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
}
