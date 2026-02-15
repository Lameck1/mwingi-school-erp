import { CreditCard, Check, Printer, MessageSquare, Loader2 } from 'lucide-react'
import React, { useState, useEffect } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore, useAppStore } from '../../../stores'
import { type Student } from '../../../types/electron-api/StudentAPI'
import { shillingsToCents, formatCurrencyFromCents } from '../../../utils/format'
import { printDocument } from '../../../utils/print'

import type { SchoolSettings } from '../../../types/electron-api/SettingsAPI'

export interface PaymentSuccess {
    success: boolean
    transactionRef?: string
    receipt_number?: string
    receiptNumber?: string // Alias for compatibility
    amount: number
    payment_method: string
    payment_reference: string
    description: string
    date: string
}

interface PaymentEntryFormProps {
    selectedStudent: Student | null
    onPaymentComplete: (newBalance: number) => void
    schoolSettings: SchoolSettings | null // Passed from parent or store
}

export const PaymentEntryForm: React.FC<PaymentEntryFormProps> = ({ selectedStudent, onPaymentComplete, schoolSettings }) => {
    const { user } = useAuthStore()
    const { currentTerm } = useAppStore()
    const { showToast } = useToast()

    const [formData, setFormData] = useState({
        amount: '',
        payment_method: 'CASH',
        payment_reference: '',
        transaction_date: new Date().toISOString().slice(0, 10),
        description: '',
    })
    const [useCredit, setUseCredit] = useState(false)
    const [saving, setSaving] = useState(false)
    const [sendingSms, setSendingSms] = useState(false)
    const [success, setSuccess] = useState<PaymentSuccess | null>(null)
    const [previousBalance, setPreviousBalance] = useState<number | null>(null)

    // Reset success and form when student changes
    useEffect(() => {
        setSuccess(null)
        setPreviousBalance(null)
        setFormData({
            amount: '', payment_method: 'CASH', payment_reference: '',
            transaction_date: new Date().toISOString().slice(0, 10), description: ''
        })
        setUseCredit(false)
    }, [selectedStudent])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedStudent || !formData.amount) {return}
        if (!user?.id) {
            showToast('You must be signed in to record payments', 'error')
            return
        }

        setSaving(true)
        setSuccess(null)
        
        // Store previous balance for rollback
        setPreviousBalance(selectedStudent.balance || 0)

        try {
            const amount = shillingsToCents(formData.amount)

            let resultData: PaymentSuccess;

            if (useCredit) {
                const invoices = await globalThis.electronAPI.getInvoicesByStudent(selectedStudent.id)
                const pending = invoices.find(inv => inv.balance > 0)

                if (!pending) {
                    showToast('No pending invoices to pay', 'error')
                    setSaving(false)
                    return
                }

                if (amount > (selectedStudent.credit_balance || 0)) {
                    showToast('Insufficient credit balance', 'error')
                    setSaving(false)
                    return
                }

                const result = await globalThis.electronAPI.payWithCredit({
                    studentId: selectedStudent.id,
                    invoiceId: pending.id,
                    amount  // Send cents, not shillings
                })

                if (!result.success) {throw new Error(result.error || result.message || 'Credit payment failed')}

                resultData = {
                    success: true,
                    amount,  // Store in cents for consistency
                    payment_method: 'CREDIT',
                    payment_reference: 'CREDIT_BALANCE',
                    description: 'Payment via Credit',
                    date: new Date().toISOString(),
                    receiptNumber: 'N/A'
                }
            } else {
                const result = await globalThis.electronAPI.recordPayment({
                    student_id: selectedStudent.id,
                    amount,
                    payment_method: formData.payment_method,
                    payment_reference: formData.payment_reference,
                    transaction_date: formData.transaction_date,
                    description: formData.description,
                    term_id: currentTerm?.id || 0,
                    idempotency_key: crypto.randomUUID()
                })

                if (!result.success) {throw new Error(result.errors?.[0] || result.error || 'Payment failed')}

                resultData = {
                    ...result,
                    receiptNumber: result.receipt_number,
                    amount,
                    payment_method: formData.payment_method,
                    payment_reference: formData.payment_reference,
                    description: formData.description,
                    date: formData.transaction_date
                }
            }

            setSuccess(resultData)

            // Calculate new balance for parent update
            const newBalance = (selectedStudent.balance || 0) - amount
            onPaymentComplete(newBalance)
            
            // Clear previous balance after successful update
            setPreviousBalance(null)

            // Clear form
            setFormData({
                amount: '', payment_method: 'CASH', payment_reference: '',
                transaction_date: new Date().toISOString().slice(0, 10), description: ''
            })

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Payment failed'
            showToast(errorMessage, 'error')
            
            // Rollback optimistic update on error
            if (previousBalance !== null && selectedStudent) {
                onPaymentComplete(previousBalance)
                setPreviousBalance(null)
            }
        } finally {
            setSaving(false)
        }
    }

    const handlePrint = () => {
        if (!success || !selectedStudent) {return}

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
            receiptNumber: success.receiptNumber || 'N/A',
            date: success.date,
            amount: success.amount,
            paymentMode: success.payment_method || 'CASH',
            reference: success.payment_reference,
            description: success.description,
            studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
            admissionNumber: selectedStudent.admission_number,
            balance: (selectedStudent.balance || 0) - success.amount, // Use post-payment balance
            amountInWords: amountToWords(Math.floor(success.amount / 100)) + ' Shillings Only'
        }

        printDocument({
            title: `Receipt - ${receipt.receiptNumber}`,
            template: 'receipt',
            data: receipt,
            schoolSettings: (schoolSettings || {}) as Record<string, unknown>
        })
    }

    const handleSendSms = async () => {
        if (!success || !selectedStudent?.guardian_phone) {
            alert('Guardian phone number missing')
            return
        }

        setSendingSms(true)
        try {
            const message = `Payment Received: ${selectedStudent.first_name} ${selectedStudent.last_name}. Amount: ${formatCurrencyFromCents(success.amount)}. Receipt: ${success.receiptNumber}. Bal: ${formatCurrencyFromCents(selectedStudent.balance || 0)}. Thank you.`

            const result = await globalThis.electronAPI.sendSMS({
                to: selectedStudent.guardian_phone,
                message,
                recipientId: selectedStudent.id,
                recipientType: 'STUDENT',
                userId: user?.id ?? 0
            })

            if (result.success) {
                alert('SMS receipt sent successfully!')
            } else {
                alert('Failed to send SMS: ' + result.error)
            }
        } catch {
            alert('Error sending SMS')
        } finally {
            setSendingSms(false)
        }
    }

    return (
        <div className="card min-h-[500px]">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                        <CreditCard className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">Transaction Details</h2>
                </div>
                {selectedStudent && <div className="text-[10px] bg-primary/20 text-primary px-3 py-1 rounded-full font-bold uppercase tracking-tighter">SECURE CHANNEL ACTIVE</div>}
            </div>

            {success && (
                <div className="mb-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl animate-slide-up">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 text-emerald-400 mb-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Check className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-lg">Transaction Confirmed</span>
                        </div>
                        <p className="text-xs font-mono text-emerald-400/60 uppercase tracking-widest">#{success.receiptNumber}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handlePrint}
                            className="btn btn-secondary flex items-center gap-2 py-2 px-6 text-sm"
                        >
                            <Printer className="w-4 h-4" />
                            Print Official Receipt
                        </button>
                        <button
                            onClick={handleSendSms}
                            disabled={sendingSms}
                            className="btn btn-primary flex items-center gap-2 py-2 px-6 text-sm"
                        >
                            {sendingSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                            Dispatch SMS Confirmation
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="label" htmlFor="payment-amount">Amount Payable (KES)</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 font-bold">KSh</div>
                            <input
                                id="payment-amount"
                                type="number"
                                value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                className="input pl-14 text-xl font-bold border-border/20 focus:border-primary/50"
                                required
                                placeholder="0.00"
                                min="1"
                                disabled={!selectedStudent}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="label" htmlFor="payment-date">Value Date</label>
                        <input
                            id="payment-date"
                            type="date"
                            value={formData.transaction_date}
                            onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                            className="input border-border/20"
                            required
                            disabled={!selectedStudent}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="label" htmlFor="payment-method">Payment Instrument</label>
                        <select
                            id="payment-method"
                            value={formData.payment_method}
                            onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                            className="input border-border/20"
                            disabled={!selectedStudent || useCredit}
                        >
                            <option value="CASH">Liquid Cash</option>
                            <option value="MPESA">M-PESA / Mobile Money</option>
                            <option value="BANK_TRANSFER">Direct EFT/Transfer</option>
                            <option value="CHEQUE">Banker's Cheque</option>
                        </select>
                        {(selectedStudent?.credit_balance || 0) > 0 && (
                            <label className="flex items-center gap-2 mt-2 text-sm font-medium text-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useCredit}
                                    onChange={e => setUseCredit(e.target.checked)}
                                    className="checkbox checkbox-primary w-4 h-4 rounded"
                                />
                                <span>Use Credit ({formatCurrencyFromCents(selectedStudent?.credit_balance || 0)})</span>
                            </label>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="label" htmlFor="payment-reference">Reference / Slip Number</label>
                        <input
                            id="payment-reference"
                            type="text"
                            value={formData.payment_reference}
                            onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
                            className="input border-border/20"
                            disabled={!selectedStudent}
                            placeholder="e.g., M-PESA Code"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="label" htmlFor="payment-description">Transaction Narrative</label>
                    <textarea
                        id="payment-description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="input border-border/20 min-h-[100px]"
                        rows={3}
                        disabled={!selectedStudent}
                        placeholder="Optional notes for this payment..."
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving || !selectedStudent}
                    className="w-full btn btn-primary py-5 rounded-2xl flex items-center justify-center gap-3 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 disabled:hover:translate-y-0"
                >
                    {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
                    <span>{saving ? 'Processing Ledger...' : 'Finalize Payment'}</span>
                </button>
            </form>
        </div>
    )
}
