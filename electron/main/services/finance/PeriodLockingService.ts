import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface FinancialPeriod {
  id: number
  name: string
  start_date: string
  end_date: string
  status: 'OPEN' | 'LOCKED' | 'CLOSED'
  locked_by: number | null
  locked_at: string | null
  closed_by: number | null
  closed_at: string | null
}

export interface LockResult {
  success: boolean
  message: string
}

export interface TransactionAllowanceResult {
  allowed: boolean
  reason: string | null
}

export class PeriodLockingService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  lockPeriod(periodId: number, lockedBy: number): LockResult {
    try {
      const period = this.db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(periodId) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status === 'LOCKED') {
        return { success: false, message: `Period is already locked` }
      }

      if (period.status === 'CLOSED') {
        return { success: false, message: `Period is closed and cannot be locked` }
      }

      const now = new Date().toISOString()
      this.db.prepare(`
        UPDATE financial_period
        SET status = 'LOCKED', locked_by = ?, locked_at = ?
        WHERE id = ?
      `).run(lockedBy, now, periodId)

      // Log audit
      this.db.prepare(`
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        lockedBy,
        'LOCK_PERIOD',
        'financial_period',
        periodId,
        JSON.stringify({ status: period.status }),
        JSON.stringify({ status: 'LOCKED' })
      )

      return { success: true, message: `Period '${period.name}' locked successfully` }
    } catch (error) {
      return { success: false, message: `Failed to lock period: ${(error as Error).message}` }
    }
  }

  unlockPeriod(periodId: number, unlockedBy: number): LockResult {
    try {
      const period = this.db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(periodId) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status === 'OPEN') {
        return { success: false, message: `Period is not currently locked` }
      }

      if (period.status === 'CLOSED') {
        return { success: false, message: `Period is closed and cannot be unlocked` }
      }

      const now = new Date().toISOString()
      this.db.prepare(`
        UPDATE financial_period
        SET status = 'OPEN', locked_by = NULL, locked_at = NULL
        WHERE id = ?
      `).run(periodId)

      // Log audit
      this.db.prepare(`
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        unlockedBy,
        'UNLOCK_PERIOD',
        'financial_period',
        periodId,
        JSON.stringify({ status: period.status }),
        JSON.stringify({ status: 'OPEN' })
      )

      return { success: true, message: `Period '${period.name}' unlocked successfully` }
    } catch (error) {
      return { success: false, message: `Failed to unlock period: ${(error as Error).message}` }
    }
  }

  closePeriod(periodId: number, closedBy: number): LockResult {
    try {
      const period = this.db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(periodId) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status === 'CLOSED') {
        return { success: false, message: `Period is already closed` }
      }

      if (period.status !== 'LOCKED') {
        return { success: false, message: `Period must be locked before closing. Current status: ${period.status}` }
      }

      const now = new Date().toISOString()
      this.db.prepare(`
        UPDATE financial_period
        SET status = 'CLOSED', closed_by = ?, closed_at = ?
        WHERE id = ?
      `).run(closedBy, now, periodId)

      // Log audit
      this.db.prepare(`
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        closedBy,
        'CLOSE_PERIOD',
        'financial_period',
        periodId,
        JSON.stringify({ status: period.status }),
        JSON.stringify({ status: 'CLOSED' })
      )

      return { success: true, message: `Period '${period.name}' closed successfully` }
    } catch (error) {
      return { success: false, message: `Failed to close period: ${(error as Error).message}` }
    }
  }

  isTransactionAllowed(transactionDate: string): TransactionAllowanceResult {
    try {
      const period = this.db.prepare(`
        SELECT * FROM financial_period
        WHERE ? BETWEEN start_date AND end_date
      `).get(transactionDate) as FinancialPeriod | undefined

      if (!period) {
        return {
          allowed: false,
          reason: 'No financial period found for this date'
        }
      }

      if (period.status === 'LOCKED' || period.status === 'CLOSED') {
        return {
          allowed: false,
          reason: `Period is ${period.status.toLowerCase()}`
        }
      }

      return {
        allowed: true,
        reason: null
      }
    } catch (error) {
      return {
        allowed: false,
        reason: `Error checking transaction allowance: ${(error as Error).message}`
      }
    }
  }

  getPeriodForDate(date: string): FinancialPeriod | null {
    try {
      return this.db.prepare(`
        SELECT * FROM financial_period
        WHERE ? BETWEEN start_date AND end_date
      `).get(date) as FinancialPeriod | null
    } catch (error) {
      return null
    }
  }

  getAllPeriods(status?: string): FinancialPeriod[] {
    try {
      if (status) {
        return this.db.prepare(`
          SELECT * FROM financial_period
          WHERE status = ?
          ORDER BY start_date DESC
        `).all(status) as FinancialPeriod[]
      }
      return this.db.prepare(`
        SELECT * FROM financial_period
        ORDER BY start_date DESC
      `).all() as FinancialPeriod[]
    } catch (error) {
      return []
    }
  }
}
