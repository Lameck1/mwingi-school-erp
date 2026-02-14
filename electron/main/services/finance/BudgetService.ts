import { logAudit } from '../../database/utils/audit'
import { BaseService } from '../base/BaseService'

const BUDGET_NOT_FOUND_ERROR = 'Budget not found'

export interface Budget {
    id: number
    budget_name: string
    academic_year_id: number
    term_id: number | null
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CLOSED'
    total_amount: number
    notes: string | null
    created_by_user_id: number
    approved_by_user_id: number | null
    approved_at: string | null
    created_at: string
    updated_at: string
    // Computed
    academic_year_name?: string
    term_name?: string
    created_by_name?: string
    approved_by_name?: string
    line_items?: BudgetLineItem[]
    total_budgeted?: number
    total_actual?: number
    total_variance?: number
}

export interface BudgetLineItem {
    id: number
    budget_id: number
    category_id: number
    description: string
    budgeted_amount: number
    actual_amount: number
    variance: number
    notes: string | null
    category_name?: string
    category_type?: 'INCOME' | 'EXPENSE'
}

export interface BudgetFilters {
    academic_year_id?: number
    term_id?: number
    status?: Budget['status']
}

export interface CreateBudgetData {
    budget_name: string
    academic_year_id: number
    term_id?: number
    notes?: string
    line_items: CreateBudgetLineItemData[]
}

export interface CreateBudgetLineItemData {
    category_id: number
    description: string
    budgeted_amount: number
    notes?: string
}

export class BudgetService extends BaseService<Budget, CreateBudgetData, Partial<CreateBudgetData>, BudgetFilters> {
    protected getTableName(): string { return 'budget' }
    protected getPrimaryKey(): string { return 'id' }
    protected getTableAlias(): string { return 'b' }
    protected getTablePrefix(): string { return 'b.' }

    protected buildSelectQuery(): string {
        return `
      SELECT 
        b.*,
        COALESCE(b.status, 'DRAFT') as status,
        ay.year_name as academic_year_name,
        t.term_name,
        u1.full_name as created_by_name,
        u2.full_name as approved_by_name,
        COALESCE(SUM(bli.budgeted_amount), 0) as total_budgeted,
        COALESCE(SUM(bli.actual_amount), 0) as total_actual,
        COALESCE(SUM(bli.variance), 0) as total_variance
      FROM budget b
      LEFT JOIN academic_year ay ON b.academic_year_id = ay.id
      LEFT JOIN term t ON b.term_id = t.id
      LEFT JOIN user u1 ON b.created_by_user_id = u1.id
      LEFT JOIN user u2 ON b.approved_by_user_id = u2.id
      LEFT JOIN budget_line_item bli ON b.id = bli.budget_id
    `
    }

    protected getGroupBy(): string {
        return ' GROUP BY b.id'
    }

    protected mapRowToEntity(row: unknown): Budget {
        return row as Budget
    }

    protected validateCreate(data: CreateBudgetData): string[] | null {
        const errors: string[] = []

        if (!data.budget_name.trim()) {
            errors.push('Budget name is required')
        }
        if (!data.academic_year_id) {
            errors.push('Academic year is required')
        }
        if (!data.line_items.length) {
            errors.push('At least one budget line item is required')
        }

        data.line_items.forEach((item, index) => {
            if (!item.category_id) {
                errors.push(`Line item ${index + 1}: Category is required`)
            }
            if (!item.description.trim()) {
                errors.push(`Line item ${index + 1}: Description is required`)
            }
            if (item.budgeted_amount < 0) {
                errors.push(`Line item ${index + 1}: Amount must be positive`)
            }
        })

        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(id: number, _data: Partial<CreateBudgetData>): Promise<string[] | null> {
        const existing = await this.findById(id)
        if (!existing) {
            return [BUDGET_NOT_FOUND_ERROR]
        }

        if (existing.status === 'APPROVED' || existing.status === 'CLOSED') {
            return ['Cannot modify an approved or closed budget. Create a revision instead.']
        }

        return null
    }

    protected executeCreate(data: CreateBudgetData): { lastInsertRowid: number | bigint } {
        return this.executeCreateWithUser(data, 0)
    }

    private executeCreateWithUser(data: CreateBudgetData, userId: number): { lastInsertRowid: number | bigint } {
        const result = this.db.transaction(() => {
            const budgetResult = this.db.prepare(`
        INSERT INTO budget (budget_name, academic_year_id, term_id, notes, status, created_by_user_id)
        VALUES (?, ?, ?, ?, 'DRAFT', ?)
      `).run(
                data.budget_name,
                data.academic_year_id,
                data.term_id || null,
                data.notes || null,
                userId
            )

            const budgetId = budgetResult.lastInsertRowid as number

            const insertItem = this.db.prepare(`
        INSERT INTO budget_line_item (budget_id, category_id, description, budgeted_amount, notes)
        VALUES (?, ?, ?, ?, ?)
      `)

            let total = 0
            for (const item of data.line_items) {
                insertItem.run(
                    budgetId,
                    item.category_id,
                    item.description,
                    item.budgeted_amount,
                    item.notes || null
                )
                total += item.budgeted_amount
            }

            this.db.prepare('UPDATE budget SET total_amount = ? WHERE id = ?').run(total, budgetId)

            return budgetResult
        })()

        return result
    }

    protected executeUpdate(id: number, data: Partial<CreateBudgetData>): void {
        this.db.transaction(() => {
            if (data.budget_name || data.notes !== undefined) {
                this.db.prepare(`
          UPDATE budget 
          SET budget_name = COALESCE(?, budget_name),
              notes = COALESCE(?, notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.budget_name, data.notes, id)
            }

            if (data.line_items) {
                this.db.prepare('DELETE FROM budget_line_item WHERE budget_id = ?').run(id)

                const insertItem = this.db.prepare(`
          INSERT INTO budget_line_item (budget_id, category_id, description, budgeted_amount, notes)
          VALUES (?, ?, ?, ?, ?)
        `)

                let total = 0
                for (const item of data.line_items) {
                    insertItem.run(id, item.category_id, item.description, item.budgeted_amount, item.notes || null)
                    total += item.budgeted_amount
                }

                this.db.prepare('UPDATE budget SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(total, id)
            }
        })()
    }

    protected applyFilters(filters: BudgetFilters, conditions: string[], params: unknown[]): void {
        if (filters.academic_year_id) {
            conditions.push('b.academic_year_id = ?')
            params.push(filters.academic_year_id)
        }
        if (filters.term_id) {
            conditions.push('b.term_id = ?')
            params.push(filters.term_id)
        }
        if (filters.status) {
            conditions.push('b.status = ?')
            params.push(filters.status)
        }
        conditions.push('b.deleted_at IS NULL')
    }

    async getBudgetWithLineItems(budgetId: number): Promise<Budget | null> {
        const budget = await this.findById(budgetId)
        if (!budget) {return null}

        const lineItems = this.db.prepare(`
      SELECT bli.*, tc.category_name, tc.category_type
      FROM budget_line_item bli
      JOIN transaction_category tc ON bli.category_id = tc.id
      WHERE bli.budget_id = ?
      ORDER BY tc.category_type DESC, tc.category_name
    `).all(budgetId) as BudgetLineItem[]

        return { ...budget, line_items: lineItems }
    }

    async submitForApproval(budgetId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        const budget = await this.findById(budgetId)
        if (!budget) {return { success: false, errors: [BUDGET_NOT_FOUND_ERROR] }}
        if (budget.status !== 'DRAFT') {return { success: false, errors: ['Only draft budgets can be submitted'] }}

        this.db.prepare(`UPDATE budget SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(budgetId)
        logAudit(userId, 'SUBMIT', 'budget', budgetId, { status: 'DRAFT' }, { status: 'SUBMITTED' })
        return { success: true }
    }

    async approve(budgetId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        const budget = await this.findById(budgetId)
        if (!budget) {return { success: false, errors: [BUDGET_NOT_FOUND_ERROR] }}
        if (budget.status !== 'SUBMITTED') {return { success: false, errors: ['Only submitted budgets can be approved'] }}

        this.db.prepare(`
      UPDATE budget 
      SET status = 'APPROVED', 
          approved_by_user_id = ?, 
          approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(userId, budgetId)

        logAudit(userId, 'APPROVE', 'budget', budgetId, { status: 'SUBMITTED' }, { status: 'APPROVED' })
        return { success: true }
    }

    async create(data: CreateBudgetData, userId: number): Promise<{ success: boolean; id: number; errors?: string[] }> {
        const errors = this.validateCreate(data)
        if (errors) {
            return { success: false, id: 0, errors }
        }

        try {
            const result = this.executeCreateWithUser(data, userId)
            const id = result.lastInsertRowid as number
            logAudit(userId, 'CREATE', this.getTableName(), id, null, data)
            return { success: true, id }
        } catch (error) {
            return {
                success: false,
                id: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            }
        }
    }
}
