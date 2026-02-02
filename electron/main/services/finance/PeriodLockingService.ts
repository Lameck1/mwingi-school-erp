import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface FinancialPeriod {
  id: number
  period_name: string
  start_date: string
  end_date: string
  status: 'OPEN' | 'LOCKED' | 'CLOSED'
  locked_by: number | null
  locked_at: string | null
  close_approved_by: number | null
  close_approved_at: string | null
  fiscal_year: string
}

export interface PeriodLockData {
  period_id: number
  locked_by: number
  lock_reason: string
}

export interface PeriodLockAudit {
  id: number
  period_id: number
  action: 'LOCK' | 'UNLOCK' | 'CLOSE'
  performed_by: number
  performed_at: string
  reason: string | null
}

export class PeriodLockingService {
  async lockPeriod(data: PeriodLockData): Promise<{ success: boolean; message: string }> {
    const db = getDatabase()

    try {
      const period = db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(data.period_id) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status === 'LOCKED' || period.status === 'CLOSED') {
        return { success: false, message: `Period is already ${period.status.toLowerCase()}` }
      }

      db.prepare(`
        UPDATE financial_period
        SET status = 'LOCKED', locked_by = ?, locked_at = ?
        WHERE id = ?
      `).run(data.locked_by, new Date().toISOString(), data.period_id)

      db.prepare(`
        INSERT INTO period_lock_audit (period_id, action, performed_by, reason)
        VALUES (?, ?, ?, ?)
      `).run(data.period_id, 'LOCK', data.locked_by, data.lock_reason)

      logAudit(
        data.locked_by,
        'LOCK',
        'financial_period',
        data.period_id,
        { status: period.status },
        { status: 'LOCKED' }
      )

      return { success: true, message: `Period '${period.period_name}' locked successfully` }
    } catch (error) {
      throw new Error(`Failed to lock period: ${(error as Error).message}`)
    }
  }

  async unlockPeriod(periodId: number, unlockedBy: number, reason: string): Promise<{ success: boolean; message: string }> {
    const db = getDatabase()

    try {
      const period = db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(periodId) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status !== 'LOCKED') {
        return { success: false, message: `Period is ${period.status}, cannot unlock` }
      }

      db.prepare(`
        UPDATE financial_period
        SET status = 'OPEN', locked_by = NULL, locked_at = NULL
        WHERE id = ?
      `).run(periodId)

      db.prepare(`
        INSERT INTO period_lock_audit (period_id, action, performed_by, reason)
        VALUES (?, ?, ?, ?)
      `).run(periodId, 'UNLOCK', unlockedBy, reason)

      logAudit(
        unlockedBy,
        'UNLOCK',
        'financial_period',
        periodId,
        { status: period.status },
        { status: 'OPEN' }
      )

      return { success: true, message: `Period '${period.period_name}' unlocked successfully` }
    } catch (error) {
      throw new Error(`Failed to unlock period: ${(error as Error).message}`)
    }
  }

  async closePeriod(periodId: number, closedBy: number): Promise<{ success: boolean; message: string }> {
    const db = getDatabase()

    try {
      const period = db.prepare(`
        SELECT * FROM financial_period WHERE id = ?
      `).get(periodId) as FinancialPeriod | undefined

      if (!period) {
        return { success: false, message: 'Financial period not found' }
      }

      if (period.status !== 'LOCKED') {
        return { success: false, message: 'Period must be locked before closing' }
      }

      db.prepare(`
        UPDATE financial_period
        SET status = 'CLOSED', close_approved_by = ?, close_approved_at = ?
        WHERE id = ?
      `).run(closedBy, new Date().toISOString(), periodId)

      db.prepare(`
        INSERT INTO period_lock_audit (period_id, action, performed_by, reason)
        VALUES (?, ?, ?, ?)
      `).run(periodId, 'CLOSE', closedBy, 'Period closed after lock approval')

      logAudit(
        closedBy,
        'CLOSE',
        'financial_period',
        periodId,
        { status: period.status },
        { status: 'CLOSED' }
      )

      return { success: true, message: `Period '${period.period_name}' closed successfully` }
    } catch (error) {
      throw new Error(`Failed to close period: ${(error as Error).message}`)
    }
  }

  async validateTransactionDate(transactionDate: string): Promise<{ valid: boolean; message: string; period?: FinancialPeriod }> {
    const db = getDatabase()

    try {
      const period = db.prepare(`
        SELECT * FROM financial_period
        WHERE ? BETWEEN start_date AND end_date
      `).get(transactionDate) as FinancialPeriod | undefined

      if (!period) {
        return {
          valid: false,
          message: 'No financial period found for this date'
        }
      }

      if (period.status === 'LOCKED' || period.status === 'CLOSED') {
        return {
          valid: false,
          message: `Cannot post transactions to ${period.status.toLowerCase()} period: ${period.period_name}`,
          period
        }
      }

      return {
        valid: true,
        message: 'Transaction date is valid',
        period
      }
    } catch (error) {
      throw new Error(`Failed to validate transaction date: ${(error as Error).message}`)
    }
  }

  async getPeriodForDate(date: string): Promise<FinancialPeriod | null> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM financial_period
      WHERE ? BETWEEN start_date AND end_date
    `).get(date) as FinancialPeriod | null
  }

  async getAllPeriods(): Promise<FinancialPeriod[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM financial_period
      ORDER BY start_date DESC
    `).all() as FinancialPeriod[]
  }

  async getPeriodAuditTrail(periodId: number): Promise<PeriodLockAudit[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM period_lock_audit
      WHERE period_id = ?
      ORDER BY performed_at DESC
    `).all(periodId) as PeriodLockAudit[]
  }
}
