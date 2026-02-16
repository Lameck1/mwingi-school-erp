import { getDatabase } from '../../database'
import { PeriodLockingService } from '../../services/finance/PeriodLockingService'
import { safeHandleRaw, safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

export function registerPeriodLockingHandlers(): void {
    const service = new PeriodLockingService(getDatabase())

    safeHandleRaw('period:getAll', (_event, status?: string) => {
        return service.getAllPeriods(status)
    })

    safeHandleRaw('period:getForDate', (_event, date: string) => {
        return service.getPeriodForDate(date)
    })

    safeHandleRaw('period:isTransactionAllowed', (_event, transactionDate: string) => {
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
