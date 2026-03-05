import { Download, Loader } from 'lucide-react'
import React from 'react'

import { PageHeader } from '../../components/patterns/PageHeader'
import { useToast } from '../../contexts/ToastContext'

import { GenerationProgressPanel } from './ReportCardGeneration/GenerationProgressPanel'
import { ParameterSelectionSection } from './ReportCardGeneration/ParameterSelectionSection'
import { handleDownloadReportCards } from './ReportCardGeneration/ReportCardGeneration.types'
import { useReportCardGeneration } from './ReportCardGeneration/useReportCardGeneration'

const ReportCardGeneration: React.FC = () => {
  const { showToast } = useToast()
  const d = useReportCardGeneration()

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
        <ParameterSelectionSection
            selectedExam={d.selectedExam}
            onExamChange={d.setSelectedExam}
            selectedStream={d.selectedStream}
            onStreamChange={d.setSelectedStream}
            exams={d.exams}
            streams={d.streams}
            emailTemplates={d.emailTemplates}
            selectedTemplate={d.selectedTemplate}
            onTemplateChange={d.setSelectedTemplate}
            sendEmail={d.sendEmail}
            onSendEmailChange={d.setSendEmail}
            sendSMS={d.sendSMS}
            onSendSMSChange={d.setSendSMS}
            mergePDFs={d.mergePDFs}
            onMergePDFsChange={d.setMergePDFs}
        />

        {d.progress.status !== 'idle' && (
          <GenerationProgressPanel progress={d.progress} />
        )}

        {/* Action Buttons */}
        <div className="bg-card rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={d.handleGenerateReportCards}
              disabled={!d.selectedExam || !d.selectedStream || d.progress.status === 'generating' || d.progress.status === 'emailing'}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:bg-muted disabled:cursor-not-allowed font-medium transition"
            >
              {d.progress.status === 'generating' || d.progress.status === 'emailing' ? (
                <>
                  <Loader className="inline w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Report Cards'
              )}
            </button>

            {d.progress.status === 'complete' && (
              <button
                onClick={() => handleDownloadReportCards(d.selectedExam, d.selectedStream, showToast)}
                className="px-6 py-2 bg-success text-white rounded-lg hover:bg-success/80 font-medium transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Report Cards
              </button>
            )}
          </div>
        </div>

        {/* Generated Files List */}
        {d.generatedFiles.length > 0 && (
          <div className="bg-card rounded-lg shadow-md p-6">
            <h3 className="font-semibold text-foreground mb-4">Generated Files</h3>
            <div className="space-y-2">
              {d.generatedFiles.map((file) => (
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
            All report cards are password-protected with the student&apos;s admission number.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ReportCardGeneration
