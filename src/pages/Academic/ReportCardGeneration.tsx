import React, { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Download, Mail, MessageSquare, Loader } from 'lucide-react'
import PageHeader from '../../components/PageHeader'

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

const ReportCardGeneration: React.FC = () => {
  const [selectedExam, setSelectedExam] = useState<number | null>(null)
  const [selectedStream, setSelectedStream] = useState<number | null>(null)
  const [exams, setExams] = useState<Array<{ id: number; name: string }>>([])
  const [streams, setStreams] = useState<Array<{ id: number; name: string }>>([])
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('default')
  const [sendEmail, setSendEmail] = useState(true)
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
    loadExams()
    loadStreams()
    loadEmailTemplates()
  }, [])

  const loadExams = async () => {
    try {
      const examsData = await window.electronAPI.invoke('academic:getExams')
      setExams(examsData || [])
    } catch (error) {
      console.error('Failed to load exams:', error)
    }
  }

  const loadStreams = async () => {
    try {
      const streamsData = await window.electronAPI.invoke('academic:getStreams')
      setStreams(streamsData || [])
    } catch (error) {
      console.error('Failed to load streams:', error)
    }
  }

  const loadEmailTemplates = async () => {
    try {
      const templates = await window.electronAPI.invoke('notifications:getEmailTemplates', { type: 'report_card' })
      setEmailTemplates(templates || [])
    } catch (error) {
      console.error('Failed to load email templates:', error)
    }
  }

  const handleGenerateReportCards = async () => {
    if (!selectedExam || !selectedStream) {
      alert('Please select both exam and stream')
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
      // Get students for stream
      const students = await window.electronAPI.invoke('students:getByStream', {
        stream_id: selectedStream
      })

      setProgress(prev => ({ ...prev, total: students.length }))

      // Generate report cards
      const results = await window.electronAPI.invoke('report-card:generateBatch', {
        exam_id: selectedExam,
        stream_id: selectedStream,
        on_progress: (data: unknown) => {
          setProgress(prev => ({
            ...prev,
            completed: data.completed,
            current_student: data.current_student,
            failed: data.failed
          }))
        }
      })

      // If email requested
      if (sendEmail) {
        setProgress(prev => ({ ...prev, status: 'emailing' }))
        
        await window.electronAPI.invoke('report-card:emailReports', {
          exam_id: selectedExam,
          stream_id: selectedStream,
          template_id: selectedTemplate,
          include_sms: sendSMS,
          on_progress: (data: unknown) => {
            setProgress(prev => ({
              ...prev,
              completed: data.completed,
              current_student: data.current_student
            }))
          }
        })
      }

      // If merge PDFs requested
      if (mergePDFs) {
        await window.electronAPI.invoke('report-card:mergePDFs', {
          exam_id: selectedExam,
          stream_id: selectedStream,
          output_path: `ReportCards_${selectedExam}_${selectedStream}.pdf`
        })

        setGeneratedFiles(prev => [
          ...prev,
          `ReportCards_${selectedExam}_${selectedStream}.pdf`
        ])
      }

      setProgress(prev => ({
        ...prev,
        status: 'complete'
      }))

      alert(`Report cards generated successfully! ${results.generated} generated, ${results.failed} failed`)
    } catch (error) {
      setProgress(prev => ({
        ...prev,
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      }))
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to generate report cards'}`)
    }
  }

  const handleDownloadReportCards = async () => {
    try {
      await window.electronAPI.invoke('report-card:downloadReports', {
        exam_id: selectedExam,
        stream_id: selectedStream,
        merge: mergePDFs
      })
      alert('Report cards downloaded successfully')
    } catch (error) {
      alert(`Error downloading: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0
    return Math.round((progress.completed / progress.total) * 100)
  }

  const getProgressColor = () => {
    const percent = getProgressPercentage()
    if (percent < 33) return 'bg-red-500'
    if (percent < 66) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <PageHeader
        title="Report Card Generation"
        subtitle="Batch generate and distribute CBC report cards to all students"
        breadcrumbs={[
          { label: 'Academic', href: '/academic' },
          { label: 'Report Cards', href: '/academic/report-cards' },
          { label: 'Generation' }
        ]}
      />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Selection Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Select Report Card Parameters</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Exam Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Exam <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedExam ?? ''}
                onChange={(e) => setSelectedExam(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Stream <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedStream ?? ''}
                onChange={(e) => setSelectedStream(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Template
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={!sendEmail}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
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
                <span className="text-sm font-medium text-slate-700">
                  <Mail className="inline w-4 h-4 mr-1" />
                  Email to Parents
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendSMS}
                  onChange={(e) => setSendSMS(e.target.checked)}
                  disabled={!sendEmail}
                  className="w-4 h-4 text-blue-600 rounded disabled:opacity-50"
                />
                <span className="text-sm font-medium text-slate-700">
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
                <span className="text-sm font-medium text-slate-700">
                  <Download className="inline w-4 h-4 mr-1" />
                  Merge PDFs (Single File)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {progress.status !== 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              {progress.status === 'generating' || progress.status === 'emailing' ? (
                <Loader className="w-6 h-6 text-blue-500 animate-spin" />
              ) : progress.status === 'complete' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-500" />
              )}
              
              <div>
                <h3 className="font-semibold text-slate-900">
                  {progress.status === 'generating' && 'Generating Report Cards...'}
                  {progress.status === 'emailing' && 'Sending Emails...'}
                  {progress.status === 'complete' && 'Complete!'}
                  {progress.status === 'error' && 'Error'}
                </h3>
                {progress.current_student && (
                  <p className="text-sm text-slate-600">
                    Current: {progress.current_student}
                  </p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-slate-600 mb-2">
                <span>Progress: {progress.completed} of {progress.total}</span>
                <span>{getProgressPercentage()}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full ${getProgressColor()} transition-all duration-300`}
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-green-50 rounded p-3">
                <p className="text-slate-600">Generated</p>
                <p className="text-2xl font-bold text-green-600">{progress.completed}</p>
              </div>
              <div className="bg-red-50 rounded p-3">
                <p className="text-slate-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              </div>
              <div className="bg-blue-50 rounded p-3">
                <p className="text-slate-600">Total</p>
                <p className="text-2xl font-bold text-blue-600">{progress.total}</p>
              </div>
            </div>

            {progress.error_message && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {progress.error_message}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={handleGenerateReportCards}
              disabled={!selectedExam || !selectedStream || progress.status === 'generating' || progress.status === 'emailing'}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed font-medium transition"
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
                onClick={handleDownloadReportCards}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Report Cards
              </button>
            )}
          </div>
        </div>

        {/* Generated Files List */}
        {generatedFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Generated Files</h3>
            <div className="space-y-2">
              {generatedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-sm text-slate-700">{file}</span>
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
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
