import axios from 'axios'
import { getDeviceId } from '@/utils/identity'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Custom error class for rate limiting (HTTP 429)
 */
export class RateLimitError extends Error {
  constructor(message = 'Too many requests. Please wait a moment.') {
    super(message)
    this.name = 'RateLimitError'
  }
}

export interface SunPosition {
  azimuth: number
  altitude: number
}

export type CollectionMethod = 'SHADOW' | 'CAMERA'

export interface MeasurementResult {
  id: number
  created_at: string
  device_id: string | null
  latitude: number
  longitude: number
  device_azimuth: number
  device_altitude: number
  nasa_azimuth: number
  nasa_altitude: number
  delta_azimuth: number
  delta_altitude: number
  magnetic_azimuth: number | null
  magnetic_declination: number | null
  collection_method: CollectionMethod | null
  flat_earth_sun_height_km: number | null
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
 * Includes anonymous device fingerprint for rate limiting.
 *
 * @throws {RateLimitError} When the user has exceeded the rate limit (HTTP 429)
 */
export async function saveMeasurement(
  lat: number,
  lon: number,
  deviceAzimuth: number,
  deviceAltitude: number,
  magneticAzimuth?: number,
  magneticDeclination?: number,
  collectionMethod?: CollectionMethod
): Promise<MeasurementResult> {
  try {
    const response = await api.post<MeasurementResult>('/api/v1/solar/measure', {
      latitude: lat,
      longitude: lon,
      device_azimuth: deviceAzimuth,
      device_altitude: deviceAltitude,
      device_id: getDeviceId(),
      magnetic_azimuth: magneticAzimuth,
      magnetic_declination: magneticDeclination,
      collection_method: collectionMethod,
    })

    return response.data
  } catch (error) {
    // Handle rate limiting specifically
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      throw new RateLimitError()
    }
    throw error
  }
}

/**
 * Get measurements for visualization on the global map.
 * Filters by date (defaults to today on the server if not provided).
 * Returns measurements ordered by created_at descending.
 *
 * @param date - Optional date string in YYYY-MM-DD format
 * @param limit - Maximum number of measurements to return (default: 5000)
 */
export async function getMeasurements(
  date?: string,
  limit = 5000
): Promise<MeasurementResult[]> {
  const response = await api.get<MeasurementResult[]>('/api/v1/solar/measurements', {
    params: {
      target_date: date,
      limit,
    },
  })
  return response.data
}

export interface StatsResult {
  count: number
  avg_delta_azimuth: number | null
  avg_delta_altitude: number | null
  std_dev_azimuth: number | null
  std_dev_altitude: number | null
  // Flat Earth triangulation statistics
  flat_earth_samples: number | null
  avg_flat_earth_sun_height_km: number | null
  std_dev_flat_earth_sun_height_km: number | null
}

/**
 * Get aggregated statistics for measurements on a given date.
 * @param date - Optional date string in YYYY-MM-DD format (defaults to today)
 */
export async function getStats(date?: string): Promise<StatsResult> {
  const response = await api.get<StatsResult>('/api/v1/solar/stats', {
    params: { target_date: date },
  })
  return response.data
}

/**
 * Trigger a browser download of measurements as CSV.
 * @param date - Optional date string in YYYY-MM-DD format (defaults to today)
 */
export function downloadCSV(date?: string): void {
  const baseUrl = import.meta.env.VITE_API_URL
  const params = new URLSearchParams()
  if (date) params.set('target_date', date)
  const url = `${baseUrl}/api/v1/solar/export${params.toString() ? '?' + params.toString() : ''}`
  window.open(url, '_blank')
}

export interface VerdictResult {
  id: number
  created_at: string
  total_samples: number
  valid_samples: number
  avg_error_azimuth: number
  avg_error_altitude: number
  confidence_score: number
  winning_model: 'NASA' | 'ANOMALY'
}

/**
 * Get the latest Earth model verdict.
 * Returns analysis of last 24h of measurements.
 */
export async function getLatestVerdict(): Promise<VerdictResult> {
  const response = await api.get<VerdictResult>('/api/v1/verdict/latest')
  return response.data
}
