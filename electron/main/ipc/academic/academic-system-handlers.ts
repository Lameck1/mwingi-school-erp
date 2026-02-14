import { jsPDF } from 'jspdf'
import fs from 'node:fs'
import path from 'node:path'

import { getDatabase } from '../../database'
import { app } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

import type {
    CreateExamDTO,
    SubjectAllocation,
    ExamResult,
    SubjectCreateData,
    SubjectUpdateData
} from '../../services/academic/AcademicSystemService'

const getService = () => container.resolve('AcademicSystemService')
const getNotificationService = () => container.resolve('NotificationService')

interface CertificatePayload {
    studentId: number
    studentName: string
    awardCategory: string
    academicYearId: number
    improvementPercentage: number
}

interface EmailParentsPayload {
    students: Array<{ student_id: number; student_name: string; improvement_percentage: number }>
    awardCategory: string
    templateType: string
}

function registerSubjectAndExamHandlers(): void {
    safeHandleRaw('academic:getSubjects', () => getService().getAllSubjects())
    safeHandleRaw('academic:getSubjectsAdmin', () => getService().getAllSubjectsAdmin())
    safeHandleRaw('academic:createSubject', (_event, data: SubjectCreateData, userId: number) => {
        return getService().createSubject(data, userId)
    })
    safeHandleRaw('academic:updateSubject', (_event, id: number, data: SubjectUpdateData, userId: number) => {
        return getService().updateSubject(id, data, userId)
    })
    safeHandleRaw('academic:setSubjectActive', (_event, id: number, isActive: boolean, userId: number) => {
        return getService().setSubjectActive(id, isActive, userId)
    })
    safeHandleRaw('academic:getExams', (_event, academicYearId: number, termId: number) => {
        return getService().getAllExams(academicYearId, termId)
    })
    safeHandleRaw('academic:createExam', (_event, data: unknown, userId: number) => {
        return getService().createExam(data as CreateExamDTO, userId)
    })
    safeHandleRaw('academic:deleteExam', (_event, id: number, userId: number) => {
        return getService().deleteExam(id, userId)
    })
}

function registerAllocationAndResultsHandlers(): void {
    safeHandleRaw('academic:allocateTeacher', (_event, data: unknown, userId: number) => {
        return getService().allocateTeacher(data as Omit<SubjectAllocation, 'id'>, userId)
    })
    safeHandleRaw('academic:getAllocations', (_event, academicYearId: number, termId: number, streamId?: number) => {
        return getService().getAllocations(academicYearId, termId, streamId)
    })
    safeHandleRaw('academic:deleteAllocation', (_event, allocationId: number, userId: number) => {
        return getService().deleteAllocation(allocationId, userId)
    })
    safeHandleRaw('academic:saveResults', (_event, examId: number, results: unknown[], userId: number) => {
        return getService().saveResults(examId, results as Omit<ExamResult, 'id' | 'exam_id'>[], userId)
    })
    safeHandleRaw('academic:getResults', (_event, examId: number, subjectId: number, streamId: number, userId: number) => {
        return getService().getResults(examId, subjectId, streamId, userId)
    })
    safeHandleRaw('academic:processResults', (_event, examId: number, userId: number) => {
        return getService().processResults(examId, userId)
    })
}

function generateCertificateFile(data: CertificatePayload): { filePath: string; success: boolean } {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const finalY = renderCertificateContent(doc, data, pageWidth)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, finalY, { align: 'center' })
    const filePath = saveCertificatePdf(doc, data.studentId)
    return { success: true, filePath }
}

function renderCertificateContent(doc: jsPDF, data: CertificatePayload, pageWidth: number): number {
    let y = 30
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(26)
    doc.text('Certificate of Achievement', pageWidth / 2, y, { align: 'center' })
    y += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.text('This certificate is proudly presented to', pageWidth / 2, y, { align: 'center' })
    y += 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text(data.studentName, pageWidth / 2, y, { align: 'center' })
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.text(`for outstanding improvement in ${data.awardCategory.replaceAll('_', ' ')}`, pageWidth / 2, y, { align: 'center' })
    y += 10
    doc.text(`Improvement: ${data.improvementPercentage.toFixed(1)}%`, pageWidth / 2, y, { align: 'center' })
    y += 15
    doc.setFontSize(11)
    // Look up the academic year name for display
    const yearRow = getDatabase().prepare(
        'SELECT year_name FROM academic_year WHERE id = ?'
    ).get(data.academicYearId) as { year_name: string } | undefined;
    const yearLabel = yearRow?.year_name ?? `Year ${data.academicYearId}`;
    doc.text(`Academic Year: ${yearLabel}`, pageWidth / 2, y, { align: 'center' })
    return y + 8
}

function saveCertificatePdf(doc: jsPDF, studentId: number): string {
    const certificatesDir = path.join(app.getPath('userData'), 'certificates')
    if (!fs.existsSync(certificatesDir)) {
        fs.mkdirSync(certificatesDir, { recursive: true })
    }

    const filename = `certificate-${studentId}-${Date.now()}.pdf`
    const filePath = path.join(certificatesDir, filename)
    const pdfBytes = doc.output('arraybuffer')
    fs.writeFileSync(filePath, Buffer.from(pdfBytes))
    return filePath
}

async function sendParentNotifications(data: EmailParentsPayload, userId: number): Promise<{ success: boolean; sent: number; failed: number; errors: string[] }> {
    const db = getDatabase()
    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const student of data.students) {
        const record = db.prepare('SELECT guardian_email, guardian_name FROM student WHERE id = ?').get(student.student_id) as { guardian_email?: string; guardian_name?: string } | undefined
        const email = record?.guardian_email
        if (!email) {
            failed += 1
            errors.push(`${student.student_name}: missing guardian email`)
            continue
        }

        const subject = `Recognition: ${student.student_name} - ${data.awardCategory.replaceAll('_', ' ')}`
        const message = `
                <p>Dear ${record.guardian_name || 'Parent/Guardian'},</p>
                <p>We are pleased to inform you that <strong>${student.student_name}</strong> has been recognized for outstanding improvement.</p>
                <p><strong>Award:</strong> ${data.awardCategory.replaceAll('_', ' ')}</p>
                <p><strong>Improvement:</strong> ${student.improvement_percentage.toFixed(1)}%</p>
                <p>Congratulations!</p>
            `

        const result = await getNotificationService().send({
            recipientType: 'GUARDIAN',
            recipientId: student.student_id,
            channel: 'EMAIL',
            to: email,
            subject,
            message
        }, userId)

        if (result.success) {
            sent += 1
            continue
        }
        failed += 1
        errors.push(`${student.student_name}: ${result.error || 'failed'}`)
    }

    return { success: failed === 0, sent, failed, errors }
}

function registerCertificateAndEmailHandlers(): void {
    safeHandleRaw('academic:generateCertificate', (_event, data: CertificatePayload) => {
        return generateCertificateFile(data)
    })

    safeHandleRaw('academic:emailParents', (_event, data: EmailParentsPayload, userId: number) => {
        return sendParentNotifications(data, userId)
    })
}

export function registerAcademicSystemHandlers(): void {
    registerSubjectAndExamHandlers()
    registerAllocationAndResultsHandlers()
    registerCertificateAndEmailHandlers()
}
