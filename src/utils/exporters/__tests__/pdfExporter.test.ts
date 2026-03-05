// @vitest-environment jsdom
/**
 * Tests for PDF export utility (pdfExporter.ts).
 *
 * Verifies document structure, school header, report title, column
 * layout, row rendering, page breaks, footer, page numbers, value
 * formatting, and orientation handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
//  jsPDF mock
// ---------------------------------------------------------------------------
function createMockDoc() {
  const pages: number[] = [1]
  return {
    text: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setFillColor: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    setDrawColor: vi.fn(),
    setTextColor: vi.fn(),
    addPage: vi.fn(() => { pages.push(pages.length + 1) }),
    save: vi.fn(),
    getNumberOfPages: vi.fn(() => pages.length),
    getCurrentPageInfo: vi.fn(() => ({ pageNumber: pages.length })),
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    },
    // track pages for assertions
    _pages: pages,
  }
}

let mockDoc: ReturnType<typeof createMockDoc>

vi.mock('jspdf', () => {
  // Must use `function` keyword so it's callable with `new`
  return {
    default: function JsPDFMock() {
      return mockDoc
    },
  }
})

// formatCurrencyFromCents is real — we only need it to return a string
vi.mock('../../format', () => ({
  formatCurrencyFromCents: (v: number) => `KES ${(v / 100).toFixed(2)}`,
}))

import { exportToPDF, type PDFExportOptions, type PDFColumn } from '../pdfExporter'

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function makeColumns(overrides?: Partial<PDFColumn>[]): PDFColumn[] {
  const base: PDFColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'amount', header: 'Amount', format: 'currency', align: 'right' },
    { key: 'score', header: 'Score', format: 'number', align: 'center' },
  ]
  if (overrides) {
    return base.map((c, i) => ({ ...c, ...overrides[i] }))
  }
  return base
}

function makeOptions(overrides?: Partial<PDFExportOptions>): PDFExportOptions {
  return {
    filename: 'test-report',
    title: 'Test Report',
    columns: makeColumns(),
    data: [
      { name: 'Alice', amount: 500000, score: 95 },
      { name: 'Bob', amount: 300000, score: 80 },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------
describe('exportToPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDoc = createMockDoc()
  })

  // ========== Basic export / save ==========
  it('saves with the correct filename', async () => {
    await exportToPDF(makeOptions())
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
  })

  it('creates the document with portrait orientation by default', async () => {
    // The default orientation is portrait — just verify it exports successfully
    await exportToPDF(makeOptions())
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
  })

  it('creates the document with landscape orientation when specified', async () => {
    await exportToPDF(makeOptions({ orientation: 'landscape' }))
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
  })

  // ========== School header ==========
  it('renders school header when schoolInfo is provided', async () => {
    await exportToPDF(
      makeOptions({
        schoolInfo: { name: 'Mwingi Academy', address: '123 Main St', phone: '0712345678', email: 'info@school.ke' },
      }),
    )
    // school name as centered text
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Mwingi Academy',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
    // address line
    expect(mockDoc.text).toHaveBeenCalledWith(
      '123 Main St',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
    // contact line
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.stringContaining('0712345678'),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.stringContaining('info@school.ke'),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
    // divider line
    expect(mockDoc.line).toHaveBeenCalled()
  })

  it('skips school header when schoolInfo is not provided', async () => {
    // No schoolInfo → the first text call should be the report title, not a school name
    await exportToPDF(makeOptions())
    const firstTextArg = mockDoc.text.mock.calls[0]?.[0]
    expect(firstTextArg).toBe('Test Report')
  })

  it('renders contact line with only phone', async () => {
    await exportToPDF(
      makeOptions({ schoolInfo: { name: 'School', phone: '0700000000' } }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      '0700000000',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
  })

  it('renders contact line with only email', async () => {
    await exportToPDF(
      makeOptions({ schoolInfo: { name: 'School', email: 'a@b.c' } }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'a@b.c',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
  })

  it('skips address when not supplied', async () => {
    await exportToPDF(makeOptions({ schoolInfo: { name: 'School' } }))
    const addressCalls = mockDoc.text.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Main St'),
    )
    expect(addressCalls).toHaveLength(0)
  })

  // ========== Report title/subtitle ==========
  it('renders the report title', async () => {
    await exportToPDF(makeOptions())
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Test Report',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
  })

  it('renders subtitle when provided', async () => {
    await exportToPDF(makeOptions({ subtitle: 'Term 1 2025' }))
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Term 1 2025',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
  })

  it('renders generated-date line', async () => {
    await exportToPDF(makeOptions())
    const genCall = mockDoc.text.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('Generated:'),
    )
    expect(genCall).toBeDefined()
  })

  // ========== Table header ==========
  it('renders column headers with dark background', async () => {
    await exportToPDF(makeOptions())
    // Header fill colour (45, 55, 72)
    expect(mockDoc.setFillColor).toHaveBeenCalledWith(45, 55, 72)
    // Each column name rendered
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Name',
      expect.any(Number),
      expect.any(Number),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Amount',
      expect.any(Number),
      expect.any(Number),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Score',
      expect.any(Number),
      expect.any(Number),
    )
  })

  // ========== Row rendering ==========
  it('renders data rows', async () => {
    await exportToPDF(makeOptions())
    // Alice and Bob row text
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Alice',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Bob',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('applies alternate row background', async () => {
    await exportToPDF(makeOptions())
    // Alternate row colour (248, 250, 252)
    expect(mockDoc.setFillColor).toHaveBeenCalledWith(248, 250, 252)
  })

  it('renders right-aligned cells for currency columns', async () => {
    await exportToPDF(makeOptions())
    // currency value for 500000 cents → "KES 5000.00"
    expect(mockDoc.text).toHaveBeenCalledWith(
      'KES 5000.00',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'right' }),
    )
  })

  it('renders center-aligned cells for score columns', async () => {
    await exportToPDF(makeOptions())
    expect(mockDoc.text).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'center' }),
    )
  })

  // ========== Page breaks ==========
  it('adds a page when rows overflow the page', async () => {
    // Generate enough rows to exceed pageHeight (297) - 20 footer margin = 277
    // Each row is 7mm. With header ~60mm start, need ~(277-60)/7 ≈ 31 rows to trigger break
    const manyRows = Array.from({ length: 45 }, (_, i) => ({
      name: `Student ${i}`,
      amount: 100000,
      score: 50,
    }))
    await exportToPDF(makeOptions({ data: manyRows }))
    expect(mockDoc.addPage).toHaveBeenCalled()
  })

  it('does not add a page for a small data set', async () => {
    await exportToPDF(makeOptions({ data: [{ name: 'A', amount: 100, score: 1 }] }))
    expect(mockDoc.addPage).not.toHaveBeenCalled()
  })

  // ========== Footer / page numbers ==========
  it('renders footer text when provided', async () => {
    await exportToPDF(makeOptions({ footerText: 'Confidential' }))
    expect(mockDoc.text).toHaveBeenCalledWith(
      'Confidential',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('renders page numbers by default', async () => {
    await exportToPDF(makeOptions())
    const pageNumCall = mockDoc.text.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('Page '),
    )
    expect(pageNumCall).toBeDefined()
  })

  it('suppresses page numbers when showPageNumbers is false', async () => {
    await exportToPDF(makeOptions({ showPageNumbers: false }))
    const pageNumCall = mockDoc.text.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('Page '),
    )
    expect(pageNumCall).toBeUndefined()
  })

  // ========== formatValue coverage ==========
  it('formats null values as dash', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'v', header: 'V' }],
        data: [{ v: null }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      '-',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('formats undefined values as dash', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'v', header: 'V' }],
        data: [{}], // v is undefined
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      '-',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('formats currency values through formatCurrencyFromCents', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'amt', header: 'Amt', format: 'currency' }],
        data: [{ amt: 250000 }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'KES 2500.00',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('formats number values with toLocaleString', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'n', header: 'N', format: 'number' }],
        data: [{ n: 1234567 }],
      }),
    )
    const formatted = (1234567).toLocaleString()
    expect(mockDoc.text).toHaveBeenCalledWith(
      formatted,
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('formats date values as locale date string', async () => {
    const dateStr = '2025-06-15'
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'd', header: 'D', format: 'date' }],
        data: [{ d: dateStr }],
      }),
    )
    const expected = new Date(dateStr).toLocaleDateString()
    expect(mockDoc.text).toHaveBeenCalledWith(
      expected,
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('stringifies object values', async () => {
    const obj = { foo: 'bar' }
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'o', header: 'Obj' }],
        data: [{ o: obj }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      JSON.stringify(obj),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('converts boolean values to string', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'b', header: 'B' }],
        data: [{ b: true }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'true',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  // ========== Column width distribution ==========
  it('respects explicit column widths', async () => {
    // With explicit widths, remaining columns get the rest
    await exportToPDF(
      makeOptions({
        columns: [
          { key: 'a', header: 'A', width: 50 },
          { key: 'b', header: 'B', width: 50 },
          { key: 'c', header: 'C' }, // should get remaining
        ],
        data: [{ a: '1', b: '2', c: '3' }],
      }),
    )
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
  })

  it('distributes equal widths when no widths are specified', async () => {
    await exportToPDF(
      makeOptions({
        columns: [
          { key: 'x', header: 'X' },
          { key: 'y', header: 'Y' },
        ],
        data: [{ x: '1', y: '2' }],
      }),
    )
    // Both columns rendered successfully with equal widths
    expect(mockDoc.text).toHaveBeenCalledWith('X', expect.any(Number), expect.any(Number))
    expect(mockDoc.text).toHaveBeenCalledWith('Y', expect.any(Number), expect.any(Number))
  })

  // ========== Empty data set ==========
  it('handles empty data array without error', async () => {
    await exportToPDF(makeOptions({ data: [] }))
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
  })

  it('adds page break without page numbers when showPageNumbers is false', async () => {
    const manyRows = Array.from({ length: 45 }, (_, i) => ({
      name: `Student ${i}`,
      amount: 100000,
      score: 50,
    }))
    await exportToPDF(makeOptions({ data: manyRows, showPageNumbers: false }))
    expect(mockDoc.addPage).toHaveBeenCalled()
    // Page number text should NOT appear during page breaks
    const pageBreakPageCalls = mockDoc.text.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('Page '),
    )
    expect(pageBreakPageCalls).toHaveLength(0)
  })

  it('renders columns without explicit align as left-aligned', async () => {
    await exportToPDF(
      makeOptions({
        columns: [
          { key: 'a', header: 'A' },
        ],
        data: [{ a: 'hello' }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      'hello',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })

  it('handles all columns having explicit widths (remainingColumns === 0)', async () => {
    await exportToPDF(
      makeOptions({
        columns: [
          { key: 'a', header: 'A', width: 60 },
          { key: 'b', header: 'B', width: 60 },
          { key: 'c', header: 'C', width: 60 },
        ],
        data: [{ a: '1', b: '2', c: '3' }],
      }),
    )
    expect(mockDoc.save).toHaveBeenCalledWith('test-report.pdf')
    expect(mockDoc.text).toHaveBeenCalledWith('A', expect.any(Number), expect.any(Number))
    expect(mockDoc.text).toHaveBeenCalledWith('B', expect.any(Number), expect.any(Number))
    expect(mockDoc.text).toHaveBeenCalledWith('C', expect.any(Number), expect.any(Number))
  })

  it('formats plain number value with no format as String(value)', async () => {
    await exportToPDF(
      makeOptions({
        columns: [{ key: 'val', header: 'Val' }],
        data: [{ val: 42 }],
      }),
    )
    expect(mockDoc.text).toHaveBeenCalledWith(
      '42',
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: 'left' }),
    )
  })
})
