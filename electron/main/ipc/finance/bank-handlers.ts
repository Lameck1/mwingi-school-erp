import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    BankAccountSchema, CreateStatementTuple, AddStatementLineTuple,
    MatchTransactionTuple, UnmatchedTransactionTuple, MarkReconciledTuple
} from '../schemas/bank-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

const getService = () => container.resolve('BankReconciliationService')

export function registerBankReconciliationHandlers(): void {
    // Bank Accounts
    validatedHandler('bank:getAccounts', ROLES.FINANCE, z.void(), () => {
        return getService().getBankAccounts()
    })

    validatedHandler('bank:getAccountById', ROLES.FINANCE, z.number().int().positive(), (_event, id) => {
        return getService().getBankAccountById(id)
    })

    validatedHandler('bank:createAccount', ROLES.FINANCE, BankAccountSchema, (_event, data) => {
        return getService().createBankAccount(data)
    })

    // Bank Statements
    validatedHandler('bank:getStatements', ROLES.FINANCE, z.number().int().positive().optional(), (_event, bankAccountId) => {
        return getService().getStatements(bankAccountId)
    })

    validatedHandler('bank:getStatementWithLines', ROLES.FINANCE, z.number().int().positive(), (_event, statementId) => {
        return getService().getStatementWithLines(statementId)
    })

    validatedHandlerMulti('bank:createStatement', ROLES.FINANCE, CreateStatementTuple, (_event, [bankAccountId, date, openBal, closeBal, ref]) => {
        return getService().createStatement(bankAccountId, date, openBal, closeBal, ref)
    })

    validatedHandlerMulti('bank:addStatementLine', ROLES.FINANCE, AddStatementLineTuple, (_event, [statementId, line]) => {
        return getService().addStatementLine(statementId, line)
    })

    // Reconciliation
    validatedHandlerMulti('bank:matchTransaction', ROLES.FINANCE, MatchTransactionTuple, (_event, [lineId, transactionId]) => {
        return getService().matchTransaction(lineId, transactionId)
    })

    validatedHandler('bank:unmatchTransaction', ROLES.FINANCE, z.number().int().positive(), (_event, lineId) => {
        return getService().unmatchTransaction(lineId)
    })

    validatedHandlerMulti('bank:getUnmatchedTransactions', ROLES.FINANCE, UnmatchedTransactionTuple, (_event, [startDate, endDate, bankAccountId]) => {
        return getService().getUnmatchedLedgerTransactions(startDate, endDate, bankAccountId)
    })

    validatedHandlerMulti('bank:markReconciled', ROLES.FINANCE, MarkReconciledTuple, (event, [statementId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().markStatementReconciled(statementId, actor.id)
    })
}
