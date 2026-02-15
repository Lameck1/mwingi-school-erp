export interface JournalEntryData {
  entry_date: string;
  entry_type: string;
  description: string;
  student_id?: number;
  staff_id?: number;
  term_id?: number;
  created_by_user_id: number;
  lines: JournalEntryLineData[];
  requires_approval?: boolean;
  source_ledger_txn_id?: number;
}

export interface JournalEntryLineData {
  gl_account_code: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

export interface JournalEntry {
  id: number;
  entry_ref: string;
  entry_date: string;
  entry_type: string;
  description: string;
  is_posted: boolean;
  is_voided: boolean;
  approval_status: string;
  lines: JournalEntryLine[];
}

export type RecordPaymentArgs = [
  studentId: number,
  amount: number,
  paymentMethod: string,
  paymentReference: string,
  paymentDate: string,
  userId: number,
  sourceLedgerTxnId?: number
];

export type JournalWriteResult = { success: boolean; error?: string; message?: string; entry_id?: number };

export interface JournalEntryLine {
  id: number;
  line_number: number;
  gl_account_code: string;
  gl_account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

export interface BalanceSheetData {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  net_income: number;
  is_balanced: boolean;
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}
