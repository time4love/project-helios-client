import { describe, it, expect } from 'vitest'
import { normalizeOrientation, getShortestAngle } from './sensorMath'

describe('normalizeOrientation', () => {
  describe('azimuth normalization', () => {
    it('should pass through valid azimuth values unchanged', () => {
      expect(normalizeOrientation(0, 90, 0).azimuth).toBe(0)
      expect(normalizeOrientation(180, 90, 0).azimuth).toBe(180)
      expect(normalizeOrientation(359, 90, 0).azimuth).toBe(359)
    })

    it('should normalize azimuth values over 360', () => {
      expect(normalizeOrientation(360, 90, 0).azimuth).toBe(0)
      expect(normalizeOrientation(450, 90, 0).azimuth).toBe(90)
      expect(normalizeOrientation(720, 90, 0).azimuth).toBe(0)
    })

    it('should normalize negative azimuth values', () => {
      expect(normalizeOrientation(-10, 90, 0).azimuth).toBe(350)
      expect(normalizeOrientation(-90, 90, 0).azimuth).toBe(270)
      // -360 % 360 = -0 in JavaScript, which is mathematically equal to 0
      expect(normalizeOrientation(-360, 90, 0).azimuth + 0).toBe(0)
    })
  })

  describe('altitude conversion (beta to astronomical altitude)', () => {
    it('should convert upright phone (beta=90) to horizon (altitude=0)', () => {
      expect(normalizeOrientation(0, 90, 0).altitude).toBe(0)
    })

    it('should convert phone pointing at zenith (beta=180) to altitude=90', () => {
      expect(normalizeOrientation(0, 180, 0).altitude).toBe(90)
    })

    it('should convert phone flat on table (beta=0) to altitude=-90', () => {
      expect(normalizeOrientation(0, 0, 0).altitude).toBe(-90)
    })

    it('should handle tilted positions correctly', () => {
      // Phone tilted 45° up from horizon
      expect(normalizeOrientation(0, 135, 0).altitude).toBe(45)
      // Phone tilted 30° down from horizon
      expect(normalizeOrientation(0, 60, 0).altitude).toBe(-30)
    })

    it('should clamp altitude to valid range [-90, 90]', () => {
      // Beta values that would exceed astronomical bounds
      expect(normalizeOrientation(0, 200, 0).altitude).toBe(90)
      expect(normalizeOrientation(0, -50, 0).altitude).toBe(-90)
    })
  })
})

describe('getShortestAngle', () => {
  describe('basic angle calculations', () => {
    it('should return 0 when target equals current', () => {
      expect(getShortestAngle(0, 0)).toBe(0)
      expect(getShortestAngle(180, 180)).toBe(0)
      expect(getShortestAngle(359, 359)).toBe(0)
    })

    it('should return positive for clockwise (right) turns', () => {
      expect(getShortestAngle(90, 0)).toBe(90) // Turn right 90°
      expect(getShortestAngle(45, 0)).toBe(45) // Turn right 45°
    })

    it('should return negative for counter-clockwise (left) turns', () => {
      expect(getShortestAngle(0, 90)).toBe(-90) // Turn left 90°
      expect(getShortestAngle(270, 0)).toBe(-90) // Turn left 90°
    })
  })

  describe('wrap-around handling (0°/360° boundary)', () => {
    it('should take the short path across 0°/360° boundary', () => {
      // From 350° to 10° should be +20° (right), not -340° (left)
      expect(getShortestAngle(10, 350)).toBe(20)

      // From 10° to 350° should be -20° (left), not +340° (right)
      expect(getShortestAngle(350, 10)).toBe(-20)
    })

    it('should handle edge cases near 0°', () => {
      expect(getShortestAngle(1, 359)).toBe(2)
      expect(getShortestAngle(359, 1)).toBe(-2)
    })

    it('should handle exact 180° difference (ambiguous case)', () => {
      // 180° difference could go either way - implementation returns 180 or -180
      const result = getShortestAngle(180, 0)
      expect(Math.abs(result)).toBe(180)
    })
  })

  describe('real-world targeting scenarios', () => {
    it('should correctly guide user facing North (0°) to sun at East (90°)', () => {
      const delta = getShortestAngle(90, 0)
      expect(delta).toBe(90) // Turn right 90°
      expect(delta).toBeGreaterThan(0) // Positive = right
    })

    it('should correctly guide user facing South (180°) to sun at West (270°)', () => {
      const delta = getShortestAngle(270, 180)
      expect(delta).toBe(90) // Turn right 90°
    })

    it('should correctly guide user facing East (90°) to sun at North (0°)', () => {
      const delta = getShortestAngle(0, 90)
      expect(delta).toBe(-90) // Turn left 90°
      expect(delta).toBeLessThan(0) // Negative = left
    })
  })
})
