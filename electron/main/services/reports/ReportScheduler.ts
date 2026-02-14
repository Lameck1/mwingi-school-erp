import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { NotificationService } from '../notifications/NotificationService'


export interface ScheduledReport {
    id: number
    report_name: string
    report_type: string
    parameters: string // JSON
    schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
    day_of_week: number | null
    day_of_month: number | null
    time_of_day: string
    recipients: string // JSON array of emails
    export_format: 'PDF' | 'EXCEL' | 'CSV'
    is_active: boolean
    last_run_at: string | null
    next_run_at: string | null
    created_by_user_id: number
    created_at: string
}

export class ReportScheduler {
    private get db() { return getDatabase() }
    private _notificationService: NotificationService | null = null
    private get notificationService() {
        this._notificationService ??= new NotificationService()
        return this._notificationService
    }
    private checkInterval: ReturnType<typeof setInterval> | null = null
    private isRunning = false

    private formatLocalDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    private parseRecipients(raw: string): string[] {
        try {
            const parsed = JSON.parse(raw) as unknown
            if (!Array.isArray(parsed)) {
                return []
            }
            return parsed
                .map(value => String(value).trim())
                .filter(value => value.length > 3 && value.includes('@'))
        } catch {
            return []
        }
    }

    /**
     * Initialize the scheduler
     */
    initialize(): void {
        if (this.isRunning) {return}

        this.logInfo('Initializing report scheduler...')

        // Check every minute
        this.checkInterval = setInterval(() => {
            void this.checkAndRunReports()
        }, 60 * 1000)

        this.isRunning = true
        this.logInfo('Report scheduler initialized')
    }

    /**
     * Stop the scheduler
     */
    shutdown(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }
        this.isRunning = false
        this.logInfo('Report scheduler shutdown')
    }

    private async checkAndRunReports(): Promise<void> {
        try {
            const schedules = this.getActiveSchedules()
            const now = new Date()

            for (const schedule of schedules) {
                if (this.shouldRun(schedule, now)) {
                    await this.executeReport(schedule)
                }
            }
        } catch (error) {
            // Database may not be ready yet (e.g. during dev server restarts).
            // Silently skip this tick — the next interval will retry.
            if (error instanceof Error && error.message.includes('not initialized')) {
                return
            }
            console.error('Report scheduler error:', error)
        }
    }

    private shouldRun(schedule: ScheduledReport, now: Date): boolean {
        const [hour, minute] = schedule.time_of_day.split(':').map(Number)

        // Check time match
        if (now.getHours() !== hour || now.getMinutes() !== minute) {
            return false
        }

        // Check day match based on type
        switch (schedule.schedule_type) {
            case 'DAILY':
                return true
            case 'WEEKLY':
                return now.getDay() === (schedule.day_of_week ?? 1)
            case 'MONTHLY':
                return now.getDate() === (schedule.day_of_month ?? 1)
            case 'TERM_END':
            case 'YEAR_END':
                // Academic calendar constraints are intentionally deferred to the academic scheduling service.
                return false
            default:
                return false
        }
    }

    /**
     * Get all scheduled reports
     */
    getScheduledReports(): ScheduledReport[] {
        return this.db.prepare(`
      SELECT * FROM scheduled_report ORDER BY report_name
    `).all() as ScheduledReport[]
    }

    /**
     * Get active schedules
     */
    private getActiveSchedules(): ScheduledReport[] {
        return this.db.prepare(`
      SELECT * FROM scheduled_report WHERE is_active = 1
    `).all() as ScheduledReport[]
    }

    /**
     * Create a scheduled report
     */
    createSchedule(
        data: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>,
        userId: number
    ): { success: boolean; id?: number; errors?: string[] } {
        const normalized = {
            ...data,
            parameters: data.parameters || '{}',
            export_format: data.export_format || 'PDF',
            recipients: data.recipients || '[]'
        }
        const errors = this.validateSchedule(normalized)
        if (errors.length > 0) {
            return { success: false, errors }
        }

        try {
            const result = this.db.prepare(`
        INSERT INTO scheduled_report (
          report_name, report_type, parameters, schedule_type, 
          day_of_week, day_of_month, time_of_day, recipients, 
          export_format, is_active, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                normalized.report_name,
                normalized.report_type,
                normalized.parameters,
                normalized.schedule_type,
                normalized.day_of_week,
                normalized.day_of_month,
                normalized.time_of_day,
                normalized.recipients,
                normalized.export_format,
                normalized.is_active ? 1 : 0,
                userId
            )

            logAudit(userId, 'CREATE', 'scheduled_report', result.lastInsertRowid as number, null, { report_name: normalized.report_name })

            return { success: true, id: result.lastInsertRowid as number }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create schedule'] }
        }
    }

    /**
     * Update a scheduled report
     */
    updateSchedule(
        id: number,
        data: Partial<ScheduledReport>,
        userId: number
    ): { success: boolean; errors?: string[] } {
        const existing = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport | undefined
        if (!existing) {
            return { success: false, errors: ['Schedule not found'] }
        }

        const mergedSchedule: ScheduledReport = {
            ...existing,
            ...data
        }
        const errors = this.validateSchedule(mergedSchedule)
        if (errors.length > 0) {
            return { success: false, errors }
        }

        // Update database
        const sets: string[] = []
        const params: unknown[] = []

        const fields = ['report_name', 'report_type', 'parameters', 'schedule_type',
            'day_of_week', 'day_of_month', 'time_of_day', 'recipients',
            'export_format', 'is_active']

        for (const field of fields) {
            const key = field as keyof ScheduledReport
            if (data[key] !== undefined) {
                sets.push(`${field} = ?`)
                params.push(data[key])
            }
        }

        if (sets.length > 0) {
            params.push(id)
            this.db.prepare(`UPDATE scheduled_report SET ${sets.join(', ')} WHERE id = ?`).run(...params)
        }

        logAudit(userId, 'UPDATE', 'scheduled_report', id, existing, data)

        return { success: true }
    }

    /**
     * Delete a schedule
     */
    deleteSchedule(id: number, userId: number): { success: boolean; errors?: string[] } {
        const existing = this.db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(id) as ScheduledReport | undefined
        if (!existing) {
            return { success: false, errors: ['Schedule not found'] }
        }

        this.db.prepare('DELETE FROM scheduled_report WHERE id = ?').run(id)
        logAudit(userId, 'DELETE', 'scheduled_report', id, existing, null)

        return { success: true }
    }

    private resolveWindow(schedule: ScheduledReport, runAt: Date): { endDate: string; startDate: string } {
        const defaultEnd = this.formatLocalDate(runAt)
        const defaultStart = `${defaultEnd.slice(0, 8)}01`

        try {
            const parsed = schedule.parameters ? JSON.parse(schedule.parameters) as { end_date?: string; start_date?: string } : {}
            const hasIsoDate = (value?: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

            return {
                startDate: hasIsoDate(parsed.start_date) ? parsed.start_date! : defaultStart,
                endDate: hasIsoDate(parsed.end_date) ? parsed.end_date! : defaultEnd
            }
        } catch {
            return { startDate: defaultStart, endDate: defaultEnd }
        }
    }

    private async generateReportPayload(schedule: ScheduledReport, startDate: string, endDate: string): Promise<unknown> {
        switch (schedule.report_type) {
            case 'FEE_COLLECTION':
                return this.db.prepare(`
                    SELECT DATE(transaction_date) as payment_date, payment_method, COUNT(*) as count, SUM(amount) as amount
                    FROM ledger_transaction
                    WHERE transaction_type = 'FEE_PAYMENT'
                      AND COALESCE(is_voided, 0) = 0
                      AND transaction_date BETWEEN ? AND ?
                    GROUP BY DATE(transaction_date), payment_method
                    ORDER BY DATE(transaction_date) ASC
                `).all(startDate, endDate)
            case 'DEFAULTERS_LIST':
                return this.db.prepare(`
                    SELECT
                        fi.invoice_number,
                        fi.student_id,
                        s.admission_number,
                        s.first_name,
                        s.last_name,
                        (fi.total_amount - fi.amount_paid) as balance,
                        fi.due_date
                    FROM fee_invoice fi
                    JOIN student s ON s.id = fi.student_id
                    WHERE fi.status IN ('PENDING', 'PARTIAL', 'OUTSTANDING')
                      AND (fi.total_amount - fi.amount_paid) > 0
                    ORDER BY balance DESC
                `).all()
            case 'EXPENSE_SUMMARY':
                return this.db.prepare(`
                    SELECT
                        COALESCE(tc.category_name, 'Uncategorized') as category_name,
                        SUM(lt.amount) as amount
                    FROM ledger_transaction lt
                    LEFT JOIN transaction_category tc ON tc.id = lt.category_id
                    WHERE lt.transaction_type IN ('EXPENSE', 'SALARY_PAYMENT', 'REFUND')
                      AND COALESCE(lt.is_voided, 0) = 0
                      AND lt.transaction_date BETWEEN ? AND ?
                    GROUP BY COALESCE(tc.category_name, 'Uncategorized')
                    ORDER BY amount DESC
                `).all(startDate, endDate)
            case 'TRIAL_BALANCE': {
                const journalService = new DoubleEntryJournalService(this.db)
                return journalService.getTrialBalance(startDate, endDate)
            }
            case 'STUDENT_LIST':
                return this.db.prepare(`
                    SELECT admission_number, first_name, last_name, gender, admission_date
                    FROM student
                    WHERE is_active = 1
                    ORDER BY admission_number ASC
                `).all()
            default:
                throw new Error(`Unsupported report type for scheduler: ${schedule.report_type}`)
        }
    }

    private buildEmailBody(schedule: ScheduledReport, startDate: string, endDate: string, payload: unknown): string {
        const summary = typeof payload === 'string'
            ? payload
            : JSON.stringify(payload, null, 2)
        return [
            `Scheduled report: ${schedule.report_name}`,
            `Type: ${schedule.report_type}`,
            `Window: ${startDate} to ${endDate}`,
            '',
            summary
        ].join('\n')
    }

    private async executeReport(schedule: ScheduledReport): Promise<void> {
        this.logInfo(`Executing scheduled report: ${schedule.report_name}`)

        try {
            const recipients = this.parseRecipients(schedule.recipients)
            if (recipients.length === 0) {
                throw new Error('No valid recipients configured for scheduled report')
            }

            const now = new Date()
            const { startDate, endDate } = this.resolveWindow(schedule, now)
            const payload = await this.generateReportPayload(schedule, startDate, endDate)
            const body = this.buildEmailBody(schedule, startDate, endDate, payload)
            const subject = `[Scheduled Report] ${schedule.report_name}`

            let recipientsNotified = 0
            const recipientErrors: string[] = []

            for (const recipient of recipients) {
                const sendResult = await this.notificationService.send({
                    recipientType: 'STAFF',
                    recipientId: schedule.created_by_user_id,
                    channel: 'EMAIL',
                    to: recipient,
                    subject,
                    message: body,
                }, schedule.created_by_user_id)

                if (sendResult.success) {
                    recipientsNotified += 1
                } else {
                    recipientErrors.push(`${recipient}: ${sendResult.error || 'failed to send'}`)
                }
            }

            if (recipientsNotified === 0) {
                throw new Error(recipientErrors.join('; ') || 'Failed to notify all recipients')
            }

            this.db.prepare(`
                UPDATE scheduled_report 
                SET last_run_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(schedule.id)

            this.db.prepare(`
                INSERT INTO report_execution_log (scheduled_report_id, execution_time, status, recipients_notified, error_message)
                VALUES (?, CURRENT_TIMESTAMP, 'SUCCESS', ?, ?)
            `).run(
                schedule.id,
                recipientsNotified,
                recipientErrors.length > 0 ? recipientErrors.join('; ') : null
            )
        } catch (error) {
            console.error('Report execution failed:', error)
            this.db.prepare(`
                INSERT INTO report_execution_log (scheduled_report_id, execution_time, status, error_message)
                VALUES (?, CURRENT_TIMESTAMP, 'FAILED', ?)
            `).run(schedule.id, error instanceof Error ? error.message : 'Unknown error')
        }
    }

    private validateSchedule(data: Partial<ScheduledReport>): string[] {
        const errors: string[] = []
        if (!data.report_name?.trim()) {errors.push('Report name is required')}
        if (!data.report_type?.trim()) {errors.push('Report type is required')}
        if (!data.time_of_day?.trim()) {errors.push('Time is required')}
        if (!data.recipients?.trim()) {errors.push('At least one recipient is required')}
        if (data.time_of_day && !/^\d{2}:\d{2}$/.test(data.time_of_day)) {
            errors.push('Time must be in HH:MM 24-hour format')
        }
        if (data.schedule_type === 'WEEKLY' && (data.day_of_week == null || data.day_of_week < 0 || data.day_of_week > 6)) {
            errors.push('Weekly schedules require day_of_week between 0 and 6')
        }
        if (data.schedule_type === 'MONTHLY' && (data.day_of_month == null || data.day_of_month < 1 || data.day_of_month > 31)) {
            errors.push('Monthly schedules require day_of_month between 1 and 31')
        }
        if (data.schedule_type === 'TERM_END' || data.schedule_type === 'YEAR_END') {
            errors.push('TERM_END and YEAR_END schedules are not supported in this release')
        }
        if (data.recipients) {
            const recipients = this.parseRecipients(data.recipients)
            if (recipients.length === 0) {
                errors.push('At least one valid recipient email is required')
            }
        }
        return errors
    }

    private logInfo(message: string): void {
        // eslint-disable-next-line no-console
        console.info(message)
    }
}

export const reportScheduler = new ReportScheduler()


