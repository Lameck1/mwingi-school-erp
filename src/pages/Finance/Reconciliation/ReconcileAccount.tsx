import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { parseStatementCSV, validateMatchSelection } from './reconcile.logic'
import { AccountSelectorGrid, ReconciliationPanels, ImportStatementModal } from './ReconcileAccount.components'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { useToast } from '../../../contexts/ToastContext'
import { type BankAccount, type BankStatement, type BankStatementLine, type UnmatchedTransaction } from '../../../types/electron-api/BankReconciliationAPI'
import { shillingsToCents } from '../../../utils/format'
import { unwrapArrayResult, unwrapIPCResult } from '../../../utils/ipc'

const IMPORT_FILE_ERROR = 'Select a CSV file to import'

function useImportForm(
    selectedAccount: number | null,
    loadStatements: (accountId: number) => Promise<void>,
    setSelectedStatement: (statement: BankStatement | null) => void,
    showToast: (message: string, type: 'success' | 'error' | 'info') => void
) {
    const [showImportModal, setShowImportModal] = useState(false)
    const [importFile, setImportFile] = useState<File | null>(null)
    const [importStatementDate, setImportStatementDate] = useState('')
    const [importOpeningBalance, setImportOpeningBalance] = useState('')
    const [importClosingBalance, setImportClosingBalance] = useState('')
    const [importReference, setImportReference] = useState('')
    const [importErrors, setImportErrors] = useState<string[]>([])
    const [importing, setImporting] = useState(false)

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

            const statementResult = await globalThis.electronAPI.finance.createStatement(
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
                const lineResult = await globalThis.electronAPI.finance.addStatementLine(statementResult.id, line)
                if (!lineResult.success) {
                    throw new Error(lineResult.errors?.[0] || 'Failed to import statement line')
                }
            }

            await loadStatements(selectedAccount)
            const updatedStatements = unwrapArrayResult(
                await globalThis.electronAPI.finance.getStatements(selectedAccount),
                'Failed to reload statements after import'
            )
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

    return {
        showImportModal, openImportModal, closeImportModal,
        importStatementDate, setImportStatementDate,
        importReference, setImportReference,
        importOpeningBalance, setImportOpeningBalance,
        importClosingBalance, setImportClosingBalance,
        setImportFile, importErrors, importing, handleCSVImport,
    }
}

function useReconciliationPage() {
    const { showToast } = useToast()
    const navigate = useNavigate()

    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [selectedAccount, setSelectedAccount] = useState<number | null>(null)
    const [statements, setStatements] = useState<BankStatement[]>([])
    const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null)
    const [lines, setLines] = useState<BankStatementLine[]>([])
    const [unmatchedTransactions, setUnmatchedTransactions] = useState<UnmatchedTransaction[]>([])

    const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
    const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null)
    const [matching, setMatching] = useState(false)

    const loadAccounts = useCallback(async () => {
        try {
            const data = unwrapArrayResult(await globalThis.electronAPI.finance.getAccounts(), 'Failed to load bank accounts')
            setAccounts(data)
            if (data.length > 0 && !selectedAccount && data[0]) {
                setSelectedAccount(data[0].id)
            }
        } catch (error) {
            console.error('Failed to load accounts', error)
            setAccounts([])
            setSelectedAccount(null)
            setStatements([])
            setSelectedStatement(null)
            setLines([])
            setUnmatchedTransactions([])
            showToast(error instanceof Error ? error.message : 'Failed to load bank accounts', 'error')
        }
    }, [selectedAccount, showToast])

    const loadStatements = useCallback(async (accountId: number) => {
        try {
            const data = unwrapArrayResult(
                await globalThis.electronAPI.finance.getStatements(accountId),
                'Failed to load statements'
            )
            setStatements(data)
            setSelectedStatement((current) => {
                if (!current) {
                    return data[0] || null
                }
                return data.find((statement) => statement.id === current.id) || data[0] || null
            })
        } catch (error) {
            console.error('Failed to load statements', error)
            setStatements([])
            setSelectedStatement(null)
            showToast(error instanceof Error ? error.message : 'Failed to load statements', 'error')
        }
    }, [showToast])

    const loadStatementDetails = useCallback(async (statementId: number) => {
        try {
            const result = unwrapIPCResult(
                await globalThis.electronAPI.finance.getStatementWithLines(statementId),
                'Failed to load statement details'
            )
            if (result) {
                setLines(Array.isArray(result.lines) ? result.lines : [])
                return
            }
            setLines([])
        } catch (error) {
            console.error('Failed to load statement lines', error)
            setLines([])
            showToast(error instanceof Error ? error.message : 'Failed to load statement details', 'error')
        }
    }, [showToast])

    const loadUnmatchedTransactions = useCallback(async () => {
        if (!selectedStatement) {
            setUnmatchedTransactions([])
            return
        }
        try {
            const start = new Date(selectedStatement.statement_date)
            start.setDate(1)
            const end = new Date(start)
            end.setMonth(end.getMonth() + 1)
            end.setDate(0)

            const data = unwrapArrayResult(
                await globalThis.electronAPI.finance.getUnmatchedTransactions(
                    start.toISOString().slice(0, 10),
                    end.toISOString().slice(0, 10),
                    selectedAccount || undefined
                ),
                'Failed to load unmatched ledger entries'
            )
            setUnmatchedTransactions(data)
        } catch (error) {
            console.error('Failed to load ledger transactions', error)
            setUnmatchedTransactions([])
            showToast(error instanceof Error ? error.message : 'Failed to load unmatched ledger entries', 'error')
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

    const {
        showImportModal, openImportModal, closeImportModal,
        importStatementDate, setImportStatementDate,
        importReference, setImportReference,
        importOpeningBalance, setImportOpeningBalance,
        importClosingBalance, setImportClosingBalance,
        setImportFile, importErrors, importing, handleCSVImport,
    } = useImportForm(selectedAccount, loadStatements, setSelectedStatement, showToast)

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
            const result = await globalThis.electronAPI.finance.matchTransaction(selectedLine!.id, selectedTransaction!.id)
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
            showToast(error instanceof Error ? error.message : 'Failed to match transactions', 'error')
        } finally {
            setMatching(false)
        }
    }

    const unmatchedLines = lines.filter((line) => !line.is_matched)

    return {
        navigate,
        accounts, selectedAccount, setSelectedAccount,
        statements, selectedStatement, setSelectedStatement,
        unmatchedLines, selectedLineId, setSelectedLineId,
        unmatchedTransactions, selectedTransactionId, setSelectedTransactionId,
        matching, handleMatch, openImportModal,
        showImportModal, closeImportModal,
        importStatementDate, setImportStatementDate,
        importReference, setImportReference,
        importOpeningBalance, setImportOpeningBalance,
        importClosingBalance, setImportClosingBalance,
        setImportFile, importErrors, importing, handleCSVImport,
    }
}

export default function ReconcileAccount() {
    const {
        navigate,
        accounts, selectedAccount, setSelectedAccount,
        statements, selectedStatement, setSelectedStatement,
        unmatchedLines, selectedLineId, setSelectedLineId,
        unmatchedTransactions, selectedTransactionId, setSelectedTransactionId,
        matching, handleMatch, openImportModal,
        showImportModal, closeImportModal,
        importStatementDate, setImportStatementDate,
        importReference, setImportReference,
        importOpeningBalance, setImportOpeningBalance,
        importClosingBalance, setImportClosingBalance,
        setImportFile, importErrors, importing, handleCSVImport,
    } = useReconciliationPage()

    return (
        <div className="space-y-8 pb-10 h-full flex flex-col">
            <PageHeader
                title="Bank Reconciliation"
                subtitle="Match bank statement lines with ledger entries"
                breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Reconciliation' }]}
            />

            {accounts.length === 0 && (
                <div className="p-4 border border-border/40 rounded-xl bg-secondary/10 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            No bank accounts found.
                        </p>
                        <p className="text-xs text-foreground/60">
                            Create a bank account first to import statements and start matching.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/bank-accounts')}
                        className="btn btn-primary"
                    >
                        Add Bank Account
                    </button>
                </div>
            )}

            <AccountSelectorGrid
                accounts={accounts}
                selectedAccount={selectedAccount}
                setSelectedAccount={setSelectedAccount}
                statements={statements}
                selectedStatement={selectedStatement}
                setSelectedStatement={setSelectedStatement}
                openImportModal={openImportModal}
                matching={matching}
                selectedLineId={selectedLineId}
                selectedTransactionId={selectedTransactionId}
                handleMatch={handleMatch}
            />

            {selectedStatement && (
                <ReconciliationPanels
                    unmatchedLines={unmatchedLines}
                    selectedLineId={selectedLineId}
                    setSelectedLineId={setSelectedLineId}
                    unmatchedTransactions={unmatchedTransactions}
                    selectedTransactionId={selectedTransactionId}
                    setSelectedTransactionId={setSelectedTransactionId}
                />
            )}

            <ImportStatementModal
                showImportModal={showImportModal}
                closeImportModal={closeImportModal}
                importStatementDate={importStatementDate}
                setImportStatementDate={setImportStatementDate}
                importReference={importReference}
                setImportReference={setImportReference}
                importOpeningBalance={importOpeningBalance}
                setImportOpeningBalance={setImportOpeningBalance}
                importClosingBalance={importClosingBalance}
                setImportClosingBalance={setImportClosingBalance}
                setImportFile={setImportFile}
                importErrors={importErrors}
                importing={importing}
                handleCSVImport={handleCSVImport}
            />
        </div>
    )
}
