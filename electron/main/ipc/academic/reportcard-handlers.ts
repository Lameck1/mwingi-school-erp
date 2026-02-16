import * as fs from 'node:fs'
import * as path from 'node:path'
import nodemailer from 'nodemailer'
import { PDFDocument } from 'pdf-lib'

import { getDatabase } from '../../database'
import { shell } from '../../electron-env'
import { getSession } from '../../security/session'
import { container } from '../../services/base/ServiceContainer'
import { ConfigService } from '../../services/ConfigService'
import { renderHtmlToPdfBuffer, resolveOutputPath, writePdfBuffer } from '../../utils/pdf'
import { ROLES, safeHandleRawWithRole } from '../ipc-result'

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
    safeHandleRawWithRole('report-card:getSubjects', ROLES.STAFF, (_event, examId?: number) => {
        try {
            const db = getDatabase()
            // Return subjects that have results for the given exam, or all active subjects
            if (examId) {
                return db.prepare(
                    `SELECT DISTINCT s.id, s.name, s.code
                     FROM subject s
                     JOIN exam_result er ON er.subject_id = s.id
                     WHERE er.exam_id = ? AND s.is_active = 1
                     ORDER BY s.name`
                ).all(examId)
            }
            return db.prepare(
                `SELECT id, name, code FROM subject WHERE is_active = 1 ORDER BY name`
            ).all()
        } catch (error) {
            console.error('Failed to get subjects:', error)
            return []
        }
    })

    safeHandleRawWithRole('report-card:get', ROLES.STAFF, (_event, examId: number, studentId: number) => {
        return getCbcService().getReportCard(examId, studentId)
    })

    safeHandleRawWithRole('report-card:generate', ROLES.STAFF, async (_event, studentId: number, examId: number) => {
        const userId = await getSessionUserId()
        return getCbcService().generateReportCard(studentId, examId, userId)
    })

    safeHandleRawWithRole('report-card:generateBatch', ROLES.STAFF, async (_event, data: { exam_id: number; stream_id: number }) => {
        const userId = await getSessionUserId()
        const result = await getCbcService().generateBatchReportCards(data.exam_id, data.stream_id, userId)
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
    safeHandleRawWithRole('report-card:emailReports', ROLES.STAFF, async (
        _event,
        data: { exam_id: number; stream_id: number; template_id: string; include_sms: boolean }
    ) => {
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
    safeHandleRawWithRole('report-card:mergePDFs', ROLES.STAFF, async (_event, data: { exam_id: number; stream_id: number; output_path: string }) => {
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
    safeHandleRawWithRole('report-card:downloadReports', ROLES.STAFF, async (_event, data: { exam_id: number; stream_id: number; merge: boolean }) => {
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

    safeHandleRawWithRole('report-card:openFile', ROLES.STAFF, async (_event, filePath: string) => {
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
    safeHandleRawWithRole('reportcard:getSubjects', ROLES.STAFF, () => {
        return getLegacyService().getSubjects()
    })

    safeHandleRawWithRole('reportcard:getStudentGrades', ROLES.STAFF, (
        _event,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return getLegacyService().getStudentGrades(studentId, academicYearId, termId)
    })

    safeHandleRawWithRole('reportcard:generate', ROLES.STAFF, (
        _event,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return getLegacyService().generateReportCard(studentId, academicYearId, termId)
    })

    safeHandleRawWithRole('reportcard:getStudentsForGeneration', ROLES.STAFF, (
        _event,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        return getLegacyService().getStudentsForReportCards(streamId, academicYearId, termId)
    })
}

async function generateReportCardPdfs(reportCards: StudentReportCard[], folderLabel: string): Promise<Array<{ studentId: number; filePath: string }>> {
    const schoolName = getSchoolName()
    const results: Array<{ studentId: number; filePath: string }> = []
    for (const card of reportCards) {
        const html = buildReportCardHtml(card, schoolName)
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

export function buildReportCardHtml(card: StudentReportCard, schoolName: string): string {
    const subjectsRows = card.subjects.map(subject => `
        <tr>
            <td>${subject.subject_name}</td>
            <td class="center">${subject.marks}</td>
            <td class="center">${subject.percentage.toFixed(1)}%</td>
            <td class="center grade">${subject.grade}</td>
            <td class="center">${subject.points.toFixed(1)}</td>
            <td>${subject.competency_level}</td>
            <td>${subject.teacher_comment || '-'}</td>
        </tr>
    `).join('')

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px 28px; font-size: 11px; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 3px double #1a5276; padding-bottom: 10px; }
            .school-name { font-size: 22px; font-weight: bold; color: #1a5276; text-transform: uppercase; letter-spacing: 1px; }
            .school-motto { font-size: 10px; color: #666; margin-top: 2px; font-style: italic; }
            .report-title { font-size: 14px; font-weight: bold; margin-top: 6px; color: #2c3e50; text-transform: uppercase; background: #eaf2f8; padding: 4px 12px; display: inline-block; border-radius: 3px; }
            .student-info { display: flex; flex-wrap: wrap; gap: 0; margin: 10px 0; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 8px 12px; }
            .info-item { width: 50%; font-size: 11px; padding: 2px 0; }
            .info-item strong { color: #2c3e50; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; }
            th, td { border: 1px solid #cbd5e0; padding: 5px 6px; font-size: 10.5px; }
            th { background: #1a5276; color: white; text-align: center; font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
            td.center { text-align: center; }
            td.grade { font-weight: bold; color: #1a5276; }
            .summary-row td { background: #eaf2f8; font-weight: bold; }
            .section-title { font-size: 12px; font-weight: bold; color: #1a5276; margin: 12px 0 4px; border-bottom: 1px solid #1a5276; padding-bottom: 2px; text-transform: uppercase; }
            .comments-section { margin: 10px 0; }
            .comment-box { border: 1px solid #dee2e6; padding: 6px 10px; margin-bottom: 6px; border-radius: 3px; min-height: 36px; }
            .comment-label { font-weight: bold; color: #2c3e50; font-size: 10.5px; margin-bottom: 2px; }
            .signature-line { margin-top: 8px; display: flex; justify-content: space-between; }
            .sig-item { width: 45%; }
            .sig-line { border-bottom: 1px solid #333; margin-top: 20px; }
            .sig-label { font-size: 9px; color: #666; margin-top: 2px; }
            .grading-key { margin-top: 10px; }
            .grading-key table { font-size: 9.5px; }
            .grading-key th { background: #2c3e50; font-size: 9px; }
            .grading-key td { padding: 3px 6px; }
            .attendance-row { display: flex; gap: 20px; margin: 6px 0; font-size: 11px; }
            .att-item strong { color: #2c3e50; }
            .overall-box { display: flex; gap: 12px; margin: 6px 0; padding: 6px 10px; background: #eaf2f8; border-radius: 4px; border: 1px solid #1a5276; }
            .overall-item { font-size: 11px; }
            .overall-item .value { font-weight: bold; font-size: 13px; color: #1a5276; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="school-name">${schoolName}</div>
            <div class="school-motto">Excellence in Education</div>
            <div class="report-title">CBC Report Card</div>
          </div>

          <div class="student-info">
            <div class="info-item"><strong>Student Name:</strong> ${card.student_name}</div>
            <div class="info-item"><strong>Adm No:</strong> ${card.admission_number}</div>
            <div class="info-item"><strong>Grade/Stream:</strong> ${card.stream_name}</div>
            <div class="info-item"><strong>Term:</strong> ${card.term_name}</div>
            <div class="info-item"><strong>Academic Year:</strong> ${card.academic_year}</div>
            <div class="info-item"><strong>Position:</strong> ${card.position_in_class}</div>
          </div>

          <div class="section-title">Subject Performance</div>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
                <th>Percent</th>
                <th>Grade</th>
                <th>Points</th>
                <th>Performance Level</th>
                <th>Teacher's Comment</th>
              </tr>
            </thead>
            <tbody>
              ${subjectsRows}
              <tr class="summary-row">
                <td><strong>TOTAL / AVERAGE</strong></td>
                <td class="center">${card.total_marks}</td>
                <td class="center">${card.average_marks.toFixed(1)}%</td>
                <td class="center grade">${card.overall_grade}</td>
                <td class="center">${card.total_points?.toFixed(1) || '-'}</td>
                <td colspan="2" class="center">Average Points: ${card.average_points?.toFixed(2) || '-'}</td>
              </tr>
            </tbody>
          </table>

          <div class="attendance-row">
            <div class="att-item"><strong>Days Present:</strong> ${card.days_present}</div>
            <div class="att-item"><strong>Days Absent:</strong> ${card.days_absent}</div>
            <div class="att-item"><strong>Attendance:</strong> ${card.attendance_percentage.toFixed(1)}%</div>
          </div>

          <div class="comments-section">
            <div class="section-title">Comments</div>
            <div class="comment-box">
              <div class="comment-label">Class Teacher's Comment:</div>
              <div>${card.class_teacher_comment || ''}</div>
            </div>
            <div class="comment-box">
              <div class="comment-label">Headteacher's Comment:</div>
              <div>${card.principal_comment || ''}</div>
            </div>
          </div>

          ${card.fees_balance > 0 ? `<p style="margin: 6px 0; color: #c0392b;"><strong>Fee Balance:</strong> KES ${card.fees_balance.toLocaleString()}</p>` : ''}
          ${card.next_term_begin_date ? `<p style="margin: 4px 0;"><strong>Next Term Begins:</strong> ${card.next_term_begin_date}</p>` : ''}

          <div class="signature-line">
            <div class="sig-item">
              <div class="sig-line"></div>
              <div class="sig-label">Class Teacher's Signature / Date</div>
            </div>
            <div class="sig-item">
              <div class="sig-line"></div>
              <div class="sig-label">Parent / Guardian Signature / Date</div>
            </div>
          </div>

          <div class="grading-key">
            <div class="section-title">Grading Key</div>
            <table>
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Marks Range</th>
                  <th>Points</th>
                  <th>Performance Level</th>
                </tr>
              </thead>
              <tbody>
                <tr><td class="center">EE1</td><td class="center">90–100</td><td class="center">4.0</td><td>Exceeding Expectation</td></tr>
                <tr><td class="center">EE2</td><td class="center">75–89</td><td class="center">3.5</td><td>Exceeding Expectation</td></tr>
                <tr><td class="center">ME1</td><td class="center">58–74</td><td class="center">3.0</td><td>Meeting Expectation</td></tr>
                <tr><td class="center">ME2</td><td class="center">41–57</td><td class="center">2.5</td><td>Meeting Expectation</td></tr>
                <tr><td class="center">AE1</td><td class="center">31–40</td><td class="center">2.0</td><td>Approaching Expectation</td></tr>
                <tr><td class="center">AE2</td><td class="center">21–30</td><td class="center">1.5</td><td>Approaching Expectation</td></tr>
                <tr><td class="center">BE1</td><td class="center">11–20</td><td class="center">1.0</td><td>Below Expectation</td></tr>
                <tr><td class="center">BE2</td><td class="center">1–10</td><td class="center">0.5</td><td>Below Expectation</td></tr>
              </tbody>
            </table>
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
