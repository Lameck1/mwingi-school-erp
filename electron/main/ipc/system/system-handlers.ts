import { log } from '../../utils/logger'
import { ROLES } from '../ipc-result'
import { LogErrorSchema } from '../schemas/system-schemas'
import { validatedHandlerMulti } from '../validated-handler'

export function registerSystemHandlers(): void {
    validatedHandlerMulti('system:logError', ROLES.STAFF, LogErrorSchema, (_event, [error, details]) => {
        log.error(`[Renderer Error] ${error}`, details?.stack || '', details?.component || '')
    })
}
