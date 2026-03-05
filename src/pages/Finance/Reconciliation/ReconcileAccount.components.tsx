import { Upload, ArrowRightLeft, CreditCard } from 'lucide-react'

import { Modal } from '../../../components/ui/Modal'
import { type BankAccount, type BankStatement, type BankStatementLine, type UnmatchedTransaction } from '../../../types/electron-api/BankReconciliationAPI'
import { formatCurrencyFromCents } from '../../../utils/format'

interface AccountSelectorGridProps {
    accounts: BankAccount[]
    selectedAccount: number | null
    setSelectedAccount: (id: number | null) => void
    statements: BankStatement[]
    selectedStatement: BankStatement | null
    setSelectedStatement: (statement: BankStatement | null) => void
    openImportModal: () => void
    matching: boolean
    selectedLineId: number | null
    selectedTransactionId: number | null
    handleMatch: () => Promise<void>
}

export function AccountSelectorGrid({ accounts, selectedAccount, setSelectedAccount, statements, selectedStatement, setSelectedStatement, openImportModal, matching, selectedLineId, selectedTransactionId, handleMatch }: Readonly<AccountSelectorGridProps>) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
                <label htmlFor="field-107" className="label">Bank Account</label>
                <select
                    id="field-107"
                    value={selectedAccount || ''}
                    onChange={(event) => {
                        const value = event.target.value
                        setSelectedAccount(value ? Number(value) : null)
                    }}
                    className="input"
                    disabled={accounts.length === 0}
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
                    disabled={!selectedAccount || statements.length === 0}
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
                    disabled={!selectedAccount}
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
    )
}

interface ReconciliationPanelsProps {
    unmatchedLines: BankStatementLine[]
    selectedLineId: number | null
    setSelectedLineId: (id: number | null) => void
    unmatchedTransactions: UnmatchedTransaction[]
    selectedTransactionId: number | null
    setSelectedTransactionId: (id: number | null) => void
}

export function ReconciliationPanels({ unmatchedLines, selectedLineId, setSelectedLineId, unmatchedTransactions, selectedTransactionId, setSelectedTransactionId }: Readonly<ReconciliationPanelsProps>) {
    return (
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
    )
}

interface ImportStatementModalProps {
    showImportModal: boolean
    closeImportModal: () => void
    importStatementDate: string
    setImportStatementDate: (v: string) => void
    importReference: string
    setImportReference: (v: string) => void
    importOpeningBalance: string
    setImportOpeningBalance: (v: string) => void
    importClosingBalance: string
    setImportClosingBalance: (v: string) => void
    setImportFile: (file: File | null) => void
    importErrors: string[]
    importing: boolean
    handleCSVImport: () => Promise<void>
}

export function ImportStatementModal({ showImportModal, closeImportModal, importStatementDate, setImportStatementDate, importReference, setImportReference, importOpeningBalance, setImportOpeningBalance, importClosingBalance, setImportClosingBalance, setImportFile, importErrors, importing, handleCSVImport }: Readonly<ImportStatementModalProps>) {
    return (
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
                            {importErrors.map((error) => (
                                <li key={error}>{error}</li>
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
    )
}
