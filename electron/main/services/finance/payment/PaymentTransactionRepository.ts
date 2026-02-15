import { getDatabase } from '../../../database'
import { asSqlInList, OUTSTANDING_INVOICE_STATUSES } from '../../../utils/financeTransactionTypes'

import type { PaymentTransaction, VoidedTransaction } from '../PaymentService.types'
import type Database from 'better-sqlite3'

export const PAYABLE_INVOICE_STATUSES_SQL = asSqlInList(OUTSTANDING_INVOICE_STATUSES)

export interface VoidAuditRecordData {
  transactionId: number
  studentId: number
  amount: number
  description: string
  voidReason: string
  voidedBy: number
  recoveryMethod?: string
}

export class PaymentTransactionRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getTransaction(id: number): Promise<PaymentTransaction | null> {
    const db = this.db
    return db.prepare(`SELECT * FROM ledger_transaction WHERE id = ?`).get(id) as PaymentTransaction | null
  }

  async getStudentHistory(studentId: number, limit: number): Promise<PaymentTransaction[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE student_id = ?
        AND transaction_type = 'FEE_PAYMENT'
        AND is_voided = 0
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT ?
    `).all(studentId, limit) as PaymentTransaction[]
  }

  async updateStudentBalance(studentId: number, newBalance: number): Promise<void> {
    const db = this.db
    db.prepare(`UPDATE student SET credit_balance = ? WHERE id = ?`).run(newBalance, studentId)
  }

  async getStudentBalance(studentId: number): Promise<number> {
    const db = this.db
    const result = db.prepare(`SELECT credit_balance FROM student WHERE id = ?`).get(studentId) as { credit_balance: number } | undefined
    return result?.credit_balance || 0
  }

  async getStudentById(studentId: number): Promise<{ id: number; credit_balance: number } | null> {
    const db = this.db
    return db.prepare(`SELECT id, credit_balance FROM student WHERE id = ?`).get(studentId) as { id: number; credit_balance: number } | null
  }
}

export class VoidAuditRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async recordVoid(data: VoidAuditRecordData): Promise<number> {
    // Check if table supports approval_request_id column
    const hasApprovalCol = (this.db.prepare(`PRAGMA table_info(void_audit)`).all() as Array<{ name: string }>).some(c => c.name === 'approval_request_id')

    if (hasApprovalCol) {
      const result = this.db.prepare(`
        INSERT INTO void_audit (
          transaction_id, transaction_type, original_amount, student_id, description,
          void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at, approval_request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.transactionId,
        'PAYMENT',
        data.amount,
        data.studentId,
        data.description,
        data.voidReason,
        data.voidedBy,
        new Date().toISOString(),
        data.recoveryMethod || null,
        null,
        null,
        null // Default null for now
      )
      return result.lastInsertRowid as number
    }

    const result = this.db.prepare(`
      INSERT INTO void_audit (
        transaction_id, transaction_type, original_amount, student_id, description,
        void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transactionId,
      'PAYMENT',
      data.amount,
      data.studentId,
      data.description,
      data.voidReason,
      data.voidedBy,
      new Date().toISOString(),
      data.recoveryMethod || null,
      null,
      null
    )
    return result.lastInsertRowid as number
  }

  async getVoidReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    const db = this.db
    return db.prepare(`
      SELECT va.*, u.first_name, u.last_name, s.admission_number, s.first_name as student_first_name
      FROM void_audit va
      LEFT JOIN user u ON va.voided_by = u.id
      LEFT JOIN student s ON va.student_id = s.id
      WHERE va.voided_at >= ? AND va.voided_at <= ?
      ORDER BY va.voided_at DESC
    `).all(startDate, endDate) as VoidedTransaction[]
  }
}
