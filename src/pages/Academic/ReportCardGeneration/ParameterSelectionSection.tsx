import { Download, Mail, MessageSquare } from 'lucide-react'

import type { EmailTemplate } from './ReportCardGeneration.types'

interface ParameterSelectionProps {
    selectedExam: number | null
    onExamChange: (exam: number | null) => void
    selectedStream: number | null
    onStreamChange: (stream: number | null) => void
    exams: Array<{ id: number; name: string }>
    streams: Array<{ id: number; name: string }>
    emailTemplates: EmailTemplate[]
    selectedTemplate: string
    onTemplateChange: (template: string) => void
    sendEmail: boolean
    onSendEmailChange: (checked: boolean) => void
    sendSMS: boolean
    onSendSMSChange: (checked: boolean) => void
    mergePDFs: boolean
    onMergePDFsChange: (checked: boolean) => void
}

export function ParameterSelectionSection({
    selectedExam, onExamChange,
    selectedStream, onStreamChange,
    exams, streams,
    emailTemplates, selectedTemplate, onTemplateChange,
    sendEmail, onSendEmailChange,
    sendSMS, onSendSMSChange,
    mergePDFs, onMergePDFsChange,
}: Readonly<ParameterSelectionProps>) {
    return (
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
                onChange={(e) => onExamChange(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
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
                onChange={(e) => onStreamChange(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
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
                onChange={(e) => onTemplateChange(e.target.value)}
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
                  onChange={(e) => onSendEmailChange(e.target.checked)}
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
                  onChange={(e) => onSendSMSChange(e.target.checked)}
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
                  onChange={(e) => onMergePDFsChange(e.target.checked)}
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
    )
}
