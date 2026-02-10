import { Upload, ArrowRightLeft, CreditCard } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { PageHeader } from '../../../components/patterns/PageHeader'
import { type BankAccount, type BankStatement, type BankStatementLine, type UnmatchedTransaction } from '../../../types/electron-api/BankReconciliationAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

export default function ReconcileAccount() {
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [selectedAccount, setSelectedAccount] = useState<number | null>(null)
    const [statements, setStatements] = useState<BankStatement[]>([])
    const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null)
    const [lines, setLines] = useState<BankStatementLine[]>([])

    const [unmatchedTransactions, setUnmatchedTransactions] = useState<UnmatchedTransaction[]>([])

    const loadAccounts = useCallback(async () => {
        try {
            const data = await globalThis.electronAPI.getAccounts()
            setAccounts(data)
            if (data.length > 0 && !selectedAccount) {setSelectedAccount(data[0].id)}
        } catch (error) {
            console.error('Failed to load accounts', error)
        }
    }, [selectedAccount])

    const loadStatements = useCallback(async (accountId: number) => {
        try {
            const data = await globalThis.electronAPI.getStatements(accountId)
            setStatements(data)
        } catch (error) {
            console.error('Failed to load statements', error)
        }
    }, [])

    const loadStatementDetails = useCallback(async (statementId: number) => {
        try {
            const result = await globalThis.electronAPI.getStatementWithLines(statementId)
            if (result) {
                setLines(result.lines)
            }
        } catch (error) {
            console.error('Failed to load statement lines', error)
        }
    }, [])

    const loadUnmatchedTransactions = useCallback(async () => {
        if (!selectedStatement) {return}
        try {
            const start = new Date(selectedStatement.statement_date)
            start.setDate(1) // Start of month
            const end = new Date(start)
            end.setMonth(end.getMonth() + 1)
            end.setDate(0) // End of month

            // Fetch broader range? Just current month for now
            const data = await globalThis.electronAPI.getUnmatchedTransactions(
                start.toISOString().slice(0, 10),
                end.toISOString().slice(0, 10)
            )
            setUnmatchedTransactions(data)
        } catch (error) {
            console.error('Failed to load ledger transactions', error)
        }
    }, [selectedStatement])

    useEffect(() => {
        loadAccounts().catch((err: unknown) => console.error('Failed to load accounts', err))
    }, [loadAccounts])

    useEffect(() => {
        if (selectedAccount) {
            loadStatements(selectedAccount).catch((err: unknown) => console.error('Failed to load statements', err))
        }
    }, [selectedAccount, loadStatements])

    useEffect(() => {
        if (selectedStatement) {
            loadStatementDetails(selectedStatement.id).catch((err: unknown) => console.error('Failed to load statement details', err))
            loadUnmatchedTransactions().catch((err: unknown) => console.error('Failed to load unmatched transactions', err))
        }
    }, [selectedStatement, loadStatementDetails, loadUnmatchedTransactions])

    const handleMatch = async (lineId: number, transactionId: number) => {
        try {
            await globalThis.electronAPI.matchTransaction(lineId, transactionId)
            // Refresh
            if (selectedStatement) {
                loadStatementDetails(selectedStatement.id).catch((err: unknown) => console.error('Failed to reload statement details', err))
                loadUnmatchedTransactions().catch((err: unknown) => console.error('Failed to reload unmatched transactions', err))
            }
        } catch {
            alert('Failed to match')
        }
    }

    return (
        <div className="space-y-8 pb-10 h-full flex flex-col">
            <PageHeader
                title="Bank Reconciliation"
                subtitle="Match bank statement lines with ledger entries"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Reconciliation' }]}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                    <label htmlFor="field-107" className="label">Bank Account</label>
                    <select id="field-107"
                        value={selectedAccount || ''}
                        onChange={(e) => setSelectedAccount(Number(e.target.value))}
                        className="input"
                    >
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.account_name} ({acc.bank_name})</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="field-119" className="label">Statement Period</label>
                    <select id="field-119"
                        value={selectedStatement?.id || ''}
                        onChange={(e) => {
                            const stmt = statements.find(s => s.id === Number(e.target.value))
                            setSelectedStatement(stmt || null)
                        }}
                        className="input"
                    >
                        <option value="">Select Statement</option>
                        {statements.map(stmt => (
                            <option key={stmt.id} value={stmt.id}>
                                {new Date(stmt.statement_date).toLocaleDateString()} - {stmt.status}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-end">
                    <button className="btn btn-secondary w-full flex items-center justify-center gap-2">
                        <Upload className="w-4 h-4" />
                        Import Statement (CSV)
                    </button>
                </div>
            </div>

            {selectedStatement && (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[500px]">
                    {/* LEFT: Bank Statement Lines */}
                    <div className="card flex flex-col h-full">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-primary" />
                            Bank Statement Lines
                        </h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-2">
                            {lines.filter(l => !l.is_matched).map(line => (
                                <div key={line.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-lg hover:border-primary/20 transition-all cursor-pointer group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-white">{line.description}</p>
                                            <p className="text-xs text-foreground/50">{new Date(line.transaction_date).toLocaleDateString()}</p>
                                        </div>
                                        <p className={`font-mono font-bold ${line.credit_amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                                            {formatCurrencyFromCents(line.credit_amount || -line.debit_amount)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {lines.filter(l => !l.is_matched).length === 0 && (
                                <p className="text-center text-foreground/30 py-10">All lines matched</p>
                            )}
                        </div>
                    </div>

                    {/* CENTER: Matching Interface (Conceptual Overlay) - Here implemented as list comparison */}

                    {/* RIGHT: Ledger Transactions */}
                    <div className="card flex flex-col h-full">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                            Unmatched Ledger Entries
                        </h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-2">
                            {unmatchedTransactions.map(txn => (
                                <div key={txn.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-lg hover:border-amber-400/20 transition-all cursor-pointer group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-white">{txn.description}</p>
                                            <p className="text-xs text-foreground/50">{txn.transaction_ref} • {new Date(txn.transaction_date).toLocaleDateString()}</p>
                                        </div>
                                        <p className="font-mono font-bold text-white">
                                            {formatCurrencyFromCents(txn.amount)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Ideally select bank line first, then click here to match
                                            // For simplicity, prompting for ID match or assume selection state
                                            const lineId = prompt('Enter Bank Line ID to match:')
                                            if (lineId) {void handleMatch(Number.parseInt(lineId, 10), txn.id)}
                                        }}
                                        className="hidden group-hover:block w-full mt-2 btn btn-xs btn-secondary text-center"
                                    >
                                        Match
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
