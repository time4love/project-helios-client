export interface SensorData {
  /** Compass heading (0-360), 0 = North */
  alpha: number
  /** Front-to-back tilt (-180 to 180) */
  beta: number
  /** Left-to-right tilt (-90 to 90) */
  gamma: number
  /** True if orientation is relative to Earth's coordinate frame */
  absolute: boolean
}
