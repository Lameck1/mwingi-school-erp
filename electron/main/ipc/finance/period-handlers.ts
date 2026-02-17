import { getDatabase } from '../../database'
import { PeriodLockingService } from '../../services/finance/PeriodLockingService'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

export function registerPeriodLockingHandlers(): void {
    const service = new PeriodLockingService(getDatabase())

    safeHandleRawWithRole('period:getAll', ROLES.STAFF, (_event, status?: string) => {
        return service.getAllPeriods(status)
    })

    safeHandleRawWithRole('period:getForDate', ROLES.STAFF, (_event, date: string) => {
        return service.getPeriodForDate(date)
    })

    safeHandleRawWithRole('period:isTransactionAllowed', ROLES.STAFF, (_event, transactionDate: string) => {
        return service.isTransactionAllowed(transactionDate)
    })

    safeHandleRawWithRole('period:lock', ROLES.FINANCE, (event, periodId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return service.lockPeriod(periodId, actor.actorId)
    })

    safeHandleRawWithRole('period:unlock', ROLES.MANAGEMENT, (event, periodId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return service.unlockPeriod(periodId, actor.actorId)
    })

    safeHandleRawWithRole('period:close', ROLES.MANAGEMENT, (event, periodId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return service.closePeriod(periodId, actor.actorId)
    })
}
