import { log } from '../../utils/logger'
import { ROLES } from '../ipc-result'
import { LogErrorSchema } from '../schemas/system-schemas'
import { validatedHandler } from '../validated-handler'

export function registerSystemHandlers(): void {
    validatedHandler('system:logError', ROLES.STAFF, LogErrorSchema, (_event, data) => {
        log.error(`[Renderer Error] ${data.error}`, data.stack || '', data.componentStack || '')
    })
}
