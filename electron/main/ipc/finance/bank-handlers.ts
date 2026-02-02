import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { BankReconciliationService } from '../../services/finance/BankReconciliationService'

const service = new BankReconciliationService()

export function registerBankReconciliationHandlers(): void {
    // Bank Accounts
    ipcMain.handle('bank:getAccounts', async () => {
        return service.getBankAccounts()
    })

    ipcMain.handle('bank:getAccountById', async (_event: IpcMainInvokeEvent, id: number) => {
        return service.getBankAccountById(id)
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
        return service.createBankAccount(data)
    })

    // Bank Statements
    ipcMain.handle('bank:getStatements', async (_event: IpcMainInvokeEvent, bankAccountId?: number) => {
        return service.getStatements(bankAccountId)
    })

    ipcMain.handle('bank:getStatementWithLines', async (_event: IpcMainInvokeEvent, statementId: number) => {
        return service.getStatementWithLines(statementId)
    })

    ipcMain.handle('bank:createStatement', async (
        _event: IpcMainInvokeEvent,
        bankAccountId: number,
        statementDate: string,
        openingBalance: number,
        closingBalance: number,
        reference?: string
    ) => {
        return service.createStatement(bankAccountId, statementDate, openingBalance, closingBalance, reference)
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
        return service.addStatementLine(statementId, {
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
        return service.matchTransaction(lineId, transactionId)
    })

    ipcMain.handle('bank:unmatchTransaction', async (_event: IpcMainInvokeEvent, lineId: number) => {
        return service.unmatchTransaction(lineId)
    })

    ipcMain.handle('bank:getUnmatchedTransactions', async (
        _event: IpcMainInvokeEvent,
        startDate: string,
        endDate: string
    ) => {
        return service.getUnmatchedLedgerTransactions(startDate, endDate)
    })

    ipcMain.handle('bank:markReconciled', async (
        _event: IpcMainInvokeEvent,
        statementId: number,
        userId: number
    ) => {
        return service.markStatementReconciled(statementId, userId)
    })
}
