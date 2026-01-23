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
        const stmt = db.prepare('INSERT INTO academic_year (year_name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)')
        const result = stmt.run(data.year_name, data.start_date, data.end_date, data.is_current ? 1 : 0)
        return { success: true, id: result.lastInsertRowid }
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

    // ======== FEE CATEGORIES ========
    ipcMain.handle('feeCategory:getAll', async () => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })
}















