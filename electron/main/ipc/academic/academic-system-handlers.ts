import { jsPDF } from 'jspdf'
import fs from 'node:fs'
import path from 'node:path'

import { getDatabase } from '../../database'
import { app } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

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
    safeHandleRawWithRole('academic:getSubjects', ROLES.STAFF, () => getService().getAllSubjects())
    safeHandleRawWithRole('academic:getSubjectsAdmin', ROLES.STAFF, () => getService().getAllSubjectsAdmin())
    safeHandleRawWithRole('academic:createSubject', ROLES.STAFF, (event, data: SubjectCreateData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().createSubject(data, actor.actorId)
    })
    safeHandleRawWithRole('academic:updateSubject', ROLES.STAFF, (event, id: number, data: SubjectUpdateData, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().updateSubject(id, data, actor.actorId)
    })
    safeHandleRawWithRole('academic:setSubjectActive', ROLES.STAFF, (event, id: number, isActive: boolean, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().setSubjectActive(id, isActive, actor.actorId)
    })
    safeHandleRawWithRole('academic:getExams', ROLES.STAFF, (_event, academicYearId: number, termId: number) => {
        return getService().getAllExams(academicYearId, termId)
    })
    safeHandleRawWithRole('academic:createExam', ROLES.STAFF, (event, data: unknown, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().createExam(data as CreateExamDTO, actor.actorId)
    })
    safeHandleRawWithRole('academic:deleteExam', ROLES.STAFF, (event, id: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().deleteExam(id, actor.actorId)
    })
}

function registerAllocationAndResultsHandlers(): void {
    safeHandleRawWithRole('academic:allocateTeacher', ROLES.STAFF, (event, data: unknown, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().allocateTeacher(data as Omit<SubjectAllocation, 'id'>, actor.actorId)
    })
    safeHandleRawWithRole('academic:getAllocations', ROLES.STAFF, (_event, academicYearId: number, termId: number, streamId?: number) => {
        return getService().getAllocations(academicYearId, termId, streamId)
    })
    safeHandleRawWithRole('academic:deleteAllocation', ROLES.STAFF, (event, allocationId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().deleteAllocation(allocationId, actor.actorId)
    })
    safeHandleRawWithRole('academic:saveResults', ROLES.STAFF, (event, examId: number, results: unknown[], legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().saveResults(examId, results as Omit<ExamResult, 'id' | 'exam_id'>[], actor.actorId)
    })
    safeHandleRawWithRole('academic:getResults', ROLES.STAFF, (event, examId: number, subjectId: number, streamId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().getResults(examId, subjectId, streamId, actor.actorId)
    })
    safeHandleRawWithRole('academic:processResults', ROLES.STAFF, (event, examId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().processResults(examId, actor.actorId)
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
    safeHandleRawWithRole('academic:generateCertificate', ROLES.STAFF, (_event, data: CertificatePayload) => {
        return generateCertificateFile(data)
    })

    safeHandleRawWithRole('academic:emailParents', ROLES.STAFF, (event, data: EmailParentsPayload, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return sendParentNotifications(data, actor.actorId)
    })
}

export function registerAcademicSystemHandlers(): void {
    registerSubjectAndExamHandlers()
    registerAllocationAndResultsHandlers()
    registerCertificateAndEmailHandlers()
}
