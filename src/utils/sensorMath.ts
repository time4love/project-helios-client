/**
 * Sensor math utilities for converting raw device orientation
 * to astronomical coordinate system.
 */

interface NormalizedOrientation {
  azimuth: number
  altitude: number
}

/**
 * Normalize raw device orientation to astronomical coordinates.
 *
 * Device orientation (portrait mode):
 * - alpha: 0-360° compass heading (0 = North)
 * - beta: -180 to 180° front-to-back tilt (90° = upright/horizon)
 * - gamma: -90 to 90° left-to-right tilt
 *
 * Astronomical coordinates:
 * - azimuth: 0-360° (0 = North, 90 = East, 180 = South, 270 = West)
 * - altitude: -90 to 90° (0 = horizon, 90 = zenith, -90 = nadir)
 *
 * @param alpha - Raw compass heading (0-360)
 * @param beta - Raw front-to-back tilt (-180 to 180)
 * @param gamma - Raw left-to-right tilt (-90 to 90) - reserved for future use
 * @returns Normalized azimuth and altitude
 */
export function normalizeOrientation(
  alpha: number,
  beta: number,
  _gamma: number
): NormalizedOrientation {
  // Azimuth: Ensure alpha is in 0-360 range
  let azimuth = alpha % 360
  if (azimuth < 0) {
    azimuth += 360
  }

  // Altitude: Convert from device beta to astronomical altitude
  // Phone reports beta = 90° when held upright (pointing at horizon)
  // Astronomy expects altitude = 0° at horizon
  // Formula: altitude = beta - 90
  let altitude = beta - 90

  // Clamp altitude to valid astronomical range [-90, 90]
  if (altitude < -90) {
    altitude = -90
  } else if (altitude > 90) {
    altitude = 90
  }

  return { azimuth, altitude }
}

/**
 * Calculate the shortest angular distance from current to target.
 * Handles the 0-360° wrap-around correctly.
 *
 * @param target - Target angle in degrees (0-360)
 * @param current - Current angle in degrees (0-360)
 * @returns Shortest angle to turn:
 *   - Positive: turn RIGHT (clockwise)
 *   - Negative: turn LEFT (counter-clockwise)
 *
 * @example
 * getShortestAngle(350, 10)  // Returns -20 (turn left 20°)
 * getShortestAngle(10, 350)  // Returns +20 (turn right 20°)
 * getShortestAngle(180, 0)   // Returns +180 or -180
 */
export function getShortestAngle(target: number, current: number): number {
  // Adding 540 before modulo ensures we never have negative numbers
  // This avoids JavaScript's quirky negative modulo behavior
  // Result: positive = turn RIGHT, negative = turn LEFT
  return ((target - current + 540) % 360) - 180
}
