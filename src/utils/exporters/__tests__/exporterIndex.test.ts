// @vitest-environment jsdom
/**
 * Barrel re-export smoke test for exporters/index.ts.
 * Ensures all public symbols are accessible from the barrel.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock jspdf so the dynamic import inside pdfExporter doesn't fail
vi.mock('jspdf', () => ({ default: vi.fn() }))

import { exportToCSV, downloadCSV, exportToPDF } from '../index'

describe('exporters barrel (index.ts)', () => {
  it('re-exports exportToCSV as a function', () => {
    expect(typeof exportToCSV).toBe('function')
  })

  it('re-exports downloadCSV as a function', () => {
    expect(typeof downloadCSV).toBe('function')
  })

  it('re-exports exportToPDF as a function', () => {
    expect(typeof exportToPDF).toBe('function')
  })
})
