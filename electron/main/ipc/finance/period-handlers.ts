// period-handlers.ts

import { getDatabase } from '../../database'
import { PeriodLockingService } from '../../services/finance/PeriodLockingService'
import { ROLES } from '../ipc-result'
import { PeriodStatusSchema, DateStringSchema, PeriodProcessTuple } from '../schemas/finance-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export function registerPeriodLockingHandlers(): void {
    const service = new PeriodLockingService(getDatabase())

    validatedHandler('period:getAll', ROLES.STAFF, PeriodStatusSchema, (_event, status) => {
        return service.getAllPeriods(status)
    })

    validatedHandler('period:getForDate', ROLES.STAFF, DateStringSchema, (_event, date) => {
        return service.getPeriodForDate(date)
    })

    validatedHandler('period:isTransactionAllowed', ROLES.STAFF, DateStringSchema, (_event, transactionDate) => {
        return service.isTransactionAllowed(transactionDate)
    })

    validatedHandlerMulti('period:lock', ROLES.FINANCE, PeriodProcessTuple, (event, [periodId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return service.lockPeriod(periodId, actor.id)
    })

    validatedHandlerMulti('period:unlock', ROLES.MANAGEMENT, PeriodProcessTuple, (event, [periodId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return service.unlockPeriod(periodId, actor.id)
    })

    validatedHandlerMulti('period:close', ROLES.MANAGEMENT, PeriodProcessTuple, (event, [periodId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return service.closePeriod(periodId, actor.id)
    })
}
