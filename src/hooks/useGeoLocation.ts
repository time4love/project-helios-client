import { useState, useEffect } from 'react'

export interface Coordinates {
  latitude: number
  longitude: number
}

/**
 * Hook for accessing real-time GPS location data.
 * Uses watchPosition for continuous updates.
 */
export function useGeoLocation() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setError(null)
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied')
            break
          case err.POSITION_UNAVAILABLE:
            setError('Location unavailable')
            break
          case err.TIMEOUT:
            setError('Location request timed out')
            break
          default:
            setError(err.message)
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return { coordinates, error }
}
