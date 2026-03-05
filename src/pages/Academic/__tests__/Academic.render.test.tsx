// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// Mock recharts (used by ExamAnalytics / ReportCardAnalytics)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
}))

// Mock ToastContext
const stableShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: stableShowToast }),
}))

// Mock stores
const stableAppState = {
  currentTerm: { id: 1, term_name: 'Term 1' },
  currentAcademicYear: { id: 1, year_name: '2025' },
  schoolSettings: {},
}
const stableAuthState = { user: { id: 1, role: 'ADMIN', username: 'admin' } }
vi.mock('../../../stores', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAppState),
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(stableAuthState),
}))

// Mock UI components that may cause issues
vi.mock('../../../components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../components/ui/ProgressBar', () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}))

vi.mock('../../../components/ui/Select', () => ({
  Select: (props: Record<string, unknown>) => <select data-testid="mock-select" {...props} />,
}))

vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>,
}))

// Mock utility modules that touch the filesystem / electron
vi.mock('../../../utils/exporters', () => ({
  exportToPDF: vi.fn(),
}))

vi.mock('../../../utils/print', () => ({
  printCurrentView: vi.fn(),
  printDocument: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock electronAPI – covers all IPC calls across Academic pages
// ---------------------------------------------------------------------------
const mockFn = () => vi.fn().mockResolvedValue([])

beforeEach(() => {
  Object.defineProperty(globalThis, 'electronAPI', {
    value: {
      academic: {
        getAcademicSubjects: mockFn(),
        getAcademicSubjectsAdmin: mockFn(),
        createAcademicSubject: mockFn(),
        updateAcademicSubject: mockFn(),
        setAcademicSubjectActive: mockFn(),
        getExams: mockFn(),
        getAcademicExams: mockFn(),
        createAcademicExam: mockFn(),
        deleteExam: mockFn(),
        generateExamTimetable: vi.fn().mockResolvedValue({ slots: [], clashes: [], stats: {} }),
        detectExamClashes: mockFn(),
        exportExamTimetableToPDF: mockFn(),
        getStreams: mockFn(),
        getTeacherAllocations: mockFn(),
        createTeacherAllocation: mockFn(),
        deleteTeacherAllocation: mockFn(),
        getResults: mockFn(),
        saveResults: mockFn(),
        getAllocationsForTeacher: mockFn(),
        generateMeritList: vi.fn().mockResolvedValue([]),
        getSubjectMeritList: mockFn(),
        getSubjectDifficulty: mockFn(),
        getPerformanceSummary: vi.fn().mockResolvedValue(null),
        getGradeDistribution: mockFn(),
        getSubjectPerformance: mockFn(),
        getStrugglingStudents: mockFn(),
        getTermComparison: mockFn(),
        getAwards: mockFn(),
        getAwardCategories: mockFn(),
        awardStudent: mockFn(),
        approveAward: mockFn(),
        rejectAward: mockFn(),
        deleteAward: mockFn(),
        downloadReportCards: mockFn(),
        generateBatchReportCards: mockFn(),
        emailReportCards: mockFn(),
        mergeReportCards: mockFn(),
        getCurrentAcademicYear: vi.fn().mockResolvedValue({ id: 1, year_name: '2025' }),
        getCurrentTerm: vi.fn().mockResolvedValue({ id: 1, term_name: 'Term 1' }),
        getTermsByYear: mockFn(),
        getMostImprovedStudents: mockFn(),
        generateCertificate: mockFn(),
        emailParents: mockFn(),
        getStudentsForAttendance: mockFn(),
        getAttendanceByDate: mockFn(),
        markAttendance: mockFn(),
      },
      students: {
        getStudents: mockFn(),
      },
      communications: {
        getNotificationTemplates: mockFn(),
      },
      staff: {
        getStaff: mockFn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ---------------------------------------------------------------------------
// Dynamic imports (ensures mocks are applied before component initialisation)
// ---------------------------------------------------------------------------

const { default: SubjectManagement } = await import('../SubjectManagement')
const { default: ExamScheduler } = await import('../ExamScheduler')
const { default: ExamManagement } = await import('../ExamManagement')
const { default: MarksEntry } = await import('../MarksEntry')
const { default: MeritLists } = await import('../MeritLists')
const { default: SubjectMeritLists } = await import('../SubjectMeritLists')
const { default: AwardsManagement } = await import('../AwardsManagement')
const { default: ExamAnalytics } = await import('../ExamAnalytics')
const { default: ReportCardGeneration } = await import('../ReportCardGeneration')
const { default: ReportCardAnalytics } = await import('../ReportCardAnalytics')
const { default: TeacherAllocation } = await import('../TeacherAllocation')
const { default: MostImproved } = await import('../MostImproved')

// ===========================================================================
// Tests
// ===========================================================================

describe('SubjectManagement', () => {
  it('renders without crashing', () => {
    render(<SubjectManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<SubjectManagement />)
    expect(await screen.findByRole('heading', { name: 'Subject Management' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('ExamScheduler', () => {
  it('renders without crashing', () => {
    render(<ExamScheduler />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ExamScheduler />)
    expect(await screen.findByRole('heading', { name: 'Exam Scheduler' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('ExamManagement', () => {
  it('renders without crashing', () => {
    render(<ExamManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ExamManagement />)
    expect(await screen.findByRole('heading', { name: 'Exam Management' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('MarksEntry', () => {
  it('renders without crashing', () => {
    render(<MarksEntry />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<MarksEntry />)
    expect(await screen.findByRole('heading', { name: 'Marks Entry' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('MeritLists', () => {
  it('renders without crashing', () => {
    render(<MeritLists />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<MeritLists />)
    expect(await screen.findByRole('heading', { name: 'Merit Lists' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('SubjectMeritLists', () => {
  it('renders without crashing', () => {
    render(<SubjectMeritLists />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<SubjectMeritLists />)
    expect(await screen.findByRole('heading', { name: 'Subject Merit Lists' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('AwardsManagement', () => {
  it('renders without crashing', () => {
    render(<AwardsManagement />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<AwardsManagement />)
    expect(await screen.findByRole('heading', { name: 'Awards Management' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('ExamAnalytics', () => {
  it('renders without crashing', () => {
    render(<ExamAnalytics />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ExamAnalytics />)
    expect(await screen.findByRole('heading', { name: 'Exam Analytics' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('ReportCardGeneration', () => {
  it('renders without crashing', () => {
    render(<ReportCardGeneration />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ReportCardGeneration />)
    expect(await screen.findByRole('heading', { name: 'Report Card Generation' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('ReportCardAnalytics', () => {
  it('renders without crashing', () => {
    render(<ReportCardAnalytics />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<ReportCardAnalytics />)
    expect(await screen.findByRole('heading', { name: 'Report Card Analytics' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('TeacherAllocation', () => {
  it('renders without crashing', () => {
    render(<TeacherAllocation />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<TeacherAllocation />)
    expect(await screen.findByRole('heading', { name: 'Teacher Allocations' }, { timeout: 3000 })).toBeDefined()
  })
})

describe('MostImproved', () => {
  it('renders without crashing', () => {
    render(<MostImproved />)
    expect(true).toBe(true)
  })

  it('displays page heading', async () => {
    render(<MostImproved />)
    expect(await screen.findByRole('heading', { name: 'Most Improved Students' }, { timeout: 3000 })).toBeDefined()
  })
})
