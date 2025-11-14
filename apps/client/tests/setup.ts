// =============================================================================
// VITEST & TESTING LIBRARY SETUP
// =============================================================================

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// =============================================================================
// GLOBAL MOCKS & CONFIGURATION
// =============================================================================

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
window.scrollTo = vi.fn();

// =============================================================================
// CONSOLE MOCKING
// =============================================================================

// Store original console methods
const originalConsole = {
  error: console.error,
  warn: console.warn,
  log: console.log,
};

// Mock console methods for cleaner test output
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Ignore React act warnings in tests
    if (
      typeof args[0] === 'string' &&
      args[0].includes(
        'Warning: An update to %s inside a test was not wrapped in act'
      )
    ) {
      return;
    }
    originalConsole.error(...args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
  };
});

// =============================================================================
// ENVIRONMENT VARIABLES FOR TESTING
// =============================================================================

// Mock environment variables for the client
vi.stubGlobal('import.meta.env', {
  VITE_API_BASE_URL: 'http://test-api.local',
  VITE_APP_ENV: 'test',
  VITE_ENABLE_DEVTOOLS: 'false',
  VITE_REQUEST_LOGGING: 'false',
  VITE_I18N_LOGGING: 'false',
  MODE: 'test',
  DEV: true,
  PROD: false,
});

// =============================================================================
// CLEANUP & TEARDOWN
// =============================================================================

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();

  // Clear storage
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  }
});

// Global teardown
afterAll(() => {
  // Restore original console methods
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.log = originalConsole.log;
});
