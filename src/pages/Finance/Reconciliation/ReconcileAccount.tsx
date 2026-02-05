import { useState, useEffect, useCallback } from 'react'
import { Upload, ArrowRightLeft, CreditCard } from 'lucide-react'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { formatCurrency } from '../../../utils/format'
import { BankAccount, BankStatement, BankStatementLine } from '../../../types/electron-api/BankReconciliationAPI'

export default function ReconcileAccount() {
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [selectedAccount, setSelectedAccount] = useState<number | null>(null)
    const [statements, setStatements] = useState<BankStatement[]>([])
    const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null)
    const [lines, setLines] = useState<BankStatementLine[]>([])

    interface UnmatchedTransaction {
        id: number
        description: string
        transaction_ref: string
        transaction_date: string
        amount: number
        [key: string]: unknown
    }
    const [unmatchedTransactions, setUnmatchedTransactions] = useState<UnmatchedTransaction[]>([])

    const loadAccounts = useCallback(async () => {
        try {
            const data = await window.electronAPI.getAccounts()
            setAccounts(data)
            if (data.length > 0 && !selectedAccount) setSelectedAccount(data[0].id)
        } catch (error) {
            console.error('Failed to load accounts', error)
        }
    }, [selectedAccount])

    const loadStatements = useCallback(async (accountId: number) => {
        try {
            const data = await window.electronAPI.getStatements(accountId)
            setStatements(data)
        } catch (error) {
            console.error('Failed to load statements', error)
        }
    }, [])

    const loadStatementDetails = useCallback(async (statementId: number) => {
        try {
            const result = await window.electronAPI.getStatementWithLines(statementId)
            if (result) {
                setLines(result.lines)
            }
        } catch (error) {
            console.error('Failed to load statement lines', error)
        }
    }, [])

    const loadUnmatchedTransactions = useCallback(async () => {
        if (!selectedStatement) return
        try {
            const start = new Date(selectedStatement.statement_date)
            start.setDate(1) // Start of month
            const end = new Date(start)
            end.setMonth(end.getMonth() + 1)
            end.setDate(0) // End of month

            // Fetch broader range? Just current month for now
            const data = await window.electronAPI.getUnmatchedTransactions(
                start.toISOString().slice(0, 10),
                end.toISOString().slice(0, 10)
            )
            setUnmatchedTransactions(data)
        } catch (error) {
            console.error('Failed to load ledger transactions', error)
        }
    }, [selectedStatement])

    useEffect(() => {
        loadAccounts()
    }, [loadAccounts])

    useEffect(() => {
        if (selectedAccount) {
            loadStatements(selectedAccount)
        }
    }, [selectedAccount, loadStatements])

    useEffect(() => {
        if (selectedStatement) {
            loadStatementDetails(selectedStatement.id)
            loadUnmatchedTransactions()
        }
    }, [selectedStatement, loadStatementDetails, loadUnmatchedTransactions])

    const handleMatch = async (lineId: number, transactionId: number) => {
        try {
            await window.electronAPI.matchTransaction(lineId, transactionId)
            // Refresh
            if (selectedStatement) {
                loadStatementDetails(selectedStatement.id)
                loadUnmatchedTransactions()
            }
        } catch (error) {
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
                    <label className="label">Bank Account</label>
                    <select
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
                    <label className="label">Statement Period</label>
                    <select
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
                                            {formatCurrency(line.credit_amount || -line.debit_amount)}
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
                                            {formatCurrency(txn.amount)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Ideally select bank line first, then click here to match
                                            // For simplicity, prompting for ID match or assume selection state
                                            const lineId = prompt('Enter Bank Line ID to match:')
                                            if (lineId) handleMatch(parseInt(lineId), txn.id)
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
