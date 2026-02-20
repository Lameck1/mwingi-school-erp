import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
                role: sessionRole,
                full_name: 'Admin User',
                is_active: 1
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
    generateSingleStudentInvoice: vi.fn()
}))

// Import the handlers to register them
import { registerStudentHandlers } from '../student-handlers'

describe('student IPC handlers', () => {
    function attachActor(event: any) {
        event.__ipcActor = {
            id: sessionUserId,
            role: sessionRole
        };
    }

    beforeEach(() => {
        handlerMap.clear()
        sessionUserId = 10
        sessionRole = 'ADMIN'
        db = new Database(':memory:')

        // Create minimal schema for testing
        db.exec(`
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
        created_at TEXT,
        updated_at TEXT
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
            stream_id: null
        }

        const result = await handler!(event, studentData) as { success: boolean; id?: number }
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
        db.prepare(`INSERT INTO student (id, first_name, admission_number, guardian_name) VALUES (1, 'John', 'ADM003', 'Parent')`).run()

        const handler = handlerMap.get('student:purge')
        expect(handler).toBeDefined()
        const event = {}
        attachActor(event)

        // Handler expects [id, reason]
        const result = await handler!(event, 1, 'GDPR Request') as { success: boolean }
        expect(result.success).toBe(true)

        const student = db.prepare('SELECT * FROM student WHERE id = 1').get() as any
        expect(student.first_name).toBe('REDACTED')
        expect(student.guardian_name).toBe('REDACTED')
        expect(student.is_active).toBe(0)
    })
})
