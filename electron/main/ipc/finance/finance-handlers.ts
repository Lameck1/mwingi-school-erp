import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'
import { logAudit } from '../../database/utils/audit'
import { CashFlowService } from '../../services/finance/CashFlowService'
import { PaymentData, PaymentResult, TransactionData, TransactionFilters, InvoiceData, InvoiceItem, FeeStructureItemData } from './types'
import { validateAmount, validateId, validateDate, sanitizeString } from '../../utils/validation'
import { ExemptionService } from '../../services/finance/ExemptionService'
import { fixCurrencyScale } from '../../database/migrations/009_fix_currency_scale'

export function registerFinanceHandlers(): void {
    const db = getDatabase()
    const exemptionService = new ExemptionService()

    // Cash Flow & Forecasting
    ipcMain.handle('finance:getCashFlow', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        return CashFlowService.getCashFlowStatement(startDate, endDate)
    })

    ipcMain.handle('finance:getForecast', async (_event: IpcMainInvokeEvent, months: number) => {
        return CashFlowService.getForecast(months)
    })

    // ======== FEE PAYMENTS ========
    ipcMain.handle('payment:record', async (_event: IpcMainInvokeEvent, data: PaymentData, userId: number): Promise<PaymentResult | { success: false, message: string }> => {
        // --- VALIDATION ---
        const vAmount = validateAmount(data.amount)
        if (!vAmount.success) return { success: false, message: vAmount.error! }

        const vStudent = validateId(data.student_id, 'Student')
        if (!vStudent.success) return { success: false, message: vStudent.error! }

        const amountCents = Math.round(vAmount.data! * 100)
        const description = sanitizeString(data.description) || 'Tuition Fee Payment'
        const paymentRef = sanitizeString(data.payment_reference)

        return db.transaction(() => {
            const txnRef = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
            const rcpNum = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`

            const txnStmt = db.prepare(`INSERT INTO ledger_transaction (
      transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
      student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
    ) VALUES (?, ?, 'FEE_PAYMENT', (SELECT id FROM transaction_category WHERE category_name = 'School Fees'), ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)`)

            const txnResult = txnStmt.run(
                txnRef, data.transaction_date, amountCents, data.student_id,
                data.payment_method, paymentRef, description,
                data.term_id, userId, data.invoice_id || null
            )

            logAudit(userId, 'CREATE', 'ledger_transaction', txnResult.lastInsertRowid as number, null, { ...data, amount: amountCents })

            const rcpStmt = db.prepare(`INSERT INTO receipt (
      receipt_number, transaction_id, receipt_date, student_id, amount,
      amount_in_words, payment_method, payment_reference, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)

            rcpStmt.run(rcpNum, txnResult.lastInsertRowid, data.transaction_date, data.student_id,
                amountCents, data.amount_in_words || '', data.payment_method, paymentRef, userId)

            let remainingAmount = amountCents

            if (data.invoice_id) {
                const inv = db.prepare('SELECT total_amount, amount_paid FROM fee_invoice WHERE id = ?').get(data.invoice_id) as { total_amount: number; amount_paid: number } | undefined
                if (inv) {
                    db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?, 
                        status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
                        WHERE id = ?`).run(amountCents, amountCents, data.invoice_id)
                }
            } else {
                const pendingInvoices = db.prepare(`
                    SELECT id, total_amount, amount_paid 
                    FROM fee_invoice 
                    WHERE student_id = ? AND status != 'PAID'
                    ORDER BY invoice_date ASC
                `).all(data.student_id) as Array<{ id: number; total_amount: number; amount_paid: number }>

                const updateInvStmt = db.prepare(`
                    UPDATE fee_invoice 
                    SET amount_paid = amount_paid + ?, 
                        status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
                    WHERE id = ?
                `)

                for (const inv of pendingInvoices) {
                    if (remainingAmount <= 0) break

                    const outstanding = inv.total_amount - (inv.amount_paid || 0)
                    const payAmount = Math.min(remainingAmount, outstanding)

                    updateInvStmt.run(payAmount, payAmount, inv.id)
                    remainingAmount -= payAmount
                }

                if (remainingAmount > 0) {
                    try {
                        db.prepare('UPDATE student SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?').run(remainingAmount, data.student_id)
                    } catch (e) {
                        console.error('Failed to update credit balance:', e)
                    }
                }
            }

            return { success: true, transactionRef: txnRef, receiptNumber: rcpNum }
        })()
    })

    ipcMain.handle('invoice:getItems', async (_event: IpcMainInvokeEvent, invoiceId: number) => {
        const items = db.prepare(`
            SELECT ii.*, fc.category_name 
            FROM invoice_item ii
            JOIN fee_category fc ON ii.fee_category_id = fc.id
            WHERE ii.invoice_id = ?
        `).all(invoiceId) as any[]

        return items.map(item => ({
            ...item,
            amount: item.amount / 100
        }))
    })

    ipcMain.handle('payment:getByStudent', async (_event: IpcMainInvokeEvent, studentId: number) => {
        const payments = db.prepare(`SELECT lt.*, r.receipt_number FROM ledger_transaction lt
      LEFT JOIN receipt r ON lt.id = r.transaction_id
      WHERE lt.student_id = ? AND lt.transaction_type = 'FEE_PAYMENT' AND lt.is_voided = 0
      ORDER BY lt.transaction_date DESC`).all(studentId) as any[]

        return payments.map(p => ({
            ...p,
            amount: p.amount / 100
        }))
    })

    ipcMain.handle('payment:payWithCredit', async (_event: IpcMainInvokeEvent, data: { studentId: number, invoiceId: number, amount: number }, userId: number) => {
        return db.transaction(() => {
            // 1. Get current credit balance
            const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(data.studentId) as { credit_balance: number }
            const currentCredit = student.credit_balance || 0
            const amountCents = Math.round(data.amount * 100)

            if (currentCredit < amountCents) {
                return { success: false, message: 'Insufficient credit balance' }
            }

            // 2. Create transaction record
            const txnRef = `TXN-CREDIT-${Date.now()}`
            const txnStmt = db.prepare(`INSERT INTO ledger_transaction (
                transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
                student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id
            ) VALUES (?, ?, 'FEE_PAYMENT', (SELECT id FROM transaction_category WHERE category_name = 'School Fees'), ?, 'CREDIT', ?, 'CASH', 'CREDIT_BALANCE', 'Payment via Credit Balance', ?, ?)`)

            const txnResult = txnStmt.run(
                txnRef, new Date().toISOString().slice(0, 10), amountCents,
                data.studentId, userId, data.invoiceId
            )

            // 3. Update Invoice
            db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?, 
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
                WHERE id = ?`).run(amountCents, amountCents, data.invoiceId)

            // 4. Deduct from Credit Balance
            db.prepare('UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?').run(amountCents, data.studentId)

            logAudit(userId, 'CREATE', 'ledger_transaction', txnResult.lastInsertRowid as number, null, { action: 'PAY_WITH_CREDIT', amount: amountCents, invoiceId: data.invoiceId })

            return { success: true }
        })()
    })

    // ======== INVOICES ========
    ipcMain.handle('invoice:create', async (_event: IpcMainInvokeEvent, data: InvoiceData, items: InvoiceItem[], userId: number) => {
        return db.transaction(() => {
            const invNum = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
            // Convert items to cents
            const itemsInCents = items.map(i => ({ ...i, amount: Math.round(i.amount * 100) }))
            const totalCents = itemsInCents.reduce((sum: number, item) => sum + item.amount, 0)

            const invStmt = db.prepare(`INSERT INTO fee_invoice (
                invoice_number, student_id, term_id, invoice_date, due_date, total_amount, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`)

            const invResult = invStmt.run(invNum, data.student_id, data.term_id, data.invoice_date, data.due_date, totalCents, userId)

            logAudit(userId, 'CREATE', 'fee_invoice', invResult.lastInsertRowid as number, null, { ...data, total: totalCents, items: itemsInCents })

            const itemStmt = db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, ?, ?, ?)')
            for (const item of itemsInCents) {
                itemStmt.run(invResult.lastInsertRowid, item.fee_category_id, item.description, item.amount)
            }

            return { success: true, invoiceNumber: invNum, id: invResult.lastInsertRowid }
        })()
    })

    ipcMain.handle('invoice:getByStudent', async (_event: IpcMainInvokeEvent, studentId: number) => {
        const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId) as any[]
        return invoices.map(inv => ({
            ...inv,
            total_amount: inv.total_amount / 100,
            amount_paid: inv.amount_paid / 100,
            balance: (inv.total_amount - inv.amount_paid) / 100
        }))
    })

    ipcMain.handle('invoice:getAll', async (_event: IpcMainInvokeEvent) => {
        const invoices = db.prepare(`
            SELECT fi.*, 
                   s.first_name || ' ' || s.last_name as student_name,
                   t.term_name
            FROM fee_invoice fi
            JOIN student s ON fi.student_id = s.id
            JOIN term t ON fi.term_id = t.id
            ORDER BY fi.invoice_date DESC
        `).all() as any[]

        return invoices.map(inv => ({
            ...inv,
            total_amount: inv.total_amount / 100,
            amount_paid: inv.amount_paid / 100,
            balance: (inv.total_amount - inv.amount_paid) / 100
        }))
    })

    // ======== FEE STRUCTURE & BATCH INVOICING ========

    ipcMain.handle('fee:getCategories', async (_event: IpcMainInvokeEvent) => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    ipcMain.handle('fee:createCategory', async (_event: IpcMainInvokeEvent, name: string, description: string) => {
        const stmt = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)')
        const result = stmt.run(name, description)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('fee:getStructure', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number) => {
        const structure = db.prepare(`
            SELECT fs.*, fc.category_name, s.stream_name 
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            JOIN stream s ON fs.stream_id = s.id
            WHERE fs.academic_year_id = ? AND fs.term_id = ?
        `).all(academicYearId, termId) as any[]

        return structure.map(s => ({
            ...s,
            amount: s.amount / 100
        }))
    })

    ipcMain.handle('fee:saveStructure', async (_event: IpcMainInvokeEvent, data: FeeStructureItemData[], academicYearId: number, termId: number) => {
        const deleteStmt = db.prepare('DELETE FROM fee_structure WHERE academic_year_id = ? AND term_id = ?')
        const insertStmt = db.prepare(`
            INSERT INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount)
            VALUES (?, ?, ?, ?, ?, ?)
        `)

        const transaction = db.transaction((items: FeeStructureItemData[]) => {
            deleteStmt.run(academicYearId, termId)
            for (const item of items) {
                insertStmt.run(academicYearId, termId, item.stream_id, item.student_type, item.fee_category_id, Math.round(item.amount * 100))
            }
        })

        transaction(data)
        return { success: true }
    })

    ipcMain.handle('invoice:generateBatch', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number, userId: number) => {
        // 1. Get Fee Structure
        const structure = db.prepare(`
            SELECT * FROM fee_structure 
            WHERE academic_year_id = ? AND term_id = ?
        `).all(academicYearId, termId) as Array<{ id: number; academic_year_id: number; term_id: number; stream_id: number; student_type: string; fee_category_id: number; amount: number; fee_items: string; total_amount: number; created_at: string }>

        if (structure.length === 0) return { success: false, message: 'No fee structure defined for this term' }

        // 2. Get Active Students with Enrollment
        // Ideally, we check enrollment for the specific term, but if not exists, fallback to active students
        // For simplicity, let's assume all active students are enrolled in their current stream
        // In a real app, we should promote students to new streams/terms first.
        // Let's use the 'student' table and assume their current stream is valid.
        // Wait, 'student' table doesn't have stream_id directly? 
        // Let's check schema... 'enrollment' table links student to stream/term.

        // Let's look for enrollments in this academic year/term
        const enrollments = db.prepare(`
            SELECT e.*, s.first_name, s.last_name 
            FROM enrollment e
            JOIN student s ON e.student_id = s.id
            WHERE e.academic_year_id = ? AND e.term_id = ? AND e.status = 'ACTIVE'
        `).all(academicYearId, termId) as Array<{ id: number; student_id: number; academic_year_id: number; term_id: number; stream_id: number; student_type: string; class_id: number; status: string; first_name: string; last_name: string }>

        if (enrollments.length === 0) {
            // Fallback: If no specific enrollment for this term, try to find active students and enroll them?
            // Or just fail and tell user to enroll students first.
            // Better: Auto-enroll based on previous term? Too complex.
            // Let's assume the user has promoted students or enrolled them.
            // If 0 enrollments, maybe they haven't set up the term enrollments yet.
            return { success: false, message: 'No active enrollments found for this term. Please enroll students first.' }
        }

        let count = 0
        // const errors = []

        const checkInvoiceStmt = db.prepare('SELECT id FROM fee_invoice WHERE student_id = ? AND term_id = ?')
        const insertInvoiceStmt = db.prepare(`
            INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, due_date, total_amount, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        // Updated to include exemption fields
        const insertItemStmt = db.prepare(`
            INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount, exemption_id, original_amount, exemption_amount) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        const transaction = db.transaction(() => {
            for (const enrollment of enrollments) {
                // Skip if invoice exists
                const existing = checkInvoiceStmt.get(enrollment.student_id, enrollment.term_id)
                if (existing) continue

                // Find applicable fees
                const fees = structure.filter(f =>
                    f.stream_id === enrollment.stream_id &&
                    f.student_type === enrollment.student_type
                )

                if (fees.length === 0) continue

                // Fetch student exemptions for this term
                const exemptions = exemptionService.getStudentExemptions(enrollment.student_id, academicYearId, termId)

                let invoiceTotal = 0
                const invoiceItems: any[] = []

                for (const fee of fees) {
                    const originalAmount = fee.amount
                    let finalAmount = originalAmount
                    let exemptionAmount = 0
                    let exemptionId: number | null = null

                    // Check for invalid exemption (blanket or specific category)
                    // Prioritize specific category exemption over blanket
                    const specificExemption = exemptions.find(e => e.fee_category_id === fee.fee_category_id && e.status === 'ACTIVE')
                    const blanketExemption = exemptions.find(e => !e.fee_category_id && e.status === 'ACTIVE')
                    const activeExemption = specificExemption || blanketExemption

                    if (activeExemption) {
                        const percentage = activeExemption.exemption_percentage
                        exemptionAmount = Math.round((originalAmount * percentage) / 100)
                        finalAmount = originalAmount - exemptionAmount
                        exemptionId = activeExemption.id
                    }

                    invoiceTotal += finalAmount
                    invoiceItems.push({
                        fee_category_id: fee.fee_category_id,
                        description: 'Term Fee', // Could be more specific based on category name
                        amount: finalAmount,
                        exemption_id: exemptionId,
                        original_amount: originalAmount,
                        exemption_amount: exemptionAmount
                    })
                }

                const invNum = `INV-${academicYearId}-${termId}-${enrollment.student_id}-${Date.now().toString().slice(-4)}`
                const dueDate = new Date().toISOString().slice(0, 10) // Today for now, or term start date

                const invResult = insertInvoiceStmt.run(
                    invNum, enrollment.student_id, enrollment.term_id,
                    new Date().toISOString().slice(0, 10), dueDate, invoiceTotal, userId
                )
                const invoiceId = invResult.lastInsertRowid

                for (const item of invoiceItems) {
                    insertItemStmt.run(
                        invoiceId, item.fee_category_id, item.description,
                        item.amount, item.exemption_id, item.original_amount, item.exemption_amount
                    )
                }
                count++
            }
        })

        try {
            transaction()
            return { success: true, count }
        } catch (e: unknown) {
            console.error(e)
            const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred'
            return { success: false, message: errorMessage }
        }
    })
    ipcMain.handle('finance:fixCurrency', async (_event: IpcMainInvokeEvent, userId: number) => {
        try {
            fixCurrencyScale(db)
            logAudit(userId, 'UPDATE', 'SYSTEM', 0, null, { action: 'FIX_CURRENCY_SCALE' })
            return { success: true, message: 'Currency scale correction applied successfully.' }
        } catch (error) {
            console.error('Manual currency fix failed:', error)
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error during fix' }
        }
    })
}

