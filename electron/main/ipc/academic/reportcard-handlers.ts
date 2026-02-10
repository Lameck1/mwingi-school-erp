import * as fs from 'node:fs'
import * as path from 'node:path'
import nodemailer from 'nodemailer'
import { PDFDocument } from 'pdf-lib'

import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'
import { getSession } from '../../security/session'
import { CBCReportCardService, type StudentReportCard } from '../../services/academic/CBCReportCardService'
import { ReportCardService } from '../../services/academic/ReportCardService'
import { ConfigService } from '../../services/ConfigService'
import { renderHtmlToPdfBuffer, resolveOutputPath, writePdfBuffer } from '../../utils/pdf'

import type { IpcMainInvokeEvent } from 'electron'



const cbcService = new CBCReportCardService()
const legacyService = new ReportCardService()
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
    return session?.user.id ?? 0
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
    const reportCards = await cbcService.generateBatchReportCards(examId, streamId, userId)
    const files = await generateReportCardPdfs(reportCards, `exam_${examId}_stream_${streamId}`)
    return { files, userId }
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
    ipcMain.handle('report-card:getSubjects', async () => [])

    ipcMain.handle('report-card:get', async (_event: IpcMainInvokeEvent, examId: number, studentId: number) => {
        return cbcService.getReportCard(examId, studentId)
    })

    ipcMain.handle('report-card:generate', async (_event: IpcMainInvokeEvent, studentId: number, examId: number) => {
        const userId = await getSessionUserId()
        return cbcService.generateReportCard(studentId, examId, userId)
    })

    ipcMain.handle('report-card:generateBatch', async (_event: IpcMainInvokeEvent, data: { exam_id: number; stream_id: number }) => {
        const userId = await getSessionUserId()
        const result = await cbcService.generateBatchReportCards(data.exam_id, data.stream_id, userId)
        return { success: true, generated: result.length, failed: 0 }
    })
}

function registerCbcEmailHandlers(): void {
    ipcMain.handle('report-card:emailReports', async (
        _event: IpcMainInvokeEvent,
        data: { exam_id: number; stream_id: number; template_id: string; include_sms: boolean }
    ) => {
        try {
            const { config, error } = resolveSmtpConfig()
            if (!config) {
                return { success: false, sent: 0, failed: 0, message: error }
            }

            const { files } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
            const { sent, failed } = await sendReportCardEmails(files, config)
            return { success: true, sent: sent.length, failed: failed.length }
        } catch (error) {
            console.error('Email report cards failed:', error)
            return { success: false, sent: 0, failed: 0, message: error instanceof Error ? error.message : UNKNOWN_ERROR }
        }
    })
}

function registerCbcMergeHandlers(): void {
    ipcMain.handle('report-card:mergePDFs', async (_event: IpcMainInvokeEvent, data: { exam_id: number; stream_id: number; output_path: string }) => {
        try {
            const { files } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
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

            return { success: true, message: 'Merged', filePath }
        } catch (error) {
            console.error('Merge report cards failed:', error)
            return { success: false, message: error instanceof Error ? error.message : UNKNOWN_ERROR }
        }
    })
}

function registerCbcDownloadHandlers(): void {
    ipcMain.handle('report-card:downloadReports', async (_event: IpcMainInvokeEvent, data: { exam_id: number; stream_id: number; merge: boolean }) => {
        try {
            const { files } = await generateBatchReportCardFiles(data.exam_id, data.stream_id)
            if (!data.merge) {
                return { success: true, files: files.map(f => f.filePath) }
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
            return { success: true, filePath }
        } catch (error) {
            console.error('Download report cards failed:', error)
            return { success: false, message: error instanceof Error ? error.message : UNKNOWN_ERROR }
        }
    })
}

function registerLegacyReportCardHandlers(): void {
    // Legacy report card handlers for term/year-based report cards (used in Reports > Report Cards)
    ipcMain.handle('reportcard:getSubjects', async () => {
        return legacyService.getSubjects()
    })

    ipcMain.handle('reportcard:getStudentGrades', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return legacyService.getStudentGrades(studentId, academicYearId, termId)
    })

    ipcMain.handle('reportcard:generate', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        academicYearId: number,
        termId: number
    ) => {
        return legacyService.generateReportCard(studentId, academicYearId, termId)
    })

    ipcMain.handle('reportcard:getStudentsForGeneration', async (
        _event: IpcMainInvokeEvent,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        return legacyService.getStudentsForReportCards(streamId, academicYearId, termId)
    })
}

async function generateReportCardPdfs(reportCards: StudentReportCard[], folderLabel: string): Promise<Array<{ studentId: number; filePath: string }>> {
    const results: Array<{ studentId: number; filePath: string }> = []
    for (const card of reportCards) {
        const html = buildReportCardHtml(card)
        const buffer = await renderHtmlToPdfBuffer(html)
        const filename = `${card.admission_number || card.student_id}_${Date.now()}.pdf`
        const filePath = resolveOutputPath(filename, path.join(REPORT_CARDS_DIR, folderLabel))
        writePdfBuffer(filePath, buffer)
        results.push({ studentId: card.student_id, filePath })
    }
    return results
}

function buildReportCardHtml(card: StudentReportCard): string {
    const subjectsRows = card.subjects.map(subject => `
        <tr>
            <td>${subject.subject_name}</td>
            <td>${subject.marks}</td>
            <td>${subject.grade}</td>
            <td>${subject.teacher_comment}</td>
        </tr>
    `).join('')

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p { font-size: 12px; color: #4b5563; margin: 0 0 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 6px; font-size: 12px; }
            th { background: #f3f4f6; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Report Card</h1>
          <p><strong>Student:</strong> ${card.student_name} (${card.admission_number})</p>
          <p><strong>Stream:</strong> ${card.stream_name}</p>
          <p><strong>Academic Year:</strong> ${card.academic_year} | <strong>Term:</strong> ${card.term_name}</p>
          <p><strong>Average:</strong> ${card.average_marks.toFixed(2)} | <strong>Grade:</strong> ${card.overall_grade}</p>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
                <th>Grade</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              ${subjectsRows}
            </tbody>
          </table>
        </body>
      </html>
    `
}

async function getGuardianEmail(studentId: number): Promise<string | null> {
    const db = getDatabase()
    const row = db.prepare('SELECT guardian_email FROM student WHERE id = ?').get(studentId) as { guardian_email?: string } | undefined
    return row?.guardian_email || null
}
