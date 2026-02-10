import { ipcMain } from '../../electron-env'
import { BankReconciliationService } from '../../services/finance/BankReconciliationService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: BankReconciliationService | null = null
const getService = () => {
    cachedService ??= new BankReconciliationService()
    return cachedService
}

export function registerBankReconciliationHandlers(): void {
    // Bank Accounts
    ipcMain.handle('bank:getAccounts', async () => {
        return getService().getBankAccounts()
    })

    ipcMain.handle('bank:getAccountById', async (_event: IpcMainInvokeEvent, id: number) => {
        return getService().getBankAccountById(id)
    })

    ipcMain.handle('bank:createAccount', async (_event: IpcMainInvokeEvent, data: {
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
    ipcMain.handle('bank:getStatements', async (_event: IpcMainInvokeEvent, bankAccountId?: number) => {
        return getService().getStatements(bankAccountId)
    })

    ipcMain.handle('bank:getStatementWithLines', async (_event: IpcMainInvokeEvent, statementId: number) => {
        return getService().getStatementWithLines(statementId)
    })

    ipcMain.handle('bank:createStatement', async (
        _event: IpcMainInvokeEvent,
        ...[bankAccountId, statementDate, openingBalance, closingBalance, reference]: CreateStatementArgs
    ) => {
        return getService().createStatement(bankAccountId, statementDate, openingBalance, closingBalance, reference)
    })

    ipcMain.handle('bank:addStatementLine', async (
        _event: IpcMainInvokeEvent,
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
        return getService().addStatementLine(statementId, {
            ...line,
            reference: line.reference ?? null,
            running_balance: line.running_balance ?? null
        })
    })

    // Reconciliation
    ipcMain.handle('bank:matchTransaction', async (
        _event: IpcMainInvokeEvent,
        lineId: number,
        transactionId: number
    ) => {
        return getService().matchTransaction(lineId, transactionId)
    })

    ipcMain.handle('bank:unmatchTransaction', async (_event: IpcMainInvokeEvent, lineId: number) => {
        return getService().unmatchTransaction(lineId)
    })

    ipcMain.handle('bank:getUnmatchedTransactions', async (
        _event: IpcMainInvokeEvent,
        startDate: string,
        endDate: string
    ) => {
        return getService().getUnmatchedLedgerTransactions(startDate, endDate)
    })

    ipcMain.handle('bank:markReconciled', async (
        _event: IpcMainInvokeEvent,
        statementId: number,
        userId: number
    ) => {
        return getService().markStatementReconciled(statementId, userId)
    })
}
    type CreateStatementArgs = [
        bankAccountId: number,
        statementDate: string,
        openingBalance: number,
        closingBalance: number,
        reference?: string
    ]
