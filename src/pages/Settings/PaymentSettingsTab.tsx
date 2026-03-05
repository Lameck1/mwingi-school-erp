import { CreditCard } from 'lucide-react'
import { type Dispatch, type SetStateAction } from 'react'

import { type SettingsFormData } from './useSettingsPage'

interface PaymentSettingsTabProps {
    formData: SettingsFormData
    setFormData: Dispatch<SetStateAction<SettingsFormData>>
}

export function PaymentSettingsTab({ formData, setFormData }: Readonly<PaymentSettingsTabProps>) {
    return (
        <div className="card animate-slide-up">
            <div className="flex items-center gap-3 mb-8 pb-3 border-b border-border/10">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground font-heading">Financial Gateways</h2>
            </div>

            <div className="space-y-8">
                <div className="space-y-3">
                    <label htmlFor="settings-mpesa-paybill" className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1">M-PESA Paybill Number</label>
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500/60 group-focus-within:text-emerald-500 transition-colors">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                        </div>
                        <input id="settings-mpesa-paybill" type="text" value={formData.mpesa_paybill}
                            onChange={(e) => setFormData(prev => ({ ...prev, mpesa_paybill: e.target.value }))}
                            className="input w-full pl-12" placeholder="e.g. 247247" />
                    </div>
                    <p className="text-[10px] text-foreground/30 font-medium ml-1 leading-relaxed">Official collection shortcode for M-PESA API automated reconciliation.</p>
                </div>

                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 border-dashed">
                    <h4 className="text-xs font-bold text-primary mb-2 uppercase tracking-widest">Upcoming Gateway Support</h4>
                    <div className="flex gap-4">
                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">Stripe</div>
                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">PayPal</div>
                        <div className="px-3 py-1 bg-secondary/40 rounded text-[9px] font-bold text-foreground/40 border border-border/20 opacity-50">Pesapal</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
