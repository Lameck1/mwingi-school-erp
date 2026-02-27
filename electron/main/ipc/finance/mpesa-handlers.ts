import { z } from 'zod'
import { MpesaReconciliationService, type MatchStatus } from '../../services/finance/MpesaReconciliationService'
import { ROLES } from '../ipc-result'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export function setupMpesaHandlers(): void {
    const importSchema = z.tuple([
        z.array(z.any()), // MpesaImportRow roughly
        z.enum(['CSV', 'API', 'MANUAL']),
        z.string().optional()
    ])

    validatedHandlerMulti('mpesa:import', ROLES.FINANCE, importSchema, async (_, [rows, source, fileName], actor) => {
        const service = new MpesaReconciliationService()
        const result = service.importTransactions(rows, actor.id, source, fileName)

        if (!result.success) {
            throw new Error(result.error ?? 'Failed to import M-Pesa transactions')
        }
        return result
    })

    // getUnmatched takes no args
    validatedHandler('mpesa:getUnmatched', ROLES.FINANCE, z.any(), async () => {
        const service = new MpesaReconciliationService()
        return service.getUnmatchedTransactions()
    })

    // getByStatus takes 1 arg
    validatedHandler('mpesa:getByStatus', ROLES.FINANCE, z.enum(['PENDING', 'MATCHED', 'FAILED', 'IGNORED']), async (_, status) => {
        const service = new MpesaReconciliationService()
        return service.getTransactionsByStatus(status as MatchStatus)
    })

    // manualMatch takes 2 args
    const matchSchema = z.tuple([z.number(), z.number()])
    validatedHandlerMulti('mpesa:manualMatch', ROLES.FINANCE, matchSchema, async (_, [transactionId, studentId], actor) => {
        const service = new MpesaReconciliationService()
        const result = service.manualMatch(transactionId, studentId, actor.id)

        if (!result.success) {
            throw new Error(result.error ?? 'Failed to manually match transaction')
        }
        return result
    })

    // getSummary takes no args
    validatedHandler('mpesa:getSummary', ROLES.FINANCE, z.any(), async () => {
        const service = new MpesaReconciliationService()
        return service.getReconciliationSummary()
    })
}
