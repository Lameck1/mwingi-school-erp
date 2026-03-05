import { Loader2, MessageSquare } from 'lucide-react'

import { formatCurrencyFromCents } from '../../utils/format'

import { type Defaulter } from './types'

interface DefaultersTabProps {
    readonly defaulters: Defaulter[]
    readonly sendingBulk: boolean
    readonly onSendReminder: (student: Defaulter) => void
    readonly onBulkReminders: () => void
}

export function DefaultersTab({ defaulters, sendingBulk, onSendReminder, onBulkReminders }: DefaultersTabProps) {
    return (
        <div className="premium-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h3 className="text-xl font-bold text-foreground font-heading tracking-tight uppercase">Defaulter Diagnostics</h3>
                    <p className="text-xs text-foreground/40 font-medium italic mt-1 leading-relaxed">System-identified accounts with outstanding balances exceeding threshold</p>
                </div>
                <button
                    onClick={onBulkReminders}
                    disabled={sendingBulk || defaulters.length === 0}
                    className="btn btn-primary flex items-center gap-2 px-8 h-12 shadow-2xl shadow-primary/20 disabled:opacity-50"
                >
                    {sendingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    <span className="text-xs font-bold uppercase tracking-widest">{sendingBulk ? 'Relaying...' : 'Bulk SMS Relay'}</span>
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/20">
                            <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Adm No</th>
                            <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Student Identity</th>
                            <th className="text-left py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Level</th>
                            <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Billed</th>
                            <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Remitted</th>
                            <th className="text-right py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Outstanding</th>
                            <th className="text-center py-4 px-2 text-[10px] font-bold uppercase text-foreground/40 tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {defaulters.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-20 text-foreground/20 italic font-medium">No institutional defaulters detected.</td></tr>
                        ) : (
                            defaulters.map((d) => (
                                <tr key={d.id} className="border-b border-border/10 hover:bg-secondary/5 transition-colors group">
                                    <td className="py-4 px-2 font-mono text-xs text-foreground/60">{d.admission_number}</td>
                                    <td className="py-4 px-2 text-sm font-bold text-foreground uppercase tracking-tight">{d.first_name} {d.last_name}</td>
                                    <td className="py-4 px-2 text-[10px] font-bold text-foreground/40 uppercase">{d.stream_name || 'UNASSIGNED'}</td>
                                    <td className="py-4 px-2 text-right text-xs font-medium text-foreground/60">{formatCurrencyFromCents(d.total_amount)}</td>
                                    <td className="py-4 px-2 text-right text-xs font-medium text-emerald-500/80">{formatCurrencyFromCents(d.amount_paid)}</td>
                                    <td className="py-4 px-2 text-right text-sm font-bold text-rose-500">{formatCurrencyFromCents(d.balance)}</td>
                                    <td className="py-4 px-2 text-center">
                                        <button
                                            onClick={() => onSendReminder(d)}
                                            className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all shadow-sm"
                                            title="Relay SMS Reminder"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
