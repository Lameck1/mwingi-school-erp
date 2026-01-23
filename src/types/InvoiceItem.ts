export interface InvoiceItem {
  id: number
  invoice_id: number
  fee_category_id: number
  amount: number
  description?: string
  category_name?: string
}