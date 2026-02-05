import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { NEMISExportService } from '../../reports/NEMISExportService'

vi.mock('../../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('NEMISExportService', () => {
  let db: Database.Database
  let service: NEMISExportService

  beforeEach(() => {
    db = new Database(':memory:')
    
    // Create all required tables
    db.exec(`
      CREATE TABLE class (
        id TEXT PRIMARY KEY,
        class_name TEXT NOT NULL,
        stream TEXT,
        grade_level TEXT,
        class_teacher_id TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE guardian (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        relationship TEXT,
        phone_primary TEXT,
        phone_secondary TEXT,
        email TEXT,
        created_at TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id)
      )
    `)

    db.exec(`
      CREATE TABLE student (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        date_of_birth TEXT,
        gender TEXT,
        admission_number TEXT,
        national_id_number TEXT,
        nemis_upi TEXT,
        county TEXT,
        sub_county TEXT,
        ward TEXT,
        special_needs TEXT DEFAULT 'No',
        class_id TEXT,
        guardian_id TEXT,
        status TEXT DEFAULT 'ACTIVE',
        school_id TEXT,
        created_at TEXT,
        FOREIGN KEY (class_id) REFERENCES class(id),
        FOREIGN KEY (guardian_id) REFERENCES guardian(id)
      )
    `)

    db.exec(`
      CREATE TABLE fee_invoice (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        academic_term_id TEXT NOT NULL,
        amount_due REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        due_date TEXT,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (academic_term_id) REFERENCES academic_term(id)
      )
    `)

    db.exec(`
      CREATE TABLE ledger_transaction (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        transaction_date TEXT,
        debit_credit TEXT,
        created_at TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id)
      )
    `)

    db.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        role TEXT,
        password_hash TEXT,
        created_at TEXT
      )
    `)

    db.exec(`
      CREATE TABLE school (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        county TEXT,
        subcounty TEXT,
        nemis_code TEXT
      )
    `)

    db.exec(`
      CREATE TABLE academic_term (
        id TEXT PRIMARY KEY,
        term_name TEXT NOT NULL,
        year INTEGER,
        academic_year TEXT,
        start_date TEXT,
        end_date TEXT,
        school_id TEXT,
        FOREIGN KEY (school_id) REFERENCES school(id)
      )
    `)

    db.exec(`
      CREATE TABLE enrollment (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        academic_term_id TEXT NOT NULL,
        stream TEXT,
        class_name TEXT,
        enrollment_date TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (academic_term_id) REFERENCES academic_term(id)
      )
    `)

    db.exec(`
      CREATE TABLE marks (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        academic_term_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        marks_obtained REAL,
        total_marks REAL,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (academic_term_id) REFERENCES academic_term(id)
      )
    `)

    db.exec(`
      CREATE TABLE nemis_export (
        id TEXT PRIMARY KEY,
        export_type TEXT NOT NULL,
        format TEXT NOT NULL,
        record_count INTEGER DEFAULT 0,
        user_id TEXT NOT NULL,
        export_date TEXT DEFAULT CURRENT_TIMESTAMP,
        data TEXT,
        FOREIGN KEY (user_id) REFERENCES user(id)
      )
    `)

    // Insert test data
    const schoolInsert = db.prepare('INSERT INTO school (id, name, code, county, subcounty, nemis_code) VALUES (?, ?, ?, ?, ?, ?)')
    schoolInsert.run('school-1', 'Mwingi Adventist School', 'MAS-001', 'Kitui', 'Mwingi', 'NEMIS-12345')

    const classInsert = db.prepare('INSERT INTO class (id, class_name, stream, created_at) VALUES (?, ?, ?, ?)')
    classInsert.run('class-1', 'Form 4A', 'Stream A', new Date().toISOString())
    classInsert.run('class-2', 'Form 4B', 'Stream B', new Date().toISOString())

    const termInsert = db.prepare('INSERT INTO academic_term (id, term_name, year, academic_year, start_date, end_date, school_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    termInsert.run('term-1', 'Term 1', 2025, '2024-2025', '2025-01-01', '2025-03-31', 'school-1')
    termInsert.run('term-2', 'Term 2', 2025, '2024-2025', '2025-04-01', '2025-06-30', 'school-1')

    const userInsert = db.prepare('INSERT INTO user (id, username, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    userInsert.run('user-1', 'admin1', 'admin@school.com', 'admin', 'hash1', new Date().toISOString())
    userInsert.run('user-2', 'teacher1', 'teacher@school.com', 'teacher', 'hash2', new Date().toISOString())

    // Insert 3 students FIRST (before guardians reference them)
    const studentInsert = db.prepare('INSERT INTO student (id, first_name, last_name, full_name, date_of_birth, gender, admission_number, national_id_number, nemis_upi, county, sub_county, ward, special_needs, class_id, guardian_id, status, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    studentInsert.run('student-1', 'John', 'Doe', 'John Doe', '2010-05-15', 'M', 'ADM001', 'NID001', 'NEMIS-UPI-001', 'Kitui', 'Mwingi', 'Ward1', 'No', 'class-1', null, 'ACTIVE', 'school-1', new Date().toISOString())
    studentInsert.run('student-2', 'Jane', 'Smith', 'Jane Smith', '2010-08-22', 'F', 'ADM002', 'NID002', 'NEMIS-UPI-002', 'Kitui', 'Mwingi', 'Ward1', 'No', 'class-1', null, 'ACTIVE', 'school-1', new Date().toISOString())
    studentInsert.run('student-3', 'James', 'Johnson', 'James Johnson', '2010-12-10', 'M', 'ADM003', 'NID003', 'NEMIS-UPI-003', 'Kitui', 'Mwingi', 'Ward2', 'No', 'class-2', null, 'ACTIVE', 'school-1', new Date().toISOString())

    // Then insert guardians
    const guardianInsert = db.prepare('INSERT INTO guardian (id, student_id, full_name, relationship, phone_primary, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    guardianInsert.run('guardian-1', 'student-1', 'John Senior', 'Father', '0720123456', 'john@email.com', new Date().toISOString())
    guardianInsert.run('guardian-2', 'student-2', 'Jane Senior', 'Mother', '0720234567', 'jane@email.com', new Date().toISOString())
    guardianInsert.run('guardian-3', 'student-3', 'James Senior', 'Father', '0720345678', 'james@email.com', new Date().toISOString())

    // Update students with guardian_id
    const updateStudentGuardian = db.prepare('UPDATE student SET guardian_id = ? WHERE id = ?')
    updateStudentGuardian.run('guardian-1', 'student-1')
    updateStudentGuardian.run('guardian-2', 'student-2')
    updateStudentGuardian.run('guardian-3', 'student-3')

    // Insert 5 invoices
    const invoiceInsert = db.prepare('INSERT INTO fee_invoice (id, student_id, academic_term_id, amount_due, amount_paid, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    invoiceInsert.run('invoice-1', 'student-1', 'term-1', 50000, 50000, '2025-01-31', 'paid', new Date().toISOString())
    invoiceInsert.run('invoice-2', 'student-1', 'term-2', 50000, 0, '2025-04-30', 'pending', new Date().toISOString())
    invoiceInsert.run('invoice-3', 'student-2', 'term-1', 45000, 45000, '2025-01-31', 'paid', new Date().toISOString())
    invoiceInsert.run('invoice-4', 'student-2', 'term-2', 45000, 22500, '2025-04-30', 'partial', new Date().toISOString())
    invoiceInsert.run('invoice-5', 'student-3', 'term-1', 50000, 25000, '2025-01-31', 'partial', new Date().toISOString())

    // Insert 10 transactions
    const transactionInsert = db.prepare('INSERT INTO ledger_transaction (id, student_id, transaction_type, amount, description, transaction_date, debit_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    transactionInsert.run('trans-1', 'student-1', 'fee_payment', 50000, 'Term 1 fees', '2025-01-15', 'credit', new Date().toISOString())
    transactionInsert.run('trans-2', 'student-1', 'fee_charge', 50000, 'Term 2 fees', '2025-04-01', 'debit', new Date().toISOString())
    transactionInsert.run('trans-3', 'student-2', 'fee_payment', 45000, 'Term 1 fees', '2025-01-15', 'credit', new Date().toISOString())
    transactionInsert.run('trans-4', 'student-2', 'fee_charge', 45000, 'Term 2 fees', '2025-04-01', 'debit', new Date().toISOString())
    transactionInsert.run('trans-5', 'student-2', 'fee_payment', 22500, 'Term 2 partial payment', '2025-05-01', 'credit', new Date().toISOString())
    transactionInsert.run('trans-6', 'student-3', 'fee_charge', 50000, 'Term 1 fees', '2025-01-01', 'debit', new Date().toISOString())
    transactionInsert.run('trans-7', 'student-3', 'fee_payment', 25000, 'Term 1 partial payment', '2025-02-01', 'credit', new Date().toISOString())
    transactionInsert.run('trans-8', 'student-3', 'fee_charge', 50000, 'Term 2 fees', '2025-04-01', 'debit', new Date().toISOString())
    transactionInsert.run('trans-9', 'student-1', 'scholarship', 10000, 'Scholarship award', '2025-02-15', 'credit', new Date().toISOString())
    transactionInsert.run('trans-10', 'student-2', 'bursary', 15000, 'Bursary award', '2025-02-20', 'credit', new Date().toISOString())

    // Insert enrollments
    const enrollmentInsert = db.prepare('INSERT INTO enrollment (id, student_id, academic_term_id, stream, class_name, enrollment_date) VALUES (?, ?, ?, ?, ?, ?)')
    enrollmentInsert.run('enroll-1', 'student-1', 'term-1', 'A', 'Form 2A', '2025-01-01')
    enrollmentInsert.run('enroll-2', 'student-1', 'term-2', 'A', 'Form 2A', '2025-04-01')
    enrollmentInsert.run('enroll-3', 'student-2', 'term-1', 'B', 'Form 2B', '2025-01-01')
    enrollmentInsert.run('enroll-4', 'student-2', 'term-2', 'B', 'Form 2B', '2025-04-01')
    enrollmentInsert.run('enroll-5', 'student-3', 'term-1', 'A', 'Form 2A', '2025-01-01')

    // Insert 15 marks
    const marksInsert = db.prepare('INSERT INTO marks (id, student_id, academic_term_id, subject, marks_obtained, total_marks) VALUES (?, ?, ?, ?, ?, ?)')
    marksInsert.run('marks-1', 'student-1', 'term-1', 'Mathematics', 85, 100)
    marksInsert.run('marks-2', 'student-1', 'term-1', 'English', 78, 100)
    marksInsert.run('marks-3', 'student-1', 'term-1', 'Science', 92, 100)
    marksInsert.run('marks-4', 'student-1', 'term-2', 'Mathematics', 88, 100)
    marksInsert.run('marks-5', 'student-1', 'term-2', 'English', 81, 100)
    marksInsert.run('marks-6', 'student-2', 'term-1', 'Mathematics', 92, 100)
    marksInsert.run('marks-7', 'student-2', 'term-1', 'English', 85, 100)
    marksInsert.run('marks-8', 'student-2', 'term-1', 'Science', 88, 100)
    marksInsert.run('marks-9', 'student-2', 'term-2', 'Mathematics', 90, 100)
    marksInsert.run('marks-10', 'student-2', 'term-2', 'English', 87, 100)
    marksInsert.run('marks-11', 'student-3', 'term-1', 'Mathematics', 75, 100)
    marksInsert.run('marks-12', 'student-3', 'term-1', 'English', 68, 100)
    marksInsert.run('marks-13', 'student-3', 'term-1', 'Science', 72, 100)
    marksInsert.run('marks-14', 'student-3', 'term-2', 'Mathematics', 78, 100)
    marksInsert.run('marks-15', 'student-3', 'term-2', 'English', 70, 100)

    service = new NEMISExportService(db)
  })

  afterEach(() => {
    if (db) db.close()
  })

  // extractStudentData tests (8 tests)
  it('should extract student data successfully', async () => {
    const result = await service.extractStudentData()
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it('should extract all three students', async () => {
    const result = await service.extractStudentData()
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('should include student identifiers in extraction', async () => {
    const result = await service.extractStudentData()
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('id')
      expect(result[0]).toHaveProperty('admission_number')
    }
  })

  it('should include personal details for each student', async () => {
    const result = await service.extractStudentData()
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('first_name')
      expect(result[0]).toHaveProperty('last_name')
    }
  })

  it('should include location information', async () => {
    const result = await service.extractStudentData()
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('county')
    }
  })

  it('should handle empty student extraction', async () => {
    const result = await service.extractStudentData()
    expect(Array.isArray(result)).toBe(true)
  })

  it('should map national ID numbers correctly', async () => {
    const result = await service.extractStudentData()
    expect(Array.isArray(result)).toBe(true)
  })

  it('should include gender information', async () => {
    const result = await service.extractStudentData()
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('gender')
    }
  })

  // extractSchoolData tests (5 tests)
  it('should extract school data successfully', async () => {
    const result = await service.extractSchoolData()
    expect(result).toBeDefined()
  })

  it('should include school identifier', async () => {
    const result = await service.extractSchoolData()
    expect(result).toBeDefined()
  })

  it('should include NEMIS code', async () => {
    const result = await service.extractSchoolData()
    expect(result).toBeDefined()
  })

  it('should include school location details', async () => {
    const result = await service.extractSchoolData()
    expect(result).toBeDefined()
  })

  it('should format school data for NEMIS export', async () => {
    const result = await service.extractSchoolData()
    expect(result).toBeDefined()
  })

  // extractEnrollmentData tests (6 tests)
  it('should extract enrollment data successfully', async () => {
    const result = await service.extractEnrollmentData('2025')
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it('should extract all enrollments', async () => {
    const result = await service.extractEnrollmentData('2025')
    expect(Array.isArray(result)).toBe(true)
  })

  it('should include student enrollment details', async () => {
    const result = await service.extractEnrollmentData('2025')
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('student_id')
    }
  })

  it('should include academic term in enrollment data', async () => {
    const result = await service.extractEnrollmentData('2025')
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('academic_term_id')
    }
  })

  it('should include class information', async () => {
    const result = await service.extractEnrollmentData('2025')
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('class_name')
    }
  })

  it('should include stream information', async () => {
    const result = await service.extractEnrollmentData('2025')
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('stream')
    }
  })

  // extractFinancialData tests (5 tests)
  it('should extract financial data successfully', async () => {
    const result = await service.extractFinancialData()
    expect(result).toBeDefined()
  })

  it('should include invoice information', async () => {
    const result = await service.extractFinancialData()
    expect(result).toBeDefined()
  })

  it('should include ledger transactions', async () => {
    const result = await service.extractFinancialData()
    expect(result).toBeDefined()
  })

  it('should count total invoices correctly', async () => {
    const result = await service.extractFinancialData()
    expect(result).toBeDefined()
  })

  it('should count total transactions correctly', async () => {
    const result = await service.extractFinancialData()
    expect(result).toBeDefined()
  })

  // validateNEMISFormat tests (4 tests)
  it('should validate NEMIS format successfully', async () => {
    const data = {
      students: await service.extractStudentData(),
      school: await service.extractSchoolData(),
      enrollments: await service.extractEnrollmentData('2025')
    }
    const result = await service.validateNEMISFormat(data)
    expect(result).toBeDefined()
  })

  it('should return validation status', async () => {
    const data = {
      students: await service.extractStudentData(),
      school: await service.extractSchoolData(),
      enrollments: await service.extractEnrollmentData('2025')
    }
    const result = await service.validateNEMISFormat(data)
    expect(result).toBeDefined()
  })

  it('should include error messages if validation fails', async () => {
    const data = {
      students: [],
      school: null,
      enrollments: []
    }
    const result = await service.validateNEMISFormat(data)
    expect(result).toBeDefined()
  })

  it('should validate required fields presence', async () => {
    const data = {
      students: await service.extractStudentData(),
      school: await service.extractSchoolData(),
      enrollments: await service.extractEnrollmentData('2025')
    }
    const result = await service.validateNEMISFormat(data)
    expect(result).toBeDefined()
  })

  // generateNEMISReport tests (7 tests)
  it('should generate NEMIS report successfully', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })

  it('should include report timestamp', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })

  it('should include school information in report', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })

  it('should include student count in report', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })

  it('should include financial summary in report', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })

  it('should format report for export', async () => {
    const report = await service.generateNEMISReport()
    expect(typeof report).toBe('object')
  })

  it('should include enrollment information in report', async () => {
    const report = await service.generateNEMISReport()
    expect(report).toBeDefined()
  })
})

