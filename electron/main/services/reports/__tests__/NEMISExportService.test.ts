import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { NEMISExportService } from '../NEMISExportService'

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

      CREATE TABLE staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        staff_number TEXT UNIQUE NOT NULL,
        position TEXT,
        tsc_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE nemis_export (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        export_type TEXT NOT NULL,
        file_format TEXT NOT NULL,
        file_path TEXT,
        record_count INTEGER NOT NULL,
        exported_by INTEGER NOT NULL,
        exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        filters TEXT
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number, birth_date, gender, grade, nemis_upi)
      VALUES 
        ('John', 'Doe', 'STU-001', '2010-05-15', 'M', 'Grade 8', 'UPI-12345678'),
        ('Jane', 'Smith', 'STU-002', '2011-08-20', 'F', 'Grade 7', 'UPI-87654321'),
        ('Bob', 'Johnson', 'STU-003', '2012-03-10', 'M', 'Grade 6', NULL);

      -- Insert test staff
      INSERT INTO staff (first_name, last_name, staff_number, position, tsc_number)
      VALUES 
        ('Teacher', 'One', 'STAFF-001', 'Mathematics Teacher', 'TSC-123456'),
        ('Teacher', 'Two', 'STAFF-002', 'English Teacher', 'TSC-789012');

      -- Insert test invoices
      INSERT INTO invoice (student_id, amount, paid_amount, status)
      VALUES 
        (1, 50000, 50000, 'PAID'),
        (1, 30000, 15000, 'PARTIALLY_PAID'),
        (2, 60000, 60000, 'PAID');
    `)

    service = new NEMISExportService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('exportStudentData', () => {
    it('should export student data in CSV format', () => {
      const result = service.exportStudentData({
        format: 'CSV',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('recordCount')
      expect(result.exportId).toBeGreaterThan(0)
    })

    it('should export student data in JSON format', () => {
      const result = service.exportStudentData({
        format: 'JSON',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()
      
      // Parse JSON to verify structure
      const jsonData = JSON.parse(result.data!)
      expect(Array.isArray(jsonData)).toBe(true)
      expect(jsonData.length).toBeGreaterThan(0)
    })

    it('should include all NEMIS-required fields', () => {
      const result = service.exportStudentData({
        format: 'JSON',
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      const student = jsonData[0]

      expect(student).toHaveProperty('admission_number')
      expect(student).toHaveProperty('first_name')
      expect(student).toHaveProperty('last_name')
      expect(student).toHaveProperty('birth_date')
      expect(student).toHaveProperty('gender')
      expect(student).toHaveProperty('grade')
      expect(student).toHaveProperty('nemis_upi')
    })

    it('should filter by grade', () => {
      const result = service.exportStudentData({
        format: 'JSON',
        filters: { grade: 'Grade 8' },
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      expect(jsonData).toHaveLength(1)
      expect(jsonData[0].grade).toBe('Grade 8')
    })

    it('should filter by gender', () => {
      const result = service.exportStudentData({
        format: 'JSON',
        filters: { gender: 'F' },
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      expect(jsonData).toHaveLength(1)
      expect(jsonData[0].gender).toBe('F')
    })

    it('should filter by date range', () => {
      const result = service.exportStudentData({
        format: 'JSON',
        filters: {
          startDate: '2020-01-01',
          endDate: '2025-12-31'
        },
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.recordCount).toBeGreaterThan(0)
    })

    it('should handle empty result set', () => {
      const result = service.exportStudentData({
        format: 'CSV',
        filters: { grade: 'Grade 12' }, // Non-existent grade
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.recordCount).toBe(0)
    })

    it('should create export record', () => {
      const result = service.exportStudentData({
        format: 'CSV',
        userId: 10
      })

      const exportRecord = db.prepare('SELECT * FROM nemis_export WHERE id = ?').get(result.exportId) as any
      expect(exportRecord).toBeDefined()
      expect(exportRecord.export_type).toBe('STUDENT')
      expect(exportRecord.file_format).toBe('CSV')
      expect(exportRecord.record_count).toBe(result.recordCount)
    })

    it('should log audit trail', () => {
      service.exportStudentData({
        format: 'CSV',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('NEMIS_EXPORT') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
    })
  })

  describe('exportStaffData', () => {
    it('should export staff data in CSV format', () => {
      const result = service.exportStaffData({
        format: 'CSV',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.recordCount).toBe(2)
    })

    it('should include TSC numbers', () => {
      const result = service.exportStaffData({
        format: 'JSON',
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      jsonData.forEach((staff: any) => {
        expect(staff).toHaveProperty('tsc_number')
      })
    })

    it('should filter by position', () => {
      const result = service.exportStaffData({
        format: 'JSON',
        filters: { position: 'Mathematics Teacher' },
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      expect(jsonData).toHaveLength(1)
      expect(jsonData[0].position).toBe('Mathematics Teacher')
    })
  })

  describe('exportFinancialData', () => {
    it('should export financial summary', () => {
      const result = service.exportFinancialData({
        format: 'JSON',
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()
    })

    it('should include revenue and collection metrics', () => {
      const result = service.exportFinancialData({
        format: 'JSON',
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      expect(jsonData).toHaveProperty('totalRevenue')
      expect(jsonData).toHaveProperty('totalCollected')
      expect(jsonData).toHaveProperty('collectionRate')
    })

    it('should calculate collection rate correctly', () => {
      const result = service.exportFinancialData({
        format: 'JSON',
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      
      // Total invoiced: 50000 + 30000 + 60000 = 140000
      // Total collected: 50000 + 15000 + 60000 = 125000
      // Rate: (125000 / 140000) * 100 = 89.29%
      
      expect(jsonData.totalRevenue).toBe(140000)
      expect(jsonData.totalCollected).toBe(125000)
      expect(jsonData.collectionRate).toBeCloseTo(89.29, 1)
    })

    it('should aggregate by student', () => {
      const result = service.exportFinancialData({
        format: 'JSON',
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        groupBy: 'student',
        userId: 10
      })

      const jsonData = JSON.parse(result.data!)
      expect(Array.isArray(jsonData)).toBe(true)
      expect(jsonData.length).toBeGreaterThan(0)
    })
  })

  describe('validateExportData', () => {
    it('should validate student data completeness', () => {
      const validation = service.validateExportData('STUDENT')

      expect(validation).toHaveProperty('isValid')
      expect(validation).toHaveProperty('errors')
      expect(validation).toHaveProperty('warnings')
    })

    it('should identify missing NEMIS UPI', () => {
      const validation = service.validateExportData('STUDENT')

      expect(validation.warnings.length).toBeGreaterThan(0)
      const upiWarning = validation.warnings.find(w => w.includes('UPI'))
      expect(upiWarning).toBeDefined()
    })

    it('should identify missing birth dates', () => {
      db.exec(`UPDATE student SET birth_date = NULL WHERE id = 1`)

      const validation = service.validateExportData('STUDENT')

      const birthDateError = validation.errors.find(e => e.includes('birth_date'))
      expect(birthDateError).toBeDefined()
    })

    it('should validate staff data', () => {
      const validation = service.validateExportData('STAFF')

      expect(validation.isValid).toBe(true)
    })

    it('should identify missing TSC numbers', () => {
      db.exec(`UPDATE staff SET tsc_number = NULL WHERE id = 1`)

      const validation = service.validateExportData('STAFF')

      const tscWarning = validation.warnings.find(w => w.includes('TSC'))
      expect(tscWarning).toBeDefined()
    })
  })

  describe('getExportHistory', () => {
    beforeEach(() => {
      service.exportStudentData({ format: 'CSV', userId: 10 })
      service.exportStaffData({ format: 'JSON', userId: 10 })
    })

    it('should return export history', () => {
      const history = service.getExportHistory()

      expect(history.length).toBeGreaterThan(0)
      history.forEach(record => {
        expect(record).toHaveProperty('export_type')
        expect(record).toHaveProperty('file_format')
        expect(record).toHaveProperty('record_count')
        expect(record).toHaveProperty('exported_at')
      })
    })

    it('should filter by export type', () => {
      const studentExports = service.getExportHistory('STUDENT')

      studentExports.forEach(record => {
        expect(record.export_type).toBe('STUDENT')
      })
    })

    it('should filter by date range', () => {
      const history = service.getExportHistory(undefined, '2026-01-01', '2026-12-31')

      expect(history.length).toBeGreaterThan(0)
    })

    it('should order by most recent first', () => {
      const history = service.getExportHistory()

      if (history.length > 1) {
        const first = new Date(history[0].exported_at)
        const second = new Date(history[1].exported_at)
        expect(first >= second).toBe(true)
      }
    })
  })

  describe('formatCSV', () => {
    it('should format data as CSV with headers', () => {
      const data = [
        { name: 'John', age: 15, grade: 'Grade 8' },
        { name: 'Jane', age: 14, grade: 'Grade 7' }
      ]

      const csv = service.formatCSV(data)

      expect(csv).toContain('name,age,grade')
      expect(csv).toContain('John,15,Grade 8')
      expect(csv).toContain('Jane,14,Grade 7')
    })

    it('should escape commas in values', () => {
      const data = [
        { name: 'Doe, John', school: 'Mwingi School' }
      ]

      const csv = service.formatCSV(data)

      expect(csv).toContain('"Doe, John"')
    })

    it('should handle empty array', () => {
      const csv = service.formatCSV([])

      expect(csv).toBe('')
    })

    it('should handle null values', () => {
      const data = [
        { name: 'John', phone: null }
      ]

      const csv = service.formatCSV(data)

      expect(csv).toContain('John,')
    })
  })

  describe('formatJSON', () => {
    it('should format data as pretty JSON', () => {
      const data = [
        { name: 'John', age: 15 }
      ]

      const json = service.formatJSON(data)

      expect(() => JSON.parse(json)).not.toThrow()
      expect(json).toContain('"name"')
      expect(json).toContain('"John"')
    })

    it('should handle empty array', () => {
      const json = service.formatJSON([])

      expect(json).toBe('[]')
    })
  })

  describe('edge cases', () => {
    it('should handle special characters in data', () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number, gender, grade) 
               VALUES ('Mary-Jane', "O'Connor", 'STU-004', 'F', 'Grade 8')`)

      const result = service.exportStudentData({ format: 'CSV', userId: 10 })

      expect(result.success).toBe(true)
      expect(result.data).toContain("O'Connor")
    })

    it('should handle unicode characters', () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number, gender, grade) 
               VALUES ('José', 'Müller', 'STU-005', 'M', 'Grade 7')`)

      const result = service.exportStudentData({ format: 'JSON', userId: 10 })

      expect(result.success).toBe(true)
      const jsonData = JSON.parse(result.data!)
      const jose = jsonData.find((s: any) => s.first_name === 'José')
      expect(jose).toBeDefined()
    })

    it('should handle large datasets', () => {
      // Insert 100 students
      const insertStmt = db.prepare(`
        INSERT INTO student (first_name, last_name, admission_number, gender, grade)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (let i = 0; i < 100; i++) {
        insertStmt.run(`Student${i}`, `Last${i}`, `STU-${1000 + i}`, 'M', 'Grade 8')
      }

      const result = service.exportStudentData({ format: 'CSV', userId: 10 })

      expect(result.success).toBe(true)
      expect(result.recordCount).toBeGreaterThan(100)
    })

    it('should handle invalid date formats', () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number, birth_date, gender, grade) 
               VALUES ('Test', 'Student', 'STU-006', 'invalid-date', 'M', 'Grade 8')`)

      const result = service.exportStudentData({ format: 'JSON', userId: 10 })

      // Should still export, may flag in validation
      expect(result.success).toBe(true)
    })
  })
})
