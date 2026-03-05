import { useState, useEffect } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

import { INITIAL_PROGRESS, runBatchReportCardGeneration, runBatchEmailDispatch, runBatchMerge } from './ReportCardGeneration.types'
import type { GenerationProgress, EmailTemplate } from './ReportCardGeneration.types'

export function useReportCardGeneration() {
    const { showToast } = useToast()

    const [selectedExam, setSelectedExam] = useState<number | null>(null)
    const [selectedStream, setSelectedStream] = useState<number | null>(null)
    const [exams, setExams] = useState<Array<{ id: number; name: string }>>([])
    const [streams, setStreams] = useState<Array<{ id: number; name: string }>>([])
    const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
    const [selectedTemplate, setSelectedTemplate] = useState<string>('default')
    const [sendEmail, setSendEmail] = useState(false)
    const [sendSMS, setSendSMS] = useState(false)
    const [mergePDFs, setMergePDFs] = useState(false)
    const [progress, setProgress] = useState<GenerationProgress>(INITIAL_PROGRESS)
    const [generatedFiles, setGeneratedFiles] = useState<string[]>([])

    // ── Data loading ──────────────────────────────────────────

    const loadExams = async () => {
        try {
            const year = unwrapIPCResult<{ id: number }>(
                await globalThis.electronAPI.academic.getCurrentAcademicYear(),
                'Failed to load current academic year'
            )
            const term = unwrapIPCResult<{ id: number }>(
                await globalThis.electronAPI.academic.getCurrentTerm(),
                'Failed to load current term'
            )
            const examsData = unwrapArrayResult(
                await globalThis.electronAPI.academic.getAcademicExams(year.id, term.id),
                'Failed to load exams'
            )
            setExams(examsData)
        } catch (error) {
            console.error('Failed to load exams:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load exams', 'error')
            setExams([])
        }
    }

    const loadStreams = async () => {
        try {
            const streamsData = unwrapArrayResult(await globalThis.electronAPI.academic.getStreams(), 'Failed to load streams')
            setStreams(streamsData.map(s => ({ id: s.id, name: s.stream_name })))
        } catch (error) {
            console.error('Failed to load streams:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load streams', 'error')
            setStreams([])
        }
    }

    const loadEmailTemplates = async () => {
        try {
            const tList = unwrapArrayResult(
                await globalThis.electronAPI.communications.getNotificationTemplates(),
                'Failed to load email templates'
            )
            const rcTemplates = tList.filter((t: { category: string, template_name: string }) => t.category === 'GENERAL' || t.template_name?.toLowerCase().includes('report'))
            setEmailTemplates(rcTemplates.map((t: { id: number, template_name: string, subject?: string | null, body: string }) => ({
                id: String(t.id),
                name: t.template_name,
                subject: t.subject || '',
                body: t.body
            })))
        } catch (error) {
            console.error('Failed to load email templates:', error)
            showToast(error instanceof Error ? error.message : 'Failed to load email templates', 'error')
            setEmailTemplates([])
        }
    }

    useEffect(() => {
        void loadExams()
        void loadStreams()
        void loadEmailTemplates()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Handlers ──────────────────────────────────────────────

    const handleGenerateReportCards = async () => {
        if (!selectedExam || !selectedStream) {
            showToast('Please select both exam and stream', 'warning')
            return
        }

        setProgress({
            total: 0,
            completed: 0,
            failed: 0,
            current_student: '',
            status: 'generating'
        })

        try {
            const studentsResult = unwrapIPCResult<{ rows: unknown[]; totalCount: number }>(
                await globalThis.electronAPI.students.getStudents({ stream_id: selectedStream, is_active: true, pageSize: 200 }),
                'Failed to load students for selected stream'
            )

            setProgress(prev => ({ ...prev, total: studentsResult.totalCount }))

            const results = await runBatchReportCardGeneration(selectedExam, selectedStream)

            let emailResultSummary: { sent: number; failed: number } | null = null

            if (sendEmail) {
                setProgress(prev => ({ ...prev, status: 'emailing' }))
                emailResultSummary = await runBatchEmailDispatch(selectedExam, selectedStream, selectedTemplate, sendSMS)
            }

            if (mergePDFs) {
                const mergedFilePath = await runBatchMerge(selectedExam, selectedStream)
                setGeneratedFiles(prev => [...prev, mergedFilePath])
            }

            setProgress(prev => ({
                ...prev,
                completed: results.generated,
                failed: results.failed,
                status: 'complete'
            }))

            if (emailResultSummary && emailResultSummary.failed > 0) {
                showToast(
                    `Generated ${results.generated}; generation failures: ${results.failed}; emails sent: ${emailResultSummary.sent}, email failures: ${emailResultSummary.failed}`,
                    'warning'
                )
            } else {
                const emailSuffix = emailResultSummary ? `; emails sent: ${emailResultSummary.sent}` : ''
                showToast(
                    `Report cards generated successfully! ${results.generated} generated, ${results.failed} failed${emailSuffix}`,
                    'success'
                )
            }
        } catch (error) {
            setProgress(prev => ({
                ...prev,
                status: 'error',
                error_message: error instanceof Error ? error.message : 'Unknown error'
            }))
            showToast(error instanceof Error ? error.message : 'Failed to generate report cards', 'error')
        }
    }

    return {
        // Selections
        selectedExam,
        setSelectedExam,
        selectedStream,
        setSelectedStream,

        // Data
        exams,
        streams,
        emailTemplates,
        selectedTemplate,
        setSelectedTemplate,

        // Options
        sendEmail,
        setSendEmail,
        sendSMS,
        setSendSMS,
        mergePDFs,
        setMergePDFs,

        // Progress
        progress,
        generatedFiles,

        // Handlers
        handleGenerateReportCards,
    }
}
