import { ipcMain } from 'electron'

import { getDatabase } from '../../database'
import { renderHtmlToPdfBuffer, resolveOutputPath, writePdfBuffer } from '../../utils/pdf'
import { ROLES } from '../ipc-result'
import {
    AcademicYearCreateSchema,
    AcademicYearActivateSchema,
    TermGetByYearSchema,
    ExamFiltersSchema,
    ExportPdfSchema,
    ScheduleGenerateSchema,
    ScheduleDetectClashesSchema,
    ScheduleExportPdfSchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

interface SchedulerSlot {
    id: number
    subject_id: number
    subject_name: string
    start_date: string
    end_date: string
    start_time: string
    end_time: string
    venue_id: number
    venue_name: string
    max_capacity: number
    enrolled_students: number
}

interface ScheduleStats {
    average_capacity_usage: number
    total_slots: number
    total_students: number
    venues_used: number
}

interface ScheduleResult {
    clashes: Array<unknown>
    slots: SchedulerSlot[]
    stats: ScheduleStats
}

const DEFAULT_SCHEDULE_STATS: ScheduleStats = {
    total_slots: 0,
    total_students: 0,
    venues_used: 0,
    average_capacity_usage: 0
}

const SCHEDULE_TIME_BLOCKS = [
    { start: '09:00', end: '11:00' },
    { start: '13:00', end: '15:00' }
]

const VENUE_TEMPLATE = [
    { id: 1, name: 'Main Hall' },
    { id: 2, name: 'Classroom A' },
    { id: 3, name: 'Classroom B' }
]

export function registerAcademicHandlers() {
    const db = getDatabase()

    // ==================== Academic Year & Terms ====================
    ipcMain.handle('academicYear:getAll', () => {
        return db.prepare('SELECT * FROM academic_year ORDER BY start_date DESC').all()
    })

    ipcMain.handle('academic-year:getAll', () => {
        return db.prepare('SELECT * FROM academic_year ORDER BY start_date DESC').all()
    })

    validatedHandler('academic-year:create', ROLES.ADMIN_ONLY, AcademicYearCreateSchema, async (_event, data) => {
        db.prepare(`
            INSERT INTO academic_year (year_name, start_date, end_date, is_current)
            VALUES (?, ?, ?, ?)
        `).run(data.year_name, data.start_date, data.end_date, data.is_current ? 1 : 0)
        return { success: true }
    })

    validatedHandlerMulti('academic-year:activate', ROLES.ADMIN_ONLY, AcademicYearActivateSchema, async (_event, [id]) => {
        db.transaction(() => {
            db.prepare('UPDATE academic_year SET is_current = 0').run()
            db.prepare('UPDATE academic_year SET is_current = 1 WHERE id = ?').run(id)
        })()
        return { success: true }
    })

    ipcMain.handle('term:getAll', () => {
        return db.prepare(`
            SELECT t.*, ay.year_name 
            FROM term t
            JOIN academic_year ay ON t.academic_year_id = ay.id
            ORDER BY ay.start_date DESC, t.term_number ASC
        `).all()
    })

    validatedHandlerMulti('term:getByYear', ROLES.STAFF, TermGetByYearSchema, async (_event, [academicYearId]) => {
        return db.prepare('SELECT * FROM term WHERE academic_year_id = ? ORDER BY term_number').all(academicYearId)
    })

    ipcMain.handle('academicYear:getCurrent', () => {
        return db.prepare('SELECT * FROM academic_year WHERE is_current = 1').get()
    })

    ipcMain.handle('academic-year:getCurrent', () => {
        return db.prepare('SELECT * FROM academic_year WHERE is_current = 1').get()
    })

    ipcMain.handle('term:getCurrent', () => {
        return db.prepare(`
            SELECT t.*, ay.year_name 
            FROM term t
            JOIN academic_year ay ON t.academic_year_id = ay.id
            WHERE ay.is_current = 1 AND t.is_current = 1
            LIMIT 1
        `).get() || db.prepare(`
            SELECT t.*, ay.year_name 
            FROM term t
            JOIN academic_year ay ON t.academic_year_id = ay.id
            WHERE ay.is_current = 1
            ORDER BY t.term_number DESC
            LIMIT 1
        `).get()
    })

    // ==================== Exams & Assessments ====================
    validatedHandler('exam:getAll', ROLES.STAFF, ExamFiltersSchema, async (_event, { academicYearId, termId }) => {
        let query = 'SELECT * FROM exam WHERE 1=1'
        const params: number[] = []

        if (academicYearId) {
            query += ' AND academic_year_id = ?'
            params.push(academicYearId)
        }
        if (termId) {
            query += ' AND term_id = ?'
            params.push(termId)
        }

        query += ' ORDER BY created_at DESC'
        return db.prepare(query).all(...params)
    })

    // Legacy mapping for frontend compatibility
    ipcMain.handle('academic:getExamsList', async (event, filters) => {
        // Reuse the logic from exam:getAll but mapped to safeHandleRaw style if needed
        // For now, implementing direct call
        let query = 'SELECT id, name FROM exam WHERE 1=1' // Changed academic_exam to exam
        const params: number[] = []

        if (filters?.academicYearId) {
            query += ' AND academic_year_id = ?'
            params.push(filters.academicYearId)
        }
        if (filters?.termId) {
            query += ' AND term_id = ?'
            params.push(filters.termId)
        }

        query += ' ORDER BY created_at DESC'
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('stream:getAll', () => {
        return db.prepare('SELECT * FROM stream WHERE is_active = 1 ORDER BY level_order').all()
    })

    ipcMain.handle('feeCategory:getAll', () => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })


    // ==================== PDF Generation Helper (Shared) ====================
    validatedHandler('report:exportPdf', ROLES.STAFF, ExportPdfSchema, async (_event, { html, content, filename }) => {
        try {
            // If raw content string provided, wrap in HTML
            const finalHtml = html || `
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>${content}</body>
                </html>
            `

            const buffer = await renderHtmlToPdfBuffer(finalHtml)
            const resolvedFilename = filename || `export_${Date.now()}.pdf`
            const filePath = resolveOutputPath(resolvedFilename, 'pdf')
            writePdfBuffer(filePath, buffer)
            return { success: true, filePath }

        } catch (error) {
            console.error('PDF Export Error:', error)
            throw new Error('Failed to generate PDF')
        }
    })

    // ==================== Exam Scheduling ====================

    validatedHandler('schedule:generate', ROLES.STAFF, ScheduleGenerateSchema, async (_event, data) => {
        return generateSchedule(db, data.examId, data.startDate, data.endDate)
    })

    validatedHandler('schedule:detectClashes', ROLES.STAFF, ScheduleDetectClashesSchema, async (_event, data) => {
        if (!data.examId) { return [] }
        const generated = await generateSchedule(db, data.examId)
        return detectClashes(db, data.examId, generated.slots)
    })

    validatedHandler('schedule:exportPdf', ROLES.STAFF, ScheduleExportPdfSchema, async (_event, data) => {
        if (!data.slots || data.slots.length === 0) {
            throw new Error('No schedule data to export')
        }

        const rows = (data.slots as unknown as SchedulerSlot[]).map(s => `
            <tr>
                <td>${s.subject_name}</td>
                <td>${s.start_date}</td>
                <td>${s.start_time} - ${s.end_time}</td>
                <td>${s.venue_name}</td>
            </tr>
        `).join('')

        const html = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
            <h1>Exam Timetable</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Venue</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            </body>
            </html>
        `
        const buffer = await renderHtmlToPdfBuffer(html)
        const filename = `exam_timetable_${data.examId || 'export'}.pdf`
        const filePath = resolveOutputPath(filename, 'timetables')
        writePdfBuffer(filePath, buffer)
        return { success: true, filePath }
    })

    // Alias for consistency
    validatedHandler('schedule:exportPDF', ROLES.STAFF, ScheduleExportPdfSchema, async (event, data, _actor) => {
        // Re-use logic by calling the handler manually or just copy-pasting since it's cleaner than internal dispatch with validation
        if (!data.slots || data.slots.length === 0) {
            throw new Error('No schedule data to export')
        }

        const rows = (data.slots as unknown as SchedulerSlot[]).map(s => `
            <tr>
                <td>${s.subject_name}</td>
                <td>${s.start_date}</td>
                <td>${s.start_time} - ${s.end_time}</td>
                <td>${s.venue_name}</td>
            </tr>
        `).join('')

        const html = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
            <h1>Exam Timetable</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Venue</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            </body>
            </html>
        `
        const buffer = await renderHtmlToPdfBuffer(html)
        const filename = `exam_timetable_${data.examId || 'export'}.pdf`
        const filePath = resolveOutputPath(filename, 'timetables')
        writePdfBuffer(filePath, buffer)
        return { success: true, filePath }
    })
}

// Helper functions (kept as is)

function detectClashes(
    db: ReturnType<typeof getDatabase>,
    examId: number,
    slots: Array<{ subject_id: number; start_date: string; start_time: string }>
): Array<{ subject1_id: number; subject1_name: string; subject2_id: number; subject2_name: string; clash_type: string; affected_students: number }> {
    const slotMap = new Map<number, string>()
    for (const slot of slots) {
        slotMap.set(slot.subject_id, `${slot.start_date} ${slot.start_time} `)
    }

    const results = db.prepare(`
        SELECT student_id, subject_id
        FROM exam_result
        WHERE exam_id = ?
    `).all(examId) as { student_id: number; subject_id: number }[]

    const subjects = db.prepare(`SELECT id, name FROM subject`).all() as { id: number; name: string }[]
    const subjectName = new Map(subjects.map(s => [s.id, s.name]))
    const studentMap = new Map<number, number[]>()

    for (const row of results) {
        if (!studentMap.has(row.student_id)) {
            studentMap.set(row.student_id, [])
        }
        studentMap.get(row.student_id)?.push(row.subject_id)
    }

    const clashCounts = new Map<string, number>()
    for (const subjectIds of studentMap.values()) {
        for (let index = 0; index < subjectIds.length; index += 1) {
            for (let nextIndex = index + 1; nextIndex < subjectIds.length; nextIndex += 1) {
                const firstSubjectId = subjectIds[index]
                const secondSubjectId = subjectIds[nextIndex]
                if (firstSubjectId === undefined || secondSubjectId === undefined) { continue }
                const firstSlot = slotMap.get(firstSubjectId)
                const secondSlot = slotMap.get(secondSubjectId)

                if (firstSlot && secondSlot && firstSlot === secondSlot) {
                    const key = `${firstSubjectId}| ${secondSubjectId}| ${firstSlot} `
                    clashCounts.set(key, (clashCounts.get(key) || 0) + 1)
                }
            }
        }
    }

    return Array.from(clashCounts.entries()).map(([key, count]) => {
        const [firstId, secondId] = key.split('|')
        const subject1Id = Number(firstId)
        const subject2Id = Number(secondId)
        return {
            subject1_id: subject1Id,
            subject1_name: subjectName.get(subject1Id) || 'Unknown',
            subject2_id: subject2Id,
            subject2_name: subjectName.get(subject2Id) || 'Unknown',
            clash_type: 'TIME_CONFLICT',
            affected_students: count
        }
    })
}

function loadScheduleSubjects(db: ReturnType<typeof getDatabase>, examId: number): Array<{ id: number; name: string }> {
    const subjects = db.prepare(`
        SELECT DISTINCT s.id, s.name
        FROM subject s
        JOIN exam_result er ON er.subject_id = s.id
        WHERE er.exam_id = ?
        ORDER BY s.name
    `).all(examId) as { id: number; name: string }[]

    if (subjects.length > 0) { return subjects }
    return db.prepare(`SELECT id, name FROM subject ORDER BY name`).all() as { id: number; name: string }[]
}

function getScheduleDateRange(startDate: string, endDate: string): string[] {
    const dateRange: string[] = []
    const currentDate = new Date(startDate)
    const end = new Date(endDate)

    while (currentDate <= end) {
        dateRange.push(currentDate.toISOString().slice(0, 10))
        currentDate.setDate(currentDate.getDate() + 1)
    }

    return dateRange
}

function buildSchedulerSlots(subjects: Array<{ id: number; name: string }>, totalStudents: number, dateRange: string[]): SchedulerSlot[] {
    const venues = [
        { ...VENUE_TEMPLATE[0]!, capacity: Math.max(150, totalStudents) },
        { ...VENUE_TEMPLATE[1]!, capacity: 60 },
        { ...VENUE_TEMPLATE[2]!, capacity: 60 }
    ]
    const slots: SchedulerSlot[] = []
    let slotId = 1
    let subjectIndex = 0

    for (const day of dateRange) {
        for (const timeBlock of SCHEDULE_TIME_BLOCKS) {
            if (subjectIndex >= subjects.length) {
                return slots
            }
            const subject = subjects[subjectIndex]
            const venue = venues[subjectIndex % venues.length]
            if (!subject || !venue) { continue }
            slots.push({
                id: slotId,
                subject_id: subject.id,
                subject_name: subject.name,
                start_date: day,
                end_date: day,
                start_time: timeBlock.start,
                end_time: timeBlock.end,
                venue_id: venue.id,
                venue_name: venue.name,
                max_capacity: venue.capacity,
                enrolled_students: totalStudents
            })
            slotId += 1
            subjectIndex += 1
        }
    }

    return slots
}

function calculateAverageCapacityUsage(slots: SchedulerSlot[]): number {
    if (slots.length === 0) { return 0 }

    const totalUsage = slots.reduce((sum, slot) => {
        if (slot.max_capacity <= 0) { return sum }
        return sum + (slot.enrolled_students / slot.max_capacity)
    }, 0)
    return (totalUsage / slots.length) * 100
}

function getExamScheduleDates(db: ReturnType<typeof getDatabase>, examId: number, startDate?: string, endDate?: string): { end: string; start: string } {
    const exam = db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as { start_date?: string; end_date?: string } | undefined
    const start = startDate || exam?.start_date || new Date().toISOString().slice(0, 10)
    const end = endDate || exam?.end_date || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start, end }
}

async function generateSchedule(
    db: ReturnType<typeof getDatabase>,
    examId?: number,
    startDate?: string,
    endDate?: string
): Promise<ScheduleResult> {
    if (!examId) {
        return { slots: [], clashes: [], stats: DEFAULT_SCHEDULE_STATS }
    }

    const { start, end } = getExamScheduleDates(db, examId, startDate, endDate)
    const subjects = loadScheduleSubjects(db, examId)
    const totalStudentsRow = db.prepare(`
        SELECT COUNT(DISTINCT student_id) as count
        FROM exam_result
        WHERE exam_id = ?
    `).get(examId) as { count: number } | undefined
    const totalStudents = totalStudentsRow?.count || 0
    const dateRange = getScheduleDateRange(start, end)
    const slots = buildSchedulerSlots(subjects, totalStudents, dateRange)
    const clashes = detectClashes(db, examId, slots)
    const averageCapacityUsage = calculateAverageCapacityUsage(slots)

    return {
        slots,
        clashes,
        stats: {
            total_slots: slots.length,
            total_students: totalStudents,
            venues_used: VENUE_TEMPLATE.length,
            average_capacity_usage: averageCapacityUsage
        }
    }
}
