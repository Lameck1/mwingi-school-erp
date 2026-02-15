import { Printer, XCircle } from 'lucide-react'
import React, { useState } from 'react'

import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore } from '../../../stores'
import { type Payment } from '../../../types/electron-api/FinanceAPI'
import { type Student } from '../../../types/electron-api/StudentAPI'
import { formatCurrencyFromCents, formatDate } from '../../../utils/format'
import { printDocument } from '../../../utils/print'

import type { SchoolSettings } from '../../../types/electron-api/SettingsAPI'

interface LedgerHistoryProps {
    payments: Payment[]
    student: Student | null
    schoolSettings: SchoolSettings | null
    onPaymentVoided?: () => void
}

export const LedgerHistory: React.FC<LedgerHistoryProps> = ({ payments, student, schoolSettings, onPaymentVoided }) => {
    const { showToast } = useToast()
    const { user } = useAuthStore()
    const [voidingId, setVoidingId] = useState<number | null>(null)
    const [voidReason, setVoidReason] = useState('')
    const [voidModalPayment, setVoidModalPayment] = useState<Payment | null>(null)

    const handleVoidRequest = (payment: Payment) => {
        setVoidModalPayment(payment)
        setVoidReason('')
    }

    const handleVoidConfirm = async () => {
        if (!voidModalPayment || !voidReason.trim() || !user?.id) {return}

        setVoidingId(voidModalPayment.id)
        try {
            const result = await globalThis.electronAPI.voidPayment(
                voidModalPayment.id,
                voidReason.trim(),
                user.id
            )
            if (result.success) {
                showToast('Payment voided successfully', 'success')
                setVoidModalPayment(null)
                onPaymentVoided?.()
            } else {
                showToast(result.error || result.message || 'Failed to void payment', 'error')
            }
        } catch (error) {
            console.error('Payment void error:', error)
            showToast('Failed to void payment', 'error')
        } finally {
            setVoidingId(null)
        }
    }

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
                            <button
                                onClick={() => handleVoidRequest(p)}
                                className="p-2 hover:bg-destructive/20 rounded-lg text-foreground/40 hover:text-destructive transition-all"
                                title="Void Payment"
                                disabled={voidingId === p.id}
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Void Payment Confirmation Modal */}
            <Modal isOpen={!!voidModalPayment} onClose={() => setVoidModalPayment(null)} title="Void Payment" size="sm">
                {voidModalPayment && (
                    <>
                        <p className="text-sm text-foreground/60 mb-4">
                            You are about to void payment <span className="font-bold">{voidModalPayment.receipt_number}</span> for{' '}
                            <span className="font-bold">{formatCurrencyFromCents(voidModalPayment.amount)}</span>.
                            This action will reverse the payment and update the student&apos;s balance.
                        </p>
                        <label htmlFor="void-reason" className="text-xs font-bold text-foreground/40 uppercase tracking-widest mb-1 block">
                            Reason for voiding <span className="text-destructive">*</span>
                        </label>
                        <textarea
                            id="void-reason"
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            placeholder="Enter the reason for voiding this payment..."
                            className="input w-full h-24 resize-none mb-4"
                            required
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setVoidModalPayment(null)}
                                className="btn btn-secondary px-6 py-2 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleVoidConfirm}
                                disabled={!voidReason.trim() || voidingId !== null}
                                className="btn bg-destructive text-white hover:bg-destructive/90 px-6 py-2 text-sm font-bold disabled:opacity-50"
                            >
                                {voidingId ? 'Voiding...' : 'Confirm Void'}
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    )
}
