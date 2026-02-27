import React, { useState } from 'react';
import { useMpesaReconciliation, type MpesaTransaction } from '../../../hooks/useMpesaReconciliation';
import Papa, { type ParseResult } from 'papaparse';
import { PageHeader } from '../../../components/patterns/PageHeader';
import { useToast } from '../../../contexts/ToastContext';

export default function MpesaReconciliation() {
    const { showToast } = useToast();
    const { unmatchedData, summary, isLoading, error, importCsv, manualMatch } = useMpesaReconciliation();
    const [activeTab, setActiveTab] = useState<'UNMATCHED' | 'SUMMARY'>('UNMATCHED');

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: ParseResult<Record<string, string>>) => {
                void importCsv(results.data, file.name)
                    .then(() => { showToast('Import successful!', 'success'); return true; })
                    .catch((err: unknown) => {
                        const message = err instanceof Error ? err.message : 'Unknown error';
                        showToast(`Import failed: ${message}`, 'error');
                        return true;
                    });
            },
            error: (err) => {
                showToast(`Failed to parse CSV: ${err.message}`, 'error');
            }
        });
    };

    return (
        <div className="space-y-8 pb-10 h-full flex flex-col">
            <div className="flex justify-between items-start">
                <PageHeader
                    title="M-Pesa Reconciliation"
                    subtitle="Import and match M-Pesa statements with student accounts automatically."
                    breadcrumbs={[
                        { label: 'Finance', href: '/finance' },
                        { label: 'Reconciliation', href: '/finance/reconciliation' },
                        { label: 'M-Pesa' }
                    ]}
                />
                <div className="mt-4 sm:mt-0">
                    <label className="btn btn-secondary cursor-pointer border border-border/40">
                        <span>Import CSV Statement</span>
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-6">
                    <p className="text-sm text-red-500">{error}</p>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border/40 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('SUMMARY')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'SUMMARY'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-foreground/60 hover:text-foreground'
                            }`}
                    >
                        Dashboard Summary
                    </button>
                    <button
                        onClick={() => setActiveTab('UNMATCHED')}
                        className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'UNMATCHED'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-foreground/60 hover:text-foreground'
                            }`}
                    >
                        Unmatched Transactions
                        {unmatchedData.length > 0 && (
                            <span className="ml-2 bg-primary/10 text-primary py-0.5 px-2.5 rounded-full text-xs">
                                {unmatchedData.length}
                            </span>
                        )}
                    </button>
                </nav>
            </div>

            {isLoading && (
                <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            )}
            {!isLoading && activeTab === 'SUMMARY' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="card">
                        <h3 className="text-sm font-medium text-foreground/60">Total Processed</h3>
                        <p className="mt-2 text-3xl font-bold text-foreground">{summary?.totalSummary?.total_processed ?? 0}</p>
                    </div>
                    <div className="card border-l-4 border-l-emerald-500">
                        <h3 className="text-sm font-medium text-foreground/60">Successfully Matched</h3>
                        <p className="mt-2 text-3xl font-bold text-emerald-500">{summary?.totalSummary?.total_matched ?? 0}</p>
                    </div>
                    <div className="card border-l-4 border-l-amber-500">
                        <h3 className="text-sm font-medium text-foreground/60">Pending Resolution</h3>
                        <p className="mt-2 text-3xl font-bold text-amber-500">{summary?.totalSummary?.total_pending ?? 0}</p>
                    </div>
                    <div className="card border-l-4 border-l-foreground/40">
                        <h3 className="text-sm font-medium text-foreground/60">Duplicates Ignored</h3>
                        <p className="mt-2 text-3xl font-bold text-foreground/60">{summary?.totalSummary?.total_duplicates ?? 0}</p>
                    </div>
                </div>
            )}
            {!isLoading && activeTab === 'UNMATCHED' && (
                <div className="card overflow-hidden">
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Date</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Receipt</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Sender</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Amount</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground/80">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {unmatchedData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-sm text-foreground/50">
                                        No unmatched transactions found. You're all caught up!
                                    </td>
                                </tr>
                            ) : (
                                unmatchedData.map((txn: MpesaTransaction) => (
                                    <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="whitespace-nowrap py-4 px-4 text-sm text-foreground/70">
                                            {new Date(txn.transaction_date).toLocaleDateString()}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                                            {txn.transaction_receipt}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-foreground/70">
                                            <div className="font-medium text-foreground">{txn.sender_party_public_name}</div>
                                            <div className="text-xs text-foreground/50">{txn.sender_msisdn}</div>
                                            <div className="text-xs text-primary/80 mt-0.5">Ref: {txn.account_reference}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-foreground">
                                            Kes {txn.amount.toLocaleString()}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <button
                                                onClick={() => {
                                                    const id = window.prompt('Enter Student ID to match with:');
                                                    if (id && !isNaN(parseInt(id, 10))) {
                                                        void manualMatch(txn.id, parseInt(id, 10));
                                                    }
                                                }}
                                                className="btn btn-secondary text-xs px-3 py-1.5"
                                            >
                                                Match Manually
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
