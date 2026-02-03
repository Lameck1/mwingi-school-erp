import { ipcMain } from 'electron';
import { DoubleEntryJournalService } from '../../services/accounting/DoubleEntryJournalService';
import { ProfitAndLossService } from '../../services/accounting/ProfitAndLossService';
import { OpeningBalanceService } from '../../services/accounting/OpeningBalanceService';

/**
 * IPC Handlers for Financial Reports
 * 
 * Provides access to:
 * - Balance Sheet
 * - Profit & Loss Statement
 * - Trial Balance
 * - General Ledger
 */

const journalService = new DoubleEntryJournalService();
const plService = new ProfitAndLossService();
const obService = new OpeningBalanceService();

// ============================================================================
// BALANCE SHEET
// ============================================================================

ipcMain.handle('reports:getBalanceSheet', async (_event, asOfDate: string) => {
  try {
    const balanceSheet = await journalService.getBalanceSheet(asOfDate);
    return {
      success: true,
      data: balanceSheet
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to generate balance sheet: ${(error as Error).message}`
    };
  }
});

// ============================================================================
// PROFIT & LOSS STATEMENT
// ============================================================================

ipcMain.handle('reports:getProfitAndLoss', async (_event, startDate: string, endDate: string) => {
  try {
    const profitAndLoss = await plService.generateProfitAndLoss(startDate, endDate);
    return {
      success: true,
      data: profitAndLoss
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to generate P&L: ${(error as Error).message}`
    };
  }
});

ipcMain.handle(
  'reports:getComparativeProfitAndLoss',
  async (_event, currentStart: string, currentEnd: string, priorStart: string, priorEnd: string) => {
    try {
      const comparative = await plService.generateComparativeProfitAndLoss(
        currentStart,
        currentEnd,
        priorStart,
        priorEnd
      );
      return {
        success: true,
        data: comparative
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate comparative P&L: ${(error as Error).message}`
      };
    }
  }
);

// ============================================================================
// TRIAL BALANCE
// ============================================================================

ipcMain.handle('reports:getTrialBalance', async (_event, startDate: string, endDate: string) => {
  try {
    const trialBalance = await journalService.getTrialBalance(startDate, endDate);
    return {
      success: true,
      data: trialBalance
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to generate trial balance: ${(error as Error).message}`
    };
  }
});

// ============================================================================
// STUDENT LEDGER
// ============================================================================

ipcMain.handle(
  'reports:getStudentLedger',
  async (_event, studentId: number, academicYearId: number, startDate: string, endDate: string) => {
    try {
      const studentLedger = await obService.getStudentLedger(
        studentId,
        academicYearId,
        startDate,
        endDate
      );
      return {
        success: true,
        data: studentLedger
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate student ledger: ${(error as Error).message}`
      };
    }
  }
);

// ============================================================================
// REVENUE BREAKDOWN
// ============================================================================

ipcMain.handle('reports:getRevenueBreakdown', async (_event, startDate: string, endDate: string) => {
  try {
    const breakdown = await plService.getRevenueBreakdown(startDate, endDate);
    return {
      success: true,
      data: breakdown
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get revenue breakdown: ${(error as Error).message}`
    };
  }
});

// ============================================================================
// EXPENSE BREAKDOWN
// ============================================================================

ipcMain.handle('reports:getExpenseBreakdown', async (_event, startDate: string, endDate: string) => {
  try {
    const breakdown = await plService.getExpenseBreakdown(startDate, endDate);
    return {
      success: true,
      data: breakdown
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get expense breakdown: ${(error as Error).message}`
    };
  }
});

console.log('Financial reports IPC handlers registered');
