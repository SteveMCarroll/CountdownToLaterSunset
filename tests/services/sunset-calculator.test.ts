import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { 
  calculateSunsetInfo, 
  calculateSunsetProgression, 
  findSunsetAfterTime 
} from '@/services/sunset-calculator'
import type { Location } from '@/types'

describe('Sunset Calculator', () => {
  beforeEach(() => {
    // Mock a consistent date for testing
    global.mockDate('2024-06-21T12:00:00Z') // Summer solstice
  })

  afterEach(() => {
    global.restoreDate()
  })

  describe('calculateSunsetInfo', () => {
    test('should calculate sunset for standard location (Seattle)', () => {
      const seattle: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        name: 'Seattle, WA',
        source: 'manual'
      }

      const result = calculateSunsetInfo(seattle, new Date('2024-06-21'))

      expect(result.success).toBe(true)
      expect(result.sunsetInfo).toBeDefined()
      
      if (result.sunsetInfo) {
        expect(result.sunsetInfo.hasSunset).toBe(true)
        expect(result.sunsetInfo.sunset).toBeInstanceOf(Date)
        expect(result.sunsetInfo.sunrise).toBeInstanceOf(Date)
        expect(result.sunsetInfo.location).toEqual(seattle)
        
        // Seattle sunset on summer solstice should be around 9 PM
        const sunsetHour = result.sunsetInfo.sunset.getHours()
        expect(sunsetHour).toBeGreaterThan(19) // After 7 PM
        expect(sunsetHour).toBeLessThan(23) // Before 11 PM
      }
    })

    test('should calculate sunset for different location (New York)', () => {
      const newYork: Location = {
        latitude: 40.7128,
        longitude: -74.0060,
        name: 'New York, NY',
        source: 'geolocation'
      }

      const result = calculateSunsetInfo(newYork, new Date('2024-06-21'))

      expect(result.success).toBe(true)
      expect(result.sunsetInfo).toBeDefined()
      
      if (result.sunsetInfo) {
        // New York sunset should be earlier than Seattle on same day
        const sunsetHour = result.sunsetInfo.sunset.getHours()
        expect(sunsetHour).toBeGreaterThan(18)
        expect(sunsetHour).toBeLessThan(22)
      }
    })

    test('should handle winter solstice (shorter days)', () => {
      const seattle: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        name: 'Seattle, WA',
        source: 'manual'
      }

      const result = calculateSunsetInfo(seattle, new Date('2024-12-21'))

      expect(result.success).toBe(true)
      
      if (result.sunsetInfo) {
        const sunsetHour = result.sunsetInfo.sunset.getHours()
        // Winter sunset should be much earlier
        expect(sunsetHour).toBeGreaterThan(14) // After 2 PM
        expect(sunsetHour).toBeLessThan(18) // Before 6 PM
      }
    })

    test('should handle extreme latitude - Northern Alaska', () => {
      const alaska: Location = {
        latitude: 70.0, // Above Arctic Circle
        longitude: -150.0,
        name: 'Northern Alaska',
        source: 'manual'
      }

      // Summer - should have midnight sun or very late sunset
      const summerResult = calculateSunsetInfo(alaska, new Date('2024-06-21'))
      
      // Winter - should have polar night
      const winterResult = calculateSunsetInfo(alaska, new Date('2024-12-21'))

      // At least one should indicate polar conditions
      expect(
        summerResult.isPolarRegion || winterResult.isPolarRegion ||
        !summerResult.success || !winterResult.success
      ).toBe(true)
    })

    test('should handle Southern hemisphere location', () => {
      const sydney: Location = {
        latitude: -33.8688,
        longitude: 151.2093,
        name: 'Sydney, Australia',
        source: 'manual'
      }

      const result = calculateSunsetInfo(sydney, new Date('2024-06-21'))

      expect(result.success).toBe(true)
      
      if (result.sunsetInfo) {
        // June is winter in Southern hemisphere
        const sunsetHour = result.sunsetInfo.sunset.getHours()
        expect(sunsetHour).toBeGreaterThan(15) // After 3 PM
        expect(sunsetHour).toBeLessThan(19) // Before 7 PM
      }
    })

    test('should handle invalid coordinates gracefully', () => {
      const invalid: Location = {
        latitude: 999, // Invalid latitude
        longitude: 999, // Invalid longitude
        source: 'manual'
      }

      const result = calculateSunsetInfo(invalid)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.sunsetInfo).toBeUndefined()
    })

    test('should handle leap year date', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const result = calculateSunsetInfo(location, new Date('2024-02-29')) // Leap day

      expect(result.success).toBe(true)
      expect(result.sunsetInfo?.date.getDate()).toBe(29)
      expect(result.sunsetInfo?.date.getMonth()).toBe(1) // February (0-indexed)
    })
  })

  describe('calculateSunsetProgression', () => {
    test('should calculate progression for multiple days', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const progression = calculateSunsetProgression(location, new Date('2024-03-01'), 7)

      expect(progression).toHaveLength(7)
      
      progression.forEach((result, index) => {
        expect(result.success).toBe(true)
        if (result.sunsetInfo) {
          const expectedDate = new Date('2024-03-01')
          expectedDate.setDate(expectedDate.getDate() + index)
          expect(result.sunsetInfo.date.toDateString()).toBe(expectedDate.toDateString())
        }
      })
    })

    test('should show sunset getting later in spring', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const progression = calculateSunsetProgression(location, new Date('2024-03-01'), 30)

      let previousSunsetTime: Date | null = null
      let laterSunsets = 0

      progression.forEach(result => {
        if (result.success && result.sunsetInfo && previousSunsetTime) {
          if (result.sunsetInfo.sunset.getTime() > previousSunsetTime.getTime()) {
            laterSunsets++
          }
          previousSunsetTime = result.sunsetInfo.sunset
        } else if (result.success && result.sunsetInfo) {
          previousSunsetTime = result.sunsetInfo.sunset
        }
      })

      // Most days should have later sunsets in spring
      expect(laterSunsets).toBeGreaterThan(progression.length * 0.6)
    })
  })

  describe('findSunsetAfterTime', () => {
    test('should find when sunset reaches 6:00 PM', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const targetTime = new Date()
      targetTime.setHours(18, 0, 0, 0) // 6:00 PM

      const result = findSunsetAfterTime(
        location, 
        targetTime, 
        new Date('2024-01-01'), 
        180 // Search 6 months
      )

      expect(result).toBeDefined()
      
      if (result) {
        const sunsetHour = result.sunsetTime.getHours()
        const sunsetMinute = result.sunsetTime.getMinutes()
        const totalMinutes = sunsetHour * 60 + sunsetMinute
        
        expect(totalMinutes).toBeGreaterThanOrEqual(18 * 60) // At or after 6:00 PM
        expect(result.date).toBeInstanceOf(Date)
        expect(result.date.getTime()).toBeGreaterThan(new Date('2024-01-01').getTime())
      }
    })

    test('should find when sunset reaches 7:30 PM', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const targetTime = new Date()
      targetTime.setHours(19, 30, 0, 0) // 7:30 PM

      const result = findSunsetAfterTime(
        location, 
        targetTime, 
        new Date('2024-01-01'), 
        365
      )

      expect(result).toBeDefined()
      
      if (result) {
        const sunsetHour = result.sunsetTime.getHours()
        const sunsetMinute = result.sunsetTime.getMinutes()
        const totalMinutes = sunsetHour * 60 + sunsetMinute
        
        expect(totalMinutes).toBeGreaterThanOrEqual(19 * 60 + 30) // At or after 7:30 PM
      }
    })

    test('should return null if sunset never reaches unrealistic time', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const targetTime = new Date()
      targetTime.setHours(23, 0, 0, 0) // 11:00 PM - unrealistic for Seattle

      const result = findSunsetAfterTime(
        location, 
        targetTime, 
        new Date('2024-01-01'), 
        365
      )

      // Should return null for unrealistic sunset times
      expect(result).toBeNull()
    })

    test('should handle edge case near current sunset time', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      // Use a time that might be very close to actual sunset
      const targetTime = new Date()
      targetTime.setHours(17, 0, 0, 0) // 5:00 PM

      const result = findSunsetAfterTime(
        location, 
        targetTime, 
        new Date('2024-01-15'), // Mid January
        30
      )

      expect(result).toBeDefined()
      
      if (result) {
        // Should find a date within reasonable time
        expect(result.date.getTime()).toBeGreaterThan(new Date('2024-01-15').getTime())
      }
    })
  })

  describe('Error handling and edge cases', () => {
    test('should handle DST transition dates', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      // Test Spring forward (typically second Sunday in March)
      const springForward = calculateSunsetInfo(location, new Date('2024-03-10'))
      expect(springForward.success).toBe(true)

      // Test Fall back (typically first Sunday in November)
      const fallBack = calculateSunsetInfo(location, new Date('2024-11-03'))
      expect(fallBack.success).toBe(true)
    })

    test('should handle year boundaries', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      // New Year's Eve
      const newYearsEve = calculateSunsetInfo(location, new Date('2024-12-31'))
      expect(newYearsEve.success).toBe(true)

      // New Year's Day
      const newYearsDay = calculateSunsetInfo(location, new Date('2025-01-01'))
      expect(newYearsDay.success).toBe(true)
    })

    test('should handle equinox dates', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      // Spring equinox (approximately March 20)
      const springEquinox = calculateSunsetInfo(location, new Date('2024-03-20'))
      expect(springEquinox.success).toBe(true)

      // Fall equinox (approximately September 22)
      const fallEquinox = calculateSunsetInfo(location, new Date('2024-09-22'))
      expect(fallEquinox.success).toBe(true)
    })
  })
})