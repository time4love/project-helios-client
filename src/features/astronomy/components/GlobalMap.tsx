import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getMeasurements, type MeasurementResult } from '@/services/api'

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

function shortenDeviceId(deviceId: string | null): string {
  if (!deviceId) return 'Unknown'
  return deviceId.length > 8 ? `${deviceId.slice(0, 8)}...` : deviceId
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calculateTotalDelta(measurement: MeasurementResult): number {
  // Use Euclidean distance for combined delta
  return Math.sqrt(
    measurement.delta_azimuth ** 2 + measurement.delta_altitude ** 2
  )
}

export function GlobalMap() {
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const data = await getMeasurements(100)
        setMeasurements(data)
        setError(null)
      } catch (err) {
        setError('Failed to load measurements')
        console.error('Error fetching measurements:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500 mx-auto mb-4" />
          <p>Loading measurements...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <div className="text-center text-red-400">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-amber-600 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen relative">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-black/70 backdrop-blur-sm p-4">
        <h1 className="text-white text-xl font-bold text-center">
          Global Measurements
        </h1>
        <p className="text-white/70 text-sm text-center">
          {measurements.length} measurement{measurements.length !== 1 ? 's' : ''} recorded
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
                      <span className="text-gray-600">Date:</span>
                      <span>{formatDate(measurement.created_at)}</span>
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
      </MapContainer>
    </div>
  )
}
