import geomagnetism from 'geomagnetism'

export interface TrueNorthResult {
  trueAzimuth: number
  declination: number
}

/**
 * Convert magnetic azimuth to true azimuth using geomagnetic declination.
 *
 * Magnetic declination is the angle between magnetic north and true north.
 * - Positive declination: magnetic north is east of true north
 * - Negative declination: magnetic north is west of true north
 *
 * True Azimuth = Magnetic Azimuth + Declination
 *
 * @param magneticAzimuth - Azimuth from device compass (magnetic north reference)
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param _alt - Altitude in meters (unused, but kept for API consistency)
 * @returns Object with trueAzimuth and declination values
 */
export function getTrueNorth(
  magneticAzimuth: number,
  lat: number,
  lon: number,
  _alt?: number
): TrueNorthResult {
  // Get the current geomagnetic model
  const model = geomagnetism.model()

  // Calculate magnetic field properties at the given location
  const info = model.point([lat, lon])

  // Declination (D) is the angle between magnetic and true north
  const declination = info.decl

  // True azimuth = magnetic azimuth + declination
  // Normalize to 0-360 range
  let trueAzimuth = (magneticAzimuth + declination) % 360
  if (trueAzimuth < 0) {
    trueAzimuth += 360
  }

  return {
    trueAzimuth,
    declination,
  }
}
