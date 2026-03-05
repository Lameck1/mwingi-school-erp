/**
 * Tests for reportCardGenerator.
 *
 * Verifies HTML generation, formatting, missing data handling, and edge cases.
 */
import { describe, it, expect } from 'vitest'
import { generateReportCardHTML } from '../reportCardGenerator'
import type { ReportCardData } from '../../types/electron-api/ReportsAPI'

function makeData(overrides?: Partial<ReportCardData>): ReportCardData {
  return {
    student: {
      id: 1,
      admission_number: 'ADM001',
      first_name: 'John',
      last_name: 'Doe',
      stream_name: 'Grade 5A',
      photo: null,
    },
    school: {
      name: 'Test School',
      motto: 'Learn and Grow',
      logo: null,
      address: 'P.O. Box 1',
      email: 'info@test.ac.ke',
      phone: '+254700000000',
    },
    academic_year: '2026',
    term: 'Term 1',
    grades: [
      {
        subject_name: 'Mathematics',
        subject_code: 'MAT',
        cat1: 80,
        cat2: 75,
        midterm: 78,
        final_exam: 85,
        average: 79.5,
        grade_letter: 'ME',
        remarks: 'Good',
      },
      {
        subject_name: 'English',
        subject_code: 'ENG',
        cat1: 60,
        cat2: 65,
        midterm: 62,
        final_exam: 70,
        average: 64.25,
        grade_letter: 'AE',
        remarks: 'Needs improvement',
      },
    ],
    attendance: {
      total_days: 90,
      present: 85,
      absent: 5,
      attendance_rate: 94.4,
    },
    summary: {
      total_marks: 144,
      average: 71.88,
      grade: 'ME',
      position: 3,
      class_size: 30,
      teacher_remarks: 'Consistent performance.',
      principal_remarks: 'Keep it up.',
    },
    rankings: {
      cat1: 5,
      cat2: 8,
      midterm: 6,
      final_exam: 3,
      average: 4,
    },
    ...overrides,
  }
}

describe('generateReportCardHTML', () => {
  it('returns a complete HTML document', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('includes student name', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('John')
    expect(html).toContain('Doe')
  })

  it('includes admission number', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('ADM001')
  })

  it('includes school name from data', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('Test School')
  })

  it('uses default school name when school data is missing', () => {
    const html = generateReportCardHTML(makeData({ school: undefined }))
    expect(html).toContain('MWINGI ADVENTIST SCHOOL')
  })

  it('includes academic year and term', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('Term 1')
    expect(html).toContain('2026')
  })

  it('includes subject grades', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('Mathematics')
    expect(html).toContain('English')
  })

  it('formats average to fixed integer', () => {
    const html = generateReportCardHTML(makeData())
    // 79.5 should render as "80" (toFixed(0))
    expect(html).toContain('>80<')
    // 64.25 should render as "64"
    expect(html).toContain('>64<')
  })

  it('includes summary stats', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('144') // total marks
    expect(html).toContain('71.88') // average
  })

  it('includes teacher remarks', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('Consistent performance.')
  })

  it('shows default teacher remarks when missing', () => {
    const html = generateReportCardHTML(
      makeData({ summary: { ...makeData().summary, teacher_remarks: '' } }),
    )
    expect(html).toContain('No remarks recorded.')
  })

  it('includes attendance rate', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('94.4%')
  })

  it('includes rankings in tfoot', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('5/30') // cat1 ranking
    expect(html).toContain('3/30') // final_exam ranking
  })

  it('handles null rankings gracefully', () => {
    const data = makeData({
      rankings: { cat1: null, cat2: null, midterm: null, final_exam: null, average: null },
    })
    const html = generateReportCardHTML(data)
    // Null rankings should show '-'
    expect(html).toContain('RANK')
  })

  it('handles empty grades array', () => {
    const data = makeData({ grades: [] })
    const html = generateReportCardHTML(data)
    expect(html).toContain('<!DOCTYPE html>')
    // No chart section should appear
    expect(html).not.toContain('Subject Performance Overview')
  })

  it('includes nextTermDate when provided', () => {
    const html = generateReportCardHTML(makeData(), '2026-09-01')
    expect(html).toContain('Opening Date')
  })

  it('omits opening date section when nextTermDate is not provided', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).not.toContain('Opening Date')
  })

  it('shows school motto when present', () => {
    const html = generateReportCardHTML(makeData())
    expect(html).toContain('Learn and Grow')
  })

  it('handles null cat scores with dash', () => {
    const data = makeData({
      grades: [
        {
          subject_name: 'Math',
          subject_code: 'MAT',
          cat1: null,
          cat2: null,
          midterm: null,
          final_exam: 80,
          average: 80,
          grade_letter: 'ME',
          remarks: '',
        },
      ],
    })
    const html = generateReportCardHTML(data)
    // null values should display as '-'
    const trMatch = /<tr[^>]*>[\s\S]*?Math[\s\S]*?<\/tr>/.exec(html)
    expect(trMatch).toBeTruthy()
    expect(trMatch![0]).toContain('>-<')
  })

  it('uses green color for grades starting with E (Excellent)', () => {
    const data = makeData({
      grades: [
        {
          subject_name: 'Science',
          subject_code: 'SCI',
          cat1: 95,
          cat2: 92,
          midterm: 93,
          final_exam: 96,
          average: 94,
          grade_letter: 'EE',
          remarks: 'Outstanding',
        },
      ],
    })
    const html = generateReportCardHTML(data)
    // getGradeColor('EE') → '#10b981' (green)
    expect(html).toContain('#10b981')
  })

  it('uses red color for grades starting with B (Below)', () => {
    const data = makeData({
      grades: [
        {
          subject_name: 'Art',
          subject_code: 'ART',
          cat1: 30,
          cat2: 25,
          midterm: 28,
          final_exam: 35,
          average: 29.5,
          grade_letter: 'BE',
          remarks: 'Needs support',
        },
      ],
    })
    const html = generateReportCardHTML(data)
    // getGradeColor('BE') → '#ef4444' (red, default)
    expect(html).toContain('#ef4444')
  })

  it('uses subject_name substring when subject_code is empty', () => {
    const data = makeData({
      grades: [
        {
          subject_name: 'History',
          subject_code: '',
          cat1: 70,
          cat2: 65,
          midterm: 72,
          final_exam: 68,
          average: 68.75,
          grade_letter: 'AE',
          remarks: 'Fair',
        },
      ],
    })
    const html = generateReportCardHTML(data)
    // Empty subject_code → first 3 chars of subject_name = 'His'
    expect(html).toContain('His')
  })

  it('includes school logo image when logo URL is provided', () => {
    const data = makeData({
      school: {
        name: 'Test School',
        motto: 'Learn',
        logo: 'https://example.com/logo.png',
        address: 'Addr',
        email: 'e@e.com',
        phone: '123',
      },
    })
    const html = generateReportCardHTML(data)
    expect(html).toContain('<img')
    expect(html).toContain('logo.png')
  })

  it('includes student photo image when photo URL is provided', () => {
    const data = makeData({
      student: {
        id: 1,
        admission_number: 'ADM001',
        first_name: 'John',
        last_name: 'Doe',
        stream_name: 'Grade 5A',
        photo: 'https://example.com/photo.jpg',
      },
    })
    const html = generateReportCardHTML(data)
    expect(html).toContain('<img')
    expect(html).toContain('photo.jpg')
  })

  it('shows dash for position when position is 0 (falsy)', () => {
    const data = makeData({
      summary: { ...makeData().summary, position: 0 },
    })
    const html = generateReportCardHTML(data)
    // position || '-' with position=0 → '-'
    expect(html).toContain('>-<')
  })

  it('shows default principal remarks when principal_remarks is empty', () => {
    const data = makeData({
      summary: { ...makeData().summary, principal_remarks: '' },
    })
    const html = generateReportCardHTML(data)
    expect(html).toContain('Diligent work is noted.')
  })
})
