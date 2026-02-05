import { db } from '../database/index'

interface Stream {
    id: number
    stream_code: string
    stream_name: string
}

interface FeeCategory {
    id: number
    category_name: string
}

interface TransactionCategory {
    id: number
    category_name: string
    category_type: string
}

interface FeeStructureResult {
    id: number
    fee_category_id: number
    category_name: string
    amount: number
}

interface InventoryCategory {
    id: number
}

interface FirstStudent {
    id: number
    stream_id: number
}

export class SystemMaintenanceService {
    async resetAndSeed2026(userId: number): Promise<{ success: boolean; message: string }> {
        if (!db) throw new Error('Database not initialized')

        try {
            // Disable foreign keys temporarily for bulk cleanup
            db.pragma('foreign_keys = OFF')

            db.transaction(() => {
                // 1. Comprehensive list of tables to clear (Transactional & Year-specific)
                const tablesToClear = [
                    'attendance', 'exam_result', 'report_card_summary', 'exam',
                    'subject_allocation', 'stock_movement', 'inventory_item',
                    'receipt', 'invoice_item', 'fee_invoice', 'ledger_transaction',
                    'fee_structure', 'enrollment', 'student', 'payroll_deduction',
                    'payroll_allowance', 'payroll', 'payroll_period', 'staff_allowance',
                    'staff', 'reconciliation_adjustment', 'bank_statement_line',
                    'bank_statement', 'budget_revision', 'budget_line_item', 'budget',
                    'approval_request', 'fixed_asset', 'report_execution_log',
                    'term', 'academic_year', 'financial_period', 'audit_log',
                    'message_log', 'backup_log',
                    'fee_category', 'stream' // Clear and re-seed these with correct data
                ]

                for (const table of tablesToClear) {
                    const exists = db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
                    if (exists) {
                        db!.prepare(`DELETE FROM ${table}`).run()
                        db!.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table)
                    }
                }

                // 2. Re-seed streams and fee categories (since we cleared them)
                db!.exec(`
                    INSERT INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES 
                    ('BABY', 'Baby Class', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
                    ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
                    ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
                    ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);
                    
                    INSERT INTO fee_category (category_name, description) VALUES 
                    ('Tuition', 'Tuition fees'), ('Feeding', 'Meals/Feeding fees'), ('Maintenance', 'School maintenance'),
                    ('Boarding', 'Boarding fees for boarders');
                `)

                // 3. Academic Setup (2026 Term 1)
                const yearId = db!.prepare(`
                    INSERT INTO academic_year (year_name, start_date, end_date, is_current)
                    VALUES ('2026', '2026-01-05', '2026-11-27', 1)
                `).run().lastInsertRowid as number

                const termId = db!.prepare(`
                    INSERT INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current, status)
                    VALUES (?, 1, 'Term 1', '2026-01-05', '2026-04-10', 1, 'OPEN')
                `).run(yearId).lastInsertRowid as number

                // 4. Institutional Metadata
                const streams = db!.prepare('SELECT id, stream_code, stream_name FROM stream WHERE is_active = 1').all() as Stream[]
                const feeCats = db!.prepare('SELECT id, category_name FROM fee_category WHERE is_active = 1').all() as FeeCategory[]
                const transCats = db!.prepare('SELECT id, category_name, category_type FROM transaction_category WHERE is_active = 1').all() as TransactionCategory[]

                const feeIncomeCat = transCats.find(c => c.category_name === 'School Fees')?.id
                const utilityCat = transCats.find(c => c.category_name === 'Utilities')?.id

                // 5. Seed Fee Structures with ACCURATE amounts from official fee structure
                // Day: [Tuition, Feeding, Maintenance]
                // Boarder: [Tuition, Feeding, Boarding] - Note: Boarding includes accommodation + meals top-up + maintenance
                const feeMap: Record<string, { DAY: number[], BOARDER: number[] }> = {
                    // Primary 1-6 Boarder: 17,000 total (estimated breakdown: Tuition ~5500, Feeding ~5000, Boarding ~6500)
                    // JSS Boarder: 19,500 total (estimated breakdown: Tuition ~7000, Feeding ~5000, Boarding ~7500)
                    // AMOUNTS IN CENTS (Multiply Shillings by 100)
                    'BABY': { DAY: [300000, 350000, 50000], BOARDER: [300000, 500000, 900000] },
                    'PP1': { DAY: [300000, 350000, 50000], BOARDER: [300000, 500000, 900000] },
                    'PP2': { DAY: [300000, 350000, 50000], BOARDER: [300000, 500000, 900000] },
                    'G1': { DAY: [550000, 350000, 50000], BOARDER: [550000, 500000, 650000] },
                    'G2': { DAY: [550000, 350000, 50000], BOARDER: [550000, 500000, 650000] },
                    'G3': { DAY: [550000, 350000, 50000], BOARDER: [550000, 500000, 650000] },
                    'G4': { DAY: [550000, 350000, 70000], BOARDER: [550000, 500000, 650000] },
                    'G5': { DAY: [550000, 350000, 70000], BOARDER: [550000, 500000, 650000] },
                    'G6': { DAY: [550000, 350000, 100000], BOARDER: [550000, 500000, 650000] },
                    'G7': { DAY: [700000, 350000, 150000], BOARDER: [700000, 500000, 750000] },
                    'G8': { DAY: [700000, 350000, 150000], BOARDER: [700000, 500000, 750000] },
                    'G9': { DAY: [700000, 350000, 150000], BOARDER: [700000, 500000, 750000] }
                }

                const tuitionCat = feeCats.find(c => c.category_name === 'Tuition')?.id
                const feedingCat = feeCats.find(c => c.category_name === 'Feeding')?.id
                const maintenanceCat = feeCats.find(c => c.category_name === 'Maintenance')?.id
                const boardingCat = feeCats.find(c => c.category_name === 'Boarding')?.id

                for (const stream of streams) {
                    const fees = feeMap[stream.stream_code]
                    if (!fees) continue

                    // Day Scholar fees (Tuition, Feeding, Maintenance)
                    if (tuitionCat && fees.DAY[0] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'DAY_SCHOLAR', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, tuitionCat, fees.DAY[0], `Tuition - ${stream.stream_name}`)
                    }
                    if (feedingCat && fees.DAY[1] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'DAY_SCHOLAR', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, feedingCat, fees.DAY[1], `Feeding - ${stream.stream_name}`)
                    }
                    if (maintenanceCat && fees.DAY[2] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'DAY_SCHOLAR', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, maintenanceCat, fees.DAY[2], `Maintenance - ${stream.stream_name}`)
                    }

                    // Boarder fees (Tuition, Feeding, Boarding)
                    if (tuitionCat && fees.BOARDER[0] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'BOARDER', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, tuitionCat, fees.BOARDER[0], `Tuition - ${stream.stream_name}`)
                    }
                    if (feedingCat && fees.BOARDER[1] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'BOARDER', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, feedingCat, fees.BOARDER[1], `Feeding - ${stream.stream_name}`)
                    }
                    if (boardingCat && fees.BOARDER[2] > 0) {
                        db!.prepare(`
                            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
                            VALUES (?, ?, 'BOARDER', ?, ?, ?, ?)
                        `).run(yearId, stream.id, termId, boardingCat, fees.BOARDER[2], `Boarding - ${stream.stream_name}`)
                    }
                }



                // 5. Seed Students (2 per class/stream)
                const firstNames = ['Samuel', 'Grace', 'David', 'Mercy', 'John', 'Sarah', 'Isaac', 'Faith', 'Peter', 'Mary', 'James', 'Ruth', 'Paul', 'Esther', 'Luke', 'Lydia', 'Mark', 'Martha', 'Silas', 'Chloe', 'Timothy', 'Phoebe', 'Andrew', 'Tabitha']
                const lastNames = ['Kamau', 'Mutua', 'Ochieng', 'Wambui', 'Njoroge', 'Cherono', 'Kipruto', 'Anyango', 'Maina', 'Atieno', 'Njenga', 'Muli', 'Karanja', 'Achieng', 'Kibet', 'Wanjiku', 'Omondi', 'Mwangi', 'Kirui', 'Naliaka', 'Gitu', 'Aoko', 'Masai', 'Zahara']

                let studentCount = 0
                for (const stream of streams) {
                    for (let sIdx = 0; sIdx < 2; sIdx++) {
                        const idx = (studentCount) % firstNames.length
                        const type = (studentCount % 3 === 0) ? 'BOARDER' : 'DAY_SCHOLAR'
                        const gender = (idx % 2 === 0) ? 'M' : 'F'
                        const adm = `2026/${String(studentCount + 1).padStart(3, '0')}`

                        const studentId = db!.prepare(`
                            INSERT INTO student (admission_number, first_name, last_name, student_type, gender, admission_date, is_active)
                            VALUES (?, ?, ?, ?, ?, '2026-01-05', 1)
                        `).run(adm, firstNames[idx], lastNames[idx], type, gender).lastInsertRowid as number

                        db!.prepare(`
                            INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, enrollment_date, status)
                            VALUES (?, ?, ?, ?, ?, '2026-01-05', 'ACTIVE')
                        `).run(studentId, yearId, termId, stream.id, type)

                        const invoiceId = db!.prepare(`
                            INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, due_date, total_amount, amount_paid, status, created_by_user_id)
                            VALUES (?, ?, ?, '2026-01-05', '2026-02-05', 0, 0, 'PENDING', ?)
                        `).run(`INV-${adm}-T1`, studentId, termId, userId).lastInsertRowid as number

                        const structures = db!.prepare(`
                            SELECT fs.*, fc.category_name 
                            FROM fee_structure fs 
                            JOIN fee_category fc ON fs.fee_category_id = fc.id
                            WHERE fs.stream_id = ? AND fs.student_type = ? AND fs.term_id = ?
                        `).all(stream.id, type, termId) as FeeStructureResult[]

                        let totalInvoiceAmount = 0
                        for (const fs of structures) {
                            db!.prepare(`
                                INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
                                VALUES (?, ?, ?, ?)
                            `).run(invoiceId, fs.fee_category_id, fs.category_name, fs.amount)
                            totalInvoiceAmount += fs.amount
                        }

                        db!.prepare('UPDATE fee_invoice SET total_amount = ? WHERE id = ?').run(totalInvoiceAmount, invoiceId)

                        const payRand = Math.random()
                        let payAmount = 0
                        if (payRand > 0.6) payAmount = totalInvoiceAmount
                        else if (payRand > 0.3) payAmount = Math.floor(totalInvoiceAmount * 0.5)

                        if (payAmount > 0) {
                            const transRef = `PAY-${adm}-T1`
                            const mpesaRef = `34262K ${firstNames[idx]} ${stream.stream_code}`
                            const transactionId = db!.prepare(`
                                INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, payment_method, payment_reference, description, recorded_by_user_id)
                                VALUES (?, '2026-01-10', 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'MPESA', ?, 'Term 1 Fee Payment', ?)
                            `).run(transRef, feeIncomeCat, payAmount, studentId, mpesaRef, userId).lastInsertRowid as number

                            db!.prepare(`
                                INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id)
                                VALUES (?, ?, '2026-01-10', ?, ?, 'MPESA', ?, ?)
                            `).run(`REC-${adm}-T1`, transactionId, studentId, payAmount, mpesaRef, userId)

                            db!.prepare('UPDATE fee_invoice SET amount_paid = ?, status = ? WHERE id = ?')
                                .run(payAmount, payAmount >= totalInvoiceAmount ? 'PAID' : 'PARTIAL', invoiceId)
                        }

                        studentCount++
                    }
                }

                // 8. Seed Expenses
                db!.prepare(`
                    INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, description, recorded_by_user_id)
                    VALUES ('EXP-2026-001', '2026-01-15', 'EXPENSE', ?, 250000000, 'DEBIT', 'January Electricity Bill', ?)
                `).run(utilityCat, userId)

                // 9. Seed Staff & Payroll
                const staffSpecs = [
                    { no: 'ST-001', first: 'Joseph', last: 'Omondi', job: 'Head Teacher', salary: 8500000 }, // Assuming 85k? 85000 * 100 = 8500000. Wait, 8500000 cents = 85,000.00. Correct.
                    { no: 'ST-002', first: 'Catherine', last: 'Mutuku', job: 'Senior Teacher', salary: 6500000 },
                    { no: 'ST-003', first: 'Philip', last: 'Kamau', job: 'Accounts Clerk', salary: 5000000 }
                ]

                const periodId = db!.prepare(`
                    INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status)
                    VALUES ('January 2026', 1, 2026, '2026-01-01', '2026-01-31', 'OPEN')
                `).run().lastInsertRowid as number

                for (const s of staffSpecs) {
                    const staffId = db!.prepare(`
                        INSERT INTO staff (staff_number, first_name, last_name, job_title, basic_salary, is_active, employment_date)
                        VALUES (?, ?, ?, ?, ?, 1, '2024-01-01')
                    `).run(s.no, s.first, s.last, s.job, s.salary).lastInsertRowid as number

                    db!.prepare(`
                        INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary, payment_status)
                        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
                    `).run(periodId, staffId, s.salary, s.salary, 0, s.salary)
                }

                // 10. Seed Inventory
                const invCat = db!.prepare('SELECT id FROM inventory_category LIMIT 1').get() as { id: number } | undefined
                if (invCat) {
                    const itemId = db!.prepare(`
                        INSERT INTO inventory_item (item_code, item_name, category_id, unit_of_measure, current_stock, unit_cost)
                        VALUES ('STA-001', 'Chalks White (Box)', ?, 'Box', 100, 25000) 
                    `).run(invCat.id).lastInsertRowid as number
                    // 25000 cents = 250.00. Seems low for a box of chalk? Maybe 250 shillings?
                    // If 250 shillings, should be 25000.
                    // If 2500 shillings (25k), should be 2500000.
                    // Assuming existing 25000 meant 250.00 or 25,000? 
                    // Let's assume 250 shillings per box -> 25000 cents.
                    // But if it was 25000 shillings (expensive chalk?), then 2500000.
                    // Keeping 25000 for now assuming 250 KES.

                    db!.prepare(`
                        INSERT INTO stock_movement (item_id, movement_type, quantity, unit_cost, total_cost, description, movement_date, recorded_by_user_id)
                        VALUES (?, 'IN', 100, 25000, 2500000, 'Opening Stock', '2026-01-05', ?)
                    `).run(itemId, userId)

                    db!.prepare(`
                        INSERT INTO stock_movement (item_id, movement_type, quantity, description, movement_date, recorded_by_user_id)
                        VALUES (?, 'OUT', 10, 'Issued to Grade 1', '2026-01-10', ?)
                    `).run(itemId, userId)

                    db!.prepare('UPDATE inventory_item SET current_stock = 90 WHERE id = ?').run(itemId)
                }

                // 11. Seed Attendance
                const firstStudent = db!.prepare('SELECT student_id as id, stream_id FROM enrollment LIMIT 1').get() as { id: number; stream_id: number } | undefined
                if (firstStudent) {
                    db!.prepare(`
                        INSERT INTO attendance (student_id, stream_id, academic_year_id, term_id, attendance_date, status, marked_by_user_id)
                        VALUES (?, ?, ?, ?, '2026-01-05', 'PRESENT', ?)
                    `).run(firstStudent.id, firstStudent.stream_id, yearId, termId, userId)
                }

                db!.prepare(`
                    INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values)
                    VALUES (?, 'SYSTEM_RESET', 'DATABASE', 0, 'Full Institutional Seeding for 2026 Done')
                `).run(userId)

            })()

            // Re-enable foreign keys
            db.pragma('foreign_keys = ON')

            return { success: true, message: 'Institutional environment for 2026 established successfully (Foreign Key constraints bypassed during reset).' }
        } catch (error) {
            console.error('Data reset failed:', error)
            // Ensure FKs are back on even on error
            try { db.pragma('foreign_keys = ON') } catch (e) {
                // Ignore pragma errors during error handling
            }
            return { success: false, message: error instanceof Error ? error.message : 'Reset failed' }
        }
    }
}

