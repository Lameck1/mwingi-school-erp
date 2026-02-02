export interface Budget {
    id: number
    budget_name: string
    academic_year_id: number
    term_id: number | null
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CLOSED'
    total_amount: number
    total_budgeted: number
    total_actual: number
    total_variance: number
    notes: string | null
    created_by_user_id: number
    created_by_name: string
    approved_by_user_id: number | null
    approved_by_name: string | null
    approved_at: string | null
    created_at: string
    updated_at: string
}

export interface BudgetFilters {
    academic_year_id?: number
    term_id?: number
    status?: Budget['status']
}

export interface CreateBudgetLineItemData {
    category_id: number
    description: string
    budgeted_amount: number
    notes?: string
}

export interface CreateBudgetData {
    budget_name: string
    academic_year_id: number
    term_id?: number
    notes?: string
    line_items: CreateBudgetLineItemData[]
}

export interface BudgetAPI {
    getBudgets: (filters?: BudgetFilters) => Promise<Budget[]>
    getBudgetById: (id: number) => Promise<Budget | null>
    createBudget: (data: CreateBudgetData, userId: number) => Promise<{ success: boolean; id: number; errors?: string[] }>
    updateBudget: (id: number, data: Partial<CreateBudgetData>, userId: number) => Promise<{ success: boolean; errors?: string[] }>
    submitBudgetForApproval: (budgetId: number, userId: number) => Promise<{ success: boolean; errors?: string[] }>
    approveBudget: (budgetId: number, userId: number) => Promise<{ success: boolean; errors?: string[] }>
}
