import * as fs from 'node:fs'
import * as path from 'node:path'
import nodemailer from 'nodemailer'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'

import { getDatabase } from '../../database'
import { shell, dialog } from '../../electron-env'
import { getSession } from '../../security/session'
import { container } from '../../services/base/ServiceContainer'
import { ConfigService } from '../../services/ConfigService'
import { getImageAsBase64DataUrl } from '../../utils/image-utils'
import { renderHtmlToPdfBuffer, resolveOutputPath, writePdfBuffer } from '../../utils/pdf'
import { getSchoolInfo, type SchoolInfo } from '../../utils/pdf-helpers'
import { ROLES } from '../ipc-result'
import {
  ReportCardGetSubjectsSchema,
  ReportCardGetSchema,
  ReportCardGenerateSchema,
  ReportCardGenerateBatchSchema,
  ReportCardEmailSchema,
  ReportCardMergeSchema,
  ReportCardDownloadSchema,
  ReportCardOpenFileSchema,
  LegacyReportCardGetGradesSchema,
  LegacyReportCardGenerateSchema,
  LegacyReportCardGetStudentsSchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { StudentReportCard } from '../../services/academic/CBCReportCardService'

const getCbcService = () => container.resolve('CBCReportCardService')
const getLegacyService = () => container.resolve('ReportCardService')
const UNKNOWN_ERROR = 'Unknown error'
const REPORT_CARDS_DIR = 'report-cards'

type SmtpConfig = {
  host: string
  port: number
  user: string
  pass: string
}

async function getSessionUserId(): Promise<number> {
  const session = await getSession()
  if (!session?.user.id) {
    throw new Error('No active session — please sign in again')
  }
  return session.user.id
}

function resolveSmtpConfig(): { config: SmtpConfig | null; error?: string } {
  const host = ConfigService.getConfig('smtp.host')
  const port = ConfigService.getConfig('smtp.port')
  const user = ConfigService.getConfig('smtp.user')
  const pass = ConfigService.getConfig('smtp.pass')

  if (!host || !port || !user || !pass) {
    return { config: null, error: 'SMTP settings are not configured' }
  }

  return {
    config: {
      host,
      port: Number(port),
      user,
      pass,
    },
  }
}

async function generateBatchReportCardFiles(examId: number, streamId: number) {
  const userId = await getSessionUserId()
  const result = await getCbcService().generateBatchReportCards(examId, streamId, userId)
  const files = await generateReportCardPdfs(result.generated, `exam_${examId}_stream_${streamId}`)
  return { files, userId, failed: result.failed, total: result.total }
}

async function sendReportCardEmails(
  files: Array<{ studentId: number; filePath: string }>,
  config: SmtpConfig
): Promise<{ sent: string[]; failed: string[] }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  })

  const sent: string[] = []
  const failed: string[] = []

  for (const file of files) {
    const studentEmail = await getGuardianEmail(file.studentId)
    if (!studentEmail) {
      failed.push(file.filePath)
      continue
    }
    try {
      await transporter.sendMail({
        from: config.user,
        to: studentEmail,
        subject: 'Report Card',
        text: 'Please find the attached report card.',
        attachments: [{ filename: path.basename(file.filePath), path: file.filePath }],
      })
      sent.push(file.filePath)
    } catch {
      failed.push(file.filePath)
    }
  }

  return { sent, failed }
}

export function registerReportCardHandlers(): void {
  registerCbcReportCardHandlers()
  registerLegacyReportCardHandlers()
}

function registerCbcReportCardHandlers(): void {
  registerCbcBaseHandlers()
  registerCbcEmailHandlers()
  registerCbcMergeHandlers()
  registerCbcDownloadHandlers()
}

function registerCbcBaseHandlers(): void {
  validatedHandlerMulti('report-card:getSubjects', ROLES.STAFF, ReportCardGetSubjectsSchema, (_event, [examId, streamId]: [number?, number?]) => {
    try {
      const db = getDatabase()

      // 1. If streamId is provided, return subjects allocated to that stream
      if (streamId) {
        return db.prepare(`
                    SELECT s.id, s.name, s.code
                    FROM subject s
                    JOIN subject_allocation sa ON sa.subject_id = s.id
                    WHERE sa.stream_id = ? AND s.is_active = 1
                    ORDER BY s.name
                `).all(streamId)
      }

      // 2. If only examId is provided, return subjects that have results for the given exam
      if (examId) {
        return db.prepare(
          `SELECT DISTINCT s.id, s.name, s.code
                     FROM subject s
                     JOIN exam_result er ON er.subject_id = s.id
                     WHERE er.exam_id = ? AND s.is_active = 1
                     ORDER BY s.name`
        ).all(examId)
      }

      // 3. Fallback: Return all active subjects
      return db.prepare(
        `SELECT id, name, code FROM subject WHERE is_active = 1 ORDER BY name`
      ).all()
    } catch (error) {
      console.error('Failed to get subjects:', error)
      return []
    }
  })

  validatedHandlerMulti('report-card:get', ROLES.STAFF, ReportCardGetSchema, (_event, [examId, studentId]: [number, number]) => {
    return getCbcService().getReportCard(examId, studentId)
  })

  validatedHandlerMulti('report-card:generate', ROLES.STAFF, ReportCardGenerateSchema, async (_event, [studentId, examId]: [number, number], actor) => {
    return getCbcService().generateReportCard(studentId, examId, actor.id)
  })

  validatedHandler('report-card:generateBatch', ROLES.STAFF, ReportCardGenerateBatchSchema, async (_event, data, actor) => {
    const result = await getCbcService().generateBatchReportCards(data.exam_id, data.stream_id, actor.id)
    return {
      success: true,
      generated: result.generated.length,
      failed: result.failed,
      total: result.total,
      failures: result.failures
    }
  })
}

function registerCbcEmailHandlers(): void {
  validatedHandler('report-card:emailReports', ROLES.STAFF, ReportCardEmailSchema, async (_event, data) => {
    try {
      const { config, error } = resolveSmtpConfig()
      if (!config) {
        return { success: false, sent: 0, failed: 0, message: error }
      }

      const { files, failed: generationFailed } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
      const { sent, failed } = await sendReportCardEmails(files, config)
      return { success: true, sent: sent.length, failed: failed.length + generationFailed }
    } catch (error) {
      console.error('Email report cards failed:', error)
      return { success: false, sent: 0, failed: 0, message: error instanceof Error ? error.message : UNKNOWN_ERROR }
    }
  })
}

function registerCbcMergeHandlers(): void {
  validatedHandler('report-card:mergePDFs', ROLES.STAFF, ReportCardMergeSchema, async (_event, data) => {
    try {
      const { files, failed } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
      const merged = await PDFDocument.create()

      for (const file of files) {
        const bytes = fs.readFileSync(file.filePath)
        const pdf = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(pdf, pdf.getPageIndices())
        pages.forEach(page => merged.addPage(page))
      }

      const mergedBytes = await merged.save()
      const outputFile = data.output_path || `report_cards_${data.exam_id}_${data.stream_id}.pdf`
      const filePath = resolveOutputPath(outputFile, REPORT_CARDS_DIR)
      fs.writeFileSync(filePath, mergedBytes)

      return { success: true, message: 'Merged', filePath, failed }
    } catch (error) {
      console.error('Merge report cards failed:', error)
      return { success: false, error: error instanceof Error ? error.message : UNKNOWN_ERROR }
    }
  })
}

function registerCbcDownloadHandlers(): void {
  validatedHandler('report-card:downloadReports', ROLES.STAFF, ReportCardDownloadSchema, async (_event, data) => {
    try {
      const { files, failed } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
      if (!data.merge) {
        return {
          success: true,
          files: files.map(f => f.filePath),
          fileRecords: files.map(f => ({ studentId: f.studentId, filePath: f.filePath })),
          failed
        }
      }

      const merged = await PDFDocument.create()
      for (const file of files) {
        const bytes = fs.readFileSync(file.filePath)
        const pdf = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(pdf, pdf.getPageIndices())
        pages.forEach(page => merged.addPage(page))
      }

      const mergedBytes = await merged.save()
      const filePath = resolveOutputPath(`report_cards_${data.exam_id}_${data.stream_id}.pdf`, REPORT_CARDS_DIR)
      fs.writeFileSync(filePath, mergedBytes)
      return { success: true, filePath, failed }
    } catch (error) {
      console.error('Download report cards failed:', error)
      return { success: false, error: error instanceof Error ? error.message : UNKNOWN_ERROR }
    }
  })

  validatedHandlerMulti('report-card:openFile', ROLES.STAFF, ReportCardOpenFileSchema, async (_event, [filePath]: [string]) => {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid report card file path' }
    }
    const openResult = await shell.openPath(filePath)
    if (openResult) {
      return { success: false, error: openResult }
    }
    return { success: true }
  })
}

function registerLegacyReportCardHandlers(): void {
  // Legacy report card handlers for term/year-based report cards (used in Reports > Report Cards)
  validatedHandler('reportcard:getSubjects', ROLES.STAFF, z.undefined(), () => {
    return getLegacyService().getSubjects()
  })

  validatedHandlerMulti('reportcard:getStudentGrades', ROLES.STAFF, LegacyReportCardGetGradesSchema, (_event, [studentId, academicYearId, termId]: [number, number, number]) => {
    return getLegacyService().getStudentGrades(studentId, academicYearId, termId)
  })

  validatedHandlerMulti('reportcard:generate', ROLES.STAFF, LegacyReportCardGenerateSchema, (_event, [studentId, academicYearId, termId]: [number, number, number]) => {
    return getLegacyService().generateReportCard(studentId, academicYearId, termId)
  })

  validatedHandlerMulti('reportcard:getStudentsForGeneration', ROLES.STAFF, LegacyReportCardGetStudentsSchema, (_event, [streamId, academicYearId, termId]: [number, number, number]) => {
    return getLegacyService().getStudentsForReportCards(streamId, academicYearId, termId)
  })

  validatedHandlerMulti('reportcard:download-pdf', ROLES.STAFF, z.tuple([z.string(), z.string().optional()]), async (_event, [html, filename]) => {
    try {
      const buffer = await renderHtmlToPdfBuffer(html)
      const result = await dialog.showSaveDialog({
        title: 'Save Report Card',
        defaultPath: filename || 'report-card.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })

      if (!result.canceled && result.filePath) {
        writePdfBuffer(result.filePath, buffer)
        return { filePath: result.filePath }
      }
      return { success: false, error: 'Save cancelled' }
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      return { success: false, error: 'Failed to generate PDF' }
    }
  })
}

async function generateReportCardPdfs(reportCards: StudentReportCard[], folderLabel: string): Promise<Array<{ studentId: number; filePath: string }>> {
  const schoolInfo = getSchoolInfo()
  const db = getDatabase()
  const results: Array<{ studentId: number; filePath: string }> = []

  for (const card of reportCards) {
    // Fetch student photo path
    const studentRow = db.prepare('SELECT photo_path FROM student WHERE id = ?').get(card.student_id) as { photo_path?: string } | undefined
    const studentPhoto = studentRow?.photo_path ? getImageAsBase64DataUrl(studentRow.photo_path) : undefined

    const html = buildReportCardHtml(card, schoolInfo, studentPhoto)
    const buffer = await renderHtmlToPdfBuffer(html)
    const filename = `${card.admission_number || card.student_id}_${Date.now()}.pdf`
    const filePath = resolveOutputPath(filename, path.join(REPORT_CARDS_DIR, folderLabel))
    writePdfBuffer(filePath, buffer)
    results.push({ studentId: card.student_id, filePath })
  }
  return results
}

export function getSchoolName(): string {
  const db = getDatabase()
  const row = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get() as { school_name?: string } | undefined
  return row?.school_name || 'School'
}

const REPORT_CARD_STYLES = `
    @page { size: A4; margin: 10mm 15mm; }
    :root {
      --primary: #1e3a8a; /* Navy Blue */
      --secondary: #64748b; /* Slate Gray */
      --accent: #f59e0b; /* Amber */
      --border: #e2e8f0;
      --bg-head: #eff6ff;
    }
    body { 
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      color: #0f172a; 
      line-height: 1.5; 
      font-size: 11px;
      max-width: 210mm;
      margin: 0 auto;
    }
    
    /* Utility Classes */
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .text-primary { color: var(--primary); }
    .text-sm { font-size: 10px; }
    .uppercase { text-transform: uppercase; }
    .w-full { width: 100%; }
    .tracking-wide { letter-spacing: 0.05em; }
    
    /* Header */
    .header { 
      display: flex; 
      gap: 20px; 
      border-bottom: 3px solid var(--primary); 
      padding-bottom: 20px; 
      margin-bottom: 25px; 
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .logo-container {
      flex: 0 0 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-img { 
      max-width: 100px; 
      max-height: 100px; 
      object-fit: contain; 
    }
    .school-info { 
      text-align: center; 
      flex: 1; 
    }
    .school-name { 
      font-size: 26px; 
      font-weight: 800; 
      color: var(--primary); 
      margin-bottom: 5px; 
      line-height: 1.1;
    }
    .school-motto { 
      font-family: 'Georgia', serif; 
      font-style: italic; 
      color: var(--secondary); 
      font-size: 13px; 
      margin-bottom: 8px;
    }
    .contact-info { 
      font-size: 10px; 
      color: #475569; 
    }

    /* Report Title */
    .report-title-banner {
      background-color: var(--primary);
      color: white;
      padding: 8px;
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 25px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    /* Student Details Grid */
    .student-grid {
      display: grid;
      grid-template-columns: 110px 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background-color: #f8fafc;
    }
    .photo-frame {
      width: 110px;
      height: 130px;
      border: 3px solid #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
      background-color: #e2e8f0;
      border-radius: 4px;
    }
    .photo-img { width: 100%; height: 100%; object-fit: cover; }
    .details-col { display: flex; flex-direction: column; justify-content: center; gap: 8px; }
    .detail-row { display: flex; border-bottom: 1px dashed #cbd5e0; padding-bottom: 4px; }
    .detail-label { width: 100px; font-weight: 600; color: #64748b; font-size: 11px; }
    .detail-val { font-weight: 700; color: #0f172a; font-size: 12px; }

    /* Academic Table */
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      color: var(--primary);
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      border-bottom: 2px solid var(--border);
      padding-bottom: 5px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    th { 
      background-color: var(--bg-head); 
      color: var(--primary); 
      font-weight: 700; 
      padding: 10px 8px; 
      text-align: center; 
      border: 1px solid #dbeafe; 
      font-size: 10px;
    }
    th.text-left { text-align: left; }
    td { border: 1px solid var(--border); font-size: 11px; vertical-align: middle; }
    tr.bg-gray-50 { background-color: #f8fafc; }

    /* Summary & Attendance */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .grading-key { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; font-size: 9px; }
    .grading-key table { margin: 0; box-shadow: none; }
    .attendance-card {
      background-color: var(--bg-head);
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 15px;
    }
    .att-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
    .att-label { color: var(--secondary); }
    .att-val { font-weight: 700; color: var(--primary); }

    /* Footer / Signatures */
    .footer { margin-top: 40px; page-break-inside: avoid; }
    .remarks-box {
      position: relative;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 25px 15px 15px;
      margin-bottom: 20px;
      background-color: #fff;
    }
    .remarks-label {
      position: absolute;
      top: -10px;
      left: 15px;
      background: #fff;
      padding: 0 8px;
      font-weight: 700;
      color: var(--primary);
      font-size: 11px;
    }
    .signatures-row {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
      gap: 40px;
    }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { 
      border-top: 2px solid #cbd5e0; 
      padding-top: 8px; 
      font-weight: 600; 
      font-size: 11px; 
      color: #475569;
    }
    .closing-line {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 30px;
      font-style: italic;
    }
`

function renderGradeTable(subjectsRows: string, card: StudentReportCard): string {
  return `
      <table>
        <thead>
          <tr>
            <th class="text-left" style="width: 30%">LEARNING AREA</th>
            <th style="width: 8%">CAT 1</th>
            <th style="width: 8%">CAT 2</th>
            <th style="width: 8%">MID</th>
            <th style="width: 8%">END</th>
            <th style="width: 8%">AVG</th>
            <th style="width: 8%">GRADE</th>
            <th class="text-left" style="width: 22%">TEACHER'S REMARKS</th>
          </tr>
        </thead>
        <tbody>
          ${subjectsRows}
          <tr style="background-color: var(--primary); color: white; font-weight: bold;">
            <td class="text-right" colspan="5" style="border-color: var(--primary); padding: 8px;">OVERALL SCORE / MEAN GRADE</td>
            <td class="text-center" style="border-color: var(--primary);">${card.average_marks.toFixed(1)}%</td>
            <td class="text-center" style="border-color: var(--primary); font-size: 12px;">${card.overall_grade}</td>
            <td style="border-color: var(--primary);">Points: ${card.average_points?.toFixed(2) || '-'}</td>
          </tr>
        </tbody>
      </table>
    `
}

export function buildReportCardHtml(card: StudentReportCard, schoolInfo: SchoolInfo, studentPhoto?: string | null): string {
  const subjectsRows = card.subjects.map((subject, index) => `
        <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="px-3 py-2 text-left border-r border-gray-200 font-medium">${subject.subject_name}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 text-gray-600">${subject.cat1 ?? '-'}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 text-gray-600">${subject.cat2 ?? '-'}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 text-gray-600">${subject.mid ?? '-'}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 text-gray-600">${subject.final ?? '-'}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 font-semibold">${subject.marks.toFixed(0)}</td>
            <td class="px-3 py-2 text-center border-r border-gray-200 font-bold text-blue-800">${subject.grade}</td>
            <td class="px-3 py-2 text-left text-sm italic text-gray-600">${subject.teacher_comment || '-'}</td>
        </tr>
    `).join('')

  // Date formatting
  const generatedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const nextTermDate = card.next_term_begin_date ? new Date(card.next_term_begin_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>${REPORT_CARD_STYLES}</style>
        </head>
        <body>
          
          <div class="header">
            <div class="logo-container">
              ${schoolInfo.logoDataUrl
      ? `<img src="${schoolInfo.logoDataUrl}" class="logo-img" alt="Logo" />`
      : '<div style="font-size:10px;color:#cbd5e0;border:1px dashed #ccc;width:80px;height:80px;display:flex;align-items:center;justify-content:center;">Logo</div>'}
            </div>
            <div class="school-info">
              <div class="school-name">${schoolInfo.name}</div>
              <div class="school-motto">"${schoolInfo.motto || 'Education for Eternity'}"</div>
              <div class="contact-info">
                Box 123, Mwingi • Tel: +254 700 000 000 • Email: info@mwingiadventist.ac.ke
              </div>
            </div>
          </div>

          <div class="report-title-banner">Competency Based Assessment Report</div>

          <div class="student-grid">
            <div class="photo-frame">
              ${studentPhoto
      ? `<img src="${studentPhoto}" class="photo-img" />`
      : '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;">NO PHOTO</div>'}
            </div>
            <div class="details-col">
              <div class="detail-row"><span class="detail-label">NAME:</span><span class="detail-val uppercase">${card.student_name}</span></div>
              <div class="detail-row"><span class="detail-label">ADM NO:</span><span class="detail-val">${card.admission_number}</span></div>
              <div class="detail-row"><span class="detail-label">GRADE:</span><span class="detail-val uppercase">${card.stream_name}</span></div>
            </div>
            <div class="details-col">
              <div class="detail-row"><span class="detail-label">TERM:</span><span class="detail-val">${card.term_name} ${card.academic_year}</span></div>
              <div class="detail-row"><span class="detail-label">POSITION:</span><span class="detail-val text-primary">${card.position_in_class || '-'}</span></div>
              <div class="detail-row"><span class="detail-label">GENERATED:</span><span class="detail-val">${generatedDate}</span></div>
            </div>
          </div>

          <div class="section-header">Academic Performance</div>
          ${renderGradeTable(subjectsRows, card)}

          <div class="bottom-grid">
            <div class="grading-key">
              <div style="background:var(--bg-head);padding:5px 8px;font-weight:bold;color:var(--primary);border-bottom:1px solid var(--border);">GRADING SYSTEM</div>
              <table>
                <tr style="background:white;"><td style="border:none;padding:4px;"><strong>EE</strong> (75-100)</td><td style="border:none;padding:4px;">Exceeding Expectations</td></tr>
                <tr style="background:white;"><td style="border:none;padding:4px;"><strong>ME</strong> (50-74)</td><td style="border:none;padding:4px;">Meeting Expectations</td></tr>
                <tr style="background:white;"><td style="border:none;padding:4px;"><strong>AE</strong> (25-49)</td><td style="border:none;padding:4px;">Approaching Expectations</td></tr>
                <tr style="background:white;"><td style="border:none;padding:4px;"><strong>BE</strong> (0-24)</td><td style="border:none;padding:4px;">Below Expectations</td></tr>
              </table>
            </div>

            <div class="attendance-card">
              <div style="font-weight:bold;color:var(--primary);margin-bottom:10px;text-transform:uppercase;">Attendance Record</div>
              <div class="att-row"><span class="att-label">Days Present</span><span class="att-val">${card.days_present}</span></div>
              <div class="att-row"><span class="att-label">Days Absent</span><span class="att-val">${card.days_absent}</span></div>
              <div class="att-row" style="margin-top:8px;border-top:1px solid #bfdbfe;padding-top:8px;">
                <span class="att-label">Percentage</span><span class="att-val">${card.attendance_percentage.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="remarks-box">
              <span class="remarks-label">CLASS TEACHER'S REMARKS</span>
              <p style="margin:0;font-style:italic;">${card.class_teacher_comment || 'A good performance.'}</p>
            </div>
            
            <div class="remarks-box">
              <span class="remarks-label">HEADTEACHER'S REMARKS</span>
              <p style="margin:0;font-style:italic;">${card.principal_comment || 'Promoted to the next grade.'}</p>
            </div>

            <div class="signatures-row">
              <div class="sig-block">
                <div style="margin-bottom:5px;">${generatedDate}</div>
                <div class="sig-line">Date</div>
              </div>
               <div class="sig-block">
                <div style="height:20px;"></div>
                <div class="sig-line">Class Teacher's Signature</div>
              </div>
              <div class="sig-block">
                <div style="height:20px;"></div>
                <div class="sig-line">Principal's Signature & Stamp</div>
              </div>
            </div>
            
            <div class="closing-line">
               ${card.next_term_begin_date ? `Next Term Begins on: <strong>${nextTermDate}</strong>` : ''} 
               ${card.fees_balance > 0 ? ` • Outstanding Balance: <strong style="color:#ef4444">KES ${card.fees_balance.toLocaleString()}</strong>` : ''}
            </div>
            <div class="closing-line" style="margin-top: 5px;">
              This document was generated electronically by Mwingi School ERP.
            </div>
          </div>

        </body>
      </html>
    `
}

async function getGuardianEmail(studentId: number): Promise<string | null> {
  const db = getDatabase()
  const row = db.prepare('SELECT guardian_email FROM student WHERE id = ?').get(studentId) as { guardian_email?: string } | undefined
  return row?.guardian_email || null
}
