import { createGetOrCreateCategoryId, type FinanceContext } from './finance-handler-utils'
import { registerInvoiceHandlers, registerFeeStructureHandlers } from './invoice-handlers'
import { registerPaymentHandlers, registerReceiptHandlers } from './payment-handlers'
import { registerCreditHandlers, registerProrationHandlers, registerScholarshipHandlers } from './scholarship-handlers'
import { getDatabase } from '../../database'
import { container } from '../../services/base/ServiceContainer'
import { CashFlowService } from '../../services/finance/CashFlowService'
import { ROLES } from '../ipc-result'
import { CashFlowTuple, ForecastSchema } from '../schemas/finance-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

const registerCashFlowHandlers = (): void => {
    validatedHandlerMulti('finance:getCashFlow', ROLES.STAFF, CashFlowTuple, (_event, [startDate, endDate]) => {
        return CashFlowService.getCashFlowStatement(startDate, endDate)
    })

    validatedHandler('finance:getForecast', ROLES.STAFF, ForecastSchema, (_event, months) => {
        return CashFlowService.getForecast(months)
    })
}

export function registerFinanceHandlers(): void {
    const db = getDatabase()
    const context: FinanceContext = {
        db,
        exemptionService: container.resolve('ExemptionService'),
        paymentService: container.resolve('PaymentService'),
        getOrCreateCategoryId: createGetOrCreateCategoryId(db)
    }

    registerCashFlowHandlers()
    registerPaymentHandlers(context)
    registerInvoiceHandlers(context)
    registerFeeStructureHandlers(context)
    registerCreditHandlers()
    registerProrationHandlers()
    registerScholarshipHandlers()
    registerReceiptHandlers(db)
}
