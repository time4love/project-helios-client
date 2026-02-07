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

/**
 * Fetch the sun's position for a given location.
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
