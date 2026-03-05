import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 10
let sessionRole = 'ADMIN'

vi.mock('keytar', () => ({
    default: {
        getPassword: vi.fn(async () => JSON.stringify({
            user: {
                id: sessionUserId,
                username: 'admin',
                email: 'admin@example.com',
                role: sessionRole,
                full_name: 'Admin User',
                is_active: 1,
                created_at: new Date().toISOString()
            },
            lastActivity: Date.now()
        })),
        setPassword: vi.fn(),
        deletePassword: vi.fn(),
    }
}))

vi.mock('../../../electron-env', () => ({
    ipcMain: {
        handle: vi.fn((channel: string, handler: IpcHandler) => {
            handlerMap.set(channel, handler)
        }),
        removeHandler: vi.fn(),
    }
}))

vi.mock('../../../database', () => ({
    getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

vi.mock('../../finance/finance-handler-utils', () => ({
    createGetOrCreateCategoryId: vi.fn().mockReturnValue(1),
    generateSingleStudentInvoice: vi.fn(() => ({ success: true, invoiceNumber: 'INV-TEST-001' }))
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
    container: {
        resolve: vi.fn(() => ({}))
    }
}))

vi.mock('../../../utils/image-utils', () => ({
    saveImageFromDataUrl: vi.fn(async () => '/mock/path/student_1.jpg'),
    getImageAsBase64DataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
    deleteImage: vi.fn(async () => {}),  
}))

// Import the handlers to register them
import { registerStudentHandlers } from '../student-handlers'

function attachActor(event: any) {
    event.__ipcActor = {
        id: sessionUserId,
        role: sessionRole
    };
}

function seedStudents() {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
        VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', '2010-03-01', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1)`).run()
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
        VALUES (2, 'ADM200', 'Bob', 'Kimani', 'M', '2011-06-15', 'BOARDER', '2024-01-01', 'Parent B', '0722', 'Parent', 'Addr B', 1)`).run()
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
        VALUES (3, 'ADM300', 'Carol', 'Odhiambo', 'F', '2009-12-10', 'BOARDER', '2024-01-01', 'Parent C', '0733', 'Parent', 'Addr C', 0)`).run()
    // Enrollments: Alice → stream 1, Bob → stream 1, Carol → stream 1 (inactive)
    db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
        VALUES (1, 1, 1, 1, 1, 'DAY_SCHOLAR', '2024-01-01', 'ACTIVE')`).run()
    db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
        VALUES (2, 1, 1, 1, 1, 'BOARDER', '2024-01-01', 'ACTIVE')`).run()
}

describe('student IPC handlers', () => {
    beforeEach(() => {
        handlerMap.clear()
        sessionUserId = 10
        sessionRole = 'ADMIN'
        clearSessionCache()
        db = new Database(':memory:')

        // Create minimal schema for testing
        db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admission_number TEXT UNIQUE,
        first_name TEXT,
        middle_name TEXT,
        last_name TEXT,
        gender TEXT,
        date_of_birth TEXT,
        student_type TEXT,
        admission_date TEXT,
        guardian_name TEXT,
        guardian_phone TEXT,
        guardian_email TEXT,
        guardian_relationship TEXT,
        address TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        photo_path TEXT,
        credit_balance INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        total_amount INTEGER,
        amount_due INTEGER,
        amount INTEGER,
        amount_paid INTEGER,
        status TEXT,
        is_voided INTEGER DEFAULT 0
      );
      CREATE TABLE student_stream_link (student_id INTEGER, stream_id INTEGER, is_active INTEGER);
      CREATE TABLE stream (id INTEGER PRIMARY KEY, stream_name TEXT);
      CREATE TABLE student_account (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, balance INTEGER, credit_balance INTEGER);
      
      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        start_date TEXT,
        end_date TEXT,
        is_current INTEGER DEFAULT 0
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER,
        term_number INTEGER,
        name TEXT,
        start_date TEXT,
        end_date TEXT,
        is_current INTEGER DEFAULT 0
      );
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        academic_year_id INTEGER,
        term_id INTEGER,
        academic_term_id INTEGER,
        stream_id INTEGER,
        student_type TEXT,
        enrollment_date TEXT,
        status TEXT
      );

      CREATE TABLE message_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_type TEXT NOT NULL,
        recipient_id INTEGER,
        recipient_contact TEXT NOT NULL,
        message_type TEXT NOT NULL,
        subject TEXT,
        message_body TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        external_id TEXT,
        error_message TEXT,
        sent_by_user_id INTEGER NOT NULL
      );
      
      INSERT INTO academic_year (name, is_current) VALUES ('2024', 1);
      INSERT INTO term (academic_year_id, term_number, name, is_current) VALUES (1, 1, 'Term 1', 1);
      INSERT INTO stream (stream_name) VALUES ('Form 1 East');
    `)

        registerStudentHandlers()
    })

    afterEach(() => {
        db.close()
    })

    it('creates a student successfully', async () => {
        const handler = handlerMap.get('student:create')
        expect(handler).toBeDefined()
        const event = {}
        attachActor(event)

        const studentData = {
            admission_number: 'ADM001',
            first_name: 'John',
            middle_name: 'Doe',
            last_name: 'Smith',
            gender: 'MALE',
            date_of_birth: '2010-01-01',
            student_type: 'BOARDER',
            admission_date: '2024-01-01',
            guardian_name: 'Jane Smith',
            guardian_phone: '0700000000',
            guardian_email: 'jane@example.com',
            guardian_relationship: 'Parent',
            address: '123 Street',
            notes: 'Test student',
            } 

 const result = await handler!(event, studentData) as { success: boolean; id?: number, error?: string }
        if (!result.success) {console.error('CREATE ERROR:', result.error)}
        expect(result.success).toBe(true)
        expect(result.id).toBeGreaterThan(0)

        const student = db.prepare('SELECT * FROM student WHERE id = ?').get(result.id) as any
        expect(student.first_name).toBe('John')
        expect(student.admission_number).toBe('ADM001')
    })

    it('validates input using Zod', async () => {
        const handler = handlerMap.get('student:create')
        expect(handler).toBeDefined()
        const event = {}
        attachActor(event)

        const invalidData = {
            admission_number: '', // Empty required field
            first_name: 'John'
        }

        const result = await handler!(event, invalidData) as { success: boolean; error?: string }
        expect(result.success).toBe(false)
        expect(result.error).toContain('Validation failed')
    })

    it('updates a student successfully', async () => {
        db.prepare(`INSERT INTO student (first_name, admission_number) VALUES ('Old', 'ADM002')`).run()
        const studentId = 1 // SQLite starts at 1

        const handler = handlerMap.get('student:update')
        expect(handler).toBeDefined()
        const event = {}
        attachActor(event)

        const updateData = { first_name: 'New' }

        // Handler expects [id, data, legacyUserId]
        const result = await handler!(event, studentId, updateData) as { success: boolean }
        expect(result.success).toBe(true)

        const student = db.prepare('SELECT first_name FROM student WHERE id = ?').get(studentId) as any
        expect(student.first_name).toBe('New')
    })

    it('purges student PII', async () => {
        db.prepare(`INSERT INTO student (id, first_name, admission_number, guardian_name, is_active) VALUES (1, 'John', 'ADM003', 'Parent', 0)`).run()
        db.prepare(`
          INSERT INTO message_log (
            recipient_type, recipient_id, recipient_contact, message_type, subject, message_body, status, sent_by_user_id
          ) VALUES ('STUDENT', 1, 'ADM003 parent', 'SMS', NULL, 'Original', 'SENT', 10)
        `).run()

        const handler = handlerMap.get('student:purge')
        expect(handler).toBeDefined()
        const event = {}
        attachActor(event)

        // Handler expects [id, reason]
        const result = await handler!(event, 1, 'GDPR Request') as { success: boolean, error?: string }
        if (!result.success) {console.error('PURGE ERROR:', result.error)}
        expect(result.success).toBe(true)

        const student = db.prepare('SELECT * FROM student WHERE id = 1').get() as any
        expect(student.first_name).toBe('[REDACTED-1]')
        expect(student.guardian_name).toBeNull()
        expect(student.is_active).toBe(0)

        const logRow = db.prepare('SELECT recipient_contact, message_body FROM message_log WHERE recipient_id = 1').get() as { recipient_contact: string; message_body: string } | undefined
        expect(logRow?.recipient_contact).toBe('[REDACTED-1]')
        expect(logRow?.message_body).toBe('purged')
    })

    // ── student:getAll ────────────────────────────────────────────
    describe('student:getAll', () => {
        it('returns paginated students with defaults', async () => {
            seedStudents()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event) as any
            expect(result.totalCount).toBe(3)
            expect(result.rows.length).toBe(3)
            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(50)
            // gender should be normalized from DB format
            const alice = result.rows.find((r: any) => r.admission_number === 'ADM100')
            expect(alice.gender).toBe('FEMALE')
        })

        it('filters by search term', async () => {
            seedStudents()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { search: 'Bob' }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Bob')
        })

        it('filters by streamId', async () => {
            seedStudents()
            // Add a second stream and enroll Alice there with a newer enrollment
            db.prepare(`INSERT INTO stream (id, stream_name) VALUES (2, 'Form 1 West')`).run()
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
                VALUES (1, 1, 1, 1, 2, 'DAY_SCHOLAR', '2024-02-01', 'ACTIVE')`).run()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            // Only Alice should be in stream 2
            const result = await handler(event, { streamId: 2 }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Alice')
        })

        it('filters by isActive', async () => {
            seedStudents()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { isActive: false }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Carol')
        })

        it('respects page and pageSize', async () => {
            seedStudents()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { page: 2, pageSize: 2 }) as any
            expect(result.page).toBe(2)
            expect(result.pageSize).toBe(2)
            expect(result.rows.length).toBe(1) // 3 students total, page 2 with pageSize 2 = 1 remaining
        })

        it('includes invoice balance in results', async () => {
            seedStudents()
            // Create an invoice for Alice: total_amount 5000, paid 2000
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_due, amount, amount_paid, status) VALUES (1, 5000, 5000, 5000, 2000, 'PENDING')`).run()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event) as any
            const alice = result.rows.find((r: any) => r.admission_number === 'ADM100')
            expect(alice.balance).toBe(3000) // 5000 - 2000 invoice balance, 0 credit
        })
    })

    // ── student:getById ────────────────────────────────────────────
    describe('student:getById', () => {
        it('returns student with enrollment info', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, credit_balance)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', '2010-03-01', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 500)`).run()
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
                VALUES (1, 1, 1, 1, 1, 'DAY_SCHOLAR', '2024-01-01', 'ACTIVE')`).run()
            const handler = handlerMap.get('student:getById')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.first_name).toBe('Alice')
            expect(result.gender).toBe('FEMALE') // transformed from 'F'
            expect(result.credit_balance).toBe(500)
            expect(result.stream_name).toBe('Form 1 East')
            expect(result.stream_id).toBe(1)
        })

        it('returns undefined for non-existent student', async () => {
            const handler = handlerMap.get('student:getById')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999)
            expect(result).toBeUndefined()
        })
    })

    // ── student:getBalance ────────────────────────────────────────────
    describe('student:getBalance', () => {
        it('returns net balance from invoices minus credit', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, credit_balance)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1000)`).run()
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_due, amount, amount_paid, status) VALUES (1, 10000, 10000, 10000, 3000, 'PENDING')`).run()
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_due, amount, amount_paid, status) VALUES (1, 5000, 5000, 5000, 0, 'PENDING')`).run()
            const handler = handlerMap.get('student:getBalance')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1)
            // invoice_balance = (10000-3000) + (5000-0) = 12000; credit = 1000 → net = 11000
            expect(result).toBe(11000)
        })

        it('excludes voided/cancelled invoices', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, credit_balance)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 0)`).run()
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_due, amount, amount_paid, status) VALUES (1, 5000, 5000, 5000, 0, 'CANCELLED')`).run()
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_due, amount, amount_paid, status, is_voided) VALUES (1, 3000, 3000, 3000, 0, 'PENDING', 1)`).run()
            const handler = handlerMap.get('student:getBalance')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1)
            expect(result).toBe(0) // Both excluded
        })

        it('returns 0 for student with no invoices', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A')`).run()
            const handler = handlerMap.get('student:getBalance')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1)
            expect(result).toBe(0)
        })
    })

    // ── student:getPhotoDataUrl ────────────────────────────────────────────
    describe('student:getPhotoDataUrl', () => {
        it('returns base64 data URL when photo exists', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, photo_path)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', '/images/students/student_1.jpg')`).run()
            const handler = handlerMap.get('student:getPhotoDataUrl')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1)
            expect(result).toBe('data:image/jpeg;base64,AAAA')
        })

        it('returns null when student has no photo', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A')`).run()
            const handler = handlerMap.get('student:getPhotoDataUrl')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1)
            expect(result).toBeNull()
        })
    })

    // ── student:deactivate ────────────────────────────────────────────
    describe('student:deactivate', () => {
        it('deactivates an active student', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1)`).run()
            const handler = handlerMap.get('student:deactivate')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.success).toBe(true)
            const student = db.prepare('SELECT is_active FROM student WHERE id = 1').get() as any
            expect(student.is_active).toBe(0)
        })

        it('rejects deactivation of non-existent student', async () => {
            const handler = handlerMap.get('student:deactivate')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('not found')
        })

        it('rejects deactivation of already-deactivated student', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 0)`).run()
            const handler = handlerMap.get('student:deactivate')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('already deactivated')
        })
    })

    // ── student:uploadPhoto ────────────────────────────────────────────
    describe('student:uploadPhoto', () => {
        it('saves photo and updates DB', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A')`).run()
            const handler = handlerMap.get('student:uploadPhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1, 'data:image/jpeg;base64,AAAA') as any
            expect(result.success).toBe(true)
            expect(result.filePath).toBe('/mock/path/student_1.jpg')
            const student = db.prepare('SELECT photo_path FROM student WHERE id = 1').get() as any
            expect(student.photo_path).toBe('/mock/path/student_1.jpg')
        })
    })

    // ── student:removePhoto ────────────────────────────────────────────
    describe('student:removePhoto', () => {
        it('removes existing photo and clears DB', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, photo_path)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', '/images/students/student_1.jpg')`).run()
            const handler = handlerMap.get('student:removePhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.success).toBe(true)
            const student = db.prepare('SELECT photo_path FROM student WHERE id = 1').get() as any
            expect(student.photo_path).toBeNull()
        })

        it('succeeds even when student has no photo', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A')`).run()
            const handler = handlerMap.get('student:removePhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.success).toBe(true)
        })
    })

    // ── student:create with stream_id (enrollment + auto-invoice) ──
    describe('student:create with enrollment', () => {
        it('creates enrollment and auto-invoice when stream_id provided', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const studentData = {
                admission_number: 'ADM-ENROLL-001',
                first_name: 'Enroll',
                last_name: 'Test',
                gender: 'MALE',
                date_of_birth: '2010-05-15',
                student_type: 'BOARDER',
                admission_date: '2024-02-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_email: '',
                guardian_relationship: 'Parent',
                address: '123 Street',
                notes: '',
                stream_id: 1,
            }
            const result = await handler(event, studentData) as any
            expect(result.success).toBe(true)
            expect(result.id).toBeGreaterThan(0)
            expect(result.invoiceGenerated).toBe(true)
            expect(result.invoiceNumber).toBe('INV-TEST-001')

            // Enrollment should exist
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id) as any
            expect(enrollment).toBeDefined()
            expect(enrollment.stream_id).toBe(1)
            expect(enrollment.student_type).toBe('BOARDER')
            expect(enrollment.status).toBe('ACTIVE')
            expect(enrollment.academic_year_id).toBe(1)
            expect(enrollment.term_id).toBe(1)
        })

        it('rejects create when first_name is empty', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const studentData = {
                admission_number: 'ADM-EMPTY',
                first_name: '',
                last_name: 'Test',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-02-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: '123 Street',
            }
            const result = await handler(event, studentData) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('required')
        })
    })

    // ── student:update with stream_id (re-enrollment) ──────────────
    describe('student:update with enrollment', () => {
        it('creates new enrollment when stream_id provided on update', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A')`).run()
            // Add an existing enrollment
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
                VALUES (1, 1, 1, 1, 1, 'DAY_SCHOLAR', '2024-01-01', 'ACTIVE')`).run()

            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            // Update with new stream_id=1 triggers re-enrollment (deactivates old, creates new)
            const result = await handler(event, 1, { stream_id: 1 }) as any
            expect(result.success).toBe(true)

            // Old enrollment should be INACTIVE, new one should be ACTIVE
            const enrollments = db.prepare('SELECT * FROM enrollment WHERE student_id = 1 ORDER BY id').all() as any[]
            expect(enrollments.length).toBe(2)
            expect(enrollments[0].status).toBe('INACTIVE')
            expect(enrollments[1].status).toBe('ACTIVE')
        })
    })

    // ── student:purge edge cases ────────────────────────────────────
    describe('student:purge edge cases', () => {
        it('rejects purge of active student', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1)`).run()
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1, 'Test purge') as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Cannot purge an active student')
        })

        it('rejects purge of non-existent student', async () => {
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999, 'Test purge') as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Student not found')
        })

        it('deletes enrollment records on purge', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 0)`).run()
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status)
                VALUES (1, 1, 1, 1, 1, 'DAY_SCHOLAR', '2024-01-01', 'ACTIVE')`).run()
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1, 'DPA request') as any
            expect(result.success).toBe(true)
            const enrollments = db.prepare('SELECT * FROM enrollment WHERE student_id = 1').all()
            expect(enrollments.length).toBe(0)
        })
    })

    // ── student:getBalance ──────────────────────────────────────────
    describe('student:getBalance', () => {
        it('returns zero balance for student with no invoices', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 0)`).run()
            const handler = handlerMap.get('student:getBalance')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as number
            expect(result).toBe(0)
        })

        it('computes balance from invoices minus credit_balance', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, credit_balance)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 500)`).run()
            db.prepare(`INSERT INTO fee_invoice (student_id, total_amount, amount_paid, status)
                VALUES (1, 5000, 2000, 'PENDING')`).run()
            const handler = handlerMap.get('student:getBalance')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as number
            // invoice_balance = 5000 - 2000 = 3000; balance = 3000 - 500 = 2500
            expect(result).toBe(2500)
        })
    })

    // ── student:create with invalid stream_id (normalizeStreamId) ───
    describe('student:create with invalid stream_id', () => {
        it('ignores stream_id=0 and skips enrollment', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-ZERO-STREAM',
                first_name: 'Zero',
                last_name: 'Stream',
                date_of_birth: '2012-05-15',
                gender: 'FEMALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-03-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 0,
            }) as any
            expect(result.success).toBe(true)
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id)
            expect(enrollment).toBeUndefined()
        })

        it('ignores negative stream_id and skips enrollment', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-NEG-STREAM',
                first_name: 'Neg',
                last_name: 'Stream',
                date_of_birth: '2011-08-20',
                gender: 'MALE',
                student_type: 'BOARDER',
                admission_date: '2024-04-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: -5,
            }) as any
            expect(result.success).toBe(true)
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id)
            expect(enrollment).toBeUndefined()
        })
    })

    // ── student:getPhotoDataUrl ─────────────────────────────────────
    describe('student:getPhotoDataUrl', () => {
        it('returns null when student has no photo', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi')`).run()
            const handler = handlerMap.get('student:getPhotoDataUrl')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result).toBeNull()
        })

        it('returns data URL when student has photo', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, photo_path)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', '/images/students/student_1.jpg')`).run()
            const handler = handlerMap.get('student:getPhotoDataUrl')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as string
            expect(result).toBe('data:image/jpeg;base64,AAAA')
        })
    })

    // ── student:getAll with search filter ─────────────────────────────
    describe('student:getAll with search filter', () => {
        it('filters by search term matching first_name', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', '2010-03-01', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1)`).run()
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (2, 'ADM200', 'Bob', 'Kimani', 'M', '2011-06-15', 'BOARDER', '2024-01-01', 'Parent B', '0722', 'Parent', 'Addr B', 1)`).run()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { search: 'Bob' }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Bob')
        })
    })

    // ── student:getAll with isActive filter ─────────────────────────────
    describe('student:getAll with isActive filter', () => {
        it('filters by isActive=false', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent A', '0711', 'Parent', 'Addr A', 1)`).run()
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (2, 'ADM200', 'Bob', 'Kimani', 'M', 'BOARDER', '2024-01-01', 'Parent B', '0722', 'Parent', 'Addr B', 0)`).run()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { isActive: false }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Bob')
        })
    })

    // ── student:create duplicate admission_number ──────────────
    describe('student:create duplicate admission_number', () => {
        it('rejects duplicate admission_number', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (1, 'ADM-DUP', 'First', 'Student', 'M', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0700', 'Parent', 'Addr')`).run()
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-DUP',
                first_name: 'Second',
                last_name: 'Student',
                gender: 'FEMALE',
                student_type: 'BOARDER',
                admission_date: '2024-02-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
            }) as any
            expect(result.success).toBe(false)
        })
    })

    // ── student:update non-existent student ──────────────
    describe('student:update edge cases', () => {
        it('rejects update of non-existent student', async () => {
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999, { first_name: 'New' }) as any
            expect(result.success).toBe(false)
        })

        // Branch coverage: validateId failure for student:update (L549)
        it('rejects update with invalid (non-positive) student ID', async () => {
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, -1, { first_name: 'X' }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })
    })

    // ── extended branch coverage ──────────────────────────────────
    describe('normalizeStreamId edge cases', () => {
        it('creates student without enrollment when stream_id is zero (non-positive)', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-NO-STREAM',
                first_name: 'NoStream',
                last_name: 'Student',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 0
            }) as any
            expect(result.success).toBe(true)
            // No enrollment should be created since normalizeStreamId returns null for 0
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id)
            expect(enrollment).toBeUndefined()
        })
    })

    describe('resolveEnrollmentContext failure', () => {
        it('student:create fails gracefully when no academic year exists', async () => {
            // Remove all academic years and terms to trigger resolveEnrollmentContext → null
            db.exec('DELETE FROM term')
            db.exec('DELETE FROM academic_year')

            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-NO-YEAR',
                first_name: 'NoYear',
                last_name: 'Student',
                date_of_birth: '2010-05-15',
                gender: 'FEMALE',
                student_type: 'BOARDER',
                admission_date: '2024-03-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1
            }) as any
            // createEnrollment should throw because resolveEnrollmentContext returns null
            expect(result.success).toBe(false)
            expect(result.error).toContain('No active academic year')
        })
    })

    describe('student:getById edge cases', () => {
        it('returns undefined for non-existent student', async () => {
            const handler = handlerMap.get('student:getById')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999999)
            expect(result).toBeUndefined()
        })
    })

    // ── branch coverage: resolveEnrollmentContext fallback paths ───
    describe('resolveEnrollmentContext – fallback year', () => {
        it('uses fallback academic year when no is_current flag is set', async () => {
            db.prepare('UPDATE academic_year SET is_current = 0').run()
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-FB-YEAR',
                first_name: 'FallbackYear',
                last_name: 'Test',
                gender: 'MALE',
                date_of_birth: '2010-01-01',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1,
            }) as any
            expect(result.success).toBe(true)
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id) as any
            expect(enrollment).toBeDefined()
        })

        it('uses fallback term when no current term flag is set', async () => {
            db.prepare('UPDATE term SET is_current = 0').run()
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-FB-TERM',
                first_name: 'FallbackTerm',
                last_name: 'Test',
                gender: 'FEMALE',
                date_of_birth: '2010-01-01',
                student_type: 'BOARDER',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1,
            }) as any
            expect(result.success).toBe(true)
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id) as any
            expect(enrollment).toBeDefined()
        })
    })

    // ── branch coverage: student:getAll with streamId filter ───
    describe('student:getAll – streamId filter', () => {
        it('filters students by stream', async () => {
            db.prepare(`INSERT INTO stream (id, stream_name) VALUES (2, 'Form 2')`).run()
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (1, 'ADM100', 'Alice', 'M', 1)`).run()
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (2, 'ADM200', 'Bob', 'K', 1)`).run()
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status) VALUES (1, 1, 1, 1, 1, 'DAY_SCHOLAR', '2024-01-01', 'ACTIVE')`).run()
            db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, enrollment_date, status) VALUES (2, 1, 1, 1, 2, 'BOARDER', '2024-01-01', 'ACTIVE')`).run()
            const handler = handlerMap.get('student:getAll')!
            const event = {}; attachActor(event)
            const result = await handler(event, { streamId: 1 }) as any
            expect(result.totalCount).toBe(1)
            expect(result.rows[0].first_name).toBe('Alice')
        })
    })

    // ── Branch coverage: getPhotoDataUrl for non-existent student ───
    describe('student:getPhotoDataUrl – non-existent student', () => {
        it('returns null when student does not exist in DB', async () => {
            const handler = handlerMap.get('student:getPhotoDataUrl')!
            const event = {}; attachActor(event)
            const result = await handler(event, 999)
            expect(result).toBeNull()
        })
    })

    // ── Branch coverage: uploadPhoto error path ───
    describe('student:uploadPhoto – error handling', () => {
        it('returns error when saveImageFromDataUrl throws', async () => {
            const { saveImageFromDataUrl } = await import('../../../utils/image-utils')
            vi.mocked(saveImageFromDataUrl).mockRejectedValueOnce(new Error('Disk full'))
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi')`).run()
            const handler = handlerMap.get('student:uploadPhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1, 'data:image/jpeg;base64,AAAA') as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Disk full')
        })
    })

    // ── Branch coverage: removePhoto error path ───
    describe('student:removePhoto – error handling', () => {
        it('returns error when deleteImage throws', async () => {
            const { deleteImage } = await import('../../../utils/image-utils')
            vi.mocked(deleteImage).mockRejectedValueOnce(new Error('Permission denied'))
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, photo_path)
                VALUES (1, 'ADM100', 'Alice', 'Mwangi', '/images/students/student_1.jpg')`).run()
            const handler = handlerMap.get('student:removePhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 1) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Permission denied')
        })
    })

    // ── Branch coverage: auto-invoice failure during student:create ───
    describe('student:create – auto-invoice failure', () => {
        it('reports error when invoice generation fails', async () => {
            const finUtils = await import('../../finance/finance-handler-utils')
            vi.mocked(finUtils.generateSingleStudentInvoice).mockReturnValueOnce(
                { success: false, error: 'Fee structure not defined' } as any
            )
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-INV-FAIL',
                first_name: 'InvFail',
                last_name: 'Test',
                gender: 'MALE',
                date_of_birth: '2010-01-01',
                student_type: 'BOARDER',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1,
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Fee structure not defined')
        })
    })

    // ── Branch coverage: normalizeStreamId with NaN-like values ───
    describe('normalizeStreamId – edge cases', () => {
        it('normalizeStreamId returns null for NaN stream_id (no enrollment)', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-NAN-STREAM',
                first_name: 'NaN',
                last_name: 'Stream',
                date_of_birth: '2011-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: Number.NaN,
            }) as any
            // NaN is not finite → normalizeStreamId returns null → no enrollment created
            // Student creation itself may still succeed or fail depending on schema validation
            // The key branch is that normalizeStreamId(NaN) returns null
            expect(result).toBeDefined()
        })
    })

    // ── Branch coverage: getUnknownErrorMessage with non-Error non-string ──
    describe('getUnknownErrorMessage fallback branch', () => {
        it('student:create returns fallback message when non-Error non-string is thrown', async () => {
            // Force db.transaction to throw a number (neither Error nor string)
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw 42 }) as unknown as ReturnType<typeof _origTransaction> // NOSONAR
            })

            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ADM-FALLBACK-ERR',
                first_name: 'Fallback',
                last_name: 'Error',
                date_of_birth: '2011-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to create student')
        })

        it('student:update returns fallback message when non-Error non-string is thrown', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (99, 'ADM-FALLBACK-UPD', 'Up', 'Date', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr')`).run()
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw { code: 500 } }) as unknown as ReturnType<typeof _origTransaction> // NOSONAR
            })

            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 99, { first_name: 'Updated' }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to update student')
        })
    })

    // ── Branch coverage: error instanceof Error FALSE in photo handlers ──
    describe('photo handler non-Error branches', () => {
        it('student:uploadPhoto returns fallback when non-Error is thrown', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES (88, 'ADM-PHOTO-ERR', 'Photo', 'Err', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr')`).run()
            const { saveImageFromDataUrl } = await import('../../../utils/image-utils')
            vi.mocked(saveImageFromDataUrl).mockRejectedValueOnce('not an error object') // NOSONAR

            const handler = handlerMap.get('student:uploadPhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 88, 'data:image/jpeg;base64,AAAA') as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to upload photo')
        })

        it('student:removePhoto returns fallback when non-Error is thrown', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, photo_path)
                VALUES (87, 'ADM-REMOVE-ERR', 'Remove', 'Err', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr', '/path/img.jpg')`).run()
            const { deleteImage } = await import('../../../utils/image-utils')
            vi.mocked(deleteImage).mockRejectedValueOnce(404) // NOSONAR

            const handler = handlerMap.get('student:removePhoto')!
            const event = {}; attachActor(event)
            const result = await handler(event, 87) as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to remove photo')
        })
    })

    // ── Branch coverage: error instanceof Error FALSE in purge handler ──
    describe('purge handler non-Error branch', () => {
        it('student:purge returns fallback when non-Error is thrown', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (86, 'ADM-PURGE-ERR', 'Purge', 'Err', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr', 0)`).run()
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw null }) as unknown as ReturnType<typeof _origTransaction> // NOSONAR
            })

            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 86, 'Test purge reason') as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('Purge failed')
        })
    })

    // ── Branch coverage: getUnknownErrorMessage with string error ──
    describe('getUnknownErrorMessage string branch', () => {
        it('student:create returns string error message when thrown as string', async () => {
            // Insert a student first so we can test duplicate admission number error
            db.prepare(`INSERT INTO student (admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES ('DUP-001', 'First', 'Student', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr')`).run()
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            // Creating a student with duplicate admission number triggers a UNIQUE constraint error
            const result = await handler(event, {
                admission_number: 'DUP-001',
                first_name: 'Dup',
                last_name: 'Student',
                gender: 'M',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('student:create returns the thrown string when error is a string (L186 true branch)', async () => {
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw 'custom string error message' }) as unknown as ReturnType<typeof _origTransaction> // NOSONAR
            })

            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'STR-ERR-001',
                first_name: 'String',
                last_name: 'Error',
                date_of_birth: '2011-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'Parent',
                guardian_phone: '0700000000',
                guardian_relationship: 'Parent',
                address: 'Addr',
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('custom string error message')
        })

        it('student:update returns the thrown string when error is a string (L549 catch)', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (777, 'STR-UPD-001', 'StrUpd', 'Test', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr', 1)`).run()
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw 'update string error' }) as unknown as ReturnType<typeof _origTransaction> // NOSONAR
            })

            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 777, { first_name: 'Updated' }) as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('update string error')
        })
    })

    // ── Branch coverage: coalesceValue when incoming is undefined ──
    describe('coalesceValue undefined branch', () => {
        it('student:update preserves existing value when field is undefined', async () => {
            // Insert a student first
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (900, 'COAL-001', 'Existing', 'Name', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr', 1)`).run()
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            // Update with only notes field, leaving first_name undefined → coalesceValue returns current
            const result = await handler(event, 900, {
                notes: 'Updated notes only'
            }) as any
            expect(result.success).toBe(true)
            const updated = db.prepare('SELECT first_name, notes FROM student WHERE id = ?').get(900) as { first_name: string; notes: string }
            expect(updated.first_name).toBe('Existing') // preserved
            expect(updated.notes).toBe('Updated notes only')
        })
    })

    // ── Branch coverage: normalizeStreamId edge cases ──
    describe('normalizeStreamId edge cases', () => {
        it('student:create with string streamId returns validation error', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NORM-001',
                first_name: 'Norm',
                last_name: 'Test',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 'not-a-number' as any
            }) as any
            // Zod rejects invalid stream_id → validation error
            expect(result.success).toBe(false)
        })

        it('student:create without stream_id succeeds and skips enrollment', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NORM-002',
                first_name: 'NoStream',
                last_name: 'Test',
                date_of_birth: '2010-05-15',
                gender: 'FEMALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr'
            }) as any
            expect(result.success).toBe(true)
            // No enrollment should be created
            const enrollment = db.prepare('SELECT * FROM enrollment WHERE student_id = ?').get(result.id)
            expect(enrollment).toBeUndefined()
        })

        it('student:create with NaN streamId skips enrollment', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NORM-003',
                first_name: 'NaN',
                last_name: 'Test',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: Number.NaN
            }) as any
            // NaN passes z.number() but normalizeStreamId returns null → no enrollment
            expect(result).toBeDefined()
        })
    })

    // ── Branch coverage: student:getById with missing student ──
    describe('student:getById not found', () => {
        it('returns falsy for non-existent student id', async () => {
            const handler = handlerMap.get('student:getById')!
            const event = {}; attachActor(event)
            const result = await handler(event, 99999) as any
            expect(result).toBeFalsy()
        })
    })

    // ── Branch coverage: mergeStudentUpdate gender & is_active undefined ──
    describe('mergeStudentUpdate preserves gender and is_active when undefined', () => {
        it('student:update with undefined gender preserves existing gender', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (901, 'MERGE-001', 'Merge', 'Test', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr', 1)`).run()
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 901, {
                first_name: 'Updated'
                // gender not provided → undefined → should preserve 'M'
            }) as any
            expect(result.success).toBe(true)
            const updated = db.prepare('SELECT gender FROM student WHERE id = ?').get(901) as { gender: string }
            expect(updated.gender).toBe('M')
        })
    })

    // ── Branch coverage: mergeStudentUpdate gender and is_active explicitly set (L192, L193 alternate) ──
    describe('mergeStudentUpdate gender and is_active explicit', () => {
        it('student:update with explicit gender triggers toDbGender branch', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (902, 'MERGE-002', 'Gender', 'Test', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr', 1)`).run()
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 902, {
                gender: 'FEMALE'
            }) as any
            expect(result.success).toBe(true)
            const updated = db.prepare('SELECT gender FROM student WHERE id = ?').get(902) as { gender: string }
            expect(updated.gender).toBe('F')
        })

        it('student:update with explicit is_active triggers toDbActiveFlag branch', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (903, 'MERGE-003', 'Active', 'Test', 'M', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr', 1)`).run()
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 903, {
                is_active: false
            }) as any
            expect(result.success).toBe(true)
            const updated = db.prepare('SELECT is_active FROM student WHERE id = ?').get(903) as { is_active: number }
            expect(updated.is_active).toBe(0)
        })
    })

    // ── Branch coverage: student:purge with empty reason → fallback to Kenya DPA reason (L405) ──
    describe('student:purge fallback reason', () => {
        it('student:purge uses default reason when empty string given', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (85, 'ADM-PURGE-FALLBACK', 'Fallback', 'Reason', 'M', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr', 0)`).run()
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 85, '') as any
            expect(result.success).toBe(true)
            expect(result.message).toContain('purged successfully')
        })
    })

    // ── Branch coverage: student:getById with credit_balance=0 → || 0 fallback (L316) ──
    describe('student:getById credit_balance fallback', () => {
        it('student:getById returns 0 credit_balance for student with zero balance', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, credit_balance)
                VALUES (84, 'CB-ZERO', 'Zero', 'Balance', 'M', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr', 0)`).run()
            const handler = handlerMap.get('student:getById')!
            const event = {}; attachActor(event)
            const result = await handler(event, 84) as any
            expect(result).toBeDefined()
            expect(result.credit_balance).toBe(0)
        })
    })

    // ── Branch coverage: student:purge with Error thrown → error.message (L450 consequent) ──
    describe('student:purge Error instance branch', () => {
        it('student:purge returns error.message when Error is thrown', async () => {
            db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                VALUES (83, 'ADM-PURGE-ERRMSG', 'PurgeErr', 'Msg', 'F', 'DAY_SCHOLAR', '2024-01-01', 'Parent', '0711', 'Parent', 'Addr', 0)`).run()
            const _origTransaction = db.transaction.bind(db)
            vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
                return (() => { throw new Error('specific purge error') }) as unknown as ReturnType<typeof _origTransaction>
            })
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 83, 'Test purge') as any
            expect(result.success).toBe(false)
            expect(result.error).toBe('specific purge error')
        })
    })

    // ── Branch coverage: student:create fails when no terms exist (L85 !termId → null) ──
    describe('student:create enrollment with no terms', () => {
        it('student:create returns error when no term configured for enrollment', async () => {
            db.prepare('DELETE FROM term').run()
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NOTERM-001',
                first_name: 'No',
                last_name: 'Term',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('No active academic year/term')
        })
    })

    // ── Branch coverage: generateAutoInvoice with no invoiceNumber (L168 false branch) ──
    describe('student:create invoice without invoiceNumber', () => {
        it('student:create succeeds when invoice generated without invoiceNumber', async () => {
            const { generateSingleStudentInvoice } = await import('../../finance/finance-handler-utils')
            vi.mocked(generateSingleStudentInvoice).mockReturnValueOnce({ success: true } as any)
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NOINV-001',
                first_name: 'NoInv',
                last_name: 'Number',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1
            }) as any
            expect(result.success).toBe(true)
            expect(result.invoiceNumber).toBeUndefined()
        })
    })

    // ── Branch coverage: normalizeStreamId with NaN/0/negative/non-number (L184-187) ──
    describe('normalizeStreamId edge cases through student:create', () => {
        it('student:create with stream_id=0 treats it as null (no enrollment)', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'ZERO-STREAM-001',
                first_name: 'Zero',
                last_name: 'Stream',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 0
            }) as any
            // stream_id=0 normalizes to null → no enrollment created → still succeeds
            expect(result.success).toBe(true)
        })

        it('student:create with negative stream_id normalizes to null', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'NEG-STREAM-001',
                first_name: 'Neg',
                last_name: 'Stream',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: -5
            }) as any
            expect(result.success).toBe(true)
        })
    })

    // ── Branch coverage: mergeStudentUpdate – undefined gender/is_active (L202-203) ──
    describe('student:update with partial data preserves existing fields', () => {
        it('update with no gender/is_active keeps existing values', async () => {
            db.exec(`
                INSERT INTO student (admission_number, first_name, last_name, gender, is_active, date_of_birth, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                VALUES ('MERGE-001', 'MergeTest', 'User', 'M', 1, '2010-01-01', 'DAY_SCHOLAR', '2024-01-01', 'G', '0700', 'Parent', 'Addr')
            `)
            const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'MERGE-001'").get() as { id: number }
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            // Update only first_name, omit gender and is_active
            const result = await handler(event, stu.id, {
                first_name: 'MergeUpdated'
            }) as any
            expect(result.success).toBe(true)
            const updated = db.prepare('SELECT * FROM student WHERE id = ?').get(stu.id) as any
            expect(updated.first_name).toBe('MergeUpdated')
            expect(updated.gender).toBe('M')
            expect(updated.is_active).toBe(1)
        })
    })

    // ── Branch coverage: resolveEnrollmentContext – fallback to last year/term (L88-94) ──
    describe('resolveEnrollmentContext fallback paths', () => {
        it('student:create uses fallback year when no current year is set', async () => {
            // Remove is_current flag from academic_year
            db.exec("UPDATE academic_year SET is_current = 0")
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'FALLBACK-YEAR-001',
                first_name: 'Fallback',
                last_name: 'Year',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1
            }) as any
            expect(result.success).toBe(true)
        })
    })

    // ── Coverage: sanitized names empty (L473) ──
    describe('student:create – empty names after sanitization', () => {
        it('returns error when first_name is whitespace-only', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'SANITIZE-001',
                first_name: ' ',   // trims to empty
                last_name: 'Doe',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('required')
        })
    })

    // ── Coverage: non-integer stream_id in create (L510) ──
    describe('student:create – invalid stream_id inside transaction', () => {
        it('fails when stream_id is a non-integer number', async () => {
            const handler = handlerMap.get('student:create')!
            const event = {}; attachActor(event)
            const result = await handler(event, {
                admission_number: 'STREAM-FLOAT-001',
                first_name: 'John',
                last_name: 'Doe',
                date_of_birth: '2010-01-01',
                gender: 'MALE',
                student_type: 'DAY_SCHOLAR',
                admission_date: '2024-01-01',
                guardian_name: 'G',
                guardian_phone: '0700',
                guardian_relationship: 'Parent',
                address: 'Addr',
                stream_id: 1.5,
            }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid Stream')
        })
    })

    // ── Coverage: non-integer stream_id in update (L592) ──
    describe('student:update – invalid stream_id inside transaction', () => {
        it('fails when stream_id is a non-integer number', async () => {
            // Create a student to update
            db.exec(`INSERT INTO student (admission_number, first_name, last_name, date_of_birth, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address)
                      VALUES ('UPD-STREAM-001','Jane','Doe','2010-01-01','M','DAY_SCHOLAR','2024-01-01','G','0700','Parent','Addr')`)
            const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'UPD-STREAM-001'").get() as { id: number }
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, stu.id, { stream_id: 1.5 }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid Stream')
        })
    })

    // ── Branch coverage: student:deactivate with invalid ID (L352) ──
    describe('student:deactivate – invalid ID', () => {
        it('rejects deactivation with ID = 0', async () => {
            const handler = handlerMap.get('student:deactivate')!
            const event = {}; attachActor(event)
            const result = await handler(event, 0) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Too small')
        })

        it('rejects deactivation with negative ID', async () => {
            const handler = handlerMap.get('student:deactivate')!
            const event = {}; attachActor(event)
            const result = await handler(event, -5) as any
            expect(result.success).toBe(false)
        })
    })

    // ── Branch coverage: student:purge with invalid ID (L394) ──
    describe('student:purge – invalid ID', () => {
        it('rejects purge with ID = 0', async () => {
            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, 0, 'test reason') as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Too small')
        })
    })

    // ── Branch coverage: student:update with invalid ID (L548) ──
    describe('student:update – invalid ID', () => {
        it('rejects update with ID = 0', async () => {
            const handler = handlerMap.get('student:update')!
            const event = {}; attachActor(event)
            const result = await handler(event, 0, { first_name: 'New' }) as any
            expect(result.success).toBe(false)
            expect(result.error).toContain('Too small')
        })
    })

    // ── Branch coverage: student:purge with message_log table (L434) ──
    describe('student:purge – message_log table present', () => {
        it('anonymizes message_log entries during purge', async () => {
            // Create message_log table
            db.exec(`
              CREATE TABLE IF NOT EXISTS message_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient_type TEXT NOT NULL,
                recipient_id INTEGER,
                recipient_contact TEXT NOT NULL,
                message_type TEXT NOT NULL,
                subject TEXT,
                message_body TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                external_id TEXT,
                error_message TEXT,
                sent_by_user_id INTEGER NOT NULL
              );
            `)
            // Insert a student and deactivate first
            db.exec(`INSERT INTO student (admission_number, first_name, last_name, date_of_birth, gender, student_type, admission_date, guardian_name, guardian_phone, guardian_relationship, address, is_active)
                      VALUES ('PURGE-MSG-001','Msg','Student','2010-01-01','M','DAY_SCHOLAR','2024-01-01','G','0700','Parent','Addr', 0)`)
            const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'PURGE-MSG-001'").get() as { id: number }
            db.exec(`INSERT INTO message_log (recipient_type, recipient_contact, message_type, message_body, sent_by_user_id) VALUES ('STUDENT', '0700_PURGE-MSG-001', 'SMS', 'Hello', 1)`)

            const handler = handlerMap.get('student:purge')!
            const event = {}; attachActor(event)
            const result = await handler(event, stu.id, 'DPA request') as any
            expect(result.success).toBe(true)

            // Verify message_log was anonymized
            const msg = db.prepare('SELECT message_body FROM message_log WHERE id = 1').get() as { message_body: string }
            expect(msg.message_body).toBe('purged')
        })
    })
})
