// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const stableShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stableShowToast }),
}))

const stableSetSchoolSettings = vi.fn()
const stableAppState = {
  currentTerm: { id: 1, term_name: 'Term 1' },
  currentAcademicYear: { id: 1, year_name: '2025' },
  schoolSettings: {},
  setSchoolSettings: stableSetSchoolSettings,
}
const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin' } }
vi.mock('../../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAppState),
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

// ---------------------------------------------------------------------------
// Mock electronAPI – covers Settings + useSettingsPage + sub-tabs
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      settings: {
        getSettings: vi.fn().mockResolvedValue({ school_name: 'Test School' }),
        updateSettings: mockFn(),
        getLogoDataUrl: vi.fn().mockResolvedValue(null),
        uploadLogo: mockFn(),
        removeLogo: mockFn(),
        normalizeCurrencyScale: mockFn(),
        seedExams: mockFn(),
        resetAndSeed: mockFn(),
        getAllConfigs: vi.fn().mockResolvedValue({}),
        saveSecureConfig: mockFn(),
      },
      academic: {
        getAcademicYears: mockFn(),
        createAcademicYear: mockFn(),
        activateAcademicYear: mockFn(),
      },
      communications: {
        getNotificationTemplates: mockFn(),
        createNotificationTemplate: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: Settings } = await import('../index')
// SchoolInfoTab, AcademicYearTab, MaintenanceTab are rendered within Settings
// but we also test them in context. MessageTemplates and Integrations are separate pages.
const { default: MessageTemplates } = await import('../MessageTemplates')
const { default: IntegrationsSettings } = await import('../Integrations')

// ===========================================================================
// Tests
// ===========================================================================

describe('Settings (index)', () => {
  it('renders without crashing', () => {
    render(<Settings />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<Settings />)
    expect(await screen.findByText('System Settings', {}, { timeout: 3000 })).toBeDefined()
  })

  it('shows the School Info tab content by default', async () => {
    render(<Settings />)
    expect(await screen.findByText('Identity & Localization', {}, { timeout: 3000 })).toBeDefined()
  })
})

describe('MessageTemplates', () => {
  it('renders without crashing', () => {
    render(<MessageTemplates />)
    expect(true).toBe(true)
  })

  it('displays key content', async () => {
    render(<MessageTemplates />)
    expect(await screen.findByText('Message Templates', {}, { timeout: 3000 })).toBeDefined()
  })
})

describe('IntegrationsSettings', () => {
  it('renders without crashing', () => {
    render(<IntegrationsSettings />)
    expect(true).toBe(true)
  })

  it('displays SMS Gateway section', async () => {
    render(<IntegrationsSettings />)
    expect(await screen.findByText('SMS Gateway', {}, { timeout: 3000 })).toBeDefined()
  })
})
