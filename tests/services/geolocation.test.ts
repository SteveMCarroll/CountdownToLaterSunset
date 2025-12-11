import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { GeolocationService } from '@/services/geolocation'
import type { Location } from '@/types'

describe('Geolocation Service', () => {
  let geolocationService: GeolocationService
  let mockGeolocation: any

  beforeEach(() => {
    // Reset singleton instance
    ;(GeolocationService as any).instance = undefined
    geolocationService = GeolocationService.getInstance()

    // Mock geolocation API
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn()
    }
    
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true
    })

    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      },
      writable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.localStorage.clear()
  })

  describe('getInstance', () => {
    test('should return singleton instance', () => {
      const instance1 = GeolocationService.getInstance()
      const instance2 = GeolocationService.getInstance()
      
      expect(instance1).toBe(instance2)
    })
  })

  describe('detectLocation', () => {
    test('should successfully detect location', async () => {
      const mockPosition = {
        coords: {
          latitude: 47.6062,
          longitude: -122.3321
        }
      }

      mockGeolocation.getCurrentPosition.mockImplementation((success: any) => {
        success(mockPosition)
      })

      const result = await geolocationService.detectLocation()

      expect(result.location).toBeDefined()
      expect(result.location?.latitude).toBe(47.6062)
      expect(result.location?.longitude).toBe(-122.3321)
      expect(result.location?.source).toBe('geolocation')
      expect(result.error).toBeUndefined()
    })

    test('should handle permission denied error', async () => {
      const mockError = {
        code: 1, // PERMISSION_DENIED
        message: 'Permission denied'
      }

      mockGeolocation.getCurrentPosition.mockImplementation((_: any, error: any) => {
        error(mockError)
      })

      const result = await geolocationService.detectLocation()

      expect(result.location).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe(1)
      expect(result.error?.message).toBe('Location access denied by user')
      expect(result.error?.fallbackRequired).toBe(true)
    })

    test('should handle position unavailable error', async () => {
      const mockError = {
        code: 2, // POSITION_UNAVAILABLE
        message: 'Position unavailable'
      }

      mockGeolocation.getCurrentPosition.mockImplementation((_: any, error: any) => {
        error(mockError)
      })

      const result = await geolocationService.detectLocation()

      expect(result.location).toBeNull()
      expect(result.error?.code).toBe(2)
      expect(result.error?.message).toBe('Location information is unavailable')
    })

    test('should handle timeout error', async () => {
      const mockError = {
        code: 3, // TIMEOUT
        message: 'Timeout'
      }

      mockGeolocation.getCurrentPosition.mockImplementation((_: any, error: any) => {
        error(mockError)
      })

      const result = await geolocationService.detectLocation()

      expect(result.location).toBeNull()
      expect(result.error?.code).toBe(3)
      expect(result.error?.message).toBe('Location request timed out')
    })

    test('should handle unsupported browser', async () => {
      Object.defineProperty(global.navigator, 'geolocation', {
        value: undefined,
        writable: true
      })

      const result = await geolocationService.detectLocation()

      expect(result.location).toBeNull()
      expect(result.error?.message).toBe('Geolocation is not supported by this browser')
      expect(result.error?.fallbackRequired).toBe(true)
    })
  })

  describe('setManualLocation', () => {
    test('should set manual location with coordinates', () => {
      const location = geolocationService.setManualLocation(40.7128, -74.0060, 'New York, NY')

      expect(location.latitude).toBe(40.7128)
      expect(location.longitude).toBe(-74.0060)
      expect(location.name).toBe('New York, NY')
      expect(location.source).toBe('manual')
    })

    test('should set manual location without name', () => {
      const location = geolocationService.setManualLocation(47.6062, -122.3321)

      expect(location.latitude).toBe(47.6062)
      expect(location.longitude).toBe(-122.3321)
      expect(location.name).toBe('47.6062, -122.3321')
      expect(location.source).toBe('manual')
    })
  })

  describe('searchLocation', () => {
    test('should find exact match for known location', async () => {
      const results = await geolocationService.searchLocation('Seattle')

      expect(results.length).toBeGreaterThan(0)
      
      const seattle = results.find(loc => loc.name.includes('Seattle'))
      expect(seattle).toBeDefined()
      expect(seattle?.latitude).toBe(47.6062)
      expect(seattle?.longitude).toBe(-122.3321)
      expect(seattle?.source).toBe('search')
    })

    test('should find partial matches', async () => {
      const results = await geolocationService.searchLocation('sea')

      expect(results.length).toBeGreaterThan(0)
      
      const seattle = results.find(loc => loc.name.includes('Seattle'))
      expect(seattle).toBeDefined()
    })

    test('should handle case insensitive search', async () => {
      const results = await geolocationService.searchLocation('SEATTLE')

      expect(results.length).toBeGreaterThan(0)
      
      const seattle = results.find(loc => loc.name.includes('Seattle'))
      expect(seattle).toBeDefined()
    })

    test('should return empty array for unknown location', async () => {
      const results = await geolocationService.searchLocation('Unknown City 12345')

      expect(results).toEqual([])
    })

    test('should find location by alias', async () => {
      const results = await geolocationService.searchLocation('nyc')

      expect(results.length).toBeGreaterThan(0)
      
      const newYork = results.find(loc => loc.name.includes('New York'))
      expect(newYork).toBeDefined()
    })
  })

  describe('localStorage integration', () => {
    test('should save and load current location', () => {
      const testLocation: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        name: 'Seattle, WA',
        source: 'manual'
      }

      // Mock localStorage.getItem to return our test location
      global.localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(testLocation))

      geolocationService.setManualLocation(testLocation.latitude, testLocation.longitude, testLocation.name)

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'currentLocation',
        JSON.stringify(expect.objectContaining({
          latitude: testLocation.latitude,
          longitude: testLocation.longitude,
          name: testLocation.name,
          source: 'manual'
        }))
      )
    })

    test('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      global.localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage not available')
      })

      // Should not throw an error
      expect(() => {
        geolocationService.setManualLocation(47.6062, -122.3321, 'Seattle, WA')
      }).not.toThrow()
    })

    test('should manage recent locations list', () => {
      const recentLocations = [
        { latitude: 47.6062, longitude: -122.3321, name: 'Seattle, WA', source: 'manual' },
        { latitude: 40.7128, longitude: -74.0060, name: 'New York, NY', source: 'manual' }
      ]

      global.localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(recentLocations))

      const recent = geolocationService.getRecentLocations()

      expect(recent).toHaveLength(2)
      expect(recent[0].name).toBe('Seattle, WA')
      expect(recent[1].name).toBe('New York, NY')
    })
  })

  describe('validation and utilities', () => {
    test('should validate correct coordinates', () => {
      expect(geolocationService.isValidLocation(47.6062, -122.3321)).toBe(true)
      expect(geolocationService.isValidLocation(0, 0)).toBe(true)
      expect(geolocationService.isValidLocation(-90, -180)).toBe(true)
      expect(geolocationService.isValidLocation(90, 180)).toBe(true)
    })

    test('should reject invalid coordinates', () => {
      expect(geolocationService.isValidLocation(91, 0)).toBe(false)
      expect(geolocationService.isValidLocation(-91, 0)).toBe(false)
      expect(geolocationService.isValidLocation(0, 181)).toBe(false)
      expect(geolocationService.isValidLocation(0, -181)).toBe(false)
    })

    test('should calculate distance between locations', () => {
      const seattle: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }
      
      const newYork: Location = {
        latitude: 40.7128,
        longitude: -74.0060,
        source: 'manual'
      }

      const distance = geolocationService.calculateDistance(seattle, newYork)

      // Distance between Seattle and NYC is approximately 3,876 km
      expect(distance).toBeGreaterThan(3800)
      expect(distance).toBeLessThan(4000)
    })

    test('should calculate zero distance for same location', () => {
      const location: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        source: 'manual'
      }

      const distance = geolocationService.calculateDistance(location, location)
      expect(distance).toBe(0)
    })

    test('should provide default location', () => {
      const defaultLocation = geolocationService.getDefaultLocation()

      expect(defaultLocation.latitude).toBe(47.6062) // Seattle
      expect(defaultLocation.longitude).toBe(-122.3321)
      expect(defaultLocation.name).toContain('Seattle')
      expect(defaultLocation.source).toBe('manual')
    })
  })

  describe('getCurrentLocation', () => {
    test('should return cached location if available', async () => {
      // Set up a location first
      geolocationService.setManualLocation(47.6062, -122.3321, 'Seattle, WA')

      const result = await geolocationService.getCurrentLocation()

      expect(result.location).toBeDefined()
      expect(result.location?.name).toBe('Seattle, WA')
      expect(result.error).toBeUndefined()
    })

    test('should attempt auto-detection when no cached location', async () => {
      const mockPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060
        }
      }

      mockGeolocation.getCurrentPosition.mockImplementation((success: any) => {
        success(mockPosition)
      })

      const result = await geolocationService.getCurrentLocation()

      expect(result.location).toBeDefined()
      expect(result.location?.latitude).toBe(40.7128)
      expect(result.location?.longitude).toBe(-74.0060)
      expect(result.location?.source).toBe('geolocation')
    })

    test('should fallback to stored location if auto-detection fails', async () => {
      const storedLocation: Location = {
        latitude: 47.6062,
        longitude: -122.3321,
        name: 'Stored Seattle',
        source: 'manual'
      }

      // Mock auto-detection failure
      mockGeolocation.getCurrentPosition.mockImplementation((_: any, error: any) => {
        error({ code: 1, message: 'Permission denied' })
      })

      // Mock stored location
      global.localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(storedLocation))

      const result = await geolocationService.getCurrentLocation()

      expect(result.location).toBeDefined()
      expect(result.location?.name).toBe('Stored Seattle')
    })
  })

  describe('location watching', () => {
    test('should start watching location', () => {
      const callback = vi.fn()
      
      geolocationService.startWatchingLocation(callback)

      expect(mockGeolocation.watchPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 600000
        })
      )
    })

    test('should stop watching location', () => {
      mockGeolocation.watchPosition.mockReturnValue(123)
      
      const callback = vi.fn()
      geolocationService.startWatchingLocation(callback)
      geolocationService.stopWatchingLocation()

      expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(123)
    })

    test('should not start multiple watches', () => {
      const callback = vi.fn()
      
      geolocationService.startWatchingLocation(callback)
      geolocationService.startWatchingLocation(callback)

      expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1)
    })
  })

  describe('clearLocationData', () => {
    test('should clear all stored location data', () => {
      geolocationService.clearLocationData()

      expect(global.localStorage.removeItem).toHaveBeenCalledWith('currentLocation')
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('recentLocations')
    })
  })
})