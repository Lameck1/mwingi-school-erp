import { createGetOrCreateCategoryId, type FinanceContext } from './finance-handler-utils'
import { registerInvoiceHandlers, registerFeeStructureHandlers } from './invoice-handlers'
import { registerPaymentHandlers, registerReceiptHandlers } from './payment-handlers'
import { registerCreditHandlers, registerProrationHandlers, registerScholarshipHandlers } from './scholarship-handlers'
import { getDatabase } from '../../database'
import { container } from '../../services/base/ServiceContainer'
import { CashFlowService } from '../../services/finance/CashFlowService'
import { safeHandleRawWithRole, ROLES } from '../ipc-result'

const registerCashFlowHandlers = (): void => {
    safeHandleRawWithRole('finance:getCashFlow', ROLES.STAFF, (_event, startDate: string, endDate: string) => {
        return CashFlowService.getCashFlowStatement(startDate, endDate)
    })

    safeHandleRawWithRole('finance:getForecast', ROLES.STAFF, (_event, months: number) => {
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
