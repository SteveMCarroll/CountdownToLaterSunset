// TypeScript type definitions for the sunset countdown app

export interface Location {
  latitude: number
  longitude: number
  name?: string
  timezone?: string
  source: 'geolocation' | 'manual' | 'search'
}

export interface SunsetInfo {
  sunset: Date
  sunrise: Date
  location: Location
  date: Date
  timezone: string
  hasSunset: boolean // false for polar regions during certain times
}

export interface Milestone {
  time: Date
  type: 'half-hour' | 'hour' | 'exact-sunset' | 'golden-hour'
  label: string // e.g., "4:30 PM", "5:00 PM", "Sunset"
  isPrimary: boolean
}

export interface CountdownInfo {
  timeRemaining: {
    days: number
    hours: number
    minutes: number
    seconds: number
  }
  milestone: Milestone
  totalMinutes: number
  targetDate: Date
}

export interface GeolocationError {
  code: number
  message: string
  fallbackRequired: boolean
}

export interface SunCalculationResult {
  success: boolean
  sunsetInfo?: SunsetInfo
  error?: string
  isPolarRegion?: boolean
  polarType?: 'midnight-sun' | 'polar-night'
}