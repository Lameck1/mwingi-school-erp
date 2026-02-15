import { getDatabase } from '../../database'
import { PeriodLockingService } from '../../services/finance/PeriodLockingService'
import { safeHandleRaw, safeHandleRawWithRole, ROLES } from '../ipc-result'

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

    safeHandleRawWithRole('period:lock', ROLES.FINANCE, (_event, periodId: number, userId: number) => {
        return service.lockPeriod(periodId, userId)
    })

    safeHandleRawWithRole('period:unlock', ROLES.MANAGEMENT, (_event, periodId: number, userId: number) => {
        return service.unlockPeriod(periodId, userId)
    })

    safeHandleRawWithRole('period:close', ROLES.MANAGEMENT, (_event, periodId: number, userId: number) => {
        return service.closePeriod(periodId, userId)
    })
}
