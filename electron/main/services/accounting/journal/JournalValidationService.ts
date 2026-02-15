import type { JournalEntryLineData } from '../JournalService.types';

export class JournalValidationService {
  static validateLineCount(lines: JournalEntryLineData[]): { message?: string; valid: boolean } {
    if (lines.length >= 2) {
      return { valid: true };
    }

    return {
      valid: false,
      message: 'Journal entry must have at least 2 lines (debit + credit)'
    };
  }

  static validateBalancing(lines: JournalEntryLineData[]): { message?: string; totalCredits: number; totalDebits: number; valid: boolean } {
    const totalDebits = lines.reduce((sum, line) => sum + line.debit_amount, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit_amount, 0);

    if (totalDebits !== totalCredits) {
      return {
        valid: false,
        totalDebits,
        totalCredits,
        message: `Debits (${totalDebits}) must equal Credits (${totalCredits}). Difference: ${Math.abs(totalDebits - totalCredits)}`
      };
    }

    return { valid: true, totalDebits, totalCredits };
  }
}
