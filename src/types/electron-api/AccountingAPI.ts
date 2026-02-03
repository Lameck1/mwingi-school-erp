/**
 * Accounting API Types
 * 
 * Type definitions for the new double-entry accounting system
 */

export interface GLAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  account_subtype?: string;
  parent_account_id?: number;
  is_system_account: boolean;
  is_active: boolean;
  requires_subsidiary: boolean;
  normal_balance: 'DEBIT' | 'CREDIT';
  description?: string;
  created_at: string;
}

export interface JournalEntry {
  id: number;
  entry_ref: string;
  entry_date: string;
  entry_type: string;
  description: string;
  student_id?: number;
  staff_id?: number;
  term_id?: number;
  is_posted: boolean;
  posted_by_user_id?: number;
  posted_at?: string;
  is_voided: boolean;
  voided_reason?: string;
  voided_by_user_id?: number;
  voided_at?: string;
  requires_approval: boolean;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by_user_id?: number;
  approved_at?: string;
  created_by_user_id: number;
  created_at: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: number;
  journal_entry_id: number;
  line_number: number;
  gl_account_id: number;
  gl_account_code?: string;
  gl_account_name?: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

export interface OpeningBalance {
  id: number;
  academic_year_id: number;
  gl_account_id?: number;
  student_id?: number;
  debit_amount: number;
  credit_amount: number;
  description: string;
  imported_from: string;
  imported_at: string;
  imported_by_user_id: number;
  is_verified: boolean;
  verified_by_user_id?: number;
  verified_at?: string;
}

export interface TrialBalance {
  accounts: Array<{
    account_code: string;
    account_name: string;
    debit_total: number;
    credit_total: number;
  }>;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}

export interface BalanceSheet {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  is_balanced: boolean;
  as_of_date: string;
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

export interface ProfitAndLoss {
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  period_start: string;
  period_end: string;
}

export interface StudentLedger {
  student: {
    admission_number: string;
    full_name: string;
  };
  opening_balance: number;
  transactions: Array<{
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  closing_balance: number;
}

export interface ApprovalRule {
  id: number;
  rule_name: string;
  transaction_type: string;
  min_amount?: number;
  max_amount?: number;
  days_since_transaction?: number;
  required_approver_role: string;
  is_active: boolean;
  created_at: string;
}

export interface TransactionApproval {
  id: number;
  journal_entry_id: number;
  approval_rule_id: number;
  requested_by_user_id: number;
  requested_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by_user_id?: number;
  reviewed_at?: string;
  review_notes?: string;
}

export interface LedgerReconciliation {
  id: number;
  reconciliation_date: string;
  gl_account_id: number;
  opening_balance: number;
  total_debits: number;
  total_credits: number;
  closing_balance: number;
  calculated_balance: number;
  variance: number;
  is_balanced: boolean;
  reconciled_by_user_id: number;
  notes?: string;
  created_at: string;
}

// Request types
export interface CreateJournalEntryRequest {
  entry_date: string;
  entry_type: string;
  description: string;
  student_id?: number;
  staff_id?: number;
  term_id?: number;
  lines: Array<{
    gl_account_code: string;
    debit_amount: number;
    credit_amount: number;
    description?: string;
  }>;
}

export interface VoidJournalEntryRequest {
  journal_entry_id: number;
  void_reason: string;
  user_id: number;
}

export interface ImportOpeningBalancesRequest {
  academic_year_id: number;
  import_source: string;
  balances: Array<{
    student_id?: number;
    gl_account_code?: string;
    debit_amount: number;
    credit_amount: number;
    description: string;
  }>;
}

export interface ApprovalRequest {
  journal_entry_id: number;
  approval_status: 'APPROVED' | 'REJECTED';
  review_notes?: string;
  reviewer_user_id: number;
}

// Response types
export interface AccountingAPIResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface GLAccountListResponse extends AccountingAPIResponse {
  data: GLAccount[];
}

export interface JournalEntryResponse extends AccountingAPIResponse {
  data: {
    entry_id: number;
    entry_ref: string;
  };
}

export interface TrialBalanceResponse extends AccountingAPIResponse {
  data: TrialBalance;
}

export interface BalanceSheetResponse extends AccountingAPIResponse {
  data: BalanceSheet;
}

export interface ProfitAndLossResponse extends AccountingAPIResponse {
  data: ProfitAndLoss;
}

export interface StudentLedgerResponse extends AccountingAPIResponse {
  data: StudentLedger;
}
