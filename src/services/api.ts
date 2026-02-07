import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface SunPosition {
  azimuth: number
  altitude: number
}

export interface MeasurementResult {
  id: number
  created_at: string
  latitude: number
  longitude: number
  device_azimuth: number
  device_altitude: number
  nasa_azimuth: number
  nasa_altitude: number
  delta_azimuth: number
  delta_altitude: number
}

/**
 * Fetch the sun's position for a given location (lookup only, no save).
 * Calls the backend Pysolar API.
 */
export async function fetchSunPosition(
  lat: number,
  lon: number
): Promise<SunPosition> {
  const response = await api.post<{
    azimuth: number
    altitude: number
    timestamp: string
  }>('/api/v1/solar/calculate', {
    latitude: lat,
    longitude: lon,
  })

  return {
    azimuth: response.data.azimuth,
    altitude: response.data.altitude,
  }
}

/**
 * Save a measurement with device sensor data.
 * Sends device readings to backend, which calculates NASA position,
 * computes deltas, and saves to database.
 */
export async function saveMeasurement(
  lat: number,
  lon: number,
  deviceAzimuth: number,
  deviceAltitude: number
): Promise<MeasurementResult> {
  const response = await api.post<MeasurementResult>('/api/v1/solar/measure', {
    latitude: lat,
    longitude: lon,
    device_azimuth: deviceAzimuth,
    device_altitude: deviceAltitude,
  })

  return response.data
}
