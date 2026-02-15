export interface OpeningBalanceImport {
  academic_year_id: number;
  gl_account_code?: string;
  student_id?: number;
  debit_amount: number;
  credit_amount: number;
  description: string;
  imported_from: string;
  imported_by_user_id: number;
}

export interface StudentOpeningBalance {
  student_id: number;
  admission_number: string;
  student_name: string;
  opening_balance: number;
  balance_type: 'DEBIT' | 'CREDIT';
}

export interface OpeningBalanceAPI {
  importStudentOpeningBalances: (
    balances: StudentOpeningBalance[],
    academicYearId: number,
    importSource: string
  ) => Promise<{ success: boolean; message: string; imported_count: number }>;

  importGLOpeningBalances: (
    balances: OpeningBalanceImport[]
  ) => Promise<{ success: boolean; message: string; imported_count: number }>;
}
