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
