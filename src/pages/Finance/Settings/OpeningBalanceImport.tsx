/**
 * Opening Balance Import Page
 * 
 * Allows importing historical student and GL account balances
 * Validates that debits = credits before posting
 */

import React from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb';
import { formatCurrency } from '../../../utils/format';
import { type ImportedBalance } from './openingBalanceImport.helpers'
import { useOpeningBalanceImport } from './useOpeningBalanceImport'

interface BalanceSummaryCardProps {
  totalDebits: number
  totalCredits: number
  variance: number
  isBalanced: boolean
  verified: boolean
  importing: boolean
  handleVerify: () => void
  handleImport: () => Promise<void>
}

function BalanceSummaryCard({ totalDebits, totalCredits, variance, isBalanced, verified, importing, handleVerify, handleImport }: Readonly<BalanceSummaryCardProps>) {
  return (
    <div className="bg-card rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Summary</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="text-center p-4 bg-green-500/10 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Total Debits</p>
          <p className="text-2xl font-bold text-green-700">
            {formatCurrency(totalDebits)}
          </p>
        </div>
        <div className="text-center p-4 bg-red-500/10 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Total Credits</p>
          <p className="text-2xl font-bold text-red-700">
            {formatCurrency(totalCredits)}
          </p>
        </div>
        <div
          className={`text-center p-4 rounded-lg ${isBalanced ? 'bg-blue-500/10' : 'bg-yellow-500/10'
            }`}
        >
          <p className="text-sm text-muted-foreground mb-1">Variance</p>
          <p
            className={`text-2xl font-bold ${isBalanced ? 'text-blue-700' : 'text-yellow-700'
              }`}
          >
            {formatCurrency(variance)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-4">
        <button
          onClick={handleVerify}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50"
        >
          Verify Balance
        </button>
        <button
          onClick={handleImport}
          disabled={!verified || importing}
          className={`px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${verified && !importing
              ? 'bg-success text-white hover:bg-success/90 focus:ring-success/50'
              : 'bg-gray-300 text-muted-foreground cursor-not-allowed'
            }`}
        >
          {importing ? 'Importing...' : 'Import to System'}
        </button>
      </div>

      {verified && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md text-center">
          <p className="text-green-500 font-medium">
            ✓ Verification successful! Ready to import.
          </p>
        </div>
      )}
    </div>
  )
}

interface BalancesTableProps {
  balances: ImportedBalance[]
  handleRemoveBalance: (index: number) => void
}

function BalancesTable({ balances, handleRemoveBalance }: Readonly<BalancesTableProps>) {
  return (
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-secondary">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Identifier
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Debit/Credit
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Amount
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {balances.map((balance, index) => (
            <tr key={`${balance.type}-${balance.identifier}-${balance.debitCredit}-${balance.amount}`} className="hover:bg-secondary">
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${balance.type === 'STUDENT'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'bg-purple-100 text-purple-800'
                    }`}
                >
                  {balance.type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">
                {balance.identifier}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                {balance.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${balance.debitCredit === 'DEBIT'
                      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                    }`}
                >
                  {balance.debitCredit}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-foreground font-medium">
                {formatCurrency(balance.amount)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <button
                  onClick={() => handleRemoveBalance(index)}
                  className="text-destructive hover:text-destructive/80"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface AddBalanceModalProps {
  showAddModal: boolean
  setShowAddModal: (show: boolean) => void
  newBalance: ImportedBalance
  setNewBalance: (balance: ImportedBalance) => void
  handleAddBalance: () => void
}

function ImportInstructions() {
  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
        Important Instructions
      </h3>
      <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
        <li>Total debits must equal total credits before import</li>
        <li>Student balances should be debits (receivables)</li>
        <li>Verify all data before importing - this cannot be easily undone</li>
        <li>
          Use GL account 3000 (Retained Earnings) to balance if needed
        </li>
      </ul>
    </div>
  )
}

function AddBalanceModal({ showAddModal, setShowAddModal, newBalance, setNewBalance, handleAddBalance }: Readonly<AddBalanceModalProps>) {
  if (!showAddModal) { return null }
  return (
    <div
      className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-50 relative"
    >
      <button
        type="button"
        aria-label="Close add balance modal"
        onClick={() => setShowAddModal(false)}
        className="absolute inset-0"
      />
      <dialog
        open
        className="bg-card rounded-lg shadow-xl p-6 max-w-md w-full relative z-10"
        aria-labelledby="opening-balance-modal-title"
      >
        <h3 id="opening-balance-modal-title" className="text-lg font-semibold text-foreground mb-4">
          Add Balance Entry
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="opening-balance-type" className="block text-sm font-medium text-foreground/70 mb-1">
              Type
            </label>
            <select
              id="opening-balance-type"
              value={newBalance.type}
              onChange={(e) =>
                setNewBalance({
                  ...newBalance,
                  type: e.target.value as 'STUDENT' | 'GL_ACCOUNT',
                })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="STUDENT">Student</option>
              <option value="GL_ACCOUNT">GL Account</option>
            </select>
          </div>

          <div>
            <label htmlFor="opening-balance-identifier" className="block text-sm font-medium text-foreground/70 mb-1">
              {newBalance.type === 'STUDENT'
                ? 'Student ID'
                : 'GL Account Code'}
            </label>
            <input
              id="opening-balance-identifier"
              type="text"
              value={newBalance.identifier}
              onChange={(e) =>
                setNewBalance({ ...newBalance, identifier: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label htmlFor="opening-balance-name" className="block text-sm font-medium text-foreground/70 mb-1">
              Name
            </label>
            <input
              id="opening-balance-name"
              type="text"
              value={newBalance.name}
              onChange={(e) =>
                setNewBalance({ ...newBalance, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label htmlFor="opening-balance-debit-credit" className="block text-sm font-medium text-foreground/70 mb-1">
              Debit/Credit
            </label>
            <select
              id="opening-balance-debit-credit"
              value={newBalance.debitCredit}
              onChange={(e) =>
                setNewBalance({
                  ...newBalance,
                  debitCredit: e.target.value as 'DEBIT' | 'CREDIT',
                })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>

          <div>
            <label htmlFor="opening-balance-amount" className="block text-sm font-medium text-foreground/70 mb-1">
              Amount (Kes)
            </label>
            <input
              id="opening-balance-amount"
              type="number"
              value={newBalance.amount}
              onChange={(e) =>
                setNewBalance({
                  ...newBalance,
                  amount: Number.parseFloat(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setShowAddModal(false)}
            className="px-4 py-2 text-sm font-medium text-foreground/70 bg-card border border-border rounded-md hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50"
          >
            Cancel
          </button>
          <button
            onClick={handleAddBalance}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50"
          >
            Add Entry
          </button>
        </div>
      </dialog>
    </div>
  )
}

export const OpeningBalanceImport: React.FC = () => {
  const {
    balances, importing, verified, totalDebits, totalCredits, variance, isBalanced,
    showAddModal, setShowAddModal, newBalance, setNewBalance,
    handleFileUpload, handleAddBalance, handleRemoveBalance, handleVerify, handleImport,
  } = useOpeningBalanceImport()




  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Opening Balances' }]} />
        <h1 className="text-2xl font-bold text-foreground">Opening Balance Import</h1>
        <p className="text-foreground/50 mt-1">
          Import historical balances for students and GL accounts
        </p>
      </div>

      <ImportInstructions />

      {/* Import Controls */}
      <div className="bg-card rounded-lg shadow p-4">
        <div className="flex gap-4">
          <div>
            <label htmlFor="opening-balance-upload" className="block text-sm font-medium text-foreground/70 mb-2">
              Upload CSV File
            </label>
            <input
              id="opening-balance-upload"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-success text-white rounded-md hover:bg-success/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success/50"
            >
              + Add Manual Entry
            </button>
          </div>
        </div>
      </div>

      {balances.length > 0 && (
        <BalanceSummaryCard
          totalDebits={totalDebits}
          totalCredits={totalCredits}
          variance={variance}
          isBalanced={isBalanced}
          verified={verified}
          importing={importing}
          handleVerify={handleVerify}
          handleImport={handleImport}
        />
      )}

      {balances.length > 0 && (
        <BalancesTable
          balances={balances}
          handleRemoveBalance={handleRemoveBalance}
        />
      )}

      {balances.length === 0 && (
        <div className="bg-card rounded-lg shadow p-12 text-center text-muted-foreground">
          <p className="text-lg mb-2">No balances loaded</p>
          <p className="text-sm">
            Upload a CSV file or add entries manually to get started
          </p>
        </div>
      )}

      <AddBalanceModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        newBalance={newBalance}
        setNewBalance={setNewBalance}
        handleAddBalance={handleAddBalance}
      />
    </div>
  );
};
