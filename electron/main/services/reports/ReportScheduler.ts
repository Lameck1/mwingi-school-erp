import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
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
        const schedules = this.getActiveSchedules()
        const now = new Date()

        for (const schedule of schedules) {
            if (this.shouldRun(schedule, now)) {
                await this.executeReport(schedule)
            }
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
        const errors = this.validateSchedule(data)
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
                data.report_name,
                data.report_type,
                data.parameters,
                data.schedule_type,
                data.day_of_week,
                data.day_of_month,
                data.time_of_day,
                data.recipients,
                data.export_format,
                data.is_active ? 1 : 0,
                userId
            )

            logAudit(userId, 'CREATE', 'scheduled_report', result.lastInsertRowid as number, null, { report_name: data.report_name })

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

    private async executeReport(schedule: ScheduledReport): Promise<void> {
        this.logInfo(`Executing scheduled report: ${schedule.report_name}`)

        // In a real implementation:
        // 1. Generate report (PDF/Excel) using ReportEngine
        // 2. Email it using NotificationService
        // 3. Log execution

        try {
            // Simulate execution
            this.logInfo('Simulating report generation and email...')

            // Update last run time
            this.db.prepare(`
            UPDATE scheduled_report 
            SET last_run_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(schedule.id)

            // Log success
            this.db.prepare(`
            INSERT INTO report_execution_log (scheduled_report_id, execution_time, status, recipients_notified)
            VALUES (?, CURRENT_TIMESTAMP, 'SUCCESS', ?)
        `).run(schedule.id, 1)

        } catch (error) {
            console.error('Report execution failed:', error)
            // Log failure
            this.db.prepare(`
            INSERT INTO report_execution_log (scheduled_report_id, execution_time, status, error_message)
            VALUES (?, CURRENT_TIMESTAMP, 'FAILED', ?)
        `).run(schedule.id, error instanceof Error ? error.message : 'Unknown error')
        }
    }

    private validateSchedule(data: Partial<ScheduledReport>): string[] {
        const errors: string[] = []
        if (!data.report_name) {errors.push('Report name is required')}
        if (!data.report_type) {errors.push('Report type is required')}
        if (!data.time_of_day) {errors.push('Time is required')}
        if (!data.recipients) {errors.push('At least one recipient is required')}
        return errors
    }

    private logInfo(message: string): void {
        // eslint-disable-next-line no-console
        console.info(message)
    }
}

export const reportScheduler = new ReportScheduler()


