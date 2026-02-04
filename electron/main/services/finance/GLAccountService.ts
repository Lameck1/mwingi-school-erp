import { Database } from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

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
}

export class GLAccountService {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async getAll(filters?: { type?: string; isActive?: boolean }): Promise<{ success: boolean; data: (GLAccount & { current_balance: number })[]; message?: string }> {
    try {
      let query = `
        SELECT 
          g.*,
          COALESCE(
            SUM(
              CASE 
                WHEN g.normal_balance = 'DEBIT' THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
                ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
              END
            ), 0
          ) as current_balance
        FROM gl_account g
        LEFT JOIN journal_entry_line jel ON g.account_code = jel.gl_account_code
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (filters?.type) {
        query += ` AND g.account_type = ?`;
        params.push(filters.type);
      }

      if (filters?.isActive !== undefined) {
        query += ` AND g.is_active = ?`;
        params.push(filters.isActive ? 1 : 0);
      }

      query += ` GROUP BY g.id ORDER BY g.account_code ASC`;

      const accounts = this.db.prepare(query).all(...params) as (GLAccount & { current_balance: number })[];
      return { success: true, data: accounts };
    } catch (error) {
      console.error('Error fetching GL accounts:', error);
      return { success: false, data: [], message: (error as Error).message };
    }
  }

  async getById(id: number): Promise<{ success: boolean; data?: GLAccount; message?: string }> {
    try {
      const account = this.db.prepare(`SELECT * FROM gl_account WHERE id = ?`).get(id) as GLAccount;
      if (!account) {
        return { success: false, message: 'Account not found' };
      }
      return { success: true, data: account };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  async create(data: GLAccountData, userId: number): Promise<{ success: boolean; data?: GLAccount; message?: string }> {
    try {
      const result = this.db.prepare(`
        INSERT INTO gl_account (
          account_code, account_name, account_type, account_subtype,
          parent_account_id, is_system_account, is_active,
          requires_subsidiary, normal_balance, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.account_code,
        data.account_name,
        data.account_type,
        data.account_subtype || null,
        data.parent_account_id || null,
        data.is_system_account ? 1 : 0,
        data.is_active !== false ? 1 : 0, // Default to true
        data.requires_subsidiary ? 1 : 0,
        data.normal_balance,
        data.description || null
      );

      logAudit(userId, 'CREATE', 'gl_account', result.lastInsertRowid as number, null, data);

      const newAccount = await this.getById(result.lastInsertRowid as number);
      return { success: true, data: newAccount.data, message: 'Account created successfully' };
    } catch (error) {
      console.error('Error creating GL account:', error);
      return { success: false, message: (error as Error).message };
    }
  }

  async update(id: number, data: Partial<GLAccountData>, userId: number): Promise<{ success: boolean; data?: GLAccount; message?: string }> {
    try {
      const currentAccount = this.db.prepare(`SELECT * FROM gl_account WHERE id = ?`).get(id) as GLAccount;
      if (!currentAccount) {
        return { success: false, message: 'Account not found' };
      }

      // Don't allow changing system accounts critical fields if it is a system account
      if (currentAccount.is_system_account && (data.account_code !== undefined && data.account_code !== currentAccount.account_code)) {
         return { success: false, message: 'Cannot change account code of a system account' };
      }

      const fields: string[] = [];
      const params: unknown[] = [];

      if (data.account_code !== undefined) { fields.push('account_code = ?'); params.push(data.account_code); }
      if (data.account_name !== undefined) { fields.push('account_name = ?'); params.push(data.account_name); }
      if (data.account_type !== undefined) { fields.push('account_type = ?'); params.push(data.account_type); }
      if (data.account_subtype !== undefined) { fields.push('account_subtype = ?'); params.push(data.account_subtype); }
      if (data.parent_account_id !== undefined) { fields.push('parent_account_id = ?'); params.push(data.parent_account_id); }
      if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }
      if (data.requires_subsidiary !== undefined) { fields.push('requires_subsidiary = ?'); params.push(data.requires_subsidiary ? 1 : 0); }
      if (data.normal_balance !== undefined) { fields.push('normal_balance = ?'); params.push(data.normal_balance); }
      if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }

      if (fields.length === 0) {
        return { success: true, data: currentAccount, message: 'No changes provided' };
      }

      params.push(id);

      this.db.prepare(`UPDATE gl_account SET ${fields.join(', ')} WHERE id = ?`).run(...params);

      logAudit(userId, 'UPDATE', 'gl_account', id, currentAccount, data);

      const updatedAccount = await this.getById(id);
      return { success: true, data: updatedAccount.data, message: 'Account updated successfully' };
    } catch (error) {
      console.error('Error updating GL account:', error);
      return { success: false, message: (error as Error).message };
    }
  }

  async delete(id: number, userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const currentAccount = this.db.prepare(`SELECT * FROM gl_account WHERE id = ?`).get(id) as GLAccount;
      if (!currentAccount) {
        return { success: false, message: 'Account not found' };
      }

      if (currentAccount.is_system_account) {
        return { success: false, message: 'Cannot delete a system account' };
      }

      // Check for usage in journal entries
      const usage = this.db.prepare(`SELECT COUNT(*) as count FROM journal_entry_line WHERE gl_account_code = ?`).get(currentAccount.account_code) as { count: number };
      if (usage.count > 0) {
        // Soft delete (deactivate) instead
        this.db.prepare(`UPDATE gl_account SET is_active = 0 WHERE id = ?`).run(id);
        logAudit(userId, 'DEACTIVATE', 'gl_account', id, currentAccount, { is_active: false });
        return { success: true, message: 'Account has transactions. It has been deactivated instead of deleted.' };
      }

      this.db.prepare(`DELETE FROM gl_account WHERE id = ?`).run(id);
      logAudit(userId, 'DELETE', 'gl_account', id, currentAccount, null);

      return { success: true, message: 'Account deleted successfully' };
    } catch (error) {
      console.error('Error deleting GL account:', error);
      return { success: false, message: (error as Error).message };
    }
  }
}
