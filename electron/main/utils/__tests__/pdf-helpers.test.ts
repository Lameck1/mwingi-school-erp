import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
//  Mocks (hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getImageAsBase64DataUrl: vi.fn(),
}))

vi.mock('../../database', () => ({
  getDatabase: mocks.getDatabase,
}))

vi.mock('../image-utils', () => ({
  getImageAsBase64DataUrl: mocks.getImageAsBase64DataUrl,
}))

import { getSchoolInfo, buildPdfHeader, type SchoolInfo } from '../pdf-helpers'

function mockDb(row: Record<string, unknown> | undefined) {
  mocks.getDatabase.mockReturnValue({
    prepare: vi.fn(() => ({ get: vi.fn(() => row) })),
  })
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------
describe('utils/pdf-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==================== getSchoolInfo ====================
  describe('getSchoolInfo', () => {
    it('returns school info with all fields populated', async () => {
      mockDb({ school_name: 'Mwingi Academy', school_motto: 'Excellence', logo_path: '/img/logo.png' })
      mocks.getImageAsBase64DataUrl.mockResolvedValue('data:image/png;base64,abc')

      const info = await getSchoolInfo()

      expect(info).toEqual({
        name: 'Mwingi Academy',
        motto: 'Excellence',
        logoDataUrl: 'data:image/png;base64,abc',
      })
      expect(mocks.getImageAsBase64DataUrl).toHaveBeenCalledWith('/img/logo.png')
    })

    it('returns defaults when row is undefined', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      mockDb(undefined)

      const info = await getSchoolInfo()

      expect(info).toEqual({ name: 'School', motto: '', logoDataUrl: null })
      expect(mocks.getImageAsBase64DataUrl).not.toHaveBeenCalled()
    })

    it('returns defaults when row has empty strings', async () => {
      mockDb({ school_name: '', school_motto: '', logo_path: '' })

      const info = await getSchoolInfo()

      expect(info).toEqual({ name: 'School', motto: '', logoDataUrl: null })
      expect(mocks.getImageAsBase64DataUrl).not.toHaveBeenCalled()
    })

    it('returns null logoDataUrl when row has no logo_path', async () => {
      mockDb({ school_name: 'Test School', school_motto: 'Motto' })

      const info = await getSchoolInfo()

      expect(info.logoDataUrl).toBeNull()
      expect(mocks.getImageAsBase64DataUrl).not.toHaveBeenCalled()
    })

    it('returns null logoDataUrl when logo_path is falsy', async () => {
      mockDb({ school_name: 'Test', school_motto: 'M', logo_path: null })

      const info = await getSchoolInfo()

      expect(info.logoDataUrl).toBeNull()
    })
  })

  // ==================== buildPdfHeader ====================
  describe('buildPdfHeader', () => {
    const fullInfo: SchoolInfo = {
      name: 'Mwingi Academy',
      motto: 'Excellence in Education',
      logoDataUrl: 'data:image/png;base64,abc123',
    }

    it('builds header with all fields (logo, motto, title)', () => {
      const { html, style } = buildPdfHeader(fullInfo, 'Fee Report')

      expect(html).toContain('<img src="data:image/png;base64,abc123"')
      expect(html).toContain('Mwingi Academy')
      expect(html).toContain('Excellence in Education')
      expect(html).toContain('Fee Report')
      expect(style).toContain('.header')
      expect(style).toContain('.school-logo')
      expect(style).toContain('.school-name')
      expect(style).toContain('.school-motto')
      expect(style).toContain('.report-title')
    })

    it('omits logo HTML when logoDataUrl is null', () => {
      const info: SchoolInfo = { name: 'School', motto: 'Motto', logoDataUrl: null }
      const { html } = buildPdfHeader(info)

      expect(html).not.toContain('<img')
      expect(html).toContain('School')
    })

    it('omits motto HTML when motto is empty', () => {
      const info: SchoolInfo = { name: 'School', motto: '', logoDataUrl: null }
      const { html } = buildPdfHeader(info)

      expect(html).not.toContain('school-motto')
    })

    it('omits report title HTML when reportTitle is undefined', () => {
      const { html } = buildPdfHeader(fullInfo)

      expect(html).not.toContain('report-title')
    })

    it('includes report title HTML when reportTitle is provided', () => {
      const { html } = buildPdfHeader(fullInfo, 'Annual Summary')

      expect(html).toContain('report-title')
      expect(html).toContain('Annual Summary')
    })

    it('returns style string with all CSS classes', () => {
      const { style } = buildPdfHeader(fullInfo, 'Test')

      expect(style).toContain('.header')
      expect(style).toContain('.school-logo')
      expect(style).toContain('.school-name')
      expect(style).toContain('.school-motto')
      expect(style).toContain('.report-title')
    })
  })
})
