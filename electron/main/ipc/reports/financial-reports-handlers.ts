import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
  ReportAsOfDateSchema, ReportDateRangeSchema, StudentLedgerSchema
} from '../schemas/reports-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

interface IJournalService {
  getBalanceSheet(asOf: string): Promise<unknown>
  getTrialBalance(start: string, end: string): Promise<unknown>
}
interface IProfitAndLossService {
  generateProfitAndLoss(start: string, end: string): Promise<unknown>
  generateComparativeProfitAndLoss(cStart: string, cEnd: string, pStart: string, pEnd: string): Promise<unknown>
  getRevenueBreakdown(start: string, end: string): Promise<unknown>
  getExpenseBreakdown(start: string, end: string): Promise<unknown>
}
interface IOpeningBalanceService {
  getStudentLedger(studentId: number, yearId: number, start: string, end: string): Promise<unknown>
}

export function registerFinancialReportsHandlers(): void {
  const journalService = container.resolve('DoubleEntryJournalService') as IJournalService
  const plService = container.resolve('ProfitAndLossService') as IProfitAndLossService
  const obService = container.resolve('OpeningBalanceService') as IOpeningBalanceService

  registerBalanceSheetHandlers(journalService)
  registerProfitAndLossHandlers(plService)
  registerTrialBalanceAndLedgerHandlers(journalService, obService)
}

function registerBalanceSheetHandlers(journalService: IJournalService): void {
  validatedHandler('reports:getBalanceSheet', ROLES.FINANCE, ReportAsOfDateSchema, async (_event, asOfDate) => {
    try {
      return { success: true, data: await journalService.getBalanceSheet(asOfDate) }
    } catch (error) {
      throw new Error(`Failed to generate balance sheet: ${(error as Error).message}`)
    }
  })
}

function registerProfitAndLossHandlers(plService: IProfitAndLossService): void {
  validatedHandlerMulti('reports:getProfitAndLoss', ROLES.FINANCE, ReportDateRangeSchema, async (_event, [startDate, endDate]) => {
    try {
      return { success: true, data: await plService.generateProfitAndLoss(startDate, endDate) }
    } catch (error) {
      throw new Error(`Failed to generate P&L: ${(error as Error).message}`)
    }
  })

  validatedHandlerMulti(
    'reports:getComparativeProfitAndLoss',
    ROLES.FINANCE,
    z.tuple([z.string(), z.string(), z.string(), z.string()]),
    async (_event, [currentStart, currentEnd, priorStart, priorEnd]) => {
      try {
        return { success: true, data: await plService.generateComparativeProfitAndLoss(currentStart, currentEnd, priorStart, priorEnd) }
      } catch (error) {
        throw new Error(`Failed to generate comparative P&L: ${(error as Error).message}`)
      }
    }
  )

  validatedHandlerMulti('reports:getRevenueBreakdown', ROLES.FINANCE, ReportDateRangeSchema, async (_event, [startDate, endDate]) => {
    try {
      return { success: true, data: await plService.getRevenueBreakdown(startDate, endDate) }
    } catch (error) {
      throw new Error(`Failed to get revenue breakdown: ${(error as Error).message}`)
    }
  })

  validatedHandlerMulti('reports:getExpenseBreakdown', ROLES.FINANCE, ReportDateRangeSchema, async (_event, [startDate, endDate]) => {
    try {
      return { success: true, data: await plService.getExpenseBreakdown(startDate, endDate) }
    } catch (error) {
      throw new Error(`Failed to get expense breakdown: ${(error as Error).message}`)
    }
  })
}

function registerTrialBalanceAndLedgerHandlers(journalService: IJournalService, obService: IOpeningBalanceService): void {
  validatedHandlerMulti('reports:getTrialBalance', ROLES.FINANCE, ReportDateRangeSchema, async (_event, [startDate, endDate]) => {
    try {
      return { success: true, data: await journalService.getTrialBalance(startDate, endDate) }
    } catch (error) {
      throw new Error(`Failed to generate trial balance: ${(error as Error).message}`)
    }
  })

  validatedHandlerMulti('reports:getStudentLedger', ROLES.FINANCE, StudentLedgerSchema, async (_event, [studentId, yearId, start, end]) => {
    try {
      return { success: true, data: await obService.getStudentLedger(studentId, yearId, start, end) }
    } catch (error) {
      throw new Error(`Failed to generate student ledger: ${(error as Error).message}`)
    }
  })
}
