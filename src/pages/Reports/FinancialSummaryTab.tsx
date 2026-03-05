import { formatCurrencyFromCents } from '../../utils/format'

import { type FinancialSummary } from './types'

interface FinancialSummaryTabProps {
    readonly financialSummary: FinancialSummary | null
}

export function FinancialSummaryTab({ financialSummary }: FinancialSummaryTabProps) {
    return (
        <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase mb-8">Fiscal Summary Diagnostic</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="p-8 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl shadow-inner group transition-all hover:bg-emerald-500/10">
                    <p className="text-[10px] font-bold uppercase text-emerald-500/60 tracking-widest mb-2">Aggregate Income</p>
                    <p className="text-xl md:text-3xl font-bold text-emerald-500 tracking-tight">{formatCurrencyFromCents(financialSummary?.totalIncome || 0)}</p>
                </div>
                <div className="p-8 bg-rose-500/5 border border-rose-500/10 rounded-2xl shadow-inner group transition-all hover:bg-rose-500/10">
                    <p className="text-[10px] font-bold uppercase text-rose-500/60 tracking-widest mb-2">Aggregate Expenditure</p>
                    <p className="text-xl md:text-3xl font-bold text-rose-500 tracking-tight">{formatCurrencyFromCents(financialSummary?.totalExpense || 0)}</p>
                </div>
                <div className="p-8 bg-primary/5 border border-primary/10 rounded-2xl shadow-inner group transition-all hover:bg-primary/10">
                    <p className="text-[10px] font-bold uppercase text-primary/60 tracking-widest mb-2">Net Institutional Liquidity</p>
                    <p className="text-xl md:text-3xl font-bold text-primary tracking-tight">{formatCurrencyFromCents(financialSummary?.netBalance || 0)}</p>
                </div>
            </div>
        </div>
    )
}
