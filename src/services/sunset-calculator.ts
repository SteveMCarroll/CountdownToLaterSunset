import { getSunrise, getSunset } from 'sunrise-sunset-js'
import type { Location, SunsetInfo, SunCalculationResult } from '@/types'

/**
 * Calculate sunset information for a given location and date
 */
export function calculateSunsetInfo(
  location: Location,
  date: Date = new Date()
): SunCalculationResult {
  try {
    // Handle extreme latitude cases (polar regions)
    if (Math.abs(location.latitude) > 66.5) {
      return handlePolarRegion(location, date)
    }

    const sunset = getSunset(location.latitude, location.longitude, date)
    const sunrise = getSunrise(location.latitude, location.longitude, date)
    
    // Check if we got valid sunset/sunrise times
    if (!sunset || !sunrise) {
      return {
        success: false,
        error: 'Unable to calculate sunset times for this location and date',
        isPolarRegion: false
      }
    }

    // Get timezone from browser or estimate from longitude
    const timezone = getTimezone(location)

    const sunsetInfo: SunsetInfo = {
      sunset,
      sunrise,
      location,
      date,
      timezone,
      hasSunset: true
    }

    return {
      success: true,
      sunsetInfo
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calculating sunset'
    }
  }
}

/**
 * Handle sunset calculations for polar regions
 */
function handlePolarRegion(location: Location, date: Date): SunCalculationResult {
  const dayOfYear = getDayOfYear(date)
  const isNorthernHemisphere = location.latitude > 0
  
  // Approximate check for midnight sun / polar night
  // This is simplified - real calculation would consider solar declination
  const isSummerSolstice = dayOfYear >= 150 && dayOfYear <= 200 // roughly June-July
  const isWinterSolstice = dayOfYear >= 340 || dayOfYear <= 50 // roughly Dec-Feb
  
  let polarType: 'midnight-sun' | 'polar-night'
  
  if (isNorthernHemisphere) {
    polarType = isSummerSolstice ? 'midnight-sun' : isWinterSolstice ? 'polar-night' : 'midnight-sun'
  } else {
    polarType = isSummerSolstice ? 'polar-night' : isWinterSolstice ? 'midnight-sun' : 'polar-night'
  }
  
  // Try to get sunset anyway - the library might handle edge cases
  const sunset = getSunset(location.latitude, location.longitude, date)
  const sunrise = getSunrise(location.latitude, location.longitude, date)
  
  if (sunset && sunrise) {
    // We got times even in polar region
    const sunsetInfo: SunsetInfo = {
      sunset,
      sunrise,
      location,
      date,
      timezone: getTimezone(location),
      hasSunset: true
    }
    
    return {
      success: true,
      sunsetInfo,
      isPolarRegion: true
    }
  }
  
  return {
    success: false,
    error: `${polarType === 'midnight-sun' ? 'Midnight sun' : 'Polar night'} - no sunset during this period`,
    isPolarRegion: true,
    polarType
  }
}

/**
 * Get timezone string for location
 * In a real app, you might use a timezone API or library
 * For now, we'll use browser timezone or estimate from longitude
 */
function getTimezone(location: Location): string {
  // First try to use browser timezone if available
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // Fallback: estimate timezone from longitude
    // This is very approximate
    const hoursFromUTC = Math.round(location.longitude / 15)
    const sign = hoursFromUTC >= 0 ? '+' : '-'
    const absHours = Math.abs(hoursFromUTC)
    return `UTC${sign}${absHours.toString().padStart(2, '0')}:00`
  }
}

/**
 * Calculate day of year (1-366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/**
 * Calculate sunset for multiple upcoming dates
 * Useful for finding when sunset crosses milestone times
 */
export function calculateSunsetProgression(
  location: Location,
  startDate: Date = new Date(),
  days: number = 7
): SunCalculationResult[] {
  const results: SunCalculationResult[] = []
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    
    results.push(calculateSunsetInfo(location, date))
  }
  
  return results
}

/**
 * Find the date when sunset will be at or after a target time
 * Searches up to maxDays in the future
 */
export function findSunsetAfterTime(
  location: Location,
  targetTime: Date, // Should be time of day, date part will be ignored
  startDate: Date = new Date(),
  maxDays: number = 365
): { date: Date; sunsetTime: Date } | null {
  const targetHours = targetTime.getHours()
  const targetMinutes = targetTime.getMinutes()
  const targetTotalMinutes = targetHours * 60 + targetMinutes
  
  for (let i = 0; i < maxDays; i++) {
    const checkDate = new Date(startDate)
    checkDate.setDate(checkDate.getDate() + i)
    
    const result = calculateSunsetInfo(location, checkDate)
    
    if (result.success && result.sunsetInfo) {
      const sunset = result.sunsetInfo.sunset
      const sunsetHours = sunset.getHours()
      const sunsetMinutes = sunset.getMinutes()
      const sunsetTotalMinutes = sunsetHours * 60 + sunsetMinutes
      
      if (sunsetTotalMinutes >= targetTotalMinutes) {
        return {
          date: checkDate,
          sunsetTime: sunset
        }
      }
    }
  }
  
  return null
}