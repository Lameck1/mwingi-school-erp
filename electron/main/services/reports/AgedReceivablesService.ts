import { getDatabase } from '../../database'
import {
  buildFeeInvoiceAmountSql,
  buildFeeInvoiceDateSql,
  buildFeeInvoiceOutstandingBalanceSql,
  buildFeeInvoiceOutstandingStatusPredicate
} from '../../utils/feeInvoiceSql'
import { STUDENT_COLLECTION_TRANSACTION_TYPES, asSqlInList } from '../../utils/financeTransactionTypes'

import type Database from 'better-sqlite3'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IAgingCalculator {
  calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]>
}

export interface IPriorityDeterminer {
  getHighPriorityCollections(): Promise<HighPriorityCollectionResult[]>
}

export interface ICollectionReminder {
  generateCollectionReminders(): Promise<CollectionReminderResult[]>
}

export interface ICollectionsAnalyzer {
  getCollectionsEffectivenessReport(): Promise<CollectionEffectivenessReport>
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

export interface HighPriorityCollectionResult extends OutstandingInvoice {
  // Inherits from OutstandingInvoice
}

export interface CollectionReminderResult {
  student_id: number
  student_phone: string
  reminder_type: string
  reminder_text: string
  amount: number
  days_overdue: number
}

export interface CollectionEffectivenessReport {
  collection_metrics: {
    total_payments: number
    total_amount_collected: number
    average_payment: number
    unique_students_paying: number
  }
  outstanding_metrics: {
    total_outstanding_invoices: number
    total_outstanding_amount: number
    students_with_arrears: number
  }
  collection_rate_percentage: number
  effectiveness_status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
}

interface OutstandingInvoice {
  id: number
  student_id: number
  first_name: string
  last_name: string
  admission_number: string
  amount: number
  due_date: string
  days_overdue: number
  phone?: string
}

interface PaymentMetricsResult {
  total_payments: number
  total_amount_collected: number
  average_payment: number
  unique_students: number
}

interface OutstandingMetricsResult {
  total_outstanding_invoices: number
  total_outstanding_amount: number
  students_with_arrears: number
}

interface TotalBilledResult {
  total: number
}

interface LastPaymentResult {
  transaction_date: string
}

export interface CollectionAction {
  student_id: number
  action_type: string
  notes?: string
  action_date?: string
  id?: number
}

type BucketKey = '0-30' | '31-60' | '61-90' | '91-120' | '120+'
const studentCollectionTransactionTypesSql = asSqlInList(STUDENT_COLLECTION_TRANSACTION_TYPES)

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class AgedReceivablesRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOutstandingInvoices(asOfDate: string): Promise<OutstandingInvoice[]> {
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
    const outstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(this.db, 'fi')

    return this.db
      .prepare(
        `
      SELECT
        fi.id,
        fi.student_id,
        s.first_name,
        s.last_name,
        s.admission_number,
        s.phone,
        ${outstandingBalanceSql} as amount,
        fi.due_date,
        JULIANDAY(?) - JULIANDAY(fi.due_date) as days_overdue
      FROM fee_invoice fi
      JOIN student s ON fi.student_id = s.id
      WHERE ${outstandingStatusPredicate}
        AND (${outstandingBalanceSql}) > 0
        AND fi.due_date <= ?
      ORDER BY fi.due_date ASC
    `
      )
      .all(asOfDate, asOfDate) as OutstandingInvoice[]
  }

  async getStudentLastPaymentDate(studentId: number): Promise<string | null> {
    const result = this.db
      .prepare(
        `
      SELECT transaction_date FROM ledger_transaction
      WHERE student_id = ? AND UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql})
      ORDER BY transaction_date DESC LIMIT 1
    `
      )
      .get(studentId) as LastPaymentResult | undefined

    return result?.transaction_date || null
  }

  async recordCollectionAction(action: CollectionAction): Promise<number> {
    const result = this.db
      .prepare(
        `
      INSERT INTO collection_action (student_id, action_type, action_date, notes)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(action.student_id, action.action_type, new Date().toISOString(), action.notes)

    return result.lastInsertRowid as number
  }

  async getCollectionHistory(studentId: number): Promise<CollectionAction[]> {
    return this.db
      .prepare(
        `
      SELECT * FROM collection_action
      WHERE student_id = ?
      ORDER BY action_date DESC
    `
      )
      .all(studentId) as CollectionAction[]
  }
}

// ============================================================================
// AGING CALCULATOR (SRP)
// ============================================================================

class AgingCalculator implements IAgingCalculator {
  private readonly repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.repo = new AgedReceivablesRepository(db)
  }

  private createBuckets(): Record<BucketKey, AgedReceivableBucket> {
    return {
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
        bucket_days_to: 999_999,
        student_count: 0,
        total_amount: 0,
        accounts: []
      }
    }
  }

  private resolveBucketKey(daysOverdue: number): BucketKey {
    if (daysOverdue > 120) {
      return '120+'
    }
    if (daysOverdue > 90) {
      return '91-120'
    }
    if (daysOverdue > 60) {
      return '61-90'
    }
    if (daysOverdue > 30) {
      return '31-60'
    }
    return '0-30'
  }

  async calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]> {
    const invoices = await this.repo.getOutstandingInvoices(asOfDate)
    const buckets = this.createBuckets()
    const studentBucketMap = new Map<number, BucketKey>()

    for (const invoice of invoices) {
      const daysOverdue = Math.ceil(invoice.days_overdue || 0)
      const bucketKey = this.resolveBucketKey(daysOverdue)
      const lastPaymentDate = await this.repo.getStudentLastPaymentDate(invoice.student_id)
      const bucket = buckets[bucketKey]
      const existingBucket = studentBucketMap.get(invoice.student_id)

      if (!existingBucket || existingBucket !== bucketKey) {
        if (!existingBucket) {
          bucket.student_count += 1
          studentBucketMap.set(invoice.student_id, bucketKey)
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
  private readonly repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.repo = new AgedReceivablesRepository(db)
  }

  async getHighPriorityCollections(): Promise<HighPriorityCollectionResult[]> {
    const invoices = await this.repo.getOutstandingInvoices(new Date().toISOString().split('T')[0])

    return [...invoices]
      .filter((invoice) => {
        const daysOverdue = Math.ceil(invoice.days_overdue || 0)
        return daysOverdue > 90 || invoice.amount > 100_000
      })
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 50)
  }
}

// ============================================================================
// COLLECTION REMINDER GENERATOR (SRP)
// ============================================================================

class CollectionReminderGenerator implements ICollectionReminder {
  private readonly repo: AgedReceivablesRepository

  constructor(db?: Database.Database) {
    this.repo = new AgedReceivablesRepository(db)
  }

  private buildReminder(daysOverdue: number, amount: number): { type: string; text: string } | null {
    if (daysOverdue === 30) {
      return {
        type: 'FIRST_REMINDER',
        text: `First reminder: Fee balance of KES ${amount} is now due. Please settle immediately.`
      }
    }

    if (daysOverdue === 60) {
      return {
        type: 'SECOND_REMINDER',
        text: `Second reminder: Outstanding balance KES ${amount} for ${daysOverdue} days. Urgent action required.`
      }
    }

    if (daysOverdue === 90) {
      return {
        type: 'FINAL_WARNING',
        text: `Final warning: Account suspended. Balance KES ${amount} overdue for 90 days. Contact bursar immediately.`
      }
    }

    return null
  }

  async generateCollectionReminders(): Promise<CollectionReminderResult[]> {
    const invoices = await this.repo.getOutstandingInvoices(new Date().toISOString().split('T')[0])
    const reminders: CollectionReminderResult[] = []

    for (const invoice of invoices) {
      const daysOverdue = Math.ceil(invoice.days_overdue || 0)
      const reminder = this.buildReminder(daysOverdue, invoice.amount)
      if (!reminder) {
        continue
      }

      reminders.push({
        student_id: invoice.student_id,
        student_phone: invoice.phone || 'N/A',
        reminder_type: reminder.type,
        reminder_text: reminder.text,
        amount: invoice.amount,
        days_overdue: daysOverdue
      })

      await this.repo.recordCollectionAction({
        student_id: invoice.student_id,
        action_type: reminder.type,
        notes: reminder.text
      })
    }

    return reminders
  }
}

// ============================================================================
// COLLECTIONS ANALYZER (SRP)
// ============================================================================

class CollectionsAnalyzer implements ICollectionsAnalyzer {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private getPaymentMetrics(): PaymentMetricsResult | undefined {
    return this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total_payments,
        SUM(amount) as total_amount_collected,
        AVG(amount) as average_payment,
        COUNT(DISTINCT student_id) as unique_students
      FROM ledger_transaction
      WHERE UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql})
        AND transaction_date >= date('now', '-3 months')
    `
      )
      .get() as PaymentMetricsResult | undefined
  }

  private getOutstandingMetrics(): OutstandingMetricsResult | undefined {
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
    const outstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(this.db, 'fi')

    return this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total_outstanding_invoices,
        SUM(${outstandingBalanceSql}) as total_outstanding_amount,
        COUNT(DISTINCT student_id) as students_with_arrears
      FROM fee_invoice fi
      WHERE ${outstandingStatusPredicate}
        AND (${outstandingBalanceSql}) > 0
    `
      )
      .get() as OutstandingMetricsResult | undefined
  }

  private getTotalBilledAmount(): number {
    const invoiceAmountSql = buildFeeInvoiceAmountSql(this.db, 'fi')
    const invoiceDateSql = buildFeeInvoiceDateSql(this.db, 'fi')
    const totalBilled = this.db
      .prepare(
        `
      SELECT SUM(${invoiceAmountSql}) as total
      FROM fee_invoice fi
      WHERE ${invoiceDateSql} >= date('now', '-3 months')
    `
      )
      .get() as TotalBilledResult | undefined

    return totalBilled?.total || 0
  }

  private getCollectionRate(paymentMetrics: PaymentMetricsResult | undefined, totalBilledAmount: number): number {
    if (totalBilledAmount <= 0) {
      return 0
    }

    return ((paymentMetrics?.total_amount_collected || 0) / totalBilledAmount) * 100
  }

  private getEffectivenessStatus(collectionRate: number): CollectionEffectivenessReport['effectiveness_status'] {
    if (collectionRate >= 80) {
      return 'EXCELLENT'
    }
    if (collectionRate >= 60) {
      return 'GOOD'
    }
    if (collectionRate >= 40) {
      return 'FAIR'
    }
    return 'POOR'
  }

  private toNumber(value: number | null | undefined): number {
    return value ?? 0
  }

  private buildCollectionMetrics(paymentMetrics: PaymentMetricsResult | undefined): CollectionEffectivenessReport['collection_metrics'] {
    return {
      total_payments: this.toNumber(paymentMetrics?.total_payments),
      total_amount_collected: this.toNumber(paymentMetrics?.total_amount_collected),
      average_payment: this.toNumber(paymentMetrics?.average_payment),
      unique_students_paying: this.toNumber(paymentMetrics?.unique_students)
    }
  }

  private buildOutstandingMetrics(outstandingMetrics: OutstandingMetricsResult | undefined): CollectionEffectivenessReport['outstanding_metrics'] {
    return {
      total_outstanding_invoices: this.toNumber(outstandingMetrics?.total_outstanding_invoices),
      total_outstanding_amount: this.toNumber(outstandingMetrics?.total_outstanding_amount),
      students_with_arrears: this.toNumber(outstandingMetrics?.students_with_arrears)
    }
  }

  async getCollectionsEffectivenessReport(): Promise<CollectionEffectivenessReport> {
    const paymentMetrics = this.getPaymentMetrics()
    const outstandingMetrics = this.getOutstandingMetrics()
    const totalBilledAmount = this.getTotalBilledAmount()
    const collectionRate = this.getCollectionRate(paymentMetrics, totalBilledAmount)

    return {
      collection_metrics: this.buildCollectionMetrics(paymentMetrics),
      outstanding_metrics: this.buildOutstandingMetrics(outstandingMetrics),
      collection_rate_percentage: collectionRate,
      effectiveness_status: this.getEffectivenessStatus(collectionRate)
    }
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class AgedReceivablesService
  implements IAgingCalculator, IPriorityDeterminer, ICollectionReminder, ICollectionsAnalyzer
{
  private readonly agingCalculator: AgingCalculator
  private readonly priorityDeterminer: PriorityDeterminer
  private readonly reminderGenerator: CollectionReminderGenerator
  private readonly analyzer: CollectionsAnalyzer

  constructor(db?: Database.Database) {
    this.agingCalculator = new AgingCalculator(db)
    this.priorityDeterminer = new PriorityDeterminer(db)
    this.reminderGenerator = new CollectionReminderGenerator(db)
    this.analyzer = new CollectionsAnalyzer(db)
  }

  async generateAgedReceivablesReport(asOfDate?: string): Promise<AgedReceivableBucket[]> {
    const date = asOfDate || new Date().toISOString().split('T')[0]
    return this.agingCalculator.calculateAgedReceivables(date)
  }

  // Legacy alias for tests
  async getAgedReceivables(asOfDate?: string): Promise<AgedReceivableBucket[]> {
    return this.generateAgedReceivablesReport(asOfDate)
  }

  async getHighPriorityCollections(): Promise<HighPriorityCollectionResult[]> {
    return this.priorityDeterminer.getHighPriorityCollections()
  }

  async getTopOverdueAccounts(limit: number = 20): Promise<AgedReceivableBucket['accounts']> {
    const invoices = await this.calculateAgedReceivables(new Date().toISOString().split('T')[0])
    const allAccounts = invoices.flatMap((bucket) => bucket.accounts)
    const sortedAccounts = [...allAccounts].sort((a, b) => (b.amount || 0) - (a.amount || 0))
    return sortedAccounts.slice(0, limit)
  }

  async generateCollectionReminders(): Promise<CollectionReminderResult[]> {
    return this.reminderGenerator.generateCollectionReminders()
  }

  async getCollectionsEffectivenessReport(): Promise<CollectionEffectivenessReport> {
    return this.analyzer.getCollectionsEffectivenessReport()
  }

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

  async calculateAgedReceivables(asOfDate: string): Promise<AgedReceivableBucket[]> {
    return this.agingCalculator.calculateAgedReceivables(asOfDate)
  }
}

