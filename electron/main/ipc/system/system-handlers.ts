import { log } from '../../utils/logger'
import { ROLES, safeHandleRawWithRole } from '../ipc-result'

export function registerSystemHandlers(): void {
    safeHandleRawWithRole('system:logError', ROLES.STAFF, (_event, data: { error: string; stack?: string; componentStack?: string | null; timestamp: string }) => {
        log.error(`[Renderer Error] ${data.error}`, data.stack || '', data.componentStack || '')
    })
}
