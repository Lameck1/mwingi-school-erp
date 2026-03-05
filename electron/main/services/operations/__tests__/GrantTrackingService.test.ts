import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { GrantTrackingService } from '../GrantTrackingService'

const SCHEMA = `
  CREATE TABLE government_grant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grant_name TEXT NOT NULL,
    grant_type TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    amount_allocated INTEGER NOT NULL DEFAULT 0,
    amount_received INTEGER NOT NULL DEFAULT 0,
    date_received TEXT,
    expiry_date TEXT,
    nemis_reference_number TEXT,
    conditions TEXT,
    is_utilized BOOLEAN NOT NULL DEFAULT 0,
    utilization_percentage REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE grant_utilization (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grant_id INTEGER NOT NULL,
    gl_account_code TEXT,
    amount_used INTEGER NOT NULL,
    utilization_date TEXT NOT NULL,
    description TEXT NOT NULL,
    journal_entry_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE gl_account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_code TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'ASSET',
    normal_balance TEXT NOT NULL DEFAULT 'DEBIT',
    is_active BOOLEAN DEFAULT 1
  );
  CREATE TABLE journal_entry (
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
  CREATE TABLE journal_entry_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL,
    line_number INTEGER NOT NULL,
    gl_account_id INTEGER NOT NULL,
    debit_amount INTEGER DEFAULT 0,
    credit_amount INTEGER DEFAULT 0,
    description TEXT
  );
  CREATE TABLE approval_rule (
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
  INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES
    ('1010', 'Cash', 'ASSET', 'DEBIT'),
    ('5010', 'Grant Income', 'REVENUE', 'CREDIT'),
    ('5300', 'Grant Expense', 'EXPENSE', 'DEBIT');
`

describe('GrantTrackingService', () => {
  let service: GrantTrackingService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(SCHEMA)
    service = new GrantTrackingService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    db.close()
  })

  // ── createGrant ──
  describe('createGrant', () => {
    it('inserts grant and creates journal entry', async () => {
      const result = await service.createGrant({
        grant_name: 'Capitation FY26',
        grant_type: 'CAPITATION',
        fiscal_year: 2026,
        amount_allocated: 500000,
        amount_received: 400000,
        date_received: '2026-01-15',
        nemis_reference_number: 'NEMIS-2026-001',
        conditions: 'Use by Dec 2026',
      }, 1)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)

      // Verify journal entry was created in the DB
      const je = db.prepare('SELECT COUNT(*) as count FROM journal_entry').get() as { count: number }
      expect(je.count).toBeGreaterThan(0)

      const row = db.prepare('SELECT * FROM government_grant WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(row.grant_name).toBe('Capitation FY26')
      expect(row.amount_allocated).toBe(500000)
    })

    it('resolves expiry_date from explicit value', async () => {
      const result = await service.createGrant({
        grant_name: 'Test', grant_type: 'OTHER', fiscal_year: 2026,
        amount_allocated: 100, amount_received: 100,
        expiry_date: '2026-06-30',
      }, 1)
      const row = db.prepare('SELECT expiry_date FROM government_grant WHERE id = ?').get(result.id) as { expiry_date: string }
      expect(row.expiry_date).toBe('2026-06-30')
    })

    it('defaults expiry_date to fiscal year end when not provided', async () => {
      const result = await service.createGrant({
        grant_name: 'No Expiry', grant_type: 'OTHER', fiscal_year: 2027,
        amount_allocated: 100, amount_received: 50,
      }, 1)
      const row = db.prepare('SELECT expiry_date FROM government_grant WHERE id = ?').get(result.id) as { expiry_date: string }
      expect(row.expiry_date).toBe('2027-12-31')
    })

    it('handles null optional fields', async () => {
      const result = await service.createGrant({
        grant_name: 'Minimal', grant_type: 'CAPITATION', fiscal_year: 2026,
        amount_allocated: 100, amount_received: 100,
      }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT nemis_reference_number, conditions FROM government_grant WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(row.nemis_reference_number).toBeNull()
      expect(row.conditions).toBeNull()
    })
  })

  // ── recordUtilization ──
  describe('recordUtilization', () => {
    let grantId: number

    beforeEach(() => {
      grantId = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('Test Grant', 'CAPITATION', 2026, 100000, 80000)
      `).run().lastInsertRowid as number
    })

    it('records utilization and updates percentage', async () => {
      const result = await service.recordUtilization({
        grantId, amount: 30000, description: 'Term 1 supplies',
        glAccountCode: '5300', utilizationDate: '2026-02-01', userId: 1,
      })
      expect(result.success).toBe(true)

      const grant = db.prepare('SELECT utilization_percentage, is_utilized FROM government_grant WHERE id = ?').get(grantId) as Record<string, number>
      expect(grant.utilization_percentage).toBe(30)
      expect(grant.is_utilized).toBe(0)
    })

    it('marks grant as fully utilized at 100%', async () => {
      await service.recordUtilization({
        grantId, amount: 100000, description: 'Full use',
        glAccountCode: '5300', utilizationDate: '2026-02-01', userId: 1,
      })
      const grant = db.prepare('SELECT utilization_percentage, is_utilized FROM government_grant WHERE id = ?').get(grantId) as Record<string, number>
      expect(grant.utilization_percentage).toBe(100)
      expect(grant.is_utilized).toBe(1)
    })

    it('rejects utilization exceeding allocated amount', async () => {
      const result = await service.recordUtilization({
        grantId, amount: 150000, description: 'Too much',
        glAccountCode: '5300', utilizationDate: '2026-02-01', userId: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Insufficient grant funds')
    })

    it('rejects utilization for non-existent grant', async () => {
      const result = await service.recordUtilization({
        grantId: 9999, amount: 100, description: 'Ghost',
        glAccountCode: '5300', utilizationDate: '2026-02-01', userId: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Grant not found')
    })

    it('creates journal entry when glAccountCode provided', async () => {
      const before = (db.prepare('SELECT COUNT(*) as count FROM journal_entry').get() as { count: number }).count
      await service.recordUtilization({
        grantId, amount: 10000, description: 'Fuel',
        glAccountCode: '5300', utilizationDate: '2026-02-01', userId: 1,
      })
      const after = (db.prepare('SELECT COUNT(*) as count FROM journal_entry').get() as { count: number }).count
      expect(after).toBeGreaterThan(before)
    })

    it('skips journal entry when glAccountCode is null', async () => {
      const before = (db.prepare('SELECT COUNT(*) as count FROM journal_entry').get() as { count: number }).count
      await service.recordUtilization({
        grantId, amount: 10000, description: 'Cash',
        glAccountCode: null, utilizationDate: '2026-02-01', userId: 1,
      })
      const after = (db.prepare('SELECT COUNT(*) as count FROM journal_entry').get() as { count: number }).count
      expect(after).toBe(before)
    })

    it('accumulates utilization across multiple records', async () => {
      await service.recordUtilization({
        grantId, amount: 40000, description: 'Batch 1',
        glAccountCode: null, utilizationDate: '2026-02-01', userId: 1,
      })
      await service.recordUtilization({
        grantId, amount: 30000, description: 'Batch 2',
        glAccountCode: null, utilizationDate: '2026-03-01', userId: 1,
      })
      const grant = db.prepare('SELECT utilization_percentage FROM government_grant WHERE id = ?').get(grantId) as { utilization_percentage: number }
      expect(grant.utilization_percentage).toBe(70)
    })
  })

  // ── getGrantSummary ──
  describe('getGrantSummary', () => {
    it('returns grant with utilizations', async () => {
      const grantId = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('Summary Grant', 'CAPITATION', 2026, 100000, 80000)
      `).run().lastInsertRowid as number

      db.prepare(`INSERT INTO grant_utilization (grant_id, gl_account_code, amount_used, utilization_date, description)
        VALUES (?, '5300', 20000, '2026-02-01', 'Term 1')`).run(grantId)

      const result = await service.getGrantSummary(grantId)
      expect(result.success).toBe(true)
      const data = result.data as Record<string, unknown>
      expect(data.grant_name).toBe('Summary Grant')
      expect((data.utilizations as unknown[]).length).toBe(1)
    })

    it('returns not found for non-existent grant', async () => {
      const result = await service.getGrantSummary(9999)
      expect(result.success).toBe(false)
    })
  })

  // ── getGrantsByStatus ──
  describe('getGrantsByStatus', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, expiry_date, is_utilized)
        VALUES
          ('Expired One', 'CAPITATION', 2025, 100000, 90000, '2026-01-15', 0),
          ('Active One', 'CAPITATION', 2026, 100000, 50000, '2099-12-31', 0),
          ('Fully Used', 'INFRASTRUCTURE', 2026, 200000, 200000, '2099-12-31', 1)
      `)
    })

    it('returns EXPIRED grants', async () => {
      const expired = await service.getGrantsByStatus('EXPIRED')
      expect(expired).toHaveLength(1)
      expect(expired[0]!.grant_name).toBe('Expired One')
    })

    it('returns ACTIVE grants', async () => {
      const active = await service.getGrantsByStatus('ACTIVE')
      expect(active).toHaveLength(1)
      expect(active[0]!.grant_name).toBe('Active One')
    })

    it('returns FULLY_UTILIZED grants', async () => {
      const utilized = await service.getGrantsByStatus('FULLY_UTILIZED')
      expect(utilized).toHaveLength(1)
      expect(utilized[0]!.grant_name).toBe('Fully Used')
    })
  })

  // ── getExpiringGrants ──
  describe('getExpiringGrants', () => {
    it('returns grants expiring within threshold days', async () => {
      db.exec(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, expiry_date, is_utilized)
        VALUES
          ('Expiring Soon', 'CAPITATION', 2026, 100000, 30000, date('now', '+5 days'), 0),
          ('Future', 'CAPITATION', 2026, 100000, 30000, date('now', '+40 days'), 0),
          ('Already Used', 'CAPITATION', 2026, 100000, 100000, date('now', '+3 days'), 1)
      `)
      const expiring = await service.getExpiringGrants(10)
      expect(expiring).toHaveLength(1)
      expect(expiring[0]!.grant_name).toBe('Expiring Soon')
    })

    it('returns empty for invalid threshold', async () => {
      expect(await service.getExpiringGrants(0)).toHaveLength(0)
      expect(await service.getExpiringGrants(-5)).toHaveLength(0)
      expect(await service.getExpiringGrants(1.5)).toHaveLength(0)
    })
  })

  // ── generateNEMISExport ──
  describe('generateNEMISExport', () => {
    it('generates CSV with header and grant rows', async () => {
      db.exec(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, nemis_reference_number, utilization_percentage)
        VALUES ('Cap FY26', 'CAPITATION', 2026, 500000, 400000, 'NEMIS-001', 60.5)
      `)
      const csv = await service.generateNEMISExport(2026)
      expect(csv).toContain('GrantName,Type,Allocated,Received,NEMIS_Ref,Utilization%')
      expect(csv).toContain('"Cap FY26"')
      expect(csv).toContain('"NEMIS-001"')
      expect(csv).toContain('500000')
    })

    it('returns empty string when no grants for fiscal year', async () => {
      const csv = await service.generateNEMISExport(9999)
      expect(csv).toBe('')
    })

    it('handles null NEMIS reference', async () => {
      db.exec(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, utilization_percentage)
        VALUES ('No NEMIS', 'OTHER', 2026, 1000, 500, 0)
      `)
      const csv = await service.generateNEMISExport(2026)
      expect(csv).toContain('""')
    })
  })

  // ── validateGrantCompliance ──
  describe('validateGrantCompliance', () => {
    it('flags missing NEMIS reference', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('No NEMIS', 'CAPITATION', 2026, 100000, 80000)
      `).run().lastInsertRowid as number

      const result = await service.validateGrantCompliance(id)
      expect(result.issues).toContain('Missing NEMIS reference number')
    })

    it('flags received exceeding allocated', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, nemis_reference_number)
        VALUES ('Over-received', 'CAPITATION', 2026, 100000, 150000, 'N1')
      `).run().lastInsertRowid as number

      const result = await service.validateGrantCompliance(id)
      expect(result.issues).toContain('Received amount exceeds allocation')
    })

    it('flags utilization before receipt date', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Pre-receipt', 'CAPITATION', 2026, 100000, 80000, '2026-03-01', 'N1')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 5000, '2026-01-01', 'Early')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Utilization recorded before grant receipt date')
    })

    it('flags utilization after expiry date', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number)
        VALUES ('Post-expiry', 'CAPITATION', 2026, 100000, 80000, '2026-01-01', '2026-06-30', 'N1')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 5000, '2026-07-01', 'Late')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Utilization recorded after grant expiry date')
    })

    it('flags conditions requiring full utilization with remaining funds', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number, conditions)
        VALUES ('Full Utils', 'CAPITATION', 2026, 100000, 80000, '2026-01-01', 'N1', 'Must be fully utilized')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 50000, '2026-02-01', 'Partial')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Grant conditions require full utilization but funds remain unused')
    })

    it('flags expired grant with unutilized received funds', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number)
        VALUES ('Expired Unused', 'CAPITATION', 2024, 100000, 80000, '2024-01-01', '2024-12-31', 'N1')
      `).run().lastInsertRowid as number

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Grant expired with unutilized received funds')
    })

    it('returns not found for non-existent grant', async () => {
      const compliance = await service.validateGrantCompliance(9999)
      expect(compliance.compliant).toBe(false)
      expect(compliance.issues).toContain('Grant not found')
    })

    it('returns compliant when everything is correct', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number)
        VALUES ('Good Grant', 'CAPITATION', 2026, 100000, 80000, '2026-01-01', '2099-12-31', 'NEMIS-OK')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 70000, '2026-02-01', 'Good usage')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.compliant).toBe(true)
      expect(compliance.issues).toEqual([])
    })

    it('flags utilization exceeding received amount', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Over-Used', 'CAPITATION', 2026, 200000, 80000, '2026-01-01', 'N1')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 100000, '2026-02-01', 'Too much')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Utilization exceeds received amount')
    })

    it('flags utilization exceeding allocated amount', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Over-Allocated', 'CAPITATION', 2026, 50000, 80000, '2026-01-01', 'N1')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 60000, '2026-02-01', 'Excess')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Utilization exceeds allocated amount')
    })
  })

  // ── createGrant error path ──
  describe('createGrant error handling', () => {
    it('catches and returns error on database failure', async () => {
      const brokenDb = new Database(':memory:')
      brokenDb.close()
      const origDb = db
      db = brokenDb as unknown as Database.Database

      const result = await service.createGrant({
        grant_name: 'Fail', grant_type: 'OTHER', fiscal_year: 2026,
        amount_allocated: 100, amount_received: 100,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()

      db = origDb
    })

    it('resolves expiry_date with invalid date format to fiscal year end', async () => {
      const result = await service.createGrant({
        grant_name: 'Bad Date', grant_type: 'OTHER', fiscal_year: 2027,
        amount_allocated: 100, amount_received: 50,
        expiry_date: 'invalid-date',
      }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT expiry_date FROM government_grant WHERE id = ?').get(result.id) as { expiry_date: string }
      expect(row.expiry_date).toBe('2027-12-31')
    })
  })

  /* ==================================================================
   *  Branch coverage: createGrant without date_received → falls back to today (L154)
   * ================================================================== */
  describe('createGrant – no date_received', () => {
    it('creates grant with today as fallback date', async () => {
      const result = await service.createGrant({
        grant_name: 'No Date', grant_type: 'CAPITATION', fiscal_year: 2026,
        amount_allocated: 50000, amount_received: 25000,
      }, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: recordUtilization without glAccountCode → skips journal entry (L223)
   * ================================================================== */
  describe('recordUtilization – no GL account code', () => {
    it('skips journal entry creation when no glAccountCode', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('No GL', 'CAPITATION', 2026, 100000, 80000, '2026-01-01', 'N1')
      `).run().lastInsertRowid as number

      const result = await service.recordUtilization({
        grantId: id,
        amount: 5000,
        utilizationDate: '2026-02-01',
        description: 'Usage without GL',
        userId: 1,
        glAccountCode: null,
      })
      expect(result.success).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: getExpiringGrants with invalid threshold → returns empty (L259)
   * ================================================================== */
  describe('getExpiringGrants – invalid thresholds', () => {
    it('returns empty for negative daysThreshold', async () => {
      const grants = await service.getExpiringGrants(-5)
      expect(grants).toEqual([])
    })

    it('returns empty for non-integer daysThreshold', async () => {
      const grants = await service.getExpiringGrants(3.5)
      expect(grants).toEqual([])
    })

    it('returns empty for zero daysThreshold', async () => {
      const grants = await service.getExpiringGrants(0)
      expect(grants).toEqual([])
    })
  })

  /* ==================================================================
   *  Branch coverage: getGrantsByStatus returns matching grants (L254-260)
   * ================================================================== */
  describe('getGrantsByStatus', () => {
    it('returns fully utilized grants', async () => {
      db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number, is_utilized)
        VALUES ('Full', 'CAPITATION', 2026, 100000, 100000, '2026-01-01', 'N-FULL', 1)
      `).run()
      const grants = await service.getGrantsByStatus('FULLY_UTILIZED')
      expect(grants.length).toBeGreaterThanOrEqual(1)
    })

    it('returns active grants', async () => {
      db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number, is_utilized)
        VALUES ('Active', 'CAPITATION', 2099, 100000, 50000, '2026-01-01', '2099-12-31', 'N-ACT', 0)
      `).run()
      const grants = await service.getGrantsByStatus('ACTIVE')
      expect(grants.length).toBeGreaterThanOrEqual(1)
    })

    it('returns expired grants', async () => {
      db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number, is_utilized)
        VALUES ('Old', 'CAPITATION', 2020, 100000, 50000, '2020-01-01', '2020-12-31', 'N-EXP', 0)
      `).run()
      const grants = await service.getGrantsByStatus('EXPIRED')
      expect(grants.length).toBeGreaterThanOrEqual(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateNEMISExport with no grants → returns '' (L292)
   * ================================================================== */
  describe('generateNEMISExport', () => {
    it('returns empty string for fiscal year with no grants', async () => {
      const csv = await service.generateNEMISExport(1900)
      expect(csv).toBe('')
    })

    it('returns CSV for fiscal year with grants', async () => {
      db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number, utilization_percentage)
        VALUES ('Test CSV', 'CAPITATION', 2077, 50000, 30000, '2077-01-01', 'NEMIS-CSV', 50.0)
      `).run()
      const csv = await service.generateNEMISExport(2077)
      expect(csv).toContain('Test CSV')
      expect(csv).toContain('NEMIS-CSV')
    })
  })

  /* ==================================================================
   *  Branch coverage: getGrantSummary with non-existent grant (L230)
   * ================================================================== */
  describe('getGrantSummary', () => {
    it('returns success false for non-existent grant', async () => {
      const result = await service.getGrantSummary(9999)
      expect(result.success).toBe(false)
    })

    it('returns grant data with utilizations', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Summary', 'CAPITATION', 2026, 100000, 80000, '2026-01-01', 'N-SUM')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 5000, '2026-02-01', 'Test')`).run(id)
      const result = await service.getGrantSummary(id)
      expect(result.success).toBe(true)
      expect((result.data as any).utilizations.length).toBe(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: validateGrantCompliance – utilization before receipt date
   * ================================================================== */
  describe('validateGrantCompliance – early utilization', () => {
    it('flags utilization before receipt date', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Early Use', 'CAPITATION', 2026, 100000, 80000, '2026-06-01', 'N1')
      `).run().lastInsertRowid as number
      db.prepare(`INSERT INTO grant_utilization (grant_id, amount_used, utilization_date, description) VALUES (?, 5000, '2026-01-01', 'Before receipt')`).run(id)

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Utilization recorded before grant receipt date')
    })
  })

  /* ==================================================================
   *  Branch coverage: validateGrantCompliance – received exceeds allocated
   * ================================================================== */
  describe('validateGrantCompliance – over-received', () => {
    it('flags when received amount exceeds allocation', async () => {
      const id = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, nemis_reference_number)
        VALUES ('Over Recv', 'CAPITATION', 2026, 50000, 100000, '2026-01-01', 'N1')
      `).run().lastInsertRowid as number

      const compliance = await service.validateGrantCompliance(id)
      expect(compliance.issues).toContain('Received amount exceeds allocation')
    })
  })

  /* ==================================================================
   *  Branch coverage: withComputedExpiry – grant with no expiry_date (L84 ??fallback)
   * ================================================================== */
  describe('withComputedExpiry', () => {
    it('falls back to fiscal year end when no expiry_date or computed_expiry', async () => {
      db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received, nemis_reference_number, is_utilized)
        VALUES ('No Expiry', 'CAPITATION', 2028, 50000, 50000, 'NE', 1)
      `).run()
      const grants = await service.getGrantsByStatus('FULLY_UTILIZED')
      const g = grants.find(g => g.grant_name === 'No Expiry')
      expect(g).toBeDefined()
      // Should have expiry_date set from the column
      expect(g!.expiry_date).toBeDefined()
    })
  })

  // ── Branch coverage: recordUtilization non-Error catch (L222-223) ──
  describe('recordUtilization – non-Error exception', () => {
    it('returns UNKNOWN_ERROR when a non-Error is thrown', async () => {
      const grantId = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('Err Grant', 'OTHER', 2026, 100000, 80000)
      `).run().lastInsertRowid as number

      // Mock db.transaction to throw a non-Error value (a string)
      const origTransaction = db.transaction.bind(db)
      vi.spyOn(db, 'transaction').mockImplementation((() => {
        return () => { throw 'non-error string' } // NOSONAR
      }) as unknown as typeof db.transaction)

      const result = await service.recordUtilization({
        grantId, amount: 1000, description: 'Trigger catch',
        glAccountCode: null, utilizationDate: '2026-03-01', userId: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')

      // Restore
      vi.mocked(db.transaction).mockImplementation(origTransaction as typeof db.transaction)
    })

    it('returns error message when an Error is thrown in transaction', async () => {
      const grantId = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('Err Grant2', 'OTHER', 2026, 100000, 80000)
      `).run().lastInsertRowid as number

      // Drop the utilization table so the INSERT inside the transaction throws an Error
      db.exec('DROP TABLE grant_utilization')

      const result = await service.recordUtilization({
        grantId, amount: 1000, description: 'Trigger catch',
        glAccountCode: null, utilizationDate: '2026-03-01', userId: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).not.toBe('Unknown error')
    })
  })

  // ── Branch coverage: getGrantSummary catch block (L242) ──
  describe('getGrantSummary – database error triggers catch', () => {
    it('returns { success: false } when DB query throws', async () => {
      const grantId = db.prepare(`
        INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
        VALUES ('Broken Grant', 'OTHER', 2026, 50000, 50000)
      `).run().lastInsertRowid as number

      // Drop the utilization table so the second query in getGrantSummary fails
      db.exec('DROP TABLE grant_utilization')

      const result = await service.getGrantSummary(grantId)
      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
    })
  })

  // ── Branch coverage: getGrantExpiryExpression false branch (L69) ──
  // When schema lacks expiry_date column, the expression falls back to printf
  describe('schema without expiry_date column', () => {
    const SCHEMA_NO_EXPIRY = `
      CREATE TABLE government_grant (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grant_name TEXT NOT NULL,
        grant_type TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        amount_allocated INTEGER NOT NULL DEFAULT 0,
        amount_received INTEGER NOT NULL DEFAULT 0,
        date_received TEXT,
        nemis_reference_number TEXT,
        conditions TEXT,
        is_utilized BOOLEAN NOT NULL DEFAULT 0,
        utilization_percentage REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE grant_utilization (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grant_id INTEGER NOT NULL,
        gl_account_code TEXT,
        amount_used INTEGER NOT NULL,
        utilization_date TEXT NOT NULL,
        description TEXT NOT NULL,
        journal_entry_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL DEFAULT 'ASSET',
        normal_balance TEXT NOT NULL DEFAULT 'DEBIT',
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE journal_entry (
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
      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT
      );
      CREATE TABLE approval_rule (
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
      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES
        ('1010', 'Cash', 'ASSET', 'DEBIT'),
        ('5010', 'Grant Income', 'REVENUE', 'CREDIT'),
        ('5300', 'Grant Expense', 'EXPENSE', 'DEBIT');
    `

    beforeEach(() => {
      db.close()
      db = new Database(':memory:')
      db.exec(SCHEMA_NO_EXPIRY)
      service = new GrantTrackingService()
    })

    it('createGrant works without expiry_date column', async () => {
      const result = await service.createGrant({
        grant_name: 'No Expiry Col', grant_type: 'CAPITATION', fiscal_year: 2026,
        amount_allocated: 100000, amount_received: 80000,
      }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT * FROM government_grant WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(row.grant_name).toBe('No Expiry Col')
      // expiry_date column does not exist in this schema
      expect(row).not.toHaveProperty('expiry_date')
    })

    it('getGrantsByStatus uses fiscal year fallback expression (L69 false branch)', async () => {
      const fy = new Date().getFullYear()
      db.prepare(
        `INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
         VALUES ('FY Grant', 'OTHER', ?, 50000, 50000)`
      ).run(fy)

      const active = await service.getGrantsByStatus('ACTIVE')
      expect(active.length).toBe(1)
      // withComputedExpiry fills expiry_date from computed_expiry_date (L84 ?? branch)
      expect(active[0]!.expiry_date).toMatch(/^\d{4}-12-31$/)
    })

    it('getExpiringGrants uses fiscal year expression when no expiry_date column', async () => {
      const fy = new Date().getFullYear()
      db.prepare(
        `INSERT INTO government_grant (grant_name, grant_type, fiscal_year, amount_allocated, amount_received)
         VALUES ('Expiry Check', 'CAPITATION', ?, 60000, 60000)`
      ).run(fy)

      const expiring = await service.getExpiringGrants(400)
      expect(Array.isArray(expiring)).toBe(true)
    })
  })
})
