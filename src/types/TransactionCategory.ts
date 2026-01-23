export interface TransactionCategory {
  id: number
  category_name: string
  category_type: 'INCOME' | 'EXPENSE'
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}