import { Printer } from 'lucide-react'
import React from 'react'

import { type Payment } from '../../../types/electron-api/FinanceAPI'
import { type Student } from '../../../types/electron-api/StudentAPI'
import { formatCurrencyFromCents, formatDate } from '../../../utils/format'
import { printDocument } from '../../../utils/print'

import type { SchoolSettings } from '../../../types/electron-api/SettingsAPI'

interface LedgerHistoryProps {
    payments: Payment[]
    student: Student | null
    schoolSettings: SchoolSettings | null
}

export const LedgerHistory: React.FC<LedgerHistoryProps> = ({ payments, student, schoolSettings }) => {

    const handlePrint = (payment: Payment) => {
        if (!payment || !student) {return}

        // Amount to words converter
        const amountToWords = (num: number): string => {
            const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
            const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

            if (num === 0) {return 'Zero'}
            if (num < 20) {return ones[num]}
            if (num < 100) {return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '')}
            if (num < 1000) {return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + amountToWords(num % 100) : '')}
            if (num < 1000000) {return amountToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + amountToWords(num % 1000) : '')}
            return amountToWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + amountToWords(num % 1000000) : '')
        }

        const receipt = {
            receiptNumber: payment.receipt_number,
            date: payment.created_at,
            amount: payment.amount,
            paymentMode: payment.payment_method,
            reference: payment.transaction_ref,
            description: 'Fee Payment', // Description might not be in Payment model shown in logs, using generic
            studentName: `${student.first_name} ${student.last_name}`,
            admissionNumber: student.admission_number,
            balance: student.balance, // This is CURRENT balance, not balance at time of payment. Accepted limitation for reprint.
            amountInWords: amountToWords(Math.floor(payment.amount / 100)) + ' Shillings Only'
        }

        printDocument({
            title: `Receipt - ${receipt.receiptNumber}`,
            template: 'receipt',
            data: receipt,
            schoolSettings: (schoolSettings || {}) as Record<string, unknown>
        })
    }

    if (payments.length === 0) {return null}

    return (
        <div className="card animate-slide-up">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-foreground">Recent Ledger Entries</h3>
                <div className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Showing last {payments.length} items</div>
            </div>

            <div className="space-y-3">
                {payments.map((p) => (
                    <div key={p.id} className="p-4 bg-secondary/20 hover:bg-secondary/40 border border-border/10 rounded-2xl flex justify-between items-center transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <Printer className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div>
                                <p className="font-bold text-foreground">{formatCurrencyFromCents(p.amount)}</p>
                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-tighter">{p.payment_method} • {p.receipt_number}</p>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                            <div className="hidden sm:block">
                                <p className="text-xs font-medium text-foreground/60">{formatDate(p.created_at)}</p>
                                <p className="text-[10px] text-foreground/40 italic">Ledger Posted</p>
                            </div>
                            <button
                                onClick={() => handlePrint(p)}
                                className="p-2 hover:bg-primary/20 rounded-lg text-foreground/40 hover:text-primary transition-all"
                                title="Re-print Receipt"
                            >
                                <Printer className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
