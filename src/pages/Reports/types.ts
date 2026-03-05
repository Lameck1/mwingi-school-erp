import { type ElementType } from 'react'

export const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']
export const COLOR_CLASSES = ['bg-primary', 'bg-emerald-600', 'bg-amber-600', 'bg-red-600', 'bg-violet-600']

export type TabId = 'fee-collection' | 'defaulters' | 'daily-collection' | 'students' | 'financial' | 'scheduled'

export interface TabDef {
    id: TabId
    label: string
    icon: ElementType
}

export interface StudentStats {
    totalStudents: number
    dayScholars: number
    boarders: number
}

export interface FinancialSummary {
    totalIncome: number
    totalExpense: number
    netBalance: number
}

export function isFinancialSummary(value: unknown): value is FinancialSummary {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const candidate = value as Partial<FinancialSummary>
    return (
        typeof candidate.totalIncome === 'number' &&
        typeof candidate.totalExpense === 'number' &&
        typeof candidate.netBalance === 'number'
    )
}

export interface Defaulter {
    id: number | string
    admission_number: string
    first_name: string
    last_name: string
    stream_name?: string
    total_amount: number
    amount_paid: number
    balance: number
    guardian_phone?: string
}

export interface DailyCollectionItem {
    admission_number: string
    student_name: string
    stream_name?: string
    amount: number
    payment_method: string
    payment_reference?: string
    date?: string
}

export interface DateRange {
    start: string
    end: string
}
