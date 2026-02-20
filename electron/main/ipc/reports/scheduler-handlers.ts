import { z } from 'zod'

import { reportScheduler } from '../../services/reports/ReportScheduler'
import { ROLES } from '../ipc-result'
import { CreateScheduleTuple, UpdateScheduleTuple } from '../schemas/reports-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

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
        return reportScheduler.createSchedule({ ...data, parameters: data.parameters ?? '{}', created_by_user_id: actor.id }, actor.id)
    })

    validatedHandlerMulti('scheduler:update', ROLES.STAFF, UpdateScheduleTuple, (event, [id, data, legacyId], actor) => {
        if (legacyId !== undefined) {
            if (legacyId <= 0) {return { success: false, error: 'Invalid user session' }}
            if (legacyId !== actor.id) {return { success: false, error: 'Unauthorized: renderer user mismatch' }}
        }
        if (data.schedule_type === 'TERM_END' || data.schedule_type === 'YEAR_END') {
            return { success: false, error: 'TERM_END and YEAR_END schedules are not supported in this release' }
        }
        return reportScheduler.updateSchedule(id, data, actor.id)
    })

    validatedHandlerMulti('scheduler:delete', ROLES.STAFF, z.tuple([z.number(), z.number().optional()]), (event, [id, legacyId], actor) => {
        if (legacyId !== undefined) {
            if (legacyId <= 0) {return { success: false, error: 'Invalid user session' }} // scheduler:delete returns { error: string } not errors[]?
            if (legacyId !== actor.id) {return { success: false, error: 'Unauthorized: renderer user mismatch' }}
        }
        return reportScheduler.deleteSchedule(id, actor.id)
    })
}
