export interface GLAccountData {
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  account_subtype?: string;
  parent_account_id?: number;
  is_system_account?: boolean;
  is_active?: boolean;
  requires_subsidiary?: boolean;
  normal_balance: 'DEBIT' | 'CREDIT';
  description?: string;
}

export interface GLAccount extends GLAccountData {
  id: number;
  created_at: string;
  current_balance?: number;
}

export interface GLAccountAPI {
  getGLAccounts: (filters?: { type?: string; isActive?: boolean }) => Promise<{ success: boolean; data: GLAccount[]; message?: string }>;
  getGLAccount: (id: number) => Promise<{ success: boolean; data?: GLAccount; message?: string }>;
  createGLAccount: (data: GLAccountData, userId: number) => Promise<{ success: boolean; data?: GLAccount; message?: string }>;
  updateGLAccount: (id: number, data: Partial<GLAccountData>, userId: number) => Promise<{ success: boolean; data?: GLAccount; message?: string }>;
  deleteGLAccount: (id: number, userId: number) => Promise<{ success: boolean; message: string }>;
}
