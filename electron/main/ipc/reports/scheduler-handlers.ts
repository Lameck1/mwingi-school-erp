import { z } from 'zod'

import { reportScheduler } from '../../services/reports/ReportScheduler'
import { ROLES } from '../ipc-result'
import { CreateScheduleTuple, UpdateScheduleTuple } from '../schemas/reports-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { ScheduledReport } from '../../services/reports/ReportScheduler'

// Initialize scheduler
reportScheduler.initialize()

export function registerReportSchedulerHandlers(): void {
    validatedHandler('scheduler:getAll', ROLES.STAFF, z.void(), () => {
        return reportScheduler.getScheduledReports()
    })

    validatedHandlerMulti('scheduler:create', ROLES.STAFF, CreateScheduleTuple, (event, [data, legacyId], actor) => {
        if (legacyId !== undefined) {
            if (legacyId <= 0) {return { success: false, error: 'Invalid user session' }}
            if (legacyId !== actor.id) {return { success: false, error: 'Unauthorized: renderer user mismatch' }}
        }
        const normalized: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'> = {
            report_name: data.report_name,
            report_type: data.report_type,
            parameters: data.parameters ?? '{}',
            schedule_type: data.schedule_type,
            day_of_week: data.day_of_week,
            day_of_month: data.day_of_month,
            time_of_day: data.time_of_day,
            recipients: data.recipients,
            export_format: data.export_format,
            is_active: data.is_active,
            created_by_user_id: actor.id
        }
        return reportScheduler.createSchedule(normalized, actor.id)
    })

    validatedHandlerMulti('scheduler:update', ROLES.STAFF, UpdateScheduleTuple, (event, [id, data, legacyId], actor) => {
        if (legacyId !== undefined) {
            if (legacyId <= 0) {return { success: false, error: 'Invalid user session' }}
            if (legacyId !== actor.id) {return { success: false, error: 'Unauthorized: renderer user mismatch' }}
        }
        const normalized: Partial<ScheduledReport> = {}
        if (data.report_name !== undefined) {
            normalized.report_name = data.report_name
        }
        if (data.report_type !== undefined) {
            normalized.report_type = data.report_type
        }
        if (data.parameters !== undefined) {
            normalized.parameters = data.parameters
        }
        if (data.schedule_type !== undefined) {
            normalized.schedule_type = data.schedule_type
        }
        if (data.day_of_week !== undefined) {
            normalized.day_of_week = data.day_of_week
        }
        if (data.day_of_month !== undefined) {
            normalized.day_of_month = data.day_of_month
        }
        if (data.time_of_day !== undefined) {
            normalized.time_of_day = data.time_of_day
        }
        if (data.recipients !== undefined) {
            normalized.recipients = data.recipients
        }
        if (data.export_format !== undefined) {
            normalized.export_format = data.export_format
        }
        if (data.is_active !== undefined) {
            normalized.is_active = data.is_active
        }
        return reportScheduler.updateSchedule(id, normalized, actor.id)
    })

    validatedHandlerMulti('scheduler:delete', ROLES.STAFF, z.tuple([z.number(), z.number().optional()]), (event, [id, legacyId], actor) => {
        if (legacyId !== undefined) {
            if (legacyId <= 0) {return { success: false, error: 'Invalid user session' }} // scheduler:delete returns { error: string } not errors[]?
            if (legacyId !== actor.id) {return { success: false, error: 'Unauthorized: renderer user mismatch' }}
        }
        return reportScheduler.deleteSchedule(id, actor.id)
    })
}
