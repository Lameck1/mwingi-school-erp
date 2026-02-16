import { Upload, ArrowRightLeft, CreditCard } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { parseStatementCSV, validateMatchSelection } from './reconcile.logic'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../contexts/ToastContext'
import { type BankAccount, type BankStatement, type BankStatementLine, type UnmatchedTransaction } from '../../../types/electron-api/BankReconciliationAPI'
import { formatCurrencyFromCents, shillingsToCents } from '../../../utils/format'

const IMPORT_FILE_ERROR = 'Select a CSV file to import'

export default function ReconcileAccount() {
    const { showToast } = useToast()

    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [selectedAccount, setSelectedAccount] = useState<number | null>(null)
    const [statements, setStatements] = useState<BankStatement[]>([])
    const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null)
    const [lines, setLines] = useState<BankStatementLine[]>([])
    const [unmatchedTransactions, setUnmatchedTransactions] = useState<UnmatchedTransaction[]>([])

    const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
    const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null)
    const [matching, setMatching] = useState(false)

    const [showImportModal, setShowImportModal] = useState(false)
    const [importFile, setImportFile] = useState<File | null>(null)
    const [importStatementDate, setImportStatementDate] = useState('')
    const [importOpeningBalance, setImportOpeningBalance] = useState('')
    const [importClosingBalance, setImportClosingBalance] = useState('')
    const [importReference, setImportReference] = useState('')
    const [importErrors, setImportErrors] = useState<string[]>([])
    const [importing, setImporting] = useState(false)

    const loadAccounts = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getAccounts()
            setAccounts(data)
            if (data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0].id)
            }
        } catch (error) {
            console.error('Failed to load accounts', error)
            showToast('Failed to load bank accounts', 'error')
        }
    }, [selectedAccount, showToast])

    const loadStatements = useCallback(async (accountId: number) => {
        try {
            const data = await globalThis.electronAPI.getStatements(accountId)
            setStatements(data)
            setSelectedStatement((current) => {
                if (!current) {
                    return data[0] || null
                }
                return data.find((statement) => statement.id === current.id) || data[0] || null
            })
        } catch (error) {
            console.error('Failed to load statements', error)
            showToast('Failed to load statements', 'error')
        }
    }, [showToast])

    const loadStatementDetails = useCallback(async (statementId: number) => {
        try {
            const result = await globalThis.electronAPI.getStatementWithLines(statementId)
            if (result) {
                setLines(result.lines)
            }
        } catch (error) {
            console.error('Failed to load statement lines', error)
            showToast('Failed to load statement details', 'error')
        }
    }, [showToast])

    const loadUnmatchedTransactions = useCallback(async () => {
        if (!selectedStatement) {return}
        try {
            const start = new Date(selectedStatement.statement_date)
            start.setDate(1)
            const end = new Date(start)
            end.setMonth(end.getMonth() + 1)
            end.setDate(0)

            const data = await globalThis.electronAPI.getUnmatchedTransactions(
                start.toISOString().slice(0, 10),
                end.toISOString().slice(0, 10),
                selectedAccount || undefined
            )
            setUnmatchedTransactions(data)
        } catch (error) {
            console.error('Failed to load ledger transactions', error)
            showToast('Failed to load unmatched ledger entries', 'error')
        }
    }, [selectedAccount, selectedStatement, showToast])

    const refreshSelectedStatement = useCallback(async () => {
        if (!selectedStatement) {
            return
        }
        await Promise.all([
            loadStatementDetails(selectedStatement.id),
            loadUnmatchedTransactions()
        ])
    }, [loadStatementDetails, loadUnmatchedTransactions, selectedStatement])

    useEffect(() => {
        void loadAccounts()
    }, [loadAccounts])

    useEffect(() => {
        setSelectedStatement(null)
        setLines([])
        setSelectedLineId(null)
        if (selectedAccount) {
            void loadStatements(selectedAccount)
        }
    }, [selectedAccount, loadStatements])

    useEffect(() => {
        setSelectedLineId(null)
        setSelectedTransactionId(null)
        if (selectedStatement) {
            void refreshSelectedStatement()
        }
    }, [refreshSelectedStatement, selectedStatement])

    const resetImportState = () => {
        setImportFile(null)
        setImportStatementDate('')
        setImportOpeningBalance('')
        setImportClosingBalance('')
        setImportReference('')
        setImportErrors([])
        setImporting(false)
    }

    const openImportModal = () => {
        if (!selectedAccount) {
            showToast('Select a bank account before importing a statement', 'error')
            return
        }
        resetImportState()
        setShowImportModal(true)
    }

    const closeImportModal = () => {
        if (importing) {
            return
        }
        setShowImportModal(false)
        resetImportState()
    }

    const handleCSVImport = async () => {
        if (!selectedAccount) {
            setImportErrors(['Select a bank account before importing'])
            return
        }
        if (!importFile) {
            setImportErrors([IMPORT_FILE_ERROR])
            return
        }
        if (!importStatementDate) {
            setImportErrors(['Statement date is required'])
            return
        }
        if (!importOpeningBalance.trim() || !importClosingBalance.trim()) {
            setImportErrors(['Opening and closing balances are required'])
            return
        }

        const openingBalanceCents = shillingsToCents(Number.parseFloat(importOpeningBalance))
        const closingBalanceCents = shillingsToCents(Number.parseFloat(importClosingBalance))
        if (!Number.isFinite(openingBalanceCents) || !Number.isFinite(closingBalanceCents)) {
            setImportErrors(['Opening and closing balances must be valid numbers'])
            return
        }

        setImporting(true)
        try {
            const csv = await importFile.text()
            const parsed = parseStatementCSV(csv)
            if (parsed.errors.length > 0) {
                setImportErrors(parsed.errors.slice(0, 20))
                return
            }
            if (parsed.lines.length === 0) {
                setImportErrors(['CSV did not contain valid statement lines'])
                return
            }

            const statementResult = await globalThis.electronAPI.createStatement(
                selectedAccount,
                importStatementDate,
                openingBalanceCents,
                closingBalanceCents,
                importReference.trim() || undefined
            )
            if (!statementResult.success || !statementResult.id) {
                setImportErrors(statementResult.errors || ['Failed to create bank statement'])
                return
            }

            for (const line of parsed.lines) {
                const lineResult = await globalThis.electronAPI.addStatementLine(statementResult.id, line)
                if (!lineResult.success) {
                    throw new Error((lineResult.errors && lineResult.errors[0]) || 'Failed to import statement line')
                }
            }

            await loadStatements(selectedAccount)
            const updatedStatements = await globalThis.electronAPI.getStatements(selectedAccount)
            const importedStatement = updatedStatements.find((statement) => statement.id === statementResult.id) || null
            setSelectedStatement(importedStatement)
            showToast(`Imported ${parsed.lines.length} statement lines`, 'success')
            closeImportModal()
        } catch (error) {
            console.error('Statement import error', error)
            setImportErrors([error instanceof Error ? error.message : 'Statement import failed'])
        } finally {
            setImporting(false)
        }
    }

    const handleMatch = async () => {
        const selectedLine = lines.find((line) => line.id === selectedLineId) || null
        const selectedTransaction = unmatchedTransactions.find((transaction) => transaction.id === selectedTransactionId) || null
        const validation = validateMatchSelection(selectedLine, selectedTransaction, selectedAccount)
        if (!validation.canMatch) {
            showToast(validation.reason || 'Cannot match selected entries', 'error')
            return
        }

        setMatching(true)
        try {
            const result = await globalThis.electronAPI.matchTransaction(selectedLine!.id, selectedTransaction!.id)
            if (!result.success) {
                showToast(result.error || 'Failed to match transactions', 'error')
                return
            }

            setSelectedLineId(null)
            setSelectedTransactionId(null)
            await refreshSelectedStatement()
            showToast('Statement line matched successfully', 'success')
        } catch (error) {
            console.error('Match error', error)
            showToast('Failed to match transactions', 'error')
        } finally {
            setMatching(false)
        }
    }

    const unmatchedLines = lines.filter((line) => !line.is_matched)

    return (
        <div className="space-y-8 pb-10 h-full flex flex-col">
            <PageHeader
                title="Bank Reconciliation"
                subtitle="Match bank statement lines with ledger entries"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Reconciliation' }]}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                    <label htmlFor="field-107" className="label">Bank Account</label>
                    <select
                        id="field-107"
                        value={selectedAccount || ''}
                        onChange={(event) => setSelectedAccount(Number(event.target.value))}
                        className="input"
                    >
                        {accounts.map((account) => (
                            <option key={account.id} value={account.id}>{account.account_name} ({account.bank_name})</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="field-119" className="label">Statement Period</label>
                    <select
                        id="field-119"
                        value={selectedStatement?.id || ''}
                        onChange={(event) => {
                            const statement = statements.find((item) => item.id === Number(event.target.value))
                            setSelectedStatement(statement || null)
                        }}
                        className="input"
                    >
                        <option value="">Select Statement</option>
                        {statements.map((statement) => (
                            <option key={statement.id} value={statement.id}>
                                {new Date(statement.statement_date).toLocaleDateString()} - {statement.status}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-end">
                    <button
                        type="button"
                        className="btn btn-secondary w-full flex items-center justify-center gap-2"
                        onClick={openImportModal}
                    >
                        <Upload className="w-4 h-4" />
                        Import Statement (CSV)
                    </button>
                </div>
                <div className="flex items-end">
                    <button
                        type="button"
                        className="btn btn-primary w-full"
                        onClick={() => { void handleMatch() }}
                        disabled={matching || !selectedLineId || !selectedTransactionId}
                    >
                        {matching ? 'Matching...' : 'Match Selected'}
                    </button>
                </div>
            </div>

            {selectedStatement && (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[500px]">
                    <div className="card flex flex-col h-full">
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-primary" />
                            Bank Statement Lines
                        </h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-2">
                            {unmatchedLines.map((line) => {
                                const isSelected = line.id === selectedLineId
                                return (
                                    <button
                                        key={line.id}
                                        type="button"
                                        onClick={() => setSelectedLineId(line.id)}
                                        aria-label={`Select statement line ${line.description}`}
                                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary/10'
                                                : 'bg-white/[0.02] border-border/20 hover:border-primary/20'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{line.description}</p>
                                                <p className="text-xs text-foreground/50">
                                                    #{line.id} • {new Date(line.transaction_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <p className={`font-mono font-bold ${line.credit_amount > 0 ? 'text-emerald-400' : 'text-foreground'}`}>
                                                {formatCurrencyFromCents(line.credit_amount || -line.debit_amount)}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                            {unmatchedLines.length === 0 && (
                                <p className="text-center text-foreground/30 py-10">All lines matched</p>
                            )}
                        </div>
                    </div>

                    <div className="card flex flex-col h-full">
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                            Unmatched Ledger Entries
                        </h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-2">
                            {unmatchedTransactions.map((transaction) => {
                                const isSelected = transaction.id === selectedTransactionId
                                return (
                                    <button
                                        key={transaction.id}
                                        type="button"
                                        onClick={() => setSelectedTransactionId(transaction.id)}
                                        aria-label={`Select ledger entry ${transaction.transaction_ref || transaction.description}`}
                                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                                            isSelected
                                                ? 'border-amber-400 bg-amber-400/10'
                                                : 'bg-white/[0.02] border-border/20 hover:border-amber-400/20'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{transaction.description}</p>
                                                <p className="text-xs text-foreground/50">
                                                    {transaction.transaction_ref} • {new Date(transaction.transaction_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <p className="font-mono font-bold text-foreground">
                                                {formatCurrencyFromCents(transaction.amount)}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            <Modal
                isOpen={showImportModal}
                onClose={closeImportModal}
                title="Import Bank Statement CSV"
                size="md"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="import-statement-date" className="label">Statement Date</label>
                            <input
                                id="import-statement-date"
                                type="date"
                                className="input"
                                value={importStatementDate}
                                onChange={(event) => setImportStatementDate(event.target.value)}
                                disabled={importing}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="import-reference" className="label">Reference</label>
                            <input
                                id="import-reference"
                                type="text"
                                className="input"
                                placeholder="Optional statement reference"
                                value={importReference}
                                onChange={(event) => setImportReference(event.target.value)}
                                disabled={importing}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="import-opening-balance" className="label">Opening Balance (Ksh)</label>
                            <input
                                id="import-opening-balance"
                                type="number"
                                step="0.01"
                                min="0"
                                className="input"
                                value={importOpeningBalance}
                                onChange={(event) => setImportOpeningBalance(event.target.value)}
                                disabled={importing}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="import-closing-balance" className="label">Closing Balance (Ksh)</label>
                            <input
                                id="import-closing-balance"
                                type="number"
                                step="0.01"
                                className="input"
                                value={importClosingBalance}
                                onChange={(event) => setImportClosingBalance(event.target.value)}
                                disabled={importing}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="import-csv-file" className="label">CSV File</label>
                        <input
                            id="import-csv-file"
                            type="file"
                            accept=".csv,text/csv"
                            className="input"
                            onChange={(event) => {
                                const file = event.target.files?.[0] || null
                                setImportFile(file)
                            }}
                            disabled={importing}
                        />
                    </div>
                    {importErrors.length > 0 && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                            <ul className="text-sm text-red-200 list-disc pl-5 space-y-1">
                                {importErrors.map((error, index) => (
                                    <li key={`import-error-${index}`}>{error}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={closeImportModal}
                            disabled={importing}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => { void handleCSVImport() }}
                            disabled={importing}
                        >
                            {importing ? 'Importing...' : 'Import Statement'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
