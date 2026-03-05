// @vitest-environment jsdom
/**
 * Tests for useReportCardGeneration hook.
 *
 * Covers: exam/stream/template loading, full generation flow with
 * email + SMS + merge permutations, progress state, and all error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../../utils/ipc', () => ({
    // eslint-disable-next-line sonarjs/function-return-type
    unwrapArrayResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return Array.isArray(value) ? value : []
    },
    unwrapIPCResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return value
    },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        academic: {
            getCurrentAcademicYear: vi.fn().mockResolvedValue({ id: 1 }),
            getCurrentTerm: vi.fn().mockResolvedValue({ id: 10 }),
            getAcademicExams: vi.fn().mockResolvedValue([]),
            getStreams: vi.fn().mockResolvedValue([]),
            generateBatchReportCards: vi.fn().mockResolvedValue({ success: true, generated: 5, failed: 0 }),
            emailReportCards: vi.fn().mockResolvedValue({ success: true, sent: 5, failed: 0 }),
            mergeReportCards: vi.fn().mockResolvedValue({ success: true, filePath: '/merged.pdf' }),
        },
        students: {
            getStudents: vi.fn().mockResolvedValue({ rows: [], totalCount: 5 }),
        },
        communications: {
            getNotificationTemplates: vi.fn().mockResolvedValue([]),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useReportCardGeneration } = await import('../useReportCardGeneration')

describe('useReportCardGeneration', () => {
    // ── Data loading ────────────────────────────────────

    describe('loadExams', () => {
        it('loads exams on mount using current year and term', async () => {
            const mockExams = [{ id: 100, name: 'Mid-Term' }]
            mockApi.academic.getAcademicExams.mockResolvedValue(mockExams)

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.exams).toEqual(mockExams)
            expect(mockApi.academic.getAcademicExams).toHaveBeenCalledWith(1, 10)
        })

        it('handles loadExams failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockRejectedValue(new Error('No year'))

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.exams).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('No year', 'error')
        })

        it('handles loadExams non-Error failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockRejectedValue('bad')

            renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load exams', 'error')
        })
    })

    describe('loadStreams', () => {
        it('loads streams and maps stream_name', async () => {
            mockApi.academic.getStreams.mockResolvedValue([
                { id: 1, stream_name: 'East' },
                { id: 2, stream_name: 'West' },
            ])

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.streams).toEqual([
                { id: 1, name: 'East' },
                { id: 2, name: 'West' },
            ])
        })

        it('handles loadStreams failure', async () => {
            mockApi.academic.getStreams.mockRejectedValue(new Error('Stream fail'))

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.streams).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Stream fail', 'error')
        })

        it('handles loadStreams non-Error failure', async () => {
            mockApi.academic.getStreams.mockRejectedValue(42)

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.streams).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load streams', 'error')
        })
    })

    describe('loadEmailTemplates', () => {
        it('loads and filters email templates', async () => {
            mockApi.communications.getNotificationTemplates.mockResolvedValue([
                { id: 1, template_name: 'Report Card', category: 'GENERAL', subject: 'RC', body: 'Hello' },
                { id: 2, template_name: 'Other', category: 'OTHER', subject: null, body: 'Bye' },
            ])

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            // 'Report Card' matches GENERAL or name includes 'report'
            // 'Other' doesn't match GENERAL and doesn't have 'report' in name → filtered out
            expect(result.current.emailTemplates).toHaveLength(1)
            expect(result.current.emailTemplates[0].name).toBe('Report Card')
        })

        it('handles loadEmailTemplates failure', async () => {
            mockApi.communications.getNotificationTemplates.mockRejectedValue(new Error('Templates fail'))

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.emailTemplates).toEqual([])
        })

        it('handles loadEmailTemplates non-Error failure', async () => {
            mockApi.communications.getNotificationTemplates.mockRejectedValue('bad')

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.emailTemplates).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load email templates', 'error')
        })

        it('includes templates matched by name containing "report" even if not GENERAL', async () => {
            mockApi.communications.getNotificationTemplates.mockResolvedValue([
                { id: 5, template_name: 'Report Card Dispatch', category: 'OTHER', subject: null, body: 'Body text' },
            ])

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.emailTemplates).toHaveLength(1)
            expect(result.current.emailTemplates[0].name).toBe('Report Card Dispatch')
            // subject should be '' when null
            expect(result.current.emailTemplates[0].subject).toBe('')
        })
    })

    // ── handleGenerateReportCards ─────────────────────

    describe('handleGenerateReportCards', () => {
        it('shows warning when exam/stream not selected', async () => {
            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleGenerateReportCards())

            expect(mockShowToast).toHaveBeenCalledWith('Please select both exam and stream', 'warning')
        })

        it('generates report cards successfully (basic)', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: true, generated: 5, failed: 0 })
            mockApi.students.getStudents.mockResolvedValue({ rows: [], totalCount: 5 })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => { result.current.setSelectedExam(100); result.current.setSelectedStream(1) })

            await act(async () => result.current.handleGenerateReportCards())

            expect(result.current.progress.status).toBe('complete')
            expect(result.current.progress.completed).toBe(5)
            expect(result.current.progress.failed).toBe(0)
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Report cards generated successfully'),
                'success'
            )
        })

        it('generates with email dispatch and no failures', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: true, generated: 3, failed: 0 })
            mockApi.academic.emailReportCards.mockResolvedValue({ success: true, sent: 3, failed: 0 })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setSelectedExam(100)
                result.current.setSelectedStream(1)
                result.current.setSendEmail(true)
                result.current.setSelectedTemplate('tpl1')
            })

            await act(async () => result.current.handleGenerateReportCards())

            expect(mockApi.academic.emailReportCards).toHaveBeenCalledWith(
                expect.objectContaining({ exam_id: 100, stream_id: 1, template_id: 'tpl1', include_sms: false })
            )
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('emails sent: 3'),
                'success'
            )
        })

        it('generates with email failures → shows warning', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: true, generated: 3, failed: 1 })
            mockApi.academic.emailReportCards.mockResolvedValue({ success: true, sent: 2, failed: 1 })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setSelectedExam(100)
                result.current.setSelectedStream(1)
                result.current.setSendEmail(true)
            })

            await act(async () => result.current.handleGenerateReportCards())

            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('email failures: 1'),
                'warning'
            )
        })

        it('generates with PDF merge', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: true, generated: 2, failed: 0 })
            mockApi.academic.mergeReportCards.mockResolvedValue({ success: true, filePath: '/out/merged.pdf' })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setSelectedExam(100)
                result.current.setSelectedStream(1)
                result.current.setMergePDFs(true)
            })

            await act(async () => result.current.handleGenerateReportCards())

            expect(mockApi.academic.mergeReportCards).toHaveBeenCalled()
            expect(result.current.generatedFiles).toContain('/out/merged.pdf')
        })

        it('generates with email + SMS + merge', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: true, generated: 4, failed: 0 })
            mockApi.academic.emailReportCards.mockResolvedValue({ success: true, sent: 4, failed: 0 })
            mockApi.academic.mergeReportCards.mockResolvedValue({ success: true, filePath: '/combo.pdf' })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setSelectedExam(100)
                result.current.setSelectedStream(1)
                result.current.setSendEmail(true)
                result.current.setSendSMS(true)
                result.current.setMergePDFs(true)
            })

            await act(async () => result.current.handleGenerateReportCards())

            expect(mockApi.academic.emailReportCards).toHaveBeenCalledWith(
                expect.objectContaining({ include_sms: true })
            )
            expect(result.current.generatedFiles).toContain('/combo.pdf')
            expect(result.current.progress.status).toBe('complete')
        })

        it('handles generation Error', async () => {
            mockApi.students.getStudents.mockRejectedValue(new Error('Student fetch failed'))

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => { result.current.setSelectedExam(100); result.current.setSelectedStream(1) })

            await act(async () => result.current.handleGenerateReportCards())

            expect(result.current.progress.status).toBe('error')
            expect(result.current.progress.error_message).toBe('Student fetch failed')
            expect(mockShowToast).toHaveBeenCalledWith('Student fetch failed', 'error')
        })

        it('handles generation non-Error failure', async () => {
            mockApi.students.getStudents.mockRejectedValue('bad')

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => { result.current.setSelectedExam(100); result.current.setSelectedStream(1) })

            await act(async () => result.current.handleGenerateReportCards())

            expect(result.current.progress.status).toBe('error')
            expect(mockShowToast).toHaveBeenCalledWith('Failed to generate report cards', 'error')
        })

        it('handles batch generation failure (success=false)', async () => {
            mockApi.academic.generateBatchReportCards.mockResolvedValue({ success: false, error: 'Batch error' })

            const { result } = renderHook(() => useReportCardGeneration())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => { result.current.setSelectedExam(100); result.current.setSelectedStream(1) })

            await act(async () => result.current.handleGenerateReportCards())

            expect(result.current.progress.status).toBe('error')
        })
    })
})
