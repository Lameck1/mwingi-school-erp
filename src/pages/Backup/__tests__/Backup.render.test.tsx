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

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------
beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      system: {
        getBackupList: vi.fn().mockResolvedValue([]),
        // eslint-disable-next-line sonarjs/publicly-writable-directories
        createBackup: vi.fn().mockResolvedValue({ success: true, path: '/tmp/backup.db' }),
        restoreBackup: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const { default: Backup } = await import('../index')

// ===========================================================================
// Tests
// ===========================================================================

describe('Backup (index)', () => {
  it('renders without crashing', () => {
    render(<Backup />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<Backup />)
    expect(await screen.findByText('Backup & Disaster Recovery', {}, { timeout: 3000 })).toBeDefined()
  })
})
