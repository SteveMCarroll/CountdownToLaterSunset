// Test setup file for Vitest
import { vi } from 'vitest'

// Mock browser APIs that might not be available in test environment
Object.defineProperty(window, 'navigator', {
  value: {
    geolocation: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn()
    },
    userAgent: 'vitest'
  },
  writable: true
})

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now())
  },
  writable: true
})

// Global test utilities
global.mockDate = (dateString: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(dateString))
}

global.restoreDate = () => {
  vi.useRealTimers()
}