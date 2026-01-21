import { ipcMain, dialog, app } from 'electron'
import { getDatabase, backupDatabase } from './database.js'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const bcryptModule = require('bcryptjs')
const bcrypt = bcryptModule.default || bcryptModule

console.log('Bcrypt module loaded, type of compare:', typeof bcrypt.compare)

export function registerIpcHandlers(): void {
    const db = getDatabase()

    // ======== AUTH ========
    ipcMain.handle('auth:login', async (_, username: string, password: string) => {
        console.log('Login attempt for:', username)
        const user = db.prepare('SELECT * FROM user WHERE username = ? AND is_active = 1').get(username) as any

        if (!user) {
            console.log('User not found:', username)
            return { success: false, error: 'Invalid username or password' }
        }

        console.log('User found, comparing password...')
        try {
            const valid = await bcrypt.compare(password, user.password_hash)
            console.log('Password valid:', valid)

            if (!valid) return { success: false, error: 'Invalid username or password' }

            db.prepare('UPDATE user SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)

            const { password_hash, ...userData } = user
            return { success: true, user: userData }
        } catch (err) {
            console.error('Bcrypt comparison error:', err)
            throw err
        }
    })

    ipcMain.handle('auth:changePassword', async (_, userId: number, oldPassword: string, newPassword: string) => {
        const user = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(userId) as any
        if (!user) return { success: false, error: 'User not found' }

        const valid = await bcrypt.compare(oldPassword, user.password_hash)
        if (!valid) return { success: false, error: 'Current password is incorrect' }

        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, userId)
        return { success: true }
    })

    // ======== SCHOOL SETTINGS ========
    ipcMain.handle('settings:get', async () => {
        return db.prepare('SELECT * FROM school_settings WHERE id = 1').get()
    })

    ipcMain.handle('settings:update', async (_, data: Record<string, any>) => {
        const keys = Object.keys(data)
        const setClause = keys.map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE school_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(...Object.values(data))
        return { success: true }
    })

    // ======== ACADEMIC YEAR & TERMS ========
    ipcMain.handle('academicYear:getAll', async () => {
        return db.prepare('SELECT * FROM academic_year ORDER BY year_name DESC').all()
    })

    ipcMain.handle('academicYear:getCurrent', async () => {
        return db.prepare('SELECT * FROM academic_year WHERE is_current = 1').get()
    })

    ipcMain.handle('academicYear:create', async (_, data: any) => {
        const stmt = db.prepare('INSERT INTO academic_year (year_name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)')
        const result = stmt.run(data.year_name, data.start_date, data.end_date, data.is_current ? 1 : 0)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('term:getByYear', async (_, yearId: number) => {
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

    // ======== STUDENTS ========
    ipcMain.handle('student:getAll', async (_, filters?: any) => {
        let query = `SELECT s.*, st.stream_name, e.student_type as current_type
      FROM student s
      LEFT JOIN enrollment e ON s.id = e.student_id AND e.id = (
        SELECT MAX(id) FROM enrollment WHERE student_id = s.id
      )
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE 1=1`
        const params: any[] = []

        if (filters?.search) {
            query += ` AND (s.admission_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)`
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`)
        }
        if (filters?.streamId) {
            query += ` AND e.stream_id = ?`
            params.push(filters.streamId)
        }
        if (filters?.isActive !== undefined) {
            query += ` AND s.is_active = ?`
            params.push(filters.isActive ? 1 : 0)
        }
        query += ` ORDER BY s.admission_number`
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('student:getById', async (_, id: number) => {
        return db.prepare('SELECT * FROM student WHERE id = ?').get(id)
    })

    ipcMain.handle('student:create', async (_, data: any) => {
        const stmt = db.prepare(`INSERT INTO student (
      admission_number, first_name, middle_name, last_name, date_of_birth, gender,
      student_type, admission_date, guardian_name, guardian_phone, guardian_email,
      guardian_relationship, address, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        const result = stmt.run(
            data.admission_number, data.first_name, data.middle_name, data.last_name,
            data.date_of_birth, data.gender, data.student_type, data.admission_date,
            data.guardian_name, data.guardian_phone, data.guardian_email,
            data.guardian_relationship, data.address, data.notes
        )
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('student:update', async (_, id: number, data: any) => {
        const keys = Object.keys(data)
        const setClause = keys.map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE student SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(data), id)
        return { success: true }
    })

    ipcMain.handle('student:getBalance', async (_, studentId: number) => {
        const invoices = db.prepare(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) as balance 
      FROM fee_invoice WHERE student_id = ? AND status != 'CANCELLED'`).get(studentId) as any
        return invoices?.balance || 0
    })

    // ======== FEE PAYMENTS ========
    ipcMain.handle('payment:record', async (_, data: any, userId: number) => {
        const txnRef = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
        const rcpNum = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`

        const txnStmt = db.prepare(`INSERT INTO ledger_transaction (
      transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
      student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id
    ) VALUES (?, ?, 'FEE_PAYMENT', 1, ?, 'CREDIT', ?, ?, ?, ?, ?, ?)`)

        const txnResult = txnStmt.run(
            txnRef, data.transaction_date, data.amount, data.student_id,
            data.payment_method, data.payment_reference, data.description,
            data.term_id, userId
        )

        const rcpStmt = db.prepare(`INSERT INTO receipt (
      receipt_number, transaction_id, receipt_date, student_id, amount,
      amount_in_words, payment_method, payment_reference, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)

        rcpStmt.run(rcpNum, txnResult.lastInsertRowid, data.transaction_date, data.student_id,
            data.amount, data.amount_in_words || '', data.payment_method, data.payment_reference, userId)

        // Update invoice if provided
        if (data.invoice_id) {
            db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?, 
        status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
        WHERE id = ?`).run(data.amount, data.amount, data.invoice_id)
        }

        return { success: true, transactionRef: txnRef, receiptNumber: rcpNum }
    })

    ipcMain.handle('payment:getByStudent', async (_, studentId: number) => {
        return db.prepare(`SELECT lt.*, r.receipt_number FROM ledger_transaction lt
      LEFT JOIN receipt r ON lt.id = r.transaction_id
      WHERE lt.student_id = ? AND lt.transaction_type = 'FEE_PAYMENT' AND lt.is_voided = 0
      ORDER BY lt.transaction_date DESC`).all(studentId)
    })

    // ======== INVOICES ========
    ipcMain.handle('invoice:create', async (_, data: any, items: any[], userId: number) => {
        const invNum = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
        const total = items.reduce((sum: number, item: any) => sum + item.amount, 0)

        const invStmt = db.prepare(`INSERT INTO fee_invoice (
      invoice_number, student_id, term_id, invoice_date, due_date, total_amount, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)

        const invResult = invStmt.run(invNum, data.student_id, data.term_id, data.invoice_date, data.due_date, total, userId)

        const itemStmt = db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, ?, ?, ?)')
        for (const item of items) {
            itemStmt.run(invResult.lastInsertRowid, item.fee_category_id, item.description, item.amount)
        }

        return { success: true, invoiceNumber: invNum, id: invResult.lastInsertRowid }
    })

    ipcMain.handle('invoice:getByStudent', async (_, studentId: number) => {
        return db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId)
    })

    // ======== STAFF ========
    ipcMain.handle('staff:getAll', async (_, activeOnly = true) => {
        const query = activeOnly
            ? 'SELECT * FROM staff WHERE is_active = 1 ORDER BY staff_number'
            : 'SELECT * FROM staff ORDER BY staff_number'
        return db.prepare(query).all()
    })

    ipcMain.handle('staff:create', async (_, data: any) => {
        const stmt = db.prepare(`INSERT INTO staff (
      staff_number, first_name, middle_name, last_name, id_number, kra_pin,
      nhif_number, nssf_number, phone, email, bank_name, bank_account,
      department, job_title, employment_date, basic_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        const result = stmt.run(
            data.staff_number, data.first_name, data.middle_name, data.last_name,
            data.id_number, data.kra_pin, data.nhif_number, data.nssf_number,
            data.phone, data.email, data.bank_name, data.bank_account,
            data.department, data.job_title, data.employment_date, data.basic_salary
        )
        return { success: true, id: result.lastInsertRowid }
    })

    // ======== PAYROLL ========
    ipcMain.handle('payroll:run', async (_, month: number, year: number, userId: number) => {
        // 1. Check if payroll already exists
        const existing = db.prepare('SELECT id FROM payroll_period WHERE month = ? AND year = ?').get(month, year) as any
        if (existing) return { success: false, error: 'Payroll for this period already exists' }

        // 2. Create Payroll Period
        const periodName = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]
        
        const periodResult = db.prepare(`INSERT INTO payroll_period (
            period_name, month, year, start_date, end_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)`).run(periodName, month, year, startDate, endDate)
        
        const periodId = periodResult.lastInsertRowid

        // 3. Get Active Staff
        const staffList = db.prepare('SELECT * FROM staff WHERE is_active = 1').all() as any[]

        // 4. Calculate for each staff
        const payrollStmt = db.prepare(`INSERT INTO payroll (
            period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary
        ) VALUES (?, ?, ?, ?, ?, ?)`)
        
        const results = []

        for (const staff of staffList) {
            const basic = staff.basic_salary || 0
            // TODO: Add allowances logic here (fetch from staff_allowance table if exists)
            const allowances = 0 
            const gross = basic + allowances

            // Calculation Logic (Simplified Kenya 2024)
            // NSSF (Tier I + II) - approx 6% capped
            const nssf = Math.min(gross * 0.06, 2160)
            
            // NHIF (Using SHIF 2.75% for modern compliance or old bands)
            // Let's use old bands for safety as they are common
            let nhif = 150
            if (gross >= 100000) nhif = 1700
            else if (gross >= 50000) nhif = 1500 // Simplified
            else if (gross >= 20000) nhif = 750
            else nhif = 500
            
            // PAYE
            // Taxable Income = Gross - NSSF
            const taxable = gross - nssf
            let tax = 0
            if (taxable > 24000) {
                 const band1 = 24000 * 0.1
                 const remainder = taxable - 24000
                 if (remainder > 8333) {
                     const band2 = 8333 * 0.25
                     const band3 = (remainder - 8333) * 0.3
                     tax = band1 + band2 + band3
                 } else {
                     tax = band1 + (remainder * 0.25)
                 }
            } else {
                tax = taxable * 0.1
            }
            // Personal Relief
            const paye = Math.max(0, tax - 2400)

            const totalDeductions = nssf + nhif + paye
            const net = gross - totalDeductions

            payrollStmt.run(periodId, staff.id, basic, gross, totalDeductions, net)
            
            results.push({
                staff_name: `${staff.first_name} ${staff.last_name}`,
                basic_salary: basic,
                allowances,
                gross_salary: gross,
                paye, nhif, nssf,
                other_deductions: 0,
                net_salary: net
            })
        }

        return { success: true, periodId, results }
    })

    ipcMain.handle('payroll:getHistory', async () => {
        return db.prepare('SELECT * FROM payroll_period ORDER BY year DESC, month DESC').all()
    })

    // ======== AUDIT LOG ========
    ipcMain.handle('audit:getAll', async (_, limit = 100) => {
        return db.prepare(`
            SELECT a.*, u.full_name as user_name 
            FROM audit_log a
            LEFT JOIN user u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(limit)
    })

    // ======== INVENTORY ========
    ipcMain.handle('inventory:getAll', async () => {
        return db.prepare(`SELECT i.*, c.category_name FROM inventory_item i
      LEFT JOIN inventory_category c ON i.category_id = c.id
      WHERE i.is_active = 1 ORDER BY i.item_name`).all()
    })

    ipcMain.handle('inventory:getLowStock', async () => {
        return db.prepare(`SELECT i.*, c.category_name FROM inventory_item i
      LEFT JOIN inventory_category c ON i.category_id = c.id
      WHERE i.is_active = 1 AND i.current_stock <= i.reorder_level`).all()
    })

    ipcMain.handle('inventory:getCategories', async () => {
        return db.prepare('SELECT * FROM inventory_category WHERE is_active = 1 ORDER BY category_name').all()
    })

    ipcMain.handle('inventory:createItem', async (_, data: any) => {
        const stmt = db.prepare(`INSERT INTO inventory_item (
            item_code, item_name, category_id, unit_of_measure, reorder_level, unit_cost
        ) VALUES (?, ?, ?, ?, ?, ?)`)
        const result = stmt.run(
            data.item_code, data.item_name, data.category_id,
            data.unit_of_measure, data.reorder_level, data.unit_cost
        )
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('inventory:updateItem', async (_, id: number, data: any) => {
        const keys = Object.keys(data)
        const setClause = keys.map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE inventory_item SET ${setClause} WHERE id = ?`).run(...Object.values(data), id)
        return { success: true }
    })

    ipcMain.handle('inventory:recordMovement', async (_, data: any, userId: number) => {
        // 1. Record movement
        const stmt = db.prepare(`INSERT INTO stock_movement (
            item_id, movement_type, quantity, unit_cost, total_cost,
            reference_number, supplier_id, description, movement_date, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        
        const totalCost = data.quantity * data.unit_cost
        stmt.run(
            data.item_id, data.movement_type, data.quantity, data.unit_cost, totalCost,
            data.reference_number, data.supplier_id, data.description, data.movement_date, userId
        )

        // 2. Update stock level
        const item = db.prepare('SELECT current_stock, unit_cost FROM inventory_item WHERE id = ?').get(data.item_id) as any
        let newStock = item.current_stock
        
        if (data.movement_type === 'IN') {
            newStock += data.quantity
            // Optional: Update weighted average cost or just last price
            db.prepare('UPDATE inventory_item SET current_stock = ?, unit_cost = ? WHERE id = ?')
              .run(newStock, data.unit_cost, data.item_id)
        } else if (data.movement_type === 'OUT') {
            newStock -= data.quantity
            db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
              .run(newStock, data.item_id)
        } else if (data.movement_type === 'ADJUSTMENT') {
             // For adjustment, we assume quantity is the CHANGE (can be negative)
             // OR we might want to set absolute stock. 
             // Requirement says "Stock in/out", implying incremental.
             // But for adjustment, usually it's fixing discrepancies.
             // Let's assume quantity is the adjustment amount (+/-).
             newStock += data.quantity
             db.prepare('UPDATE inventory_item SET current_stock = ? WHERE id = ?')
              .run(newStock, data.item_id)
        }

        return { success: true, newStock }
    })

    // ======== REPORTS ========
    ipcMain.handle('report:feeCollection', async (_, startDate: string, endDate: string) => {
        return db.prepare(`SELECT DATE(transaction_date) as date, SUM(amount) as total,
      payment_method, COUNT(*) as count FROM ledger_transaction
      WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0
      AND transaction_date BETWEEN ? AND ? GROUP BY DATE(transaction_date), payment_method`).all(startDate, endDate)
    })

    ipcMain.handle('report:defaulters', async (_, termId?: number) => {
        let query = `SELECT s.*, fi.total_amount, fi.amount_paid, (fi.total_amount - fi.amount_paid) as balance,
      st.stream_name FROM student s
      INNER JOIN fee_invoice fi ON s.id = fi.student_id
      LEFT JOIN enrollment e ON s.id = e.student_id
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE fi.status IN ('PENDING', 'PARTIAL') AND s.is_active = 1`
        if (termId) query += ` AND fi.term_id = ${termId}`
        query += ` ORDER BY balance DESC`
        return db.prepare(query).all()
    })

    ipcMain.handle('report:dashboard', async () => {
        const totalStudents = db.prepare('SELECT COUNT(*) as count FROM student WHERE is_active = 1').get() as any
        const totalStaff = db.prepare('SELECT COUNT(*) as count FROM staff WHERE is_active = 1').get() as any
        const feeCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM ledger_transaction 
      WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0`).get() as any
        const outstandingBalance = db.prepare(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) as total 
      FROM fee_invoice WHERE status IN ('PENDING', 'PARTIAL')`).get() as any

        return {
            totalStudents: totalStudents?.count || 0,
            totalStaff: totalStaff?.count || 0,
            feeCollected: feeCollected?.total || 0,
            outstandingBalance: outstandingBalance?.total || 0
        }
    })

    // ======== BACKUP ========
    ipcMain.handle('backup:create', async () => {
        const { filePath } = await dialog.showSaveDialog({
            title: 'Save Backup',
            defaultPath: `mwingi-erp-backup-${new Date().toISOString().slice(0, 10)}.db`,
            filters: [{ name: 'SQLite Database', extensions: ['db'] }]
        })
        if (!filePath) return { success: false, cancelled: true }

        await backupDatabase(filePath)
        return { success: true, path: filePath }
    })

    ipcMain.handle('backup:restore', async () => {
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Restore Backup',
            filters: [{ name: 'SQLite Database', extensions: ['db'] }],
            properties: ['openFile']
        })
        if (!filePaths.length) return { success: false, cancelled: true }

        // Copy backup to app data
        const userDataPath = app.getPath('userData')
        const dbPath = path.join(userDataPath, 'data', 'school_erp.db')
        fs.copyFileSync(filePaths[0], dbPath)

        return { success: true, message: 'Backup restored. Please restart the application.' }
    })

    // ======== USERS ========
    ipcMain.handle('user:getAll', async () => {
        return db.prepare('SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM user').all()
    })

    ipcMain.handle('user:create', async (_, data: any) => {
        const hash = await bcrypt.hash(data.password, 10)
        const stmt = db.prepare('INSERT INTO user (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)')
        const result = stmt.run(data.username, hash, data.full_name, data.email, data.role)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('user:update', async (_, id: number, data: any) => {
        const keys = Object.keys(data)
        const setClause = keys.map(k => `${k} = ?`).join(', ')
        db.prepare(`UPDATE user SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(data), id)
        return { success: true }
    })

    ipcMain.handle('user:toggleStatus', async (_, id: number, isActive: boolean) => {
        db.prepare('UPDATE user SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id)
        return { success: true }
    })

    ipcMain.handle('user:resetPassword', async (_, id: number, newPassword: string) => {
        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id)
        return { success: true }
    })
}
