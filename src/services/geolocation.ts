import type { Location, GeolocationError } from '@/types'

/**
 * Geolocation service for handling user location detection and management
 */
export class GeolocationService {
  private static instance: GeolocationService
  private currentLocation: Location | null = null
  private watchId: number | null = null

  private constructor() {}

  static getInstance(): GeolocationService {
    if (!GeolocationService.instance) {
      GeolocationService.instance = new GeolocationService()
    }
    return GeolocationService.instance
  }

  /**
   * Get current location, attempting auto-detection first
   */
  async getCurrentLocation(): Promise<{ location: Location | null; error?: GeolocationError }> {
    // First try to get from cache
    if (this.currentLocation && this.currentLocation.source === 'geolocation') {
      return { location: this.currentLocation }
    }

    // Try auto-detection
    const autoResult = await this.detectLocation()
    if (autoResult.location) {
      this.currentLocation = autoResult.location
      this.saveLocationToStorage(autoResult.location)
      return autoResult
    }

    // Fall back to stored location
    const stored = this.getStoredLocation()
    if (stored) {
      this.currentLocation = stored
      return { location: stored }
    }

    return {
      location: null,
      error: autoResult.error || {
        code: 0,
        message: 'No location available',
        fallbackRequired: true
      }
    }
  }

  /**
   * Attempt to auto-detect user location using browser geolocation API
   */
  async detectLocation(): Promise<{ location: Location | null; error?: GeolocationError }> {
    if (!navigator.geolocation) {
      return {
        location: null,
        error: {
          code: 0,
          message: 'Geolocation is not supported by this browser',
          fallbackRequired: true
        }
      }
    }

    return new Promise((resolve) => {
      const options: PositionOptions = {
        enableHighAccuracy: false, // Don't need GPS precision for sunset calculations
        timeout: 3000, // 3 second timeout
        maximumAge: 300000 // Accept 5-minute old position
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: Location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            source: 'geolocation',
            name: 'Current Location'
          }
          resolve({ location })
        },
        (error) => {
          const geolocationError: GeolocationError = {
            code: error.code,
            message: this.getGeolocationErrorMessage(error.code),
            fallbackRequired: true
          }
          resolve({ location: null, error: geolocationError })
        },
        options
      )
    })
  }

  /**
   * Set location manually (user input)
   */
  setManualLocation(latitude: number, longitude: number, name?: string): Location {
    const location: Location = {
      latitude,
      longitude,
      name: name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      source: 'manual'
    }
    
    this.currentLocation = location
    this.saveLocationToStorage(location)
    return location
  }

  /**
   * Search for a location by name/address
   * Note: This is a simplified implementation - in a real app you'd use a geocoding service
   */
  async searchLocation(query: string): Promise<Location[]> {
    // Simplified location search - in production you'd use a real geocoding API
    const knownLocations: Array<{ name: string; lat: number; lng: number; aliases: string[] }> = [
      { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321, aliases: ['seattle', 'sea'] },
      { name: 'New York, NY', lat: 40.7128, lng: -74.0060, aliases: ['nyc', 'new york', 'manhattan'] },
      { name: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437, aliases: ['la', 'los angeles'] },
      { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298, aliases: ['chicago', 'chi'] },
      { name: 'London, UK', lat: 51.5074, lng: -0.1278, aliases: ['london'] },
      { name: 'Paris, France', lat: 48.8566, lng: 2.3522, aliases: ['paris'] },
      { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, aliases: ['tokyo'] },
      { name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093, aliases: ['sydney'] },
      { name: 'Sammamish, WA', lat: 47.6163, lng: -122.0356, aliases: ['sammamish'] },
      { name: 'Bellevue, WA', lat: 47.6101, lng: -122.2015, aliases: ['bellevue'] }
    ]

    const searchTerm = query.toLowerCase().trim()
    const matches = knownLocations.filter(loc => 
      loc.name.toLowerCase().includes(searchTerm) ||
      loc.aliases.some(alias => alias.includes(searchTerm))
    )

    return matches.map(match => ({
      latitude: match.lat,
      longitude: match.lng,
      name: match.name,
      source: 'search' as const
    }))
  }

  /**
   * Get recently used locations
   */
  getRecentLocations(): Location[] {
    try {
      const stored = localStorage.getItem('recentLocations')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.warn('Failed to load recent locations:', error)
    }
    return []
  }

  /**
   * Add location to recent locations list
   */
  private addToRecentLocations(location: Location): void {
    try {
      const recent = this.getRecentLocations()
      
      // Remove if already exists
      const filtered = recent.filter(loc => 
        !(Math.abs(loc.latitude - location.latitude) < 0.001 && 
          Math.abs(loc.longitude - location.longitude) < 0.001)
      )
      
      // Add to front
      filtered.unshift(location)
      
      // Keep only 5 most recent
      const limited = filtered.slice(0, 5)
      
      localStorage.setItem('recentLocations', JSON.stringify(limited))
    } catch (error) {
      console.warn('Failed to save recent location:', error)
    }
  }

  /**
   * Save current location to localStorage
   */
  private saveLocationToStorage(location: Location): void {
    try {
      localStorage.setItem('currentLocation', JSON.stringify(location))
      this.addToRecentLocations(location)
    } catch (error) {
      console.warn('Failed to save location to storage:', error)
    }
  }

  /**
   * Get stored location from localStorage
   */
  private getStoredLocation(): Location | null {
    try {
      const stored = localStorage.getItem('currentLocation')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.warn('Failed to load stored location:', error)
    }
    return null
  }

  /**
   * Watch for location changes (continuous tracking)
   * Note: Use sparingly as this drains battery
   */
  startWatchingLocation(callback: (location: Location | null, error?: GeolocationError) => void): void {
    if (!navigator.geolocation || this.watchId !== null) {
      return
    }

    const options: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 600000 // Accept 10-minute old position for watching
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location: Location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'geolocation',
          name: 'Current Location'
        }
        this.currentLocation = location
        this.saveLocationToStorage(location)
        callback(location)
      },
      (error) => {
        const geolocationError: GeolocationError = {
          code: error.code,
          message: this.getGeolocationErrorMessage(error.code),
          fallbackRequired: true
        }
        callback(null, geolocationError)
      },
      options
    )
  }

  /**
   * Stop watching location changes
   */
  stopWatchingLocation(): void {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }

  /**
   * Clear all stored location data
   */
  clearLocationData(): void {
    try {
      localStorage.removeItem('currentLocation')
      localStorage.removeItem('recentLocations')
      this.currentLocation = null
    } catch (error) {
      console.warn('Failed to clear location data:', error)
    }
  }

  /**
   * Get human-readable error message for geolocation errors
   */
  private getGeolocationErrorMessage(code: number): string {
    switch (code) {
      case 1: // PERMISSION_DENIED
        return 'Location access denied by user'
      case 2: // POSITION_UNAVAILABLE
        return 'Location information is unavailable'
      case 3: // TIMEOUT
        return 'Location request timed out'
      default:
        return 'An unknown error occurred while retrieving location'
    }
  }

  /**
   * Check if location permissions are granted
   */
  async checkLocationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (!navigator.permissions) {
      return 'unsupported'
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' })
      return permission.state
    } catch (error) {
      return 'unsupported'
    }
  }

  /**
   * Get default location (fallback when no location available)
   */
  getDefaultLocation(): Location {
    // Default to Seattle (where the app idea originated)
    return {
      latitude: 47.6062,
      longitude: -122.3321,
      name: 'Seattle, WA (Default)',
      source: 'manual'
    }
  }

  /**
   * Validate location coordinates
   */
  isValidLocation(latitude: number, longitude: number): boolean {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  }

  /**
   * Calculate distance between two locations (rough estimate in km)
   */
  calculateDistance(loc1: Location, loc2: Location): number {
    const R = 6371 // Earth's radius in kilometers
    const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180
    const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }
}