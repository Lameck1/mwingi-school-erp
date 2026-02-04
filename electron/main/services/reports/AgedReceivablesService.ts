import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IAgingCalculator {
  calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]>
}

export interface IPriorityDeterminer {
  getHighPriorityCollections(): Promise<any[]>
}

export interface ICollectionReminder {
  generateCollectionReminders(): Promise<any[]>
}

export interface ICollectionsAnalyzer {
  getCollectionsEffectivenessReport(): Promise<unknown>
}

export interface AgedReceivableBucket {
  bucket_name: string
  bucket_days_from: number
  bucket_days_to: number
  student_count: number
  total_amount: number
  accounts: Array<{
    student_id: number
    student_name: string
    admission_number: string
    amount: number
    days_overdue: number
    last_payment_date: string
  }>
}

export interface AgedReceivablesData {
  as_of_date?: string
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class AgedReceivablesRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOutstandingInvoices(asOfDate: string): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT fi.*, s.first_name, s.last_name, s.admission_number,
             JULIANDAY(?) - JULIANDAY(fi.due_date) as days_overdue
      FROM fee_invoice fi
      JOIN student s ON fi.student_id = s.id
      WHERE fi.status = 'OUTSTANDING' AND fi.due_date <= ?
      ORDER BY fi.due_date ASC
    `).all(asOfDate, asOfDate) as unknown[]
  }

  async getStudentLastPaymentDate(studentId: number): Promise<string | null> {
    const db = this.db
    const result = db.prepare(`
      SELECT transaction_date FROM ledger_transaction
      WHERE student_id = ? AND transaction_type IN ('CREDIT', 'PAYMENT')
      ORDER BY transaction_date DESC LIMIT 1
    `).get(studentId) as unknown
    return result?.transaction_date || null
  }

  async recordCollectionAction(action: unknown): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO collection_action (student_id, action_type, action_date, notes)
      VALUES (?, ?, ?, ?)
    `).run(action.student_id, action.action_type, new Date().toISOString(), action.notes)
    return result.lastInsertRowid as number
  }

  async getCollectionHistory(studentId: number): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM collection_action
      WHERE student_id = ?
      ORDER BY action_date DESC
    `).all(studentId) as unknown[]
  }
}

// ============================================================================
// AGING CALCULATOR (SRP)
// ============================================================================

class AgingCalculator implements IAgingCalculator {
  private db: Database.Database
  private repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new AgedReceivablesRepository(this.db)
  }

  async calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]> {
    const invoices = await this.repo.getOutstandingInvoices(asOfDate)

    const buckets: { [key: string]: AgedReceivableBucket } = {
      '0-30': {
        bucket_name: '0-30 Days',
        bucket_days_from: 0,
        bucket_days_to: 30,
        student_count: 0,
        total_amount: 0,
        accounts: []
      },
      '31-60': {
        bucket_name: '31-60 Days',
        bucket_days_from: 31,
        bucket_days_to: 60,
        student_count: 0,
        total_amount: 0,
        accounts: []
      },
      '61-90': {
        bucket_name: '61-90 Days',
        bucket_days_from: 61,
        bucket_days_to: 90,
        student_count: 0,
        total_amount: 0,
        accounts: []
      },
      '91-120': {
        bucket_name: '91-120 Days',
        bucket_days_from: 91,
        bucket_days_to: 120,
        student_count: 0,
        total_amount: 0,
        accounts: []
      },
      '120+': {
        bucket_name: '120+ Days',
        bucket_days_from: 120,
        bucket_days_to: 999999,
        student_count: 0,
        total_amount: 0,
        accounts: []
      }
    }

    const studentBucketMap: { [key: number]: string } = {}

    for (const invoice of invoices) {
      const daysOverdue = Math.ceil(invoice.days_overdue || 0)
      let bucketKey = '0-30'

      if (daysOverdue > 120) bucketKey = '120+'
      else if (daysOverdue > 90) bucketKey = '91-120'
      else if (daysOverdue > 60) bucketKey = '61-90'
      else if (daysOverdue > 30) bucketKey = '31-60'

      const lastPaymentDate = await this.repo.getStudentLastPaymentDate(invoice.student_id)
      const bucket = buckets[bucketKey]

      // Only count each student once (use highest overdue amount)
      if (!studentBucketMap[invoice.student_id] || studentBucketMap[invoice.student_id] !== bucketKey) {
        if (!studentBucketMap[invoice.student_id]) {
          bucket.student_count++
          studentBucketMap[invoice.student_id] = bucketKey
        }

        bucket.total_amount += invoice.amount
        bucket.accounts.push({
          student_id: invoice.student_id,
          student_name: `${invoice.first_name} ${invoice.last_name}`,
          admission_number: invoice.admission_number,
          amount: invoice.amount,
          days_overdue: daysOverdue,
          last_payment_date: lastPaymentDate || 'N/A'
        })
      }
    }

    return Object.values(buckets)
  }
}

// ============================================================================
// PRIORITY DETERMINER (SRP)
// ============================================================================

class PriorityDeterminer implements IPriorityDeterminer {
  private db: Database.Database
  private repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new AgedReceivablesRepository(this.db)
  }

  async getHighPriorityCollections(): Promise<any[]> {
    const invoices = await this.repo.getOutstandingInvoices(new Date().toISOString().split('T')[0])

    const highPriority = invoices.filter((inv: unknown) => {
      const daysOverdue = Math.ceil(inv.days_overdue || 0)
      // High priority: >90 days OR >100,000 KES
      return daysOverdue > 90 || inv.amount > 100000
    })

    return highPriority
      .sort((a: unknown, b: unknown) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 50) // Top 50
  }
}

// ============================================================================
// COLLECTION REMINDER GENERATOR (SRP)
// ============================================================================

class CollectionReminderGenerator implements ICollectionReminder {
  private db: Database.Database
  private repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new AgedReceivablesRepository(this.db)
  }

  async generateCollectionReminders(): Promise<any[]> {
    const invoices = await this.repo.getOutstandingInvoices(new Date().toISOString().split('T')[0])

    const reminders: any[] = []

    for (const invoice of invoices) {
      const daysOverdue = Math.ceil(invoice.days_overdue || 0)
      let reminderType = ''
      let reminderText = ''

      if (daysOverdue === 30) {
        reminderType = 'FIRST_REMINDER'
        reminderText = `First reminder: Fee balance of KES ${invoice.amount} is now due. Please settle immediately.`
      } else if (daysOverdue === 60) {
        reminderType = 'SECOND_REMINDER'
        reminderText = `Second reminder: Outstanding balance KES ${invoice.amount} for ${invoice.days_overdue} days. Urgent action required.`
      } else if (daysOverdue === 90) {
        reminderType = 'FINAL_WARNING'
        reminderText = `Final warning: Account suspended. Balance KES ${invoice.amount} overdue for 90 days. Contact bursar immediately.`
      }

      if (reminderType) {
        reminders.push({
          student_id: invoice.student_id,
          student_phone: invoice.phone || 'N/A',
          reminder_type: reminderType,
          reminder_text: reminderText,
          amount: invoice.amount,
          days_overdue: daysOverdue
        })

        // Record the action
        await this.repo.recordCollectionAction({
          student_id: invoice.student_id,
          action_type: reminderType,
          notes: reminderText
        })
      }
    }

    return reminders
  }
}

// ============================================================================
// COLLECTIONS ANALYZER (SRP)
// ============================================================================

class CollectionsAnalyzer implements ICollectionsAnalyzer {
  private db: Database.Database
  private repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new AgedReceivablesRepository(this.db)
  }

  async getCollectionsEffectivenessReport(): Promise<unknown> {
    const db = this.db

    // Get all payments in last 3 months
    const paymentMetrics = db.prepare(`
      SELECT
        COUNT(*) as total_payments,
        SUM(amount) as total_amount_collected,
        AVG(amount) as average_payment,
        COUNT(DISTINCT student_id) as unique_students
      FROM ledger_transaction
      WHERE transaction_type IN ('CREDIT', 'PAYMENT')
        AND transaction_date >= date('now', '-3 months')
    `).get() as unknown

    // Get outstanding invoices
    const outstandingMetrics = db.prepare(`
      SELECT
        COUNT(*) as total_outstanding_invoices,
        SUM(amount) as total_outstanding_amount,
        COUNT(DISTINCT student_id) as students_with_arrears
      FROM fee_invoice
      WHERE status = 'OUTSTANDING'
    `).get() as unknown

    // Calculate collection rate
    const totalBilled = db.prepare(`
      SELECT SUM(amount) as total
      FROM fee_invoice
      WHERE invoice_date >= date('now', '-3 months')
    `).get() as unknown

    const collectionRate = totalBilled?.total ? ((paymentMetrics?.total_amount_collected || 0) / (totalBilled.total || 1)) * 100 : 0

    return {
      collection_metrics: {
        total_payments: paymentMetrics?.total_payments || 0,
        total_amount_collected: paymentMetrics?.total_amount_collected || 0,
        average_payment: paymentMetrics?.average_payment || 0,
        unique_students_paying: paymentMetrics?.unique_students || 0
      },
      outstanding_metrics: {
        total_outstanding_invoices: outstandingMetrics?.total_outstanding_invoices || 0,
        total_outstanding_amount: outstandingMetrics?.total_outstanding_amount || 0,
        students_with_arrears: outstandingMetrics?.students_with_arrears || 0
      },
      collection_rate_percentage: collectionRate,
      effectiveness_status:
        collectionRate >= 80 ? 'EXCELLENT' : collectionRate >= 60 ? 'GOOD' : collectionRate >= 40 ? 'FAIR' : 'POOR'
    }
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class AgedReceivablesService
  implements IAgingCalculator, IPriorityDeterminer, ICollectionReminder, ICollectionsAnalyzer
{
  // Composed services
  private db: Database.Database
  private readonly agingCalculator: AgingCalculator
  private readonly priorityDeterminer: PriorityDeterminer
  private readonly reminderGenerator: CollectionReminderGenerator
  private readonly analyzer: CollectionsAnalyzer

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.agingCalculator = new AgingCalculator(this.db)
    this.priorityDeterminer = new PriorityDeterminer(this.db)
    this.reminderGenerator = new CollectionReminderGenerator(this.db)
    this.analyzer = new CollectionsAnalyzer(this.db)
  }

  /**
   * Generate aged receivables report with 30/60/90/120+ day buckets
   */
  async generateAgedReceivablesReport(asOfDate?: string): Promise<AgedReceivableBucket[]> {
    const date = asOfDate || new Date().toISOString().split('T')[0]
    return this.agingCalculator.calculateAgedReceivables(date)
  }
  // Legacy alias for tests
  async getAgedReceivables(asOfDate?: string): Promise<AgedReceivableBucket[]> {
    return this.generateAgedReceivablesReport(asOfDate)
  }
  /**
   * Get high priority collections (>90 days OR >100K KES)
   */
  async getHighPriorityCollections(): Promise<any[]> {
    return this.priorityDeterminer.getHighPriorityCollections()
  }

  /**
   * Get top N overdue accounts by amount
   */
  async getTopOverdueAccounts(limit: number = 20): Promise<any[]> {
    const invoices = await this.calculateAgedReceivables(new Date().toISOString().split('T')[0])
    const allAccounts = invoices.flatMap(b => b.accounts)
    return allAccounts.sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, limit)
  }

  /**
   * Generate collection reminder SMS messages
   */
  async generateCollectionReminders(): Promise<any[]> {
    return this.reminderGenerator.generateCollectionReminders()
  }

  /**
   * Get collections effectiveness report with KPIs
   */
  async getCollectionsEffectivenessReport(): Promise<unknown> {
    return this.analyzer.getCollectionsEffectivenessReport()
  }

  /**
   * Export aged receivables to CSV format
   */
  async exportAgedReceivablesCSV(asOfDate?: string): Promise<string> {
    const report = await this.generateAgedReceivablesReport(asOfDate)

    let csv = 'Bucket,Days Overdue,Student Count,Total Amount,Student Name,Admission #,Amount,Last Payment\n'

    for (const bucket of report) {
      for (const account of bucket.accounts) {
        csv += `${bucket.bucket_name},${account.days_overdue},${bucket.student_count},${bucket.total_amount},${account.student_name},${account.admission_number},${account.amount},${account.last_payment_date}\n`
      }
    }

    return csv
  }

  // Delegated interface implementations
  async calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]> {
    return this.agingCalculator.calculateAgedReceivables(asOfDate)
  }
}

