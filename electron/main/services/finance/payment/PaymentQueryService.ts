import { getDatabase } from '../../../database'

import { PaymentTransactionRepository, VoidAuditRepository } from './PaymentTransactionRepository'

import type { ApprovalQueueItem, IPaymentQueryService, PaymentTransaction, VoidedTransaction } from '../PaymentService.types'
import type Database from 'better-sqlite3'

export class PaymentQueryService implements IPaymentQueryService {
  private readonly db: Database.Database
  private readonly transactionRepo: PaymentTransactionRepository
  private readonly voidAuditRepo: VoidAuditRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transactionRepo = this.createTransactionRepository()
    this.voidAuditRepo = this.createVoidAuditRepository()
  }

  private createTransactionRepository(): PaymentTransactionRepository {
    return new PaymentTransactionRepository(this.db)
  }

  private createVoidAuditRepository(): VoidAuditRepository {
    return new VoidAuditRepository(this.db)
  }

  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentTransaction[]> {
    return this.transactionRepo.getStudentHistory(studentId, limit)
  }

  async getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    return this.voidAuditRepo.getVoidReport(startDate, endDate)
  }

  async getPaymentApprovalQueue(_role: string): Promise<ApprovalQueueItem[]> {
    const db = this.db
    return db.prepare(`
      SELECT ar.*,
        lt.student_id,
        s.first_name as student_first_name,
        s.last_name as student_last_name
      FROM approval_request ar
      LEFT JOIN ledger_transaction lt ON ar.entity_id = lt.id AND ar.entity_type = 'PAYMENT'
      LEFT JOIN student s ON lt.student_id = s.id
      WHERE ar.entity_type = 'PAYMENT'
        AND ar.status = 'PENDING'
      ORDER BY ar.created_at ASC
    `).all() as ApprovalQueueItem[]
  }
}
