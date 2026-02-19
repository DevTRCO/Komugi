import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Tauri APIs for tests
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // Mock unlisten function
  }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

// Mock typed Tauri bindings (tauri-specta generated)
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    greet: vi.fn().mockResolvedValue('Hello, test!'),
    loadPreferences: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: { theme: 'system' } }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    sendNativeNotification: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    loadEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
    checkScreenRecordingPermission: vi.fn().mockResolvedValue(true),
    checkAccessibilityPermission: vi.fn().mockResolvedValue(true),
    openScreenRecordingSettings: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    openAccessibilitySettings: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    historySaveSession: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    historySaveMessages: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    historyListSessions: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    historyLoadSession: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    historyDeleteSession: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    historyClearAll: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    historySearchSessions: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: [] }),
    historyCleanupOldSessions: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
  },
}))
