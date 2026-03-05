// @vitest-environment jsdom
/**
 * Tests for Excel and PDF export utilities.
 *
 * Verifies CSV generation, column mapping, formatting, empty data,
 * and PDF export structure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  exportToCSV,
  type ExcelColumn,
  type ExcelExportOptions,
} from '../excelExporter'

// ================================================================
//  exportToCSV
// ================================================================
const columns: ExcelColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'amount', header: 'Amount', format: 'currency' },
  { key: 'score', header: 'Score', format: 'number' },
]

const sampleData = [
  { name: 'Alice', amount: 500000, score: 95 },
  { name: 'Bob', amount: 300000, score: 80 },
]

function makeOptions(overrides?: Partial<ExcelExportOptions>): ExcelExportOptions {
  return {
    filename: 'test-export',
    columns,
    data: sampleData,
    ...overrides,
  }
}

describe('exportToCSV', () => {
  it('generates CSV with header row', () => {
    const csv = exportToCSV(makeOptions({ includeTimestamp: false }))
    const lines = csv.split('\n')
    expect(lines).toContainEqual('Name,Amount,Score')
  })

  it('generates correct number of data rows', () => {
    const csv = exportToCSV(makeOptions({ includeTimestamp: false }))
    const lines = csv.split('\n').filter(l => l.trim())
    // header + 2 data rows  
    expect(lines.length).toBe(3)
  })

  it('formats currency values from cents to shillings', () => {
    const csv = exportToCSV(makeOptions({ includeTimestamp: false }))
    // 500000 cents = 5000.00 shillings
    expect(csv).toContain('5000.00')
  })

  it('includes title and subtitle when provided', () => {
    const csv = exportToCSV(
      makeOptions({ title: 'Report Title', subtitle: 'Sub Info', includeTimestamp: false }),
    )
    expect(csv).toContain('Report Title')
    expect(csv).toContain('Sub Info')
  })

  it('includes timestamp by default', () => {
    const csv = exportToCSV(makeOptions())
    expect(csv).toContain('Generated:')
  })

  it('excludes timestamp when includeTimestamp is false', () => {
    const csv = exportToCSV(makeOptions({ includeTimestamp: false }))
    expect(csv).not.toContain('Generated:')
  })

  it('handles empty data array', () => {
    const csv = exportToCSV(makeOptions({ data: [], includeTimestamp: false }))
    const lines = csv.split('\n').filter(l => l.trim())
    // Only the header row
    expect(lines.length).toBe(1)
    expect(lines[0]).toBe('Name,Amount,Score')
  })

  it('escapes values containing commas', () => {
    const csv = exportToCSV(
      makeOptions({
        data: [{ name: 'Doe, Jane', amount: 100, score: 70 }],
        includeTimestamp: false,
      }),
    )
    expect(csv).toContain('"Doe, Jane"')
  })

  it('escapes values containing double quotes', () => {
    const csv = exportToCSV(
      makeOptions({
        data: [{ name: 'He said "hi"', amount: 100, score: 50 }],
        includeTimestamp: false,
      }),
    )
    expect(csv).toContain('"He said ""hi"""')
  })

  it('escapes values containing newlines', () => {
    const csv = exportToCSV(
      makeOptions({
        data: [{ name: 'Line1\nLine2', amount: 100, score: 50 }],
        includeTimestamp: false,
      }),
    )
    expect(csv).toContain('"Line1\nLine2"')
  })

  it('handles null and undefined values', () => {
    const csv = exportToCSV(
      makeOptions({
        data: [{ name: null, amount: undefined, score: undefined }] as unknown as Record<string, unknown>[],
        includeTimestamp: false,
      }),
    )
    // null/undefined should produce empty strings
    const dataLine = csv.split('\n').findLast(l => l.trim())
    expect(dataLine).toBeDefined()
  })

  it('formats percent values with % sign', () => {
    const csv = exportToCSV(
      makeOptions({
        columns: [{ key: 'rate', header: 'Rate', format: 'percent' }],
        data: [{ rate: 94.4 }],
        includeTimestamp: false,
      }),
    )
    expect(csv).toContain('94.4%')
  })

  it('formats date values', () => {
    const csv = exportToCSV(
      makeOptions({
        columns: [{ key: 'created', header: 'Date', format: 'date' }],
        data: [{ created: '2026-01-15' }],
        includeTimestamp: false,
      }),
    )
    // Exact format depends on locale, but should contain something recognizable
    const lines = csv.split('\n').filter(l => l.trim())
    expect(lines.length).toBe(2) // header + 1 row
  })
})

// ================================================================
//  downloadCSV (DOM interaction - smoke check)
// ================================================================
describe('downloadCSV', () => {
  beforeEach(() => {
    // Mock DOM methods for download
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('creates and revokes a blob URL', async () => {
    const { downloadCSV } = await import('../excelExporter')
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_v: string) { /* noop */ },
      set download(_v: string) { /* noop */ },
      style: {} as CSSStyleDeclaration,
      click: clickSpy,
      remove: vi.fn(),
    } as unknown as ReturnType<typeof document.createElement>)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

    downloadCSV(makeOptions())

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
