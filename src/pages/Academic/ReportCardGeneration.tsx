import { AlertCircle, CheckCircle, Download, Mail, MessageSquare, Loader } from 'lucide-react'
import React, { useState, useEffect } from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { useToast } from '../../contexts/ToastContext'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

interface GenerationProgress {
  total: number
  completed: number
  failed: number
  current_student: string
  status: 'idle' | 'generating' | 'emailing' | 'complete' | 'error'
  error_message?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

function getOperationErrorMessage(result: unknown, fallback: string): string {
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

const handleDownloadReportCards = async (examId: number | null, streamId: number | null, showToastFn: (msg: string, type: 'success' | 'error' | 'warning') => void): Promise<void> => {
  if (!examId || !streamId) {
    showToastFn('Please select an exam and stream first', 'warning')
    return
  }
  try {
    const result = await globalThis.electronAPI.downloadReportCards({
      exam_id: examId,
      stream_id: streamId,
      merge: true
    })
    if (result.success) {
      showToastFn('Report cards downloaded successfully', 'success')
    } else {
      const message = result.message || ('error' in result ? String(result.error || '') : '') || 'Download failed'
      showToastFn(message, 'error')
    }
  } catch (error) {
    console.error('Download failed:', error)
    showToastFn('Failed to download report cards', 'error')
  }
}

const renderProgressIcon = (status: GenerationProgress['status']) => {
  if (status === 'generating' || status === 'emailing') {
    return <Loader className="w-6 h-6 text-blue-500 animate-spin" />
  }

  if (status === 'complete') {
    return <CheckCircle className="w-6 h-6 text-green-500" />
  }

  return <AlertCircle className="w-6 h-6 text-red-500" />
}

async function runBatchReportCardGeneration(examId: number, streamId: number) {
  const result = await globalThis.electronAPI.generateBatchReportCards({
    exam_id: examId,
    stream_id: streamId
  })
  if (!result.success) {
    throw new Error(getOperationErrorMessage(result, 'Failed to generate report cards'))
  }
  return result
}

async function runBatchEmailDispatch(examId: number, streamId: number, templateId: string, includeSms: boolean) {
  const result = await globalThis.electronAPI.emailReportCards({
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

async function runBatchMerge(examId: number, streamId: number) {
  const fallbackFileName = `ReportCards_${examId}_${streamId}.pdf`
  const result = await globalThis.electronAPI.mergeReportCards({
    exam_id: examId,
    stream_id: streamId,
    output_path: fallbackFileName
  })
  if (!result.success) {
    throw new Error(getOperationErrorMessage(result, 'Failed to merge report cards'))
  }
  return result.filePath || fallbackFileName
}

const ReportCardGeneration: React.FC = () => {
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
  const [progress, setProgress] = useState<GenerationProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current_student: '',
    status: 'idle'
  })
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([])

  // Load initial data
  useEffect(() => {
    void loadExams()
    void loadStreams()
    void loadEmailTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadExams = async () => {
    try {
      // Changed to use typed getExams from AcademicAPI
      const year = unwrapIPCResult<{ id: number }>(
        await globalThis.electronAPI.getCurrentAcademicYear(),
        'Failed to load current academic year'
      )
      const term = unwrapIPCResult<{ id: number }>(
        await globalThis.electronAPI.getCurrentTerm(),
        'Failed to load current term'
      )
      const examsData = unwrapArrayResult(
        await globalThis.electronAPI.getAcademicExams(year.id, term.id),
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
      const streamsData = unwrapArrayResult(await globalThis.electronAPI.getStreams(), 'Failed to load streams')
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
        await globalThis.electronAPI.getNotificationTemplates(),
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
        await globalThis.electronAPI.getStudents({ stream_id: selectedStream, is_active: true, pageSize: 200 }),
        'Failed to load students for selected stream'
      )

      setProgress(prev => ({ ...prev, total: studentsResult.totalCount }))

      const results = await runBatchReportCardGeneration(selectedExam, selectedStream)

      let emailResultSummary: { sent: number; failed: number } | null = null

      // If email requested
      if (sendEmail) {
        setProgress(prev => ({ ...prev, status: 'emailing' }))
        emailResultSummary = await runBatchEmailDispatch(selectedExam, selectedStream, selectedTemplate, sendSMS)
      }

      // If merge PDFs requested
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

  const getProgressPercentage = () => {
    if (progress.total === 0) { return 0 }
    return Math.round((progress.completed / progress.total) * 100)
  }

  const getProgressColor = () => {
    const percent = getProgressPercentage()
    if (percent < 33) { return 'bg-red-500' }
    if (percent < 66) { return 'bg-yellow-500' }
    return 'bg-green-500'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader
        title="Report Card Generation"
        subtitle="Batch generate and distribute CBC report cards to all students"
        breadcrumbs={[
          { label: 'Academics', href: '/academics' },
          { label: 'Report Cards', href: '/report-cards' },
          { label: 'Generation' }
        ]}
      />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Selection Section */}
        <div className="bg-card rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Select Report Card Parameters</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Exam Selection */}
            <div>
              <label htmlFor="field-193" className="block text-sm font-medium text-foreground/70 mb-2">
                Exam <span className="text-red-500">*</span>
              </label>
              <select id="field-193"
                value={selectedExam ?? ''}
                onChange={(e) => setSelectedExam(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/50 focus:border-transparent"
              >
                <option value="">Select Exam</option>
                {exams.map(exam => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Stream Selection */}
            <div>
              <label htmlFor="field-212" className="block text-sm font-medium text-foreground/70 mb-2">
                Stream <span className="text-red-500">*</span>
              </label>
              <select id="field-212"
                value={selectedStream ?? ''}
                onChange={(e) => setSelectedStream(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/50 focus:border-transparent"
              >
                <option value="">Select Stream</option>
                {streams.map(stream => (
                  <option key={stream.id} value={stream.id}>
                    {stream.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Email Options */}
            <div>
              <label htmlFor="field-231" className="block text-sm font-medium text-foreground/70 mb-2">
                Email Template
              </label>
              <select id="field-231"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={!sendEmail}
                className="w-full px-4 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/50 focus:border-transparent disabled:bg-secondary"
              >
                {emailTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-foreground/70">
                  <Mail className="inline w-4 h-4 mr-1" />
                  Email to Parents
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendSMS}
                  onChange={(e) => setSendSMS(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded disabled:opacity-50"
                />
                <span className="text-sm font-medium text-foreground/70">
                  <MessageSquare className="inline w-4 h-4 mr-1" />
                  SMS Notification
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergePDFs}
                  onChange={(e) => setMergePDFs(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-foreground/70">
                  <Download className="inline w-4 h-4 mr-1" />
                  Merge PDFs (Single File)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {progress.status !== 'idle' && (
          <div className="bg-card rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              {renderProgressIcon(progress.status)}

              <div>
                <h3 className="font-semibold text-foreground">
                  {progress.status === 'generating' && 'Generating Report Cards...'}
                  {progress.status === 'emailing' && 'Sending Emails...'}
                  {progress.status === 'complete' && 'Complete!'}
                  {progress.status === 'error' && 'Error'}
                </h3>
                {progress.current_student && (
                  <p className="text-sm text-muted-foreground">
                    Current: {progress.current_student}
                  </p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Progress: {progress.completed} of {progress.total}</span>
                <span>{getProgressPercentage()}%</span>
              </div>
              <ProgressBar value={getProgressPercentage()} height="h-3" fillClass={`${getProgressColor()} transition-all duration-300`} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-green-500/10 rounded p-3">
                <p className="text-muted-foreground">Generated</p>
                <p className="text-2xl font-bold text-green-600">{progress.completed}</p>
              </div>
              <div className="bg-red-500/10 rounded p-3">
                <p className="text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              </div>
              <div className="bg-blue-500/10 rounded p-3">
                <p className="text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-blue-600">{progress.total}</p>
              </div>
            </div>

            {progress.error_message && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                {progress.error_message}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-card rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={handleGenerateReportCards}
              disabled={!selectedExam || !selectedStream || progress.status === 'generating' || progress.status === 'emailing'}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:bg-muted disabled:cursor-not-allowed font-medium transition"
            >
              {progress.status === 'generating' || progress.status === 'emailing' ? (
                <>
                  <Loader className="inline w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Report Cards'
              )}
            </button>

            {progress.status === 'complete' && (
              <button
                onClick={() => handleDownloadReportCards(selectedExam, selectedStream, showToast)}
                className="px-6 py-2 bg-success text-white rounded-lg hover:bg-success/80 font-medium transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Report Cards
              </button>
            )}
          </div>
        </div>

        {/* Generated Files List */}
        {generatedFiles.length > 0 && (
          <div className="bg-card rounded-lg shadow-md p-6">
            <h3 className="font-semibold text-foreground mb-4">Generated Files</h3>
            <div className="space-y-2">
              {generatedFiles.map((file) => (
                <div key={file} className="flex items-center justify-between p-3 bg-secondary rounded border border-border">
                  <span className="text-sm text-foreground/70">{file}</span>
                  <button className="text-primary hover:text-primary/80 text-sm font-medium">
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Note:</strong> Report cards will be generated for all students in the selected stream for the chosen exam.
            If email is enabled, parents will receive the report card as an attachment with parent portal access links.
            All report cards are password-protected with the student's admission number.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ReportCardGeneration
