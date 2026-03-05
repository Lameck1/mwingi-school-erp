export interface GenerationProgress {
    total: number
    completed: number
    failed: number
    current_student: string
    status: 'idle' | 'generating' | 'emailing' | 'complete' | 'error'
    error_message?: string
}

export interface EmailTemplate {
    id: string
    name: string
    subject: string
    body: string
}

export const INITIAL_PROGRESS: GenerationProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    current_student: '',
    status: 'idle'
}

export function getOperationErrorMessage(result: unknown, fallback: string): string {
    if (typeof result === 'object' && result !== null) {
        if ('message' in result && typeof result.message === 'string' && result.message.trim()) {
            return result.message
        }
        if ('error' in result && typeof result.error === 'string' && result.error.trim()) {
            return result.error
        }
    }
    return fallback
}

export async function runBatchReportCardGeneration(examId: number, streamId: number) {
    const result = await globalThis.electronAPI.academic.generateBatchReportCards({
        exam_id: examId,
        stream_id: streamId
    })
    if (!result.success) {
        throw new Error(getOperationErrorMessage(result, 'Failed to generate report cards'))
    }
    return result
}

export async function runBatchEmailDispatch(examId: number, streamId: number, templateId: string, includeSms: boolean) {
    const result = await globalThis.electronAPI.academic.emailReportCards({
        exam_id: examId,
        stream_id: streamId,
        template_id: templateId,
        include_sms: includeSms
    })
    if (!result.success) {
        throw new Error(getOperationErrorMessage(result, 'Failed to send report card emails'))
    }
    return { sent: result.sent, failed: result.failed }
}

export async function runBatchMerge(examId: number, streamId: number) {
    const fallbackFileName = `ReportCards_${examId}_${streamId}.pdf`
    const result = await globalThis.electronAPI.academic.mergeReportCards({
        exam_id: examId,
        stream_id: streamId,
        output_path: fallbackFileName
    })
    if (!result.success) {
        throw new Error(getOperationErrorMessage(result, 'Failed to merge report cards'))
    }
    return result.filePath || fallbackFileName
}

export async function handleDownloadReportCards(
    examId: number | null,
    streamId: number | null,
    showToastFn: (msg: string, type: 'success' | 'error' | 'warning') => void
): Promise<void> {
    if (!examId || !streamId) {
        showToastFn('Please select an exam and stream first', 'warning')
        return
    }
    try {
        const result = await globalThis.electronAPI.academic.downloadReportCards({
            exam_id: examId,
            stream_id: streamId,
            merge: true
        })
        if (result.success) {
            showToastFn('Report cards downloaded successfully', 'success')
        } else {
            const message = getOperationErrorMessage(result, 'Download failed')
            showToastFn(message, 'error')
        }
    } catch (error) {
        console.error('Download failed:', error)
        showToastFn('Failed to download report cards', 'error')
    }
}
