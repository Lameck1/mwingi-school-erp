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

describe('GrantTrackingService expiry logic', () => {
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
        journal_entry_id INTEGER
      );
      CREATE TABLE gl_account (
        account_code TEXT PRIMARY KEY,
        account_name TEXT
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('classifies expired grants using expiry_date when filtering by status', async () => {
    db.prepare(`
      INSERT INTO government_grant (
        grant_name, grant_type, fiscal_year, amount_allocated, amount_received, expiry_date, is_utilized
      ) VALUES
        ('Expired Capitation', 'CAPITATION', 2025, 100000, 90000, '2026-01-15', 0),
        ('Active Capitation', 'CAPITATION', 2026, 100000, 50000, '2026-12-31', 0)
    `).run()

    const service = new GrantTrackingService()
    const expired = await service.getGrantsByStatus('EXPIRED')

    expect(expired).toHaveLength(1)
    expect(expired[0].grant_name).toBe('Expired Capitation')
  })

  it('returns grants expiring within threshold days', async () => {
    db.prepare(`
      INSERT INTO government_grant (
        grant_name, grant_type, fiscal_year, amount_allocated, amount_received, expiry_date, is_utilized
      ) VALUES
        ('Expiring Soon', 'CAPITATION', 2026, 100000, 30000, date('now', '+5 days'), 0),
        ('Future Grant', 'CAPITATION', 2026, 100000, 30000, date('now', '+40 days'), 0),
        ('Already Utilized', 'CAPITATION', 2026, 100000, 100000, date('now', '+3 days'), 1)
    `).run()

    const service = new GrantTrackingService()
    const expiring = await service.getExpiringGrants(10)

    expect(expiring).toHaveLength(1)
    expect(expiring[0].grant_name).toBe('Expiring Soon')
  })

  it('flags compliance issues for invalid utilization timelines and amounts', async () => {
    const grantId = db.prepare(`
      INSERT INTO government_grant (
        grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number, conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Infrastructure Grant',
      'INFRASTRUCTURE',
      2026,
      100000,
      90000,
      '2026-02-01',
      '2026-02-28',
      'NEMIS-001',
      'Must be fully utilized'
    ).lastInsertRowid as number

    db.prepare(`
      INSERT INTO grant_utilization (grant_id, gl_account_code, amount_used, utilization_date, description)
      VALUES
        (?, '5300', 20000, '2026-01-20', 'Pre-receipt utilization'),
        (?, '5300', 80000, '2026-03-02', 'Post-expiry utilization')
    `).run(grantId, grantId)

    const service = new GrantTrackingService()
    const compliance = await service.validateGrantCompliance(grantId)

    expect(compliance.compliant).toBe(false)
    expect(compliance.issues).toContain('Utilization exceeds received amount')
    expect(compliance.issues).toContain('Utilization recorded before grant receipt date')
    expect(compliance.issues).toContain('Utilization recorded after grant expiry date')
  })

  it('returns compliant when grant utilization is within constraints', async () => {
    const grantId = db.prepare(`
      INSERT INTO government_grant (
        grant_name, grant_type, fiscal_year, amount_allocated, amount_received, date_received, expiry_date, nemis_reference_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Capitation Grant',
      'CAPITATION',
      2026,
      120000,
      100000,
      '2026-01-10',
      '2026-12-31',
      'NEMIS-OK'
    ).lastInsertRowid as number

    db.prepare(`
      INSERT INTO grant_utilization (grant_id, gl_account_code, amount_used, utilization_date, description)
      VALUES
        (?, '5300', 30000, '2026-01-25', 'Term 1 allocation'),
        (?, '5300', 50000, '2026-03-10', 'Term 2 allocation')
    `).run(grantId, grantId)

    const service = new GrantTrackingService()
    const compliance = await service.validateGrantCompliance(grantId)

    expect(compliance.compliant).toBe(true)
    expect(compliance.issues).toEqual([])
  })
})
