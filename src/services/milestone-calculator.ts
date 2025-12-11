import type { Milestone, CountdownInfo, Location, SunsetInfo } from '@/types'
import { findSunsetAfterTime, calculateSunsetInfo } from './sunset-calculator'

/**
 * Generate milestone times for a given date (30-minute increments from 4:00 PM to 9:00 PM)
 */
function generateMilestoneTemplate(date: Date): Date[] {
  const milestones: Date[] = []
  
  // Start from 4:00 PM and go to 9:00 PM in 30-minute increments
  for (let hour = 16; hour <= 21; hour++) {
    for (let minute of [0, 30]) {
      if (hour === 21 && minute === 30) break // Stop at 9:00 PM
      
      const milestone = new Date(date)
      milestone.setHours(hour, minute, 0, 0)
      milestones.push(milestone)
    }
  }
  
  return milestones
}

/**
 * Determine milestone type based on time
 */
function getMilestoneType(time: Date): Milestone['type'] {
  const minutes = time.getMinutes()
  
  if (minutes === 0) return 'hour'
  if (minutes === 30) return 'half-hour'
  return 'exact-sunset'
}

/**
 * Format milestone label for display
 */
function formatMilestoneLabel(time: Date, type: Milestone['type']): string {
  if (type === 'exact-sunset') return 'Sunset'
  if (type === 'golden-hour') return 'Golden Hour'
  
  return time.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
}

/**
 * Calculate the next milestone sunset time for a given location
 */
export function getNextMilestone(location: Location, currentDate: Date = new Date()): {
  milestone: Milestone | null
  sunsetInfo: SunsetInfo | null
  daysUntil: number
  error?: string
} {
  try {
    // First check today's sunset
    const todayResult = calculateSunsetInfo(location, currentDate)
    if (!todayResult.success) {
      return {
        milestone: null,
        sunsetInfo: null,
        daysUntil: 0,
        error: todayResult.error
      }
    }
    
    const todaySunset = todayResult.sunsetInfo!.sunset
    
    // Find the next 30-minute milestone after TODAY'S sunset time
    const sunsetHour = todaySunset.getHours()
    const sunsetMinute = todaySunset.getMinutes()
    
    let nextMilestoneTime: Date
    
    if (sunsetMinute < 30) {
      // Next milestone is at :30 of the same hour
      nextMilestoneTime = new Date(todaySunset)
      nextMilestoneTime.setMinutes(30, 0, 0)
    } else {
      // Next milestone is at :00 of the next hour
      nextMilestoneTime = new Date(todaySunset)
      nextMilestoneTime.setHours(sunsetHour + 1, 0, 0, 0)
    }
    
    // Find when sunset will actually reach this milestone time
    const result = findSunsetAfterTime(location, nextMilestoneTime, currentDate, 365)
    
    if (!result) {
      return {
        milestone: null,
        sunsetInfo: null,
        daysUntil: 0,
        error: 'Could not find when sunset reaches next milestone'
      }
    }
    
    const daysUntil = Math.ceil((result.date.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
    
    const milestone: Milestone = {
      time: nextMilestoneTime,
      type: getMilestoneType(nextMilestoneTime),
      label: formatMilestoneLabel(nextMilestoneTime, getMilestoneType(nextMilestoneTime)),
      isPrimary: true
    }
    
    const futureSunsetInfo = calculateSunsetInfo(location, result.date)
    
    return {
      milestone,
      sunsetInfo: futureSunsetInfo.success ? futureSunsetInfo.sunsetInfo! : todayResult.sunsetInfo!,
      daysUntil
    }
    
  } catch (error) {
    return {
      milestone: null,
      sunsetInfo: null,
      daysUntil: 0,
      error: error instanceof Error ? error.message : 'Unknown error calculating milestone'
    }
  }
}

/**
 * Calculate upcoming milestones (next 3-5 milestones after the primary one)
 */
export function getUpcomingMilestones(
  location: Location,
  currentDate: Date = new Date(),
  count: number = 4
): Array<Milestone & { targetDate: Date; daysUntil: number }> {
  try {
    const nextMilestone = getNextMilestone(location, currentDate)
    if (!nextMilestone.milestone) return []
    
    const milestones: Array<Milestone & { targetDate: Date; daysUntil: number }> = []
    let currentMilestone = new Date(nextMilestone.milestone.time)
    
    // Generate next few milestones
    for (let i = 0; i < count; i++) {
      // Add 30 minutes to get next milestone
      currentMilestone = new Date(currentMilestone.getTime() + 30 * 60 * 1000)
      
      // Stop if we go past reasonable sunset times (9:30 PM)
      if (currentMilestone.getHours() > 21 || 
          (currentMilestone.getHours() === 21 && currentMilestone.getMinutes() > 30)) {
        break
      }
      
      // Find when sunset will reach this milestone
      const result = findSunsetAfterTime(location, currentMilestone, currentDate, 365)
      
      if (result) {
        const daysUntil = Math.ceil((result.sunsetTime.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
        
        const milestone = {
          time: currentMilestone,
          type: getMilestoneType(currentMilestone),
          label: formatMilestoneLabel(currentMilestone, getMilestoneType(currentMilestone)),
          isPrimary: false,
          targetDate: result.sunsetTime,
          daysUntil
        }
        
        milestones.push(milestone)
      }
    }
    
    return milestones
    
  } catch (error) {
    return []
  }
}

/**
 * Calculate countdown information for display
 */
export function calculateCountdown(
  location: Location,
  currentDate: Date = new Date()
): CountdownInfo | null {
  const next = getNextMilestone(location, currentDate)
  
  if (!next.milestone || next.daysUntil < 0) return null
  
  // Use the actual future date when sunset reaches the milestone
  const result = findSunsetAfterTime(location, next.milestone.time, currentDate, 365)
  
  if (!result) return null
  
  const now = currentDate
  const targetDateTime = result.sunsetTime
  
  const totalMilliseconds = targetDateTime.getTime() - now.getTime()
  const totalMinutes = Math.floor(totalMilliseconds / (1000 * 60))
  
  // Ensure we don't show negative time
  if (totalMilliseconds < 0) return null
  
  const days = Math.floor(totalMilliseconds / (1000 * 60 * 60 * 24))
  const hours = Math.floor((totalMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((totalMilliseconds % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((totalMilliseconds % (1000 * 60)) / 1000)
  
  return {
    timeRemaining: {
      days,
      hours,
      minutes,
      seconds
    },
    milestone: next.milestone,
    totalMinutes,
    targetDate: targetDateTime
  }
}

/**
 * Get milestone dates for calendar/planning view
 * Returns when sunset will reach each major milestone
 */
export function getMilestoneCalendar(
  location: Location,
  startDate: Date = new Date(),
  milestoneHours: number[] = [16.5, 17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5, 21] // 4:30, 5:00, etc.
): Array<{ time: string; date: Date | null; daysFromNow: number }> {
  const results: Array<{ time: string; date: Date | null; daysFromNow: number }> = []
  
  for (const hourDecimal of milestoneHours) {
    const hours = Math.floor(hourDecimal)
    const minutes = (hourDecimal % 1) * 60
    
    const targetTime = new Date()
    targetTime.setHours(hours, minutes, 0, 0)
    
    const result = findSunsetAfterTime(location, targetTime, startDate, 365)
    
    const timeLabel = `${hours === 12 ? 12 : hours % 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
    
    if (result) {
      const daysFromNow = Math.ceil((result.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      results.push({
        time: timeLabel,
        date: result.date,
        daysFromNow
      })
    } else {
      results.push({
        time: timeLabel,
        date: null,
        daysFromNow: -1
      })
    }
  }
  
  return results
}