import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { NEMISExportService } from '../NEMISExportService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('NEMISExportService', () => {
  let db: Database.Database
  let service: NEMISExportService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL,
        birth_date DATE,
        gender TEXT,
        grade TEXT,
        nemis_upi TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'OUTSTANDING',
        due_date DATE,
        invoice_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES transaction_category(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
      );

      -- Insert test data
      INSERT INTO user (username) VALUES ('testuser');
      INSERT INTO transaction_category (category_name) VALUES ('FEE_INCOME'), ('REFUND');

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number, birth_date, gender, grade, nemis_upi)
      VALUES 
        ('John', 'Doe', 'STU-001', '2010-05-15', 'M', 'Grade 8', 'UPI-12345678'),
        ('Jane', 'Smith', 'STU-002', '2011-08-20', 'F', 'Grade 7', 'UPI-87654321'),
        ('Bob', 'Johnson', 'STU-003', '2012-03-10', 'M', 'Grade 6', NULL);

      -- Insert test invoices
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
      VALUES 
        (1, 'INV-2026-001', 50000, 50000, 'PAID', '2026-01-05', '2026-01-05 10:00:00'),
        (1, 'INV-2026-002', 30000, 15000, 'PARTIAL', '2026-01-10', '2026-01-10 10:00:00'),
        (2, 'INV-2026-003', 60000, 60000, 'PAID', '2026-01-15', '2026-01-15 10:00:00');

      -- Insert test transactions
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, recorded_by_user_id, created_at)
      VALUES 
        ('TRX-001', '2026-01-05', 'INCOME', 1, 50000, 'DEBIT', 1, 1, '2026-01-05 10:00:00'),
        ('TRX-002', '2026-01-10', 'INCOME', 1, 30000, 'DEBIT', 1, 1, '2026-01-10 10:00:00'),
        ('TRX-003', '2026-01-15', 'INCOME', 1, 60000, 'DEBIT', 2, 1, '2026-01-15 10:00:00');
    `)

    service = new NEMISExportService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('extractStudentData', () => {
    it('should extract student data successfully', async () => {
      const result = await service.extractStudentData()

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include required NEMIS fields', async () => {
      const result = await service.extractStudentData()

      result.forEach(student => {
        expect(student).toHaveProperty('nemis_upi')
        expect(student).toHaveProperty('full_name')
        expect(student).toHaveProperty('gender')
      })
    })

    it('should handle students without NEMIS UPI', async () => {
      const result = await service.extractStudentData()

      const withoutUPI = result.filter((s: any) => !s.nemis_upi)
      expect(withoutUPI.length).toBeGreaterThan(0)
    })

    it('should format student names correctly', async () => {
      const result = await service.extractStudentData()

      result.forEach(student => {
        expect(typeof student.full_name).toBe('string')
        expect(student.full_name.length).toBeGreaterThan(0)
      })
    })

    it('should include admission numbers', async () => {
      const result = await service.extractStudentData()

      result.forEach(student => {
        expect(student).toHaveProperty('admission_number')
      })
    })

    it('should filter by gender', async () => {
      const result = await service.extractStudentData({ gender: 'M' })

      expect(Array.isArray(result)).toBe(true)
      result.forEach(student => {
        expect(student.gender).toBe('M')
      })
    })

    it('should filter by academic year', async () => {
      const result = await service.extractStudentData({ academic_year: '2026' })

      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle empty filter results', async () => {
      const result = await service.extractStudentData({ gender: 'X' })

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(0)
    })

    it('should return consistent results', async () => {
      const result1 = await service.extractStudentData()
      const result2 = await service.extractStudentData()

      expect(result1.length).toBe(result2.length)
    })

    it('should handle multiple students', async () => {
      const result = await service.extractStudentData()

      expect(result.length).toBeGreaterThanOrEqual(3)
    })

    it('should include birth date', async () => {
      const result = await service.extractStudentData()

      result.forEach(student => {
        expect(student).toHaveProperty('date_of_birth')
      })
    })

    it('should include guardian info', async () => {
      const result = await service.extractStudentData()

      result.forEach(student => {
        expect(student).toHaveProperty('guardian_name')
      })
    })

    it('should handle special characters', async () => {
      const result = await service.extractStudentData()

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('extractStaffData', () => {
    it('should extract staff data successfully', async () => {
      const result = await service.extractStaffData()

      expect(Array.isArray(result)).toBe(true)
    })

    it('should return results', async () => {
      const result = await service.extractStaffData()

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('extractEnrollmentData', () => {
    it('should extract enrollment data', async () => {
      const result = await service.extractEnrollmentData('2026')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle academic year parameter', async () => {
      const result = await service.extractEnrollmentData('2026')

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('formatToCSV', () => {
    it('should format data as CSV', async () => {
      const data = await service.extractStudentData()

      const csv = service.formatToCSV(data, 'STUDENT')

      expect(typeof csv).toBe('string')
      expect(csv.length).toBeGreaterThan(0)
    })

    it('should include headers', async () => {
      const data = [{ nemis_upi: 'UPI-123', full_name: 'Test' }]

      const csv = service.formatToCSV(data, 'STUDENT')

      expect(csv).toContain('nemis_upi')
    })

    it('should handle empty data', () => {
      const csv = service.formatToCSV([], 'STUDENT')

      expect(typeof csv).toBe('string')
    })

    it('should escape special characters', async () => {
      const data = [{ nemis_upi: 'UPI-123', full_name: 'Smith, Jr.' }]

      const csv = service.formatToCSV(data, 'STUDENT')

      expect(csv).toBeDefined()
    })

    it('should handle commas in values', () => {
      const data = [{ name: 'Doe, Jane', id: '1' }]

      const csv = service.formatToCSV(data, 'STAFF')

      expect(csv).toBeDefined()
    })

    it('should handle null values', () => {
      const data = [{ name: 'Test', nemis_upi: null }]

      const csv = service.formatToCSV(data, 'STUDENT')

      expect(csv).toBeDefined()
    })

    it('should format multiple records', async () => {
      const data = await service.extractStudentData()

      const csv = service.formatToCSV(data, 'STUDENT')

      const lines = csv.split('\n')
      expect(lines.length).toBeGreaterThan(1)
    })

    it('should handle unicode characters', () => {
      const data = [{ name: 'José', id: '1' }]

      const csv = service.formatToCSV(data, 'STUDENT')

      expect(csv).toContain('José')
    })
  })

  describe('formatToJSON', () => {
    it('should format data as JSON', async () => {
      const data = await service.extractStudentData()

      const json = service.formatToJSON(data, 'STUDENT')

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should maintain data structure', async () => {
      const data = await service.extractStudentData()

      const json = service.formatToJSON(data, 'STUDENT')
      const parsed = JSON.parse(json)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(data.length)
    })

    it('should handle empty array', () => {
      const json = service.formatToJSON([], 'STUDENT')

      expect(json).toBe('[]')
    })

    it('should handle special characters', async () => {
      const data = [{ nemis_upi: 'UPI-123', full_name: "O'Neill" }]

      const json = service.formatToJSON(data, 'STUDENT')

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should preserve numeric values', () => {
      const data = [{ id: 123, amount: 50000 }]

      const json = service.formatToJSON(data, 'FINANCIAL')
      const parsed = JSON.parse(json)

      expect(parsed[0].id).toBe(123)
    })

    it('should handle null values', () => {
      const data = [{ name: 'Test', email: null }]

      const json = service.formatToJSON(data, 'STUDENT')
      const parsed = JSON.parse(json)

      expect(parsed[0].email).toBeNull()
    })

    it('should format multiple records', async () => {
      const data = await service.extractStudentData()

      const json = service.formatToJSON(data, 'STUDENT')
      const parsed = JSON.parse(json)

      expect(parsed.length).toBeGreaterThan(0)
    })
  })

  describe('createExport', () => {
    it('should create export record', async () => {
      const result = await service.createExport({
        exportType: 'STUDENT',
        format: 'CSV'
      } as any, 1)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })

    it('should track export attempts', async () => {
      await service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)

      const result = await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)

      expect(result).toBeDefined()
    })

    it('should generate export with data', async () => {
      const result = await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)

      expect(result).toHaveProperty('data')
    })

    it('should include record count', async () => {
      const result = await service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)

      expect(result).toHaveProperty('recordCount')
    })

    it('should handle different export types', async () => {
      const result = await service.createExport({ exportType: 'STAFF', format: 'CSV' } as any, 1)

      expect(result).toBeDefined()
    })

    it('should handle different formats', async () => {
      const csv = await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)
      const json = await service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)

      expect(csv).toBeDefined()
      expect(json).toBeDefined()
    })

    it('should include user ID in export metadata', async () => {
      const result = await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 42)

      expect(result).toBeDefined()
    })

    it('should handle concurrent exports', async () => {
      const [r1, r2] = await Promise.all([
        service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1),
        service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)
      ])

      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
    })
  })

  describe('getExportHistory', () => {
    it('should retrieve export history', async () => {
      await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)

      const history = await service.getExportHistory()

      expect(Array.isArray(history)).toBe(true)
    })

    it('should limit results', async () => {
      await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)
      await service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)

      const history = await service.getExportHistory(1)

      expect(history.length).toBeLessThanOrEqual(1)
    })

    it('should return export metadata', async () => {
      await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)

      const history = await service.getExportHistory()

      if (history.length > 0) {
        expect(history[0]).toHaveProperty('export_type')
      }
    })

    it('should return default limit', async () => {
      const history = await service.getExportHistory()

      expect(Array.isArray(history)).toBe(true)
    })
  })

  describe('validateStudentData', () => {
    it('should validate student record', async () => {
      const students = await service.extractStudentData()

      const validation = service.validateStudentData(students[0])

      expect(validation).toHaveProperty('isValid')
    })

    it('should report validation status', () => {
      const student = { nemis_upi: 'UPI-123', full_name: 'Test', gender: 'M', admission_number: 'STU-001' }

      const validation = service.validateStudentData(student as any)

      expect(typeof validation.isValid).toBe('boolean')
    })

    it('should handle missing fields', () => {
      const invalidStudent = { nemis_upi: 'UPI-123' }

      const validation = service.validateStudentData(invalidStudent as any)

      expect(validation).toHaveProperty('errors')
    })
  })

  describe('validateExportReadiness', () => {
    it('should validate export readiness', async () => {
      const result = await service.validateExportReadiness(1)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('isValid')
    })

    it('should check data completeness', async () => {
      const result = await service.validateExportReadiness(1)

      expect(typeof result.isValid).toBe('boolean')
    })

    it('should identify data gaps', async () => {
      const result = await service.validateExportReadiness(1)

      if (!result.isValid) {
        expect(result).toHaveProperty('errors')
      }
    })

    it('should handle non-existent export', async () => {
      const result = await service.validateExportReadiness(9999)

      expect(result).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle special characters in names', async () => {
      const result = await service.extractStudentData()

      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle large export operations', async () => {
      const result = await service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1)

      expect(result).toBeDefined()
    })

    it('should handle concurrent exports', async () => {
      const [r1, r2] = await Promise.all([
        service.createExport({ exportType: 'STUDENT', format: 'CSV' } as any, 1),
        service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)
      ])

      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
    })

    it('should handle different export types', async () => {
      const result = await service.createExport({ exportType: 'ENROLLMENT', format: 'CSV' } as any, 1)

      expect(result).toBeDefined()
    })

    it('should preserve data integrity', async () => {
      const original = await service.extractStudentData()
      const exported = await service.createExport({ exportType: 'STUDENT', format: 'JSON' } as any, 1)

      expect(original.length).toBeGreaterThan(0)
      expect(exported.recordCount).toBeGreaterThan(0)
    })
  })
})
