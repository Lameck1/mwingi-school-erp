import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'

interface AcademicYearCreateData {
    year_name: string
    start_date: string
    end_date: string
    is_current: boolean
}

export function registerAcademicHandlers(): void {
    const db = getDatabase()

    // ======== ACADEMIC YEAR & TERMS ========
    ipcMain.handle('academicYear:getAll', async () => {
        return db.prepare('SELECT * FROM academic_year ORDER BY year_name DESC').all()
    })

    ipcMain.handle('academicYear:getCurrent', async () => {
        return db.prepare('SELECT * FROM academic_year WHERE is_current = 1').get()
    })

    ipcMain.handle('academicYear:create', async (_event, data: AcademicYearCreateData) => {
        try {
            db.transaction(() => {
                if (data.is_current) {
                    db.prepare('UPDATE academic_year SET is_current = 0').run()
                }
                const stmt = db.prepare('INSERT INTO academic_year (year_name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)')
                stmt.run(data.year_name, data.start_date, data.end_date, data.is_current ? 1 : 0)
            })()
            return { success: true }
        } catch (error) {
            console.error('Failed to create academic year:', error)
            throw error
        }
    })

    ipcMain.handle('academicYear:activate', async (_event, id: number) => {
        try {
            db.transaction(() => {
                db.prepare('UPDATE academic_year SET is_current = 0').run()
                db.prepare('UPDATE academic_year SET is_current = 1 WHERE id = ?').run(id)
            })()
            return { success: true }
        } catch (error) {
            console.error('Failed to activate academic year:', error)
            throw error
        }
    })

    ipcMain.handle('term:getByYear', async (_event, yearId: number) => {
        return db.prepare('SELECT * FROM term WHERE academic_year_id = ? ORDER BY term_number').all(yearId)
    })

    ipcMain.handle('term:getCurrent', async () => {
        return db.prepare('SELECT * FROM term WHERE is_current = 1').get()
    })

    // ======== STREAMS ========
    ipcMain.handle('stream:getAll', async () => {
        return db.prepare('SELECT * FROM stream WHERE is_active = 1 ORDER BY level_order').all()
    })

    // ======== EXAMS LIST ========
    ipcMain.handle('academic:getExamsList', async (_event, filters: { academicYearId?: number; termId?: number }) => {
        let query = 'SELECT id, name FROM academic_exam WHERE 1=1'
        const params: any[] = []

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

    // ======== PDF EXPORT (Placeholder) ========
    ipcMain.handle('export:pdf', async (_event, data: any) => {
        console.log('PDF Export requested:', data.title, data.filename);
        // TODO: Implement actual PDF generation (e.g. using pdfmake or puppeteer on backend)
        return { success: true, message: 'PDF export simulated' }
    })

    // ======== FEE CATEGORIES ========
    ipcMain.handle('feeCategory:getAll', async () => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    // ======== EXAM SCHEDULER (Stubs) ========
    ipcMain.handle('schedule:generate', async (_event, data: any) => {
        console.log('Generating timetable for:', data.examId)
        // Stub: Return empty or mock slots
        return {
            slots: [],
            clashes: [],
            stats: {
                total_slots: 0,
                total_students: 0,
                venues_used: 0,
                average_capacity_usage: 0
            }
        }
    })

    ipcMain.handle('schedule:detectClashes', async (_event, data: any) => {
        return [] // No clashes
    })

    ipcMain.handle('schedule:exportPDF', async (_event, data: any) => {
        console.log('Exporting timetable PDF:', data.examId)
        return { success: true }
    })
}















