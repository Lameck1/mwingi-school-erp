import { container } from '../../services/base/ServiceContainer'
import { validateId, validatePastOrTodayDate } from '../../utils/validation'
import { safeHandleRaw, safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

const getService = () => container.resolve('BankReconciliationService')

export function registerBankReconciliationHandlers(): void {
    // Bank Accounts
    safeHandleRaw('bank:getAccounts', () => {
        return getService().getBankAccounts()
    })

    safeHandleRaw('bank:getAccountById', (_event, id: number) => {
        return getService().getBankAccountById(id)
    })

    safeHandleRawWithRole('bank:createAccount', ROLES.FINANCE, (_event, data: {
        account_name: string
        account_number: string
        bank_name: string
        branch?: string
        swift_code?: string
        currency?: string
        opening_balance: number
    }) => {
        return getService().createBankAccount(data)
    })

    // Bank Statements
    safeHandleRaw('bank:getStatements', (_event, bankAccountId?: number) => {
        return getService().getStatements(bankAccountId)
    })

    safeHandleRaw('bank:getStatementWithLines', (_event, statementId: number) => {
        return getService().getStatementWithLines(statementId)
    })

    safeHandleRawWithRole('bank:createStatement', ROLES.FINANCE, (
        _event,
        bankAccountId: number,
        statementDate: string,
        openingBalance: number,
        closingBalance: number,
        reference?: string
    ) => {
        const accountValidation = validateId(bankAccountId, 'Bank account ID')
        if (!accountValidation.success) {
            return { success: false, errors: [accountValidation.error || 'Invalid bank account ID'] }
        }
        const dateValidation = validatePastOrTodayDate(statementDate)
        if (!dateValidation.success) {
            return { success: false, errors: [dateValidation.error || 'Invalid statement date'] }
        }
        if (!Number.isFinite(openingBalance) || !Number.isFinite(closingBalance)) {
            return { success: false, errors: ['Statement balances must be valid numbers'] }
        }

        return getService().createStatement(bankAccountId, statementDate, openingBalance, closingBalance, reference)
    })

    safeHandleRawWithRole('bank:addStatementLine', ROLES.FINANCE, (
        _event,
        statementId: number,
        line: {
            transaction_date: string
            description: string
            reference?: string | null
            debit_amount: number
            credit_amount: number
            running_balance?: number | null
        }
    ) => {
        const statementValidation = validateId(statementId, 'Bank statement ID')
        if (!statementValidation.success) {
            return { success: false, errors: [statementValidation.error || 'Invalid bank statement ID'] }
        }

        const dateValidation = validatePastOrTodayDate(line?.transaction_date)
        if (!dateValidation.success) {
            return { success: false, errors: [dateValidation.error || 'Invalid statement line date'] }
        }

        const description = line?.description?.trim() || ''
        if (!description) {
            return { success: false, errors: ['Statement line description is required'] }
        }

        const debitAmount = Number(line?.debit_amount)
        const creditAmount = Number(line?.credit_amount)
        if (!Number.isFinite(debitAmount) || !Number.isFinite(creditAmount)) {
            return { success: false, errors: ['Debit and credit amounts must be valid numbers'] }
        }
        if (debitAmount < 0 || creditAmount < 0) {
            return { success: false, errors: ['Debit and credit amounts cannot be negative'] }
        }
        const hasDebit = debitAmount > 0
        const hasCredit = creditAmount > 0
        if (hasDebit === hasCredit) {
            return { success: false, errors: ['Exactly one of debit amount or credit amount must be greater than zero'] }
        }
        if (line?.running_balance != null && !Number.isFinite(Number(line.running_balance))) {
            return { success: false, errors: ['Running balance must be a valid number when provided'] }
        }

        return getService().addStatementLine(statementId, {
            ...line,
            transaction_date: dateValidation.data!,
            description,
            debit_amount: debitAmount,
            credit_amount: creditAmount,
            reference: line.reference ?? null,
            running_balance: line.running_balance ?? null
        })
    })

    // Reconciliation
    safeHandleRawWithRole('bank:matchTransaction', ROLES.FINANCE, (
        _event,
        lineId: number,
        transactionId: number
    ) => {
        return getService().matchTransaction(lineId, transactionId)
    })

    safeHandleRawWithRole('bank:unmatchTransaction', ROLES.FINANCE, (_event, lineId: number) => {
        return getService().unmatchTransaction(lineId)
    })

    safeHandleRaw('bank:getUnmatchedTransactions', (
        _event,
        startDate: string,
        endDate: string,
        bankAccountId?: number
    ) => {
        return getService().getUnmatchedLedgerTransactions(startDate, endDate, bankAccountId)
    })

    safeHandleRawWithRole('bank:markReconciled', ROLES.FINANCE, (
        event,
        statementId: number,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        const statementValidation = validateId(statementId, 'Statement ID')
        if (!statementValidation.success) {
            return { success: false, error: statementValidation.error || 'Invalid statement ID' }
        }

        return getService().markStatementReconciled(statementValidation.data!, actor.actorId)
    })
}
