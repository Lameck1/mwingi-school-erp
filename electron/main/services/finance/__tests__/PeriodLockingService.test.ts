import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { PeriodLockingService } from '../PeriodLockingService'

describe('PeriodLockingService', () => {
  let db: Database.Database
  let service: PeriodLockingService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE financial_period (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT DEFAULT 'OPEN',
        locked_at DATETIME,
        locked_by INTEGER,
        closed_at DATETIME,
        closed_by INTEGER
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

      -- Create test periods
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES 
        ('Term 1 2026', '2026-01-01', '2026-03-31', 'OPEN'),
        ('Term 2 2026', '2026-04-01', '2026-06-30', 'OPEN'),
        ('Term 3 2025', '2025-09-01', '2025-12-31', 'LOCKED');
    `)

    service = new PeriodLockingService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('lockPeriod', () => {
    it('should lock an open period', () => {
      const result = service.lockPeriod(1, 10)

      expect(result.success).toBe(true)
      expect(result.message).toContain('locked successfully')

      const period = db.prepare('SELECT * FROM financial_period WHERE id = ?').get(1) as unknown
      expect(period.status).toBe('LOCKED')
      expect(period.locked_by).toBe(10)
      expect(period.locked_at).not.toBeNull()
    })

    it('should prevent locking an already locked period', () => {
      service.lockPeriod(1, 10)
      const result = service.lockPeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('already locked')
    })

    it('should prevent locking a closed period', () => {
      // Close the period first
      db.exec(`UPDATE financial_period SET status = 'CLOSED' WHERE id = 1`)

      const result = service.lockPeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('closed and cannot be locked')
    })

    it('should log audit trail on lock', () => {
      service.lockPeriod(1, 10)

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('LOCK_PERIOD') as unknown[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
      expect(auditLogs[0].record_id).toBe(1)
    })
  })

  describe('unlockPeriod', () => {
    beforeEach(() => {
      service.lockPeriod(1, 10)
    })

    it('should unlock a locked period', () => {
      const result = service.unlockPeriod(1, 10)

      expect(result.success).toBe(true)
      expect(result.message).toContain('unlocked successfully')

      const period = db.prepare('SELECT * FROM financial_period WHERE id = ?').get(1) as unknown
      expect(period.status).toBe('OPEN')
      expect(period.locked_by).toBeNull()
      expect(period.locked_at).toBeNull()
    })

    it('should prevent unlocking an open period', () => {
      service.unlockPeriod(1, 10)
      const result = service.unlockPeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('not currently locked')
    })

    it('should prevent unlocking a closed period', () => {
      db.exec(`UPDATE financial_period SET status = 'CLOSED' WHERE id = 1`)

      const result = service.unlockPeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('closed and cannot be unlocked')
    })

    it('should log audit trail on unlock', () => {
      service.unlockPeriod(1, 10)

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('UNLOCK_PERIOD') as unknown[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
      expect(auditLogs[0].record_id).toBe(1)
    })
  })

  describe('closePeriod', () => {
    it('should close a locked period', () => {
      service.lockPeriod(1, 10)
      const result = service.closePeriod(1, 10)

      expect(result.success).toBe(true)
      expect(result.message).toContain('closed successfully')

      const period = db.prepare('SELECT * FROM financial_period WHERE id = ?').get(1) as unknown
      expect(period.status).toBe('CLOSED')
      expect(period.closed_by).toBe(10)
      expect(period.closed_at).not.toBeNull()
    })

    it('should prevent closing an unlocked period', () => {
      const result = service.closePeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('must be locked')
    })

    it('should prevent closing an already closed period', () => {
      db.exec(`UPDATE financial_period SET status = 'CLOSED' WHERE id = 1`)

      const result = service.closePeriod(1, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('already closed')
    })

    it('should log audit trail on close', () => {
      service.lockPeriod(1, 10)
      service.closePeriod(1, 10)

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('CLOSE_PERIOD') as unknown[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
      expect(auditLogs[0].record_id).toBe(1)
    })
  })

  describe('isTransactionAllowed', () => {
    it('should allow transaction in open period', () => {
      const result = service.isTransactionAllowed('2026-02-15')

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeNull()
    })

    it('should block transaction in locked period', () => {
      service.lockPeriod(1, 10)
      const result = service.isTransactionAllowed('2026-02-15')

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('locked')
    })

    it('should block transaction in closed period', () => {
      const result = service.isTransactionAllowed('2025-10-15') // Term 3 2025 is locked

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('locked')
    })

    it('should block transaction with no matching period', () => {
      const result = service.isTransactionAllowed('2028-01-01')

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('No financial period')
    })
  })

  describe('getAllPeriods', () => {
    it('should return all periods with lock info', () => {
      const periods = service.getAllPeriods()

      expect(periods).toHaveLength(3)
      expect(periods[0]).toHaveProperty('name')
      expect(periods[0]).toHaveProperty('status')
      expect(periods[0]).toHaveProperty('start_date')
      expect(periods[0]).toHaveProperty('end_date')
    })

    it('should filter by status', () => {
      const openPeriods = service.getAllPeriods('OPEN')
      expect(openPeriods.length).toBe(2)
      openPeriods.forEach(p => {
        expect(p.status).toBe('OPEN')
      })
    })
  })

  describe('edge cases', () => {
    it('should handle invalid period ID gracefully', () => {
      const result = service.lockPeriod(999, 10)

      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('should handle transaction on period boundary', () => {
      const result = service.isTransactionAllowed('2026-03-31') // Last day of Term 1

      expect(result.allowed).toBe(true)
    })
  })
})

