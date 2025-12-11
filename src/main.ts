import { GeolocationService } from '@/services/geolocation'
import { getNextMilestone, getUpcomingMilestones, calculateCountdown } from '@/services/milestone-calculator'
import { calculateSunsetInfo } from '@/services/sunset-calculator'
import type { Location, CountdownInfo } from '@/types'

/**
 * Main application class that coordinates all the services and UI updates
 */
class SunsetCountdownApp {
  private geolocationService: GeolocationService
  private currentLocation: Location | null = null
  private updateInterval: number | null = null

  constructor() {
    this.geolocationService = GeolocationService.getInstance()
    this.init()
  }

  /**
   * Initialize the application
   */
  private async init() {
    console.log('🌅 Initializing Sunset Countdown App...')
    
    // Set up DOM elements and event listeners
    this.setupEventListeners()
    
    // Try to get initial location
    await this.loadInitialLocation()
    
    // Start the update loop
    this.startUpdateLoop()
    
    console.log('✅ App initialized successfully')
  }

  /**
   * Set up all event listeners for the UI
   */
  private setupEventListeners() {
    // Location button click
    const locationBtn = document.getElementById('change-location-btn')
    if (locationBtn) {
      locationBtn.addEventListener('click', () => this.showLocationPicker())
    }

    // Location picker form submission
    const locationForm = document.getElementById('location-form')
    if (locationForm) {
      locationForm.addEventListener('submit', (e) => this.handleLocationSubmit(e))
    }

    // Auto-detect location button
    const autoDetectBtn = document.getElementById('auto-detect-btn')
    if (autoDetectBtn) {
      autoDetectBtn.addEventListener('click', () => this.autoDetectLocation())
    }

    // Location search input
    const locationSearch = document.getElementById('location-search') as HTMLInputElement
    if (locationSearch) {
      locationSearch.addEventListener('input', (e) => this.handleLocationSearch(e))
    }

    // Close location picker
    const closePickerBtn = document.getElementById('close-picker-btn')
    if (closePickerBtn) {
      closePickerBtn.addEventListener('click', () => this.hideLocationPicker())
    }
  }

  /**
   * Load initial location (try auto-detect, fallback to stored/default)
   */
  private async loadInitialLocation() {
    this.showLoading('Getting your location...')
    
    try {
      const locationResult = await this.geolocationService.getCurrentLocation()
      
      if (locationResult.location) {
        this.currentLocation = locationResult.location
        console.log('📍 Location loaded:', this.currentLocation.name)
      } else {
        // Fallback to default location
        this.currentLocation = this.geolocationService.getDefaultLocation()
        console.log('📍 Using default location:', this.currentLocation.name)
        
        if (locationResult.error) {
          this.showLocationError(locationResult.error.message)
        }
      }
      
      await this.updateDisplay()
      
    } catch (error) {
      console.error('Error loading location:', error)
      this.currentLocation = this.geolocationService.getDefaultLocation()
      this.showError('Failed to get location. Using default location.')
      await this.updateDisplay()
    } finally {
      this.hideLoading()
    }
  }

  /**
   * Update only the countdown display (for real-time updates)
   */
  private updateCountdownOnly() {
    if (!this.currentLocation) return

    try {
      const countdown = calculateCountdown(this.currentLocation, new Date())
      if (countdown) {
        this.updateCountdownDisplay(countdown)
      }
    } catch (error) {
      console.error('Error updating countdown:', error)
    }
  }

  /**
   * Update the entire display with current data
   */
  private async updateDisplay() {
    if (!this.currentLocation) return

    try {
      // Update location display
      this.updateLocationDisplay(this.currentLocation)
      
      // Calculate and display countdown
      const countdown = calculateCountdown(this.currentLocation)
      if (countdown) {
        this.updateCountdownDisplay(countdown)
        
        // Get and display upcoming milestones
        const upcomingMilestones = getUpcomingMilestones(this.currentLocation)
        this.updateMilestonesList(upcomingMilestones)
      } else {
        this.showError('Unable to calculate sunset milestones for this location')
      }
      
      // Update current sunset info
      const sunsetInfo = calculateSunsetInfo(this.currentLocation)
      if (sunsetInfo.success && sunsetInfo.sunsetInfo) {
        this.updateCurrentSunsetInfo(sunsetInfo.sunsetInfo)
      }
      
    } catch (error) {
      console.error('Error updating display:', error)
      this.showError('Failed to update sunset information')
    }
  }

  /**
   * Update location display in header
   */
  private updateLocationDisplay(location: Location) {
    const locationDisplay = document.getElementById('current-location')
    if (locationDisplay) {
      locationDisplay.textContent = location.name || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    }

    const locationSource = document.getElementById('location-source')
    if (locationSource) {
      const sourceText = location.source === 'geolocation' ? 'Automatically detected' : 
                        location.source === 'search' ? 'From search' : 'Manual entry'
      locationSource.textContent = sourceText
    }
  }

  /**
   * Update primary countdown display
   */
  private updateCountdownDisplay(countdown: CountdownInfo) {
    const milestoneElement = document.getElementById('next-milestone')
    if (milestoneElement) {
      milestoneElement.textContent = countdown.milestone.label
    }

    const daysElement = document.getElementById('days-count')
    const hoursElement = document.getElementById('hours-count')
    const minutesElement = document.getElementById('minutes-count')
    const secondsElement = document.getElementById('seconds-count')

    if (daysElement) daysElement.textContent = countdown.timeRemaining.days.toString()
    if (hoursElement) hoursElement.textContent = countdown.timeRemaining.hours.toString().padStart(2, '0')
    if (minutesElement) minutesElement.textContent = countdown.timeRemaining.minutes.toString().padStart(2, '0')
    if (secondsElement) secondsElement.textContent = countdown.timeRemaining.seconds.toString().padStart(2, '0')

    // Update countdown message with target date
    const messageElement = document.getElementById('countdown-message')
    if (messageElement) {
      const targetDateStr = countdown.targetDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      
      if (countdown.timeRemaining.days === 0) {
        messageElement.textContent = `Sunset reaches ${countdown.milestone.label} today!`
      } else if (countdown.timeRemaining.days === 1) {
        messageElement.textContent = `Only 1 more day until sunset is ${countdown.milestone.label} on ${targetDateStr}`
      } else {
        messageElement.textContent = `Only ${countdown.timeRemaining.days} more days until sunset is ${countdown.milestone.label} on ${targetDateStr}`
      }
    }
  }

  /**
   * Update upcoming milestones list
   */
  private updateMilestonesList(milestones: any[]) {
    const milestonesContainer = document.getElementById('milestones-list')
    if (!milestonesContainer) return

    milestonesContainer.innerHTML = ''

    milestones.forEach(milestone => {
      const dateStr = milestone.targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
      
      const daysText = milestone.daysUntil === 0 ? 'Today' :
                       milestone.daysUntil === 1 ? 'Tomorrow' :
                       `${milestone.daysUntil} days`
      
      const milestoneElement = document.createElement('div')
      milestoneElement.className = 'milestone-item'
      milestoneElement.innerHTML = `
        <span class="milestone-time">${milestone.label}</span>
        <span class="milestone-note">${daysText} • ${dateStr}</span>
      `
      milestonesContainer.appendChild(milestoneElement)
    })
  }

  /**
   * Update current sunset information
   */
  private updateCurrentSunsetInfo(sunsetInfo: any) {
    const todaySunsetElement = document.getElementById('today-sunset')
    if (todaySunsetElement) {
      const sunsetTime = sunsetInfo.sunset.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
      todaySunsetElement.textContent = `Today's sunset: ${sunsetTime}`
    }
  }

  /**
   * Show location picker modal
   */
  private showLocationPicker() {
    const modal = document.getElementById('location-modal')
    if (modal) {
      modal.style.display = 'block'
      
      // Populate recent locations
      this.updateRecentLocationsList()
      
      // Clear and focus search input
      const searchInput = document.getElementById('location-search') as HTMLInputElement
      if (searchInput) {
        searchInput.value = ''
        searchInput.focus()
      }
    }
  }

  /**
   * Hide location picker modal
   */
  private hideLocationPicker() {
    const modal = document.getElementById('location-modal')
    if (modal) {
      modal.style.display = 'none'
    }
  }

  /**
   * Handle location form submission
   */
  private async handleLocationSubmit(e: Event) {
    e.preventDefault()
    
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const lat = parseFloat(formData.get('latitude') as string)
    const lng = parseFloat(formData.get('longitude') as string)
    const name = formData.get('location-name') as string

    if (this.geolocationService.isValidLocation(lat, lng)) {
      this.currentLocation = this.geolocationService.setManualLocation(lat, lng, name)
      this.hideLocationPicker()
      await this.updateDisplay()
    } else {
      this.showError('Please enter valid coordinates (latitude: -90 to 90, longitude: -180 to 180)')
    }
  }

  /**
   * Handle location search input
   */
  private async handleLocationSearch(e: Event) {
    const input = e.target as HTMLInputElement
    const query = input.value.trim()
    
    if (query.length < 2) {
      this.clearSearchResults()
      return
    }

    const results = await this.geolocationService.searchLocation(query)
    this.displaySearchResults(results)
  }

  /**
   * Display search results in the location picker
   */
  private displaySearchResults(results: Location[]) {
    const resultsContainer = document.getElementById('search-results')
    if (!resultsContainer) return

    resultsContainer.innerHTML = ''

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="search-result no-results">No locations found</div>'
      return
    }

    results.forEach(location => {
      const resultElement = document.createElement('div')
      resultElement.className = 'search-result'
      resultElement.innerHTML = `
        <span class="location-name">${location.name}</span>
        <span class="location-coords">${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</span>
      `
      
      resultElement.addEventListener('click', async () => {
        this.currentLocation = this.geolocationService.setManualLocation(
          location.latitude, 
          location.longitude, 
          location.name
        )
        this.hideLocationPicker()
        await this.updateDisplay()
      })
      
      resultsContainer.appendChild(resultElement)
    })
  }

  /**
   * Clear search results
   */
  private clearSearchResults() {
    const resultsContainer = document.getElementById('search-results')
    if (resultsContainer) {
      resultsContainer.innerHTML = ''
    }
  }

  /**
   * Update recent locations list in location picker
   */
  private updateRecentLocationsList() {
    const recentContainer = document.getElementById('recent-locations')
    if (!recentContainer) return

    const recentLocations = this.geolocationService.getRecentLocations()
    
    recentContainer.innerHTML = ''
    
    if (recentLocations.length === 0) {
      recentContainer.innerHTML = '<div class="recent-location no-recent">No recent locations</div>'
      return
    }

    recentLocations.forEach(location => {
      const recentElement = document.createElement('div')
      recentElement.className = 'recent-location'
      recentElement.innerHTML = `
        <span class="location-name">${location.name}</span>
        <span class="location-coords">${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</span>
      `
      
      recentElement.addEventListener('click', async () => {
        this.currentLocation = this.geolocationService.setManualLocation(
          location.latitude,
          location.longitude,
          location.name
        )
        this.hideLocationPicker()
        await this.updateDisplay()
      })
      
      recentContainer.appendChild(recentElement)
    })
  }

  /**
   * Auto-detect current location
   */
  private async autoDetectLocation() {
    this.showLoading('Detecting your location...')
    
    try {
      const result = await this.geolocationService.detectLocation()
      
      if (result.location) {
        this.currentLocation = result.location
        this.hideLocationPicker()
        await this.updateDisplay()
      } else {
        this.showLocationError(result.error?.message || 'Unable to detect location')
      }
      
    } catch (error) {
      console.error('Auto-detection failed:', error)
      this.showLocationError('Location detection failed')
    } finally {
      this.hideLoading()
    }
  }

  /**
   * Start the update loop for real-time countdown
   */
  private startUpdateLoop() {
    // Update every second for real-time countdown
    this.updateInterval = window.setInterval(() => {
      if (this.currentLocation) {
        this.updateCountdownOnly()
      }
    }, 1000)
    
    // Also update full display every 5 minutes in case data changes
    window.setInterval(() => {
      if (this.currentLocation) {
        this.updateDisplay()
      }
    }, 300000) // 5 minutes
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  /**
   * Show loading state
   */
  private showLoading(message: string) {
    const loadingElement = document.getElementById('loading-message')
    if (loadingElement) {
      loadingElement.textContent = message
      loadingElement.style.display = 'block'
    }
  }

  /**
   * Hide loading state
   */
  private hideLoading() {
    const loadingElement = document.getElementById('loading-message')
    if (loadingElement) {
      loadingElement.style.display = 'none'
    }
  }

  /**
   * Show error message
   */
  private showError(message: string) {
    const errorElement = document.getElementById('error-message')
    if (errorElement) {
      errorElement.textContent = message
      errorElement.style.display = 'block'
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        errorElement.style.display = 'none'
      }, 5000)
    }
  }

  /**
   * Show location-specific error
   */
  private showLocationError(message: string) {
    const errorElement = document.getElementById('location-error')
    if (errorElement) {
      errorElement.textContent = message
      errorElement.style.display = 'block'
    }
  }

  /**
   * Cleanup when app is destroyed
   */
  destroy() {
    this.stopUpdateLoop()
    this.geolocationService.stopWatchingLocation()
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SunsetCountdownApp()
})