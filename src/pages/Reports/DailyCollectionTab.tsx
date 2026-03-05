import { Calendar, Printer } from 'lucide-react'

import { formatCurrencyFromCents } from '../../utils/format'
import { printCurrentView } from '../../utils/print'

import { type DailyCollectionItem } from './types'

interface DailyCollectionTabProps {
    readonly dailyCollections: DailyCollectionItem[]
    readonly selectedDate: string
    readonly onDateChange: (date: string) => void
}

export function DailyCollectionTab({ dailyCollections, selectedDate, onDateChange }: DailyCollectionTabProps) {
    return (
        <div id="daily-collection-print-area" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="premium-card flex flex-col md:flex-row md:items-center justify-between gap-4 border-primary/20 bg-primary/5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                        <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                        <label htmlFor="audit-date" className="text-[10px] font-bold uppercase text-foreground/40 tracking-widest block">Audit Date</label>
                        <input
                            id="audit-date"
                            type="date"
                            value={selectedDate}
                            onChange={(e) => onDateChange(e.target.value)}
                            className="bg-transparent border-none p-0 text-xl font-bold text-foreground focus:ring-0 cursor-pointer"
                        />
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => printCurrentView({
                            title: `Daily Collection Report - ${selectedDate}`,
                            selector: '#daily-collection-print-area',
                        })}
                        className="btn btn-secondary flex items-center gap-2 px-6"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Print DCR</span>
                    </button>
                </div>
            </div>

            <div className="premium-card overflow-hidden p-0 border-border/20">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-secondary/5 border-b border-border/20">
                                <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Audit Time</th>
                                <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Student Information</th>
                                <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Channel</th>
                                <th className="text-left py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Audit Ref</th>
                                <th className="text-right py-5 px-6 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyCollections.length > 0 ? (
                                dailyCollections.map((col) => {
                                    const rowKey = col.payment_reference || `${col.admission_number}-${col.amount}-${col.date ?? selectedDate}-${col.payment_method}`
                                    return (
                                        <tr key={rowKey} className="border-b border-border/10 hover:bg-secondary/5 transition-colors">
                                            <td className="py-5 px-6 text-xs font-mono text-foreground/60">08:00 AM+</td>
                                            <td className="py-5 px-6">
                                                <div className="text-sm font-bold text-foreground uppercase tracking-tight">{col.student_name}</div>
                                                <div className="text-[10px] font-medium text-foreground/40">Audit Verified</div>
                                            </td>
                                            <td className="py-5 px-6">
                                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 uppercase tracking-tighter">
                                                    {col.payment_method}
                                                </span>
                                            </td>
                                            <td className="py-5 px-6 text-xs font-mono text-foreground/40">{col.payment_reference || 'INTERNAL_REF'}</td>
                                            <td className="py-5 px-6 text-right text-sm font-bold text-primary">{formatCurrencyFromCents(col.amount)}</td>
                                        </tr>
                                    )
                                })
                            ) : (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <div className="text-foreground/20 italic text-sm font-medium">No institutional collections recorded for the selected audit date.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {dailyCollections.length > 0 && (
                            <tfoot>
                                <tr className="bg-primary/5 border-t border-primary/20">
                                    <td colSpan={4} className="py-5 px-6 text-sm font-bold text-foreground text-right uppercase tracking-[0.2em]">Daily Audit Aggregate:</td>
                                    <td className="py-5 px-6 text-right text-xl font-bold text-primary">
                                        {formatCurrencyFromCents(dailyCollections.reduce((sum, c) => sum + c.amount, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    )
}
