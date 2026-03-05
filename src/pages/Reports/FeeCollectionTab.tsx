import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'

import { formatCurrencyFromCents } from '../../utils/format'

import { COLORS, COLOR_CLASSES } from './types'

interface FeeCollectionTabProps {
    readonly feeCollectionData: { month: string; amount: number }[]
    readonly paymentMethodData: { name: string; value: number }[]
}

export function FeeCollectionTab({ feeCollectionData, paymentMethodData }: FeeCollectionTabProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="premium-card group overflow-hidden">
                <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                    <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-emerald-500 opacity-60" />
                        <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Monthly Liquidity</h3>
                    </div>
                </div>
                <div className="p-4 md:p-8">
                    {feeCollectionData.length > 0 ? (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={feeCollectionData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                                        formatter={(v: number) => formatCurrencyFromCents(v)}
                                    />
                                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-foreground/20 border-2 border-dashed border-border/20 rounded-2xl">
                            <TrendingUp className="w-12 h-12 mb-4 opacity-10" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">No collection metrics available</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="premium-card group overflow-hidden">
                <div className="p-6 border-b border-border/40 flex items-center justify-between bg-secondary/5">
                    <div className="flex items-center gap-3">
                        <TrendingDown className="w-5 h-5 text-primary opacity-60" />
                        <h3 className="text-lg font-bold text-foreground font-heading tracking-tight uppercase">Payment Channels</h3>
                    </div>
                </div>
                <div className="p-4 md:p-8">
                    {paymentMethodData.length > 0 ? (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={paymentMethodData}
                                        innerRadius={60}
                                        outerRadius={100}
                                        dataKey="value"
                                        stroke="none"
                                        paddingAngle={5}
                                    >
                                        {paymentMethodData.map((entry) => (
                                            <Cell key={entry.name} fill={COLORS[paymentMethodData.indexOf(entry) % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-4 flex flex-wrap gap-4 justify-center">
                                {paymentMethodData.map((item, index) => (
                                    <div key={item.name} className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`} />
                                        <span className="text-[10px] font-bold uppercase text-foreground/60">{item.name} ({item.value}%)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-foreground/20 border-2 border-dashed border-border/20 rounded-2xl">
                            <Download className="w-12 h-12 mb-4 opacity-10" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">No channel metrics available</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
