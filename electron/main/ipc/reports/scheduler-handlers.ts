import { reportScheduler, type ScheduledReport } from '../../services/reports/ReportScheduler'
import { validateId } from '../../utils/validation'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

// Initialize scheduler
reportScheduler.initialize()

export function registerReportSchedulerHandlers(): void {
    const isValidTimeOfDay = (value: string): boolean => {
        const match = /^(\d{2}):(\d{2})$/.exec(value)
        if (!match) {
            return false
        }
        const hour = Number(match[1])
        const minute = Number(match[2])
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    }

    const validateScheduleShape = (
        data: Partial<ScheduledReport>,
        requireCoreFields: boolean
    ): string[] => {
        const errors: string[] = []

        if (requireCoreFields) {
            if (!data.report_name?.trim()) { errors.push('Report name is required') }
            if (!data.report_type?.trim()) { errors.push('Report type is required') }
            if (!data.time_of_day?.trim()) { errors.push('Time is required') }
            if (!data.recipients?.trim()) { errors.push('At least one recipient is required') }
        }

        if (data.time_of_day && !isValidTimeOfDay(data.time_of_day)) {
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
            try {
                const parsed = JSON.parse(data.recipients) as unknown
                if (!Array.isArray(parsed) || parsed.length === 0) {
                    errors.push('At least one recipient is required')
                }
            } catch {
                errors.push('Recipients must be a JSON array of email addresses')
            }
        }

        return errors
    }

    safeHandleRawWithRole('scheduler:getAll', ROLES.STAFF, () => {
        return reportScheduler.getScheduledReports()
    })

    safeHandleRawWithRole('scheduler:create', ROLES.STAFF, (
        event,
        data: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, errors: [actor.error] }
        }
        const shapeErrors = validateScheduleShape(data, true)
        if (shapeErrors.length > 0) {
            return { success: false, errors: shapeErrors }
        }

        return reportScheduler.createSchedule(data, actor.actorId)
    })

    safeHandleRawWithRole('scheduler:update', ROLES.STAFF, (
        event,
        id: number,
        data: Partial<ScheduledReport>,
        legacyUserId?: number
    ) => {
        const idValidation = validateId(id, 'Schedule ID')
        const actor = resolveActorId(event, legacyUserId)
        if (!idValidation.success) {
            return { success: false, errors: [idValidation.error || 'Invalid schedule ID'] }
        }
        if (!actor.success) {
            return { success: false, errors: [actor.error] }
        }
        const shapeErrors = validateScheduleShape(data, false)
        if (shapeErrors.length > 0) {
            return { success: false, errors: shapeErrors }
        }
        return reportScheduler.updateSchedule(idValidation.data!, data, actor.actorId)
    })

    safeHandleRawWithRole('scheduler:delete', ROLES.STAFF, (event, id: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return reportScheduler.deleteSchedule(id, actor.actorId)
    })
}
