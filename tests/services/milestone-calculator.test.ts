import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getNextMilestone,
  getUpcomingMilestones,
  calculateCountdown,
  getMilestoneCalendar
} from '@/services/milestone-calculator'
import type { Location } from '@/types'

describe('Milestone Calculator', () => {
  const testLocation: Location = {
    latitude: 47.6062,
    longitude: -122.3321,
    name: 'Seattle, WA',
    source: 'manual'
  }

  beforeEach(() => {
    // Mock consistent date for testing
    global.mockDate('2024-01-15T14:30:00Z') // Mid-January afternoon
  })

  afterEach(() => {
    global.restoreDate()
  })

  describe('getNextMilestone', () => {
    test('should find next 30-minute milestone', () => {
      // Mock current time to 2:15 PM
      global.mockDate('2024-01-15T14:15:00Z')
      
      const result = getNextMilestone(testLocation, new Date('2024-01-15'))

      expect(result.milestone).toBeDefined()
      expect(result.sunsetInfo).toBeDefined()
      
      if (result.milestone) {
        // Next milestone after 2:15 should be 2:30 or later
        const milestoneMinutes = result.milestone.time.getMinutes()
        expect(milestoneMinutes === 0 || milestoneMinutes === 30).toBe(true)
        
        expect(result.milestone.isPrimary).toBe(true)
        expect(result.milestone.label).toBeTruthy()
        expect(['hour', 'half-hour', 'exact-sunset'].includes(result.milestone.type)).toBe(true)
      }

      expect(typeof result.daysUntil).toBe('number')
      expect(result.daysUntil).toBeGreaterThanOrEqual(0)
    })

    test('should handle edge case when current time is exactly at milestone', () => {
      // Mock current time to exactly 4:30 PM
      global.mockDate('2024-01-15T16:30:00Z')
      
      const result = getNextMilestone(testLocation, new Date('2024-01-15'))

      expect(result.milestone).toBeDefined()
      
      if (result.milestone) {
        // Should find the next milestone (5:00 PM)
        const milestoneHour = result.milestone.time.getHours()
        const milestoneMinute = result.milestone.time.getMinutes()
        
        expect(milestoneHour).toBeGreaterThan(16)
        expect(milestoneMinute === 0 || milestoneMinute === 30).toBe(true)
      }
    })

    test('should handle late evening times', () => {
      // Mock current time to 8:45 PM  
      global.mockDate('2024-01-15T20:45:00Z')
      
      const result = getNextMilestone(testLocation, new Date('2024-01-15'))

      expect(result.milestone).toBeDefined()
      
      if (result.milestone) {
        // Should find next milestone, likely next day
        expect(result.daysUntil).toBeGreaterThanOrEqual(0)
        
        // Milestone should be reasonable time
        const milestoneHour = result.milestone.time.getHours()
        expect(milestoneHour).toBeGreaterThanOrEqual(16) // After 4 PM
        expect(milestoneHour).toBeLessThanOrEqual(21) // Before 9 PM
      }
    })

    test('should handle winter dates when sunset is early', () => {
      // Test in deep winter when sunset might be around 4:30 PM
      const result = getNextMilestone(testLocation, new Date('2024-12-21'))

      expect(result.milestone).toBeDefined()
      expect(result.error).toBeUndefined()
      
      if (result.milestone) {
        expect(result.daysUntil).toBeGreaterThanOrEqual(0)
        expect(result.milestone.label).toMatch(/\d{1,2}:\d{2}\s?(AM|PM|Sunset)/i)
      }
    })

    test('should handle summer dates when sunset is late', () => {
      // Test in summer when sunset might be after 8 PM
      const result = getNextMilestone(testLocation, new Date('2024-06-21'))

      expect(result.milestone).toBeDefined()
      expect(result.error).toBeUndefined()
      
      if (result.milestone) {
        expect(result.daysUntil).toBeGreaterThanOrEqual(0)
      }
    })

    test('should return error for invalid location', () => {
      const invalidLocation: Location = {
        latitude: 999,
        longitude: 999,
        source: 'manual'
      }

      const result = getNextMilestone(invalidLocation)

      expect(result.milestone).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.daysUntil).toBe(0)
    })
  })

  describe('getUpcomingMilestones', () => {
    test('should return list of upcoming milestones', () => {
      const milestones = getUpcomingMilestones(testLocation, new Date('2024-03-01'), 4)

      expect(Array.isArray(milestones)).toBe(true)
      expect(milestones.length).toBeGreaterThan(0)
      expect(milestones.length).toBeLessThanOrEqual(4)
      
      milestones.forEach((milestone, index) => {
        expect(milestone.isPrimary).toBe(false)
        expect(milestone.label).toBeTruthy()
        expect(['hour', 'half-hour', 'exact-sunset'].includes(milestone.type)).toBe(true)
        
        // Each milestone should be after the previous one
        if (index > 0) {
          expect(milestone.time.getTime()).toBeGreaterThan(milestones[index - 1].time.getTime())
        }
      })
    })

    test('should limit milestones to reasonable times', () => {
      const milestones = getUpcomingMilestones(testLocation, new Date('2024-03-01'), 10)

      milestones.forEach(milestone => {
        const hour = milestone.time.getHours()
        const minute = milestone.time.getMinutes()
        
        // Should not go past 9:30 PM
        expect(hour <= 21).toBe(true)
        if (hour === 21) {
          expect(minute <= 30).toBe(true)
        }
        
        // Should be 30-minute increments
        expect(minute === 0 || minute === 30).toBe(true)
      })
    })

    test('should handle request for 0 milestones', () => {
      const milestones = getUpcomingMilestones(testLocation, new Date('2024-03-01'), 0)

      expect(milestones).toEqual([])
    })

    test('should handle edge case when starting near end time', () => {
      // Mock time to 8:30 PM
      global.mockDate('2024-01-15T20:30:00Z')
      
      const milestones = getUpcomingMilestones(testLocation, new Date('2024-01-15'), 5)

      // Should return fewer milestones since we're near the end of reasonable times
      milestones.forEach(milestone => {
        const hour = milestone.time.getHours()
        expect(hour).toBeLessThanOrEqual(21)
      })
    })
  })

  describe('calculateCountdown', () => {
    test('should calculate countdown to next milestone', () => {
      const countdown = calculateCountdown(testLocation, new Date('2024-03-01'))

      expect(countdown).toBeDefined()
      
      if (countdown) {
        expect(countdown.timeRemaining).toBeDefined()
        expect(countdown.milestone).toBeDefined()
        expect(countdown.totalMinutes).toBeGreaterThanOrEqual(0)
        
        const { days, hours, minutes, seconds } = countdown.timeRemaining
        expect(typeof days).toBe('number')
        expect(typeof hours).toBe('number')
        expect(typeof minutes).toBe('number')
        expect(typeof seconds).toBe('number')
        
        expect(days).toBeGreaterThanOrEqual(0)
        expect(hours).toBeGreaterThanOrEqual(0)
        expect(hours).toBeLessThanOrEqual(23)
        expect(minutes).toBeGreaterThanOrEqual(0)
        expect(minutes).toBeLessThanOrEqual(59)
        expect(seconds).toBeGreaterThanOrEqual(0)
        expect(seconds).toBeLessThanOrEqual(59)
      }
    })

    test('should handle same-day countdown', () => {
      // Mock morning time when next milestone might be today
      global.mockDate('2024-03-01T10:00:00Z')
      
      const countdown = calculateCountdown(testLocation, new Date('2024-03-01'))

      if (countdown && countdown.timeRemaining.days === 0) {
        // Same-day countdown should have reasonable hours
        expect(countdown.timeRemaining.hours).toBeLessThanOrEqual(23)
        expect(countdown.totalMinutes).toBeLessThanOrEqual(24 * 60)
      }
    })

    test('should return null for invalid scenarios', () => {
      const invalidLocation: Location = {
        latitude: 999,
        longitude: 999,
        source: 'manual'
      }

      const countdown = calculateCountdown(invalidLocation)
      expect(countdown).toBeNull()
    })
  })

  describe('getMilestoneCalendar', () => {
    test('should return calendar of milestone dates', () => {
      const calendar = getMilestoneCalendar(testLocation, new Date('2024-01-01'))

      expect(Array.isArray(calendar)).toBe(true)
      expect(calendar.length).toBeGreaterThan(0)
      
      calendar.forEach((entry, index) => {
        expect(entry.time).toBeTruthy()
        expect(entry.time).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i)
        expect(typeof entry.daysFromNow).toBe('number')
        
        // Either we have a valid date or daysFromNow is -1 (no date found)
        if (entry.date) {
          expect(entry.date).toBeInstanceOf(Date)
          expect(entry.daysFromNow).toBeGreaterThanOrEqual(0)
        } else {
          expect(entry.daysFromNow).toBe(-1)
        }
        
        // Times should be in ascending order
        if (index > 0 && entry.date && calendar[index - 1].date) {
          expect(entry.daysFromNow).toBeGreaterThanOrEqual(calendar[index - 1].daysFromNow)
        }
      })
    })

    test('should handle custom milestone hours', () => {
      const customHours = [17, 18, 19] // 5 PM, 6 PM, 7 PM
      const calendar = getMilestoneCalendar(testLocation, new Date('2024-03-01'), customHours)

      expect(calendar.length).toBe(3)
      expect(calendar[0].time).toMatch(/5:00\s?PM/i)
      expect(calendar[1].time).toMatch(/6:00\s?PM/i)  
      expect(calendar[2].time).toMatch(/7:00\s?PM/i)
    })

    test('should handle unrealistic milestone times gracefully', () => {
      const unrealisticHours = [23, 24, 1] // 11 PM, midnight, 1 AM
      const calendar = getMilestoneCalendar(testLocation, new Date('2024-01-01'), unrealisticHours)

      // Most/all entries should have no date found (daysFromNow: -1)
      const noDateEntries = calendar.filter(entry => entry.daysFromNow === -1)
      expect(noDateEntries.length).toBeGreaterThan(0)
    })
  })

  describe('Edge cases and boundary conditions', () => {
    test('should handle leap year dates', () => {
      const countdown = calculateCountdown(testLocation, new Date('2024-02-29'))
      expect(countdown).toBeDefined()
    })

    test('should handle year boundaries', () => {
      const newYearEve = calculateCountdown(testLocation, new Date('2024-12-31'))
      const newYearDay = calculateCountdown(testLocation, new Date('2025-01-01'))
      
      expect(newYearEve).toBeDefined()
      expect(newYearDay).toBeDefined()
    })

    test('should handle DST transition dates', () => {
      // Spring forward
      const springDST = calculateCountdown(testLocation, new Date('2024-03-10'))
      expect(springDST).toBeDefined()
      
      // Fall back  
      const fallDST = calculateCountdown(testLocation, new Date('2024-11-03'))
      expect(fallDST).toBeDefined()
    })

    test('should handle very early morning times', () => {
      global.mockDate('2024-03-01T02:00:00Z') // 2 AM
      
      const result = getNextMilestone(testLocation, new Date('2024-03-01'))
      expect(result.milestone).toBeDefined()
      
      if (result.milestone) {
        // Should find milestone later today or in future days
        const milestoneHour = result.milestone.time.getHours()
        expect(milestoneHour).toBeGreaterThanOrEqual(16) // Should be afternoon/evening
      }
    })
  })
})