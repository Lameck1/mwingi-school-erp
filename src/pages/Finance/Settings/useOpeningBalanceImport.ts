import type React from 'react'
import { useEffect, useState } from 'react'

import { useToast } from '../../../contexts/ToastContext'
import { useAuthStore, useAppStore } from '../../../stores'
import { shillingsToCents } from '../../../utils/format'

import { type ImportedBalance, parseCsvBalances, getResultMessage } from './openingBalanceImport.helpers'

const EMPTY_BALANCE: ImportedBalance = {
    type: 'STUDENT',
    identifier: '',
    name: '',
    amount: 0,
    debitCredit: 'DEBIT',
}

export function useOpeningBalanceImport() {
    const { showToast } = useToast()
    const user = useAuthStore((s) => s.user)
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)

    const [balances, setBalances] = useState<ImportedBalance[]>([])
    const [importing, setImporting] = useState(false)
    const [verified, setVerified] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [newBalance, setNewBalance] = useState<ImportedBalance>({ ...EMPTY_BALANCE })

    // ── Keyboard escape listener ───────────────────────────

    useEffect(() => {
        if (!showAddModal) { return }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowAddModal(false)
            }
        }

        globalThis.addEventListener('keydown', handleEscape)
        return () => globalThis.removeEventListener('keydown', handleEscape)
    }, [showAddModal])

    // ── Handlers ──────────────────────────────────────────────

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) { return }
        try {
            const text = await file.text()
            const { balances: parsed, error } = parseCsvBalances(text)
            if (error) {
                showToast(error, 'error')
                return
            }

            if (parsed.length === 0) {
                showToast('No valid rows found in CSV file', 'warning')
                return
            }

            setBalances(parsed)
            setVerified(false)
            showToast(`Loaded ${parsed.length} balance row(s)`, 'success')
        } catch (err) {
            console.error('CSV parse error:', err)
            showToast('Failed to parse CSV file. Ensure it is a valid CSV format.', 'error')
        } finally {
            event.target.value = ''
        }
    }

    const handleAddBalance = () => {
        if (!newBalance.identifier || !newBalance.name || newBalance.amount <= 0) {
            showToast('Please fill all fields', 'warning')
            return
        }

        setBalances((prev) => [...prev, { ...newBalance }])
        setNewBalance({ ...EMPTY_BALANCE })
        setShowAddModal(false)
        setVerified(false)
    }

    const handleRemoveBalance = (index: number) => {
        setBalances((prev) => prev.filter((_, i) => i !== index))
        setVerified(false)
    }

    const handleVerify = () => {
        if (balances.length === 0) {
            showToast('Add balances before verification', 'warning')
            return
        }

        const totalDebits = balances
            .filter((b) => b.debitCredit === 'DEBIT')
            .reduce((sum, b) => sum + b.amount, 0)

        const totalCredits = balances
            .filter((b) => b.debitCredit === 'CREDIT')
            .reduce((sum, b) => sum + b.amount, 0)

        if (Math.abs(totalDebits - totalCredits) < 0.01) {
            setVerified(true)
            showToast('Verification successful. Debits equal credits.', 'success')
        } else {
            setVerified(false)
            showToast(
                `Verification failed. Debits: Kes ${totalDebits.toFixed(2)}, Credits: Kes ${totalCredits.toFixed(2)}, Variance: Kes ${Math.abs(totalDebits - totalCredits).toFixed(2)}`,
                'error'
            )
        }
    }

    const handleImport = async () => {
        if (balances.length === 0) {
            showToast('Add balances before importing', 'warning')
            return
        }
        if (!verified) {
            showToast('Please verify balances before importing', 'warning')
            return
        }
        if (!user?.id) {
            showToast('You must be signed in to import opening balances', 'error')
            return
        }
        if (!currentAcademicYear?.id) {
            showToast('Select an active academic year before importing balances', 'error')
            return
        }

        setImporting(true)
        try {
            const studentBalances = balances
                .filter(b => b.type === 'STUDENT')
                .map(b => ({
                    student_id: Number(b.identifier),
                    admission_number: b.identifier,
                    student_name: b.name,
                    opening_balance: shillingsToCents(b.amount),
                    balance_type: b.debitCredit
                }))

            const invalidStudent = studentBalances.find(b => !Number.isFinite(b.student_id) || b.student_id <= 0)
            if (invalidStudent) {
                showToast('Student balances must include a valid numeric student ID in the identifier field.', 'error')
                return
            }

            const glBalances = balances
                .filter(b => b.type === 'GL_ACCOUNT')
                .map(b => ({
                    academic_year_id: currentAcademicYear.id,
                    gl_account_code: b.identifier,
                    debit_amount: b.debitCredit === 'DEBIT' ? shillingsToCents(b.amount) : 0,
                    credit_amount: b.debitCredit === 'CREDIT' ? shillingsToCents(b.amount) : 0,
                    description: `Opening balance for ${b.identifier}`,
                    imported_from: 'csv_import',
                    imported_by_user_id: user.id
                }))

            if (studentBalances.length > 0) {
                const studentImportResult = await globalThis.electronAPI.finance.importStudentOpeningBalances(
                    studentBalances,
                    currentAcademicYear.id,
                    'csv_import',
                    user.id
                )
                if (studentImportResult?.success !== true) {
                    throw new Error(getResultMessage(studentImportResult, 'Failed to import student opening balances'))
                }
            }
            if (glBalances.length > 0) {
                const glImportResult = await globalThis.electronAPI.finance.importGLOpeningBalances(glBalances, user.id)
                if (glImportResult?.success !== true) {
                    throw new Error(getResultMessage(glImportResult, 'Failed to import GL opening balances'))
                }
            }

            showToast('Opening balances imported successfully', 'success')
            setBalances([])
            setVerified(false)
        } catch (error) {
            console.error('Import failed:', error)
            showToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error')
        } finally {
            setImporting(false)
        }
    }

    // ── Derived ──────────────────────────────────────────────

    const totalDebits = balances
        .filter((b) => b.debitCredit === 'DEBIT')
        .reduce((sum, b) => sum + b.amount, 0)

    const totalCredits = balances
        .filter((b) => b.debitCredit === 'CREDIT')
        .reduce((sum, b) => sum + b.amount, 0)

    const variance = Math.abs(totalDebits - totalCredits)
    const isBalanced = variance < 0.01

    return {
        // Data
        balances,
        importing,
        verified,
        totalDebits,
        totalCredits,
        variance,
        isBalanced,

        // Add modal
        showAddModal,
        setShowAddModal,
        newBalance,
        setNewBalance,

        // Handlers
        handleFileUpload,
        handleAddBalance,
        handleRemoveBalance,
        handleVerify,
        handleImport,
    }
}
