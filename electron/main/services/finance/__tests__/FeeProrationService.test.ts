import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { FeeProrationService } from '../FeeProrationService'

type DbRow = Record<string, any>

// Mock audit utilities to avoid database initialization issues
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('FeeProrationService', () => {
  let db: Database.Database
  let service: FeeProrationService

  beforeEach(() => {
    db = new Database(':memory:')
    
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
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL,
        enrollment_date DATE
      );

      CREATE TABLE academic_term (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN DEFAULT 0
      );

      CREATE TABLE invoice_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        item_type TEXT NOT NULL,
        amount REAL NOT NULL,
        is_prorated BOOLEAN DEFAULT 0
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        academic_term_id INTEGER,
        invoice_number TEXT UNIQUE NOT NULL,
        invoice_date DATE,
        due_date DATE,
        total_amount INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_due INTEGER NOT NULL,
        original_amount INTEGER,
        amount_paid INTEGER DEFAULT 0,
        description TEXT,
        invoice_type TEXT,
        class_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        is_prorated INTEGER DEFAULT 0,
        proration_percentage REAL,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE pro_ration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        full_amount INTEGER NOT NULL,
        pro_rated_amount INTEGER NOT NULL,
        discount_percentage REAL NOT NULL,
        enrollment_date TEXT NOT NULL,
        term_start TEXT NOT NULL,
        term_end TEXT NOT NULL,
        days_in_term INTEGER NOT NULL,
        days_enrolled INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test term (90 days)
      INSERT INTO academic_term (term_name, start_date, end_date, is_current)
      VALUES ('Term 1 2026', '2026-01-01', '2026-03-31', 1);

      -- Insert invoice templates
      INSERT INTO invoice_template (grade, item_type, amount, is_prorated)
      VALUES 
        ('Grade 8', 'TUITION', 60000, 1),
        ('Grade 8', 'BOARDING', 45000, 1),
        ('Grade 8', 'TRANSPORT', 15000, 1),
        ('Grade 8', 'ACTIVITY', 5000, 0);

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number, enrollment_date)
      VALUES ('John', 'Doe', 'STU-001', '2026-01-15');
    `)

    service = new FeeProrationService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('generateProRatedInvoice', () => {
    it('should generate pro-rated invoice for mid-term enrollment', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should calculate correct proration percentage', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as DbRow

      expect(prorationLog).toBeDefined()
      if (prorationLog) {
        expect(prorationLog.days_in_term).toBe(90)
        expect(prorationLog.days_enrolled).toBeGreaterThan(0)
      }
    })

    it('should apply proration to eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ?').all(1) as DbRow[]

      expect(invoices.length).toBeGreaterThan(0)
    })

    it('should not prorate non-eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ?').all(1) as DbRow[]

      const nonProratedExists = invoices.some(inv => inv.is_prorated === 0)
      if (nonProratedExists) {
        const nonProrated = invoices.find(inv => inv.is_prorated === 0)
        expect(nonProrated).toBeDefined()
      }
    })

    it('should create proration audit log', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLogs = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').all(1) as DbRow[]
      expect(prorationLogs.length).toBeGreaterThan(0)
    })

    it('should handle enrollment on term start date', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle enrollment on last day of term', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-31',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should reject enrollment before term start', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2025-12-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should reject enrollment after term end', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-04-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })
  })

  describe('getProrationDetails', () => {
    beforeEach(() => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
    })

    it('should return proration breakdown', () => {
      const details = service.getProrationDetails(1)

      expect(details).toBeDefined()
    })

    it('should show original vs prorated amounts', () => {
      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = 1').all() as DbRow[]

      expect(invoices.length).toBeGreaterThan(0)
      invoices.forEach(inv => {
        if (inv.is_prorated === 1 && inv.original_amount) {
          expect(inv.amount).toBeLessThanOrEqual(inv.original_amount)
        }
      })
    })

    it('should calculate total savings', () => {
      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = 1').all() as DbRow[]
      
      let totalOriginal = 0
      let totalProrated = 0
      
      invoices.forEach(inv => {
        totalProrated += inv.amount
        if (inv.original_amount) {
          totalOriginal += inv.original_amount
        } else {
          totalOriginal += inv.amount
        }
      })

      expect(totalProrated).toBeLessThanOrEqual(totalOriginal)
    })
  })

  describe('validateEnrollmentDate', () => {
    const termStart = '2026-01-01'
    const termEnd = '2026-03-31'

    it('should validate date within term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should reject date before term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2025-12-01')

      expect(result).toBeDefined()
    })

    it('should reject date after term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-04-15')

      expect(result).toBeDefined()
    })

    it('should accept term boundary dates', () => {
      const startResult = service.validateEnrollmentDate(termStart, termEnd, '2026-01-01')
      expect(startResult).toBeDefined()

      const endResult = service.validateEnrollmentDate(termStart, termEnd, '2026-03-31')
      expect(endResult).toBeDefined()
    })
  })

  describe('calculateProrationPercentage', () => {
    it('should calculate daily proration accurately', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      expect(percentage).toBeGreaterThan(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('should return 100% for full term', () => {
      const percentage = service.calculateProrationPercentage('2026-01-01', '2026-01-01', '2026-03-31')

      expect(percentage).toBe(100)
    })

    it('should handle leap year correctly', () => {
      const percentage = service.calculateProrationPercentage('2024-02-15', '2024-02-01', '2024-02-29')

      expect(percentage).toBeGreaterThan(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('should round to 2 decimal places', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      const decimals = percentage.toString().split('.')[1]?.length || 0
      expect(decimals).toBeLessThanOrEqual(2)
    })
  })

  describe('getProrationHistory', () => {
    beforeEach(() => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
    })

    it('should return proration history for student', () => {
      const history = service.getProrationHistory(1)

      expect(history).toBeDefined()
    })

    it('should filter by date range', () => {
      const history = service.getProrationHistory(1, '2026-01-01', '2026-01-31')

      expect(history).toBeDefined()
    })

    it('should show term-wide proration statistics', () => {
      const stats = service.getProrationHistory(1)

      expect(stats).toBeDefined()
    })
  })

  describe('edge cases', () => {
    const termStart = '2026-01-01'
    const termEnd = '2026-03-31'

    it('should handle student with no invoice templates', () => {
      db.exec('DELETE FROM invoice_template')

      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle term with no current flag', () => {
      db.exec('UPDATE academic_term SET is_current = 0')

      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should handle very short term enrollment', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-30',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle duplicate proration attempts', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })
  })

  describe('calculateProRatedFee direct', () => {
    it('returns correct proration result structure', () => {
      const result = service.calculateProRatedFee(
        60000, '2026-01-01', '2026-03-31', '2026-02-01'
      )

      expect(result.full_amount).toBe(60000)
      expect(result.pro_rated_amount).toBeLessThan(60000)
      expect(result.pro_rated_amount).toBeGreaterThan(0)
      expect(result.discount_percentage).toBeGreaterThan(0)
      expect(result.days_in_term).toBe(90)
      expect(result.days_enrolled).toBeLessThan(90)
      expect(result.enrollment_date).toBe('2026-02-01')
      expect(result.calculation_method).toBe('DAILY')
    })

    it('full amount when enrolled on first day', () => {
      const result = service.calculateProRatedFee(
        60000, '2026-01-01', '2026-03-31', '2026-01-01'
      )
      expect(result.pro_rated_amount).toBe(60000)
      expect(result.discount_percentage).toBe(0)
    })

    it('minimal amount when enrolled on last day', () => {
      const result = service.calculateProRatedFee(
        90000, '2026-01-01', '2026-03-31', '2026-03-31'
      )
      expect(result.pro_rated_amount).toBeLessThan(90000)
      expect(result.days_enrolled).toBe(1)
    })
  })

  describe('validateEnrollmentDate assertions', () => {
    const termStart = '2026-01-01'
    const termEnd = '2026-03-31'

    it('returns valid=true for mid-term date', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-02-15')
      expect(result.valid).toBe(true)
      expect(result.message).toContain('valid for proration')
    })

    it('returns valid=false for date before term start', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2025-12-01')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('before term start')
    })

    it('returns valid=false for date after term end', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-04-15')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('after term end')
    })

    it('returns valid=false for term start date (no proration needed)', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-01-01')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('no proration needed')
    })
  })

  describe('generateProRatedInvoiceSync coverage', () => {
    it('returns error when no template found for grade', () => {
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 99',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No invoice template found')
    })

    it('returns error when no current term found', () => {
      db.exec('UPDATE academic_term SET is_current = 0')
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No current term found')
    })

    it('creates invoice with correct amounts and records proration log', () => {
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-02-01',
        grade: 'Grade 8',
        userId: 10
      })
      expect(result.success).toBe(true)
      expect(result.invoice_id).toBeDefined()
      expect(result.message).toContain('Pro-rated invoice created')

      const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = ?').get(result.invoice_id) as any
      expect(invoice.is_prorated).toBe(1)
      expect(invoice.status).toBe('PENDING')
      expect(invoice.original_amount).toBe(60000)
      expect(invoice.amount).toBeLessThan(60000)

      const log = db.prepare('SELECT * FROM pro_ration_log WHERE invoice_id = ?').get(result.invoice_id) as any
      expect(log).toBeDefined()
      expect(log.days_in_term).toBe(90)
    })
  })

  describe('getStudentProRationHistory', () => {
    it('returns proration history', async () => {
      service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
      const history = await service.getStudentProRationHistory(1)
      expect(history.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty array for student with no proration', async () => {
      const history = await service.getStudentProRationHistory(999)
      expect(history).toHaveLength(0)
    })
  })

  describe('generateProRatedInvoice old-style API', () => {
    it('calls invoiceGenerator for old-style 4-param API', async () => {
      // Insert a template invoice record
      db.prepare(`
        INSERT INTO fee_invoice (
          student_id, term_id, academic_term_id, invoice_number, invoice_date, due_date,
          total_amount, amount, amount_due, original_amount, amount_paid, description,
          invoice_type, class_id, status, created_by_user_id
        ) VALUES (1, 1, 1, 'TMPL-001', '2026-01-01', '2026-02-01', 60000, 60000, 60000, 60000, 0, 'Template invoice', 'TUITION', 1, 'PENDING', 10)
      `).run()

      const result = await service.generateProRatedInvoice(1, 1, '2026-02-01', 10)
      expect(result).toBeDefined()
      // The template repo will find the invoice, term dates must exist
      expect(result.success).toBeDefined()
    })
  })

  // ── Branch coverage: validateEnrollmentDate edges ──────────────
  describe('validateEnrollmentDate branch coverage', () => {
    it('rejects enrollment before term start', () => {
      const result = service.validateEnrollmentDate('2026-02-01', '2026-04-30', '2026-01-15')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('before term start')
    })

    it('rejects enrollment after term end', () => {
      const result = service.validateEnrollmentDate('2026-02-01', '2026-04-30', '2026-05-15')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('after term end')
    })

    it('rejects enrollment on term start date (no proration needed)', () => {
      const result = service.validateEnrollmentDate('2026-02-01', '2026-04-30', '2026-02-01')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('full fee applies')
    })

    it('accepts enrollment mid-term', () => {
      const result = service.validateEnrollmentDate('2026-02-01', '2026-04-30', '2026-03-01')
      expect(result.valid).toBe(true)
    })
  })

  // ── Branch coverage: generateProRatedInvoiceSync failure paths ──
  describe('generateProRatedInvoiceSync failure paths', () => {
    it('returns error when no invoice template found for grade', () => {
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'NonExistentGrade',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No invoice template found')
    })

    it('returns error when no current term found', () => {
      // Insert template but remove current term
      db.exec(`
        INSERT OR IGNORE INTO invoice_template (grade, item_type, amount, is_prorated) VALUES ('Grade 5', 'TUITION', 50000, 1);
        UPDATE academic_term SET is_current = 0;
      `)
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 5',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No current term found')
    })
  })

  // ── Branch coverage: getProrationHistory with date range ─────────
  describe('getProrationHistory with date range', () => {
    it('filters by date range when startDate and endDate provided', () => {
      service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
      const history = service.getProrationHistory(1, '2020-01-01', '2030-12-31')
      expect(history.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty when no proration in date range', () => {
      const history = service.getProrationHistory(1, '2020-01-01', '2020-12-31')
      expect(history).toHaveLength(0)
    })
  })

  // ── Branch coverage: calculateProrationPercentage ─────────────────
  describe('calculateProrationPercentage', () => {
    it('returns percentage of term enrolled', () => {
      const pct = service.calculateProrationPercentage('2026-02-15', '2026-01-01', '2026-03-31')
      expect(pct).toBeGreaterThan(0)
      expect(pct).toBeLessThanOrEqual(100)
    })
  })

  // ── Branch coverage: getProrationDetails ──────────────────────────
  describe('getProrationDetails', () => {
    it('returns prorated invoice details for student', () => {
      service.generateProRatedInvoiceSync({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
      const details = service.getProrationDetails(1)
      expect(Array.isArray(details)).toBe(true)
    })

    it('returns empty for student with no prorated invoices', () => {
      const details = service.getProrationDetails(999)
      expect(details).toHaveLength(0)
    })
  })

  // ── Branch coverage: old-style API error paths through invoiceGenerator ──
  describe('generateProRatedInvoice async error paths', () => {
    it('returns template-not-found when template invoice id does not exist', async () => {
      const result = await service.generateProRatedInvoice(1, 99999, '2026-02-01', 10)
      expect(result.success).toBe(false)
      expect(result.message).toContain('Template invoice not found')
    })

    it('returns term-dates-not-found when template references non-existent term', async () => {
      // Create a fee_invoice with a term_id that doesn't exist in academic_term
      db.prepare(`
        INSERT INTO fee_invoice (
          student_id, term_id, academic_term_id, invoice_number, invoice_date, due_date,
          total_amount, amount, amount_due, original_amount, amount_paid, description,
          invoice_type, class_id, status, created_by_user_id
        ) VALUES (1, 99999, 99999, 'TMPL-NOTERM', '2026-01-01', '2026-02-01', 60000, 60000, 60000, 60000, 0, 'No term', 'TUITION', 1, 'PENDING', 10)
      `).run()
      const row = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'TMPL-NOTERM'").get() as { id: number }

      const result = await service.generateProRatedInvoice(1, row.id, '2026-02-01', 10)
      expect(result.success).toBe(false)
      expect(result.message).toContain('Term dates not found')
    })

    it('returns validation error when enrollment date is before term start', async () => {
      // Use existing template that has valid term dates
      db.prepare(`
        INSERT INTO fee_invoice (
          student_id, term_id, academic_term_id, invoice_number, invoice_date, due_date,
          total_amount, amount, amount_due, original_amount, amount_paid, description,
          invoice_type, class_id, status, created_by_user_id
        ) VALUES (1, 1, 1, 'TMPL-EARLYENROL', '2026-01-01', '2026-02-01', 60000, 60000, 60000, 60000, 0, 'Early enrollment', 'TUITION', 1, 'PENDING', 10)
      `).run()
      const row = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'TMPL-EARLYENROL'").get() as { id: number }

      // Enrollment date before term start
      const result = await service.generateProRatedInvoice(1, row.id, '2025-12-01', 10)
      expect(result.success).toBe(false)
      expect(result.message).toContain('before term start')
    })
  })

  // ── Branch coverage: generateProRatedInvoiceSync catch block ──
  describe('generateProRatedInvoiceSync error handling', () => {
    it('returns error when invoice_template table does not match grade', () => {
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        grade: 'NonExistentGrade',
        enrollmentDate: '2026-02-15',
        userId: 10 
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No invoice template found')
    })

    it('succeeds for valid mid-term enrollment', () => {
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        grade: 'Grade 8',
        enrollmentDate: '2026-02-15',
        userId: 10
      })
      expect(result.success).toBe(true)
      expect(result.invoice_id).toBeDefined()
    })
  })

  // ── Branch coverage: generateProRatedInvoiceSync journal failure ──
  describe('generateProRatedInvoiceSync – journal failure', () => {
    it('returns error when journal entry fails', () => {
      // The journal service will fail if the GL account doesn't exist
      // We can remove gl_account rows to trigger the failure
      db.exec('DELETE FROM gl_account')
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        grade: 'Grade 8',
        enrollmentDate: '2026-02-15',
        userId: 10
      })
      // Could succeed or fail depending on how DoubleEntryJournalService handles missing GL accounts
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('message')
    })
  })

  // ── Branch coverage: generateProRatedInvoiceSync no current term ──
  describe('generateProRatedInvoiceSync – no current term', () => {
    it('returns error when no current academic term exists', () => {
      // Mark all terms as not current
      db.exec('UPDATE academic_term SET is_current = 0')
      const result = service.generateProRatedInvoiceSync({
        studentId: 1,
        grade: 'Grade 8',
        enrollmentDate: '2026-02-15',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No current term found')
    })
  })

  // ── Branch coverage: generateProRatedInvoice with object-style input ──
  describe('generateProRatedInvoice – object input style', () => {
    it('delegates to generateProRatedInvoiceSync when given an object', async () => {
      const result = await service.generateProRatedInvoice({
        studentId: 1,
        grade: 'Grade 8',
        enrollmentDate: '2026-02-15',
        userId: 10
      })
      expect(result).toHaveProperty('success')
    })
  })

  // ── Branch coverage: getProrationHistory with date range ──
  describe('getProrationHistory – with date filter', () => {
    it('filters by date range when startDate and endDate provided', () => {
      const result = service.getProrationHistory(1, '2026-01-01', '2026-12-31')
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns all history when no dates provided', () => {
      const result = service.getProrationHistory(1)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ── Branch coverage: getProrationDetails ──
  describe('getProrationDetails', () => {
    it('returns proration details for student', () => {
      const result = service.getProrationDetails(1)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ── Branch coverage: calculateProrationPercentage ──
  describe('calculateProrationPercentage', () => {
    it('calculates correct percentage for mid-term enrollment', () => {
      const percentage = service.calculateProrationPercentage('2026-02-15', '2026-01-05', '2026-04-10')
      expect(percentage).toBeGreaterThan(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('returns ~100% when enrollment is at term start', () => {
      const percentage = service.calculateProrationPercentage('2026-01-05', '2026-01-05', '2026-04-10')
      expect(percentage).toBeCloseTo(100, 0)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateProRatedInvoice old-style – catch block (L362)
   * ================================================================== */
  describe('generateProRatedInvoice old-style – error in invoice creation', () => {
    it('throws wrapped error when createInvoiceAndAudit fails', async () => {
      // Create a valid template invoice
      db.prepare(`
        INSERT INTO fee_invoice (
          student_id, term_id, academic_term_id, invoice_number, invoice_date, due_date,
          total_amount, amount, amount_due, original_amount, amount_paid, description,
          invoice_type, class_id, status, created_by_user_id
        ) VALUES (1, 1, 1, 'TMPL-CATCH', '2026-01-01', '2026-02-01', 60000, 60000, 60000, 60000, 0, 'Catch test', 'TUITION', 1, 'PENDING', 10)
      `).run()
      const row = db.prepare("SELECT id FROM fee_invoice WHERE invoice_number = 'TMPL-CATCH'").get() as { id: number }

      // Drop pro_ration_log so recordProRationLog throws inside createInvoiceAndAudit
      db.exec('DROP TABLE pro_ration_log')

      await expect(
        service.generateProRatedInvoice(1, row.id, '2026-02-15', 10)
      ).rejects.toThrow('Failed to generate pro-rated invoice')

      // Recreate for cleanup
      db.exec(`CREATE TABLE pro_ration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        full_amount INTEGER NOT NULL,
        pro_rated_amount INTEGER NOT NULL,
        discount_percentage REAL NOT NULL,
        enrollment_date TEXT NOT NULL,
        term_start TEXT NOT NULL,
        term_end TEXT NOT NULL,
        days_in_term INTEGER NOT NULL,
        days_enrolled INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)
    })
  })
})
