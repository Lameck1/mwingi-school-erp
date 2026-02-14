import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

import type { DoubleEntryJournalService } from '../../services/accounting/DoubleEntryJournalService';
import type { OpeningBalanceService } from '../../services/accounting/OpeningBalanceService';
import type { ProfitAndLossService } from '../../services/accounting/ProfitAndLossService';

type ReportResponse<T> = { data: T; success: true } | { error: string; success: false };

function success<T>(data: T): ReportResponse<T> {
  return { success: true, data };
}

function failure(error: string): ReportResponse<never> {
  return { success: false, error };
}

function registerBalanceSheetHandlers(journalService: DoubleEntryJournalService): void {
  safeHandleRaw('reports:getBalanceSheet', async (_event, asOfDate: string) => {
    try {
      return success(await journalService.getBalanceSheet(asOfDate));
    } catch (error) {
      return failure(`Failed to generate balance sheet: ${(error as Error).message}`);
    }
  });
}

function registerProfitAndLossHandlers(plService: ProfitAndLossService): void {
  safeHandleRaw('reports:getProfitAndLoss', async (_event, startDate: string, endDate: string) => {
    try {
      return success(await plService.generateProfitAndLoss(startDate, endDate));
    } catch (error) {
      return failure(`Failed to generate P&L: ${(error as Error).message}`);
    }
  });

  safeHandleRaw(
    'reports:getComparativeProfitAndLoss',
    async (
      _event,
      currentStart: string,
      currentEnd: string,
      priorStart: string,
      priorEnd: string
    ) => {
      try {
        return success(await plService.generateComparativeProfitAndLoss(currentStart, currentEnd, priorStart, priorEnd));
      } catch (error) {
        return failure(`Failed to generate comparative P&L: ${(error as Error).message}`);
      }
    }
  );

  safeHandleRaw('reports:getRevenueBreakdown', async (_event, startDate: string, endDate: string) => {
    try {
      return success(await plService.getRevenueBreakdown(startDate, endDate));
    } catch (error) {
      return failure(`Failed to get revenue breakdown: ${(error as Error).message}`);
    }
  });

  safeHandleRaw('reports:getExpenseBreakdown', async (_event, startDate: string, endDate: string) => {
    try {
      return success(await plService.getExpenseBreakdown(startDate, endDate));
    } catch (error) {
      return failure(`Failed to get expense breakdown: ${(error as Error).message}`);
    }
  });
}

function registerTrialBalanceAndLedgerHandlers(journalService: DoubleEntryJournalService, obService: OpeningBalanceService): void {
  safeHandleRaw('reports:getTrialBalance', async (_event, startDate: string, endDate: string) => {
    try {
      return success(await journalService.getTrialBalance(startDate, endDate));
    } catch (error) {
      return failure(`Failed to generate trial balance: ${(error as Error).message}`);
    }
  });

  safeHandleRaw(
    'reports:getStudentLedger',
    async (
      _event,
      studentId: number,
      academicYearId: number,
      startDate: string,
      endDate: string
    ) => {
      try {
        return success(await obService.getStudentLedger(studentId, academicYearId, startDate, endDate));
      } catch (error) {
        return failure(`Failed to generate student ledger: ${(error as Error).message}`);
      }
    }
  );
}

/**
 * IPC Handlers for Financial Reports
 * Refactored: wrapped in registration function to prevent side-effects at import time
 *
 * Provides access to:
 * - Balance Sheet
 * - Profit & Loss Statement
 * - Trial Balance
 * - General Ledger
 */

export function registerFinancialReportsHandlers(): void {
  const journalService = container.resolve('DoubleEntryJournalService');
  const plService = container.resolve('ProfitAndLossService');
  const obService = container.resolve('OpeningBalanceService');
  registerBalanceSheetHandlers(journalService);
  registerProfitAndLossHandlers(plService);
  registerTrialBalanceAndLedgerHandlers(journalService, obService);
}
