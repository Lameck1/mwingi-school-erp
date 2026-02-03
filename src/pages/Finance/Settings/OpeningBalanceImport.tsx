/**
 * Opening Balance Import Page
 * 
 * Allows importing historical student and GL account balances
 * Validates that debits = credits before posting
 */

import React, { useState } from 'react';

interface ImportedBalance {
  type: 'STUDENT' | 'GL_ACCOUNT';
  identifier: string; // Student ID or GL Account Code
  name: string;
  amount: number;
  debitCredit: 'DEBIT' | 'CREDIT';
}

export const OpeningBalanceImport: React.FC = () => {
  const [balances, setBalances] = useState<ImportedBalance[]>([]);
  const [importing, setImporting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBalance, setNewBalance] = useState<ImportedBalance>({
    type: 'STUDENT',
    identifier: '',
    name: '',
    amount: 0,
    debitCredit: 'DEBIT',
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // TODO: Parse CSV/Excel file
    // For now, mock data
    const mockData: ImportedBalance[] = [
      {
        type: 'STUDENT',
        identifier: 'STU001',
        name: 'John Doe',
        amount: 50000,
        debitCredit: 'DEBIT',
      },
      {
        type: 'STUDENT',
        identifier: 'STU002',
        name: 'Jane Smith',
        amount: 30000,
        debitCredit: 'DEBIT',
      },
      {
        type: 'GL_ACCOUNT',
        identifier: '1100',
        name: 'Accounts Receivable',
        amount: 80000,
        debitCredit: 'DEBIT',
      },
      {
        type: 'GL_ACCOUNT',
        identifier: '3000',
        name: 'Retained Earnings',
        amount: 80000,
        debitCredit: 'CREDIT',
      },
    ];

    setBalances(mockData);
    setVerified(false);
  };

  const handleAddBalance = () => {
    if (!newBalance.identifier || !newBalance.name || newBalance.amount <= 0) {
      alert('Please fill all fields');
      return;
    }

    setBalances([...balances, { ...newBalance }]);
    setNewBalance({
      type: 'STUDENT',
      identifier: '',
      name: '',
      amount: 0,
      debitCredit: 'DEBIT',
    });
    setShowAddModal(false);
    setVerified(false);
  };

  const handleRemoveBalance = (index: number) => {
    setBalances(balances.filter((_, i) => i !== index));
    setVerified(false);
  };

  const handleVerify = () => {
    const totalDebits = balances
      .filter((b) => b.debitCredit === 'DEBIT')
      .reduce((sum, b) => sum + b.amount, 0);

    const totalCredits = balances
      .filter((b) => b.debitCredit === 'CREDIT')
      .reduce((sum, b) => sum + b.amount, 0);

    if (Math.abs(totalDebits - totalCredits) < 0.01) {
      setVerified(true);
      alert('✓ Verification successful! Debits equal credits.');
    } else {
      setVerified(false);
      alert(
        `✗ Verification failed!\nDebits: Kes ${totalDebits.toFixed(
          2
        )}\nCredits: Kes ${totalCredits.toFixed(
          2
        )}\nVariance: Kes ${Math.abs(totalDebits - totalCredits).toFixed(2)}`
      );
    }
  };

  const handleImport = async () => {
    if (!verified) {
      alert('Please verify balances before importing');
      return;
    }

    setImporting(true);
    try {
      // TODO: Call IPC handler to import balances
      await new Promise((resolve) => setTimeout(resolve, 2000));
      alert('Opening balances imported successfully!');
      setBalances([]);
      setVerified(false);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const totalDebits = balances
    .filter((b) => b.debitCredit === 'DEBIT')
    .reduce((sum, b) => sum + b.amount, 0);

  const totalCredits = balances
    .filter((b) => b.debitCredit === 'CREDIT')
    .reduce((sum, b) => sum + b.amount, 0);

  const variance = Math.abs(totalDebits - totalCredits);
  const isBalanced = variance < 0.01;

  const formatCurrency = (amount: number): string => {
    return `Kes ${amount.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Opening Balance Import</h1>
        <p className="text-gray-600 mt-1">
          Import historical balances for students and GL accounts
        </p>
      </div>

      {/* Import Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          Important Instructions
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Total debits must equal total credits before import</li>
          <li>Student balances should be debits (receivables)</li>
          <li>Verify all data before importing - this cannot be easily undone</li>
          <li>
            Use GL account 3000 (Retained Earnings) to balance if needed
          </li>
        </ul>
      </div>

      {/* Import Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              + Add Manual Entry
            </button>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      {balances.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Debits</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(totalDebits)}
              </p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Credits</p>
              <p className="text-2xl font-bold text-red-700">
                {formatCurrency(totalCredits)}
              </p>
            </div>
            <div
              className={`text-center p-4 rounded-lg ${
                isBalanced ? 'bg-blue-50' : 'bg-yellow-50'
              }`}
            >
              <p className="text-sm text-gray-600 mb-1">Variance</p>
              <p
                className={`text-2xl font-bold ${
                  isBalanced ? 'text-blue-700' : 'text-yellow-700'
                }`}
              >
                {formatCurrency(variance)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-center gap-4">
            <button
              onClick={handleVerify}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Verify Balance
            </button>
            <button
              onClick={handleImport}
              disabled={!verified || importing}
              className={`px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                verified && !importing
                  ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {importing ? 'Importing...' : 'Import to System'}
            </button>
          </div>

          {verified && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-center">
              <p className="text-green-800 font-medium">
                ✓ Verification successful! Ready to import.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Balances Table */}
      {balances.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Identifier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debit/Credit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {balances.map((balance, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        balance.type === 'STUDENT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {balance.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {balance.identifier}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {balance.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        balance.debitCredit === 'DEBIT'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {balance.debitCredit}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                    {formatCurrency(balance.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button
                      onClick={() => handleRemoveBalance(index)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {balances.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No balances loaded</p>
          <p className="text-sm">
            Upload a CSV file or add entries manually to get started
          </p>
        </div>
      )}

      {/* Add Balance Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Add Balance Entry
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newBalance.type}
                  onChange={(e) =>
                    setNewBalance({
                      ...newBalance,
                      type: e.target.value as 'STUDENT' | 'GL_ACCOUNT',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STUDENT">Student</option>
                  <option value="GL_ACCOUNT">GL Account</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {newBalance.type === 'STUDENT'
                    ? 'Student ID'
                    : 'GL Account Code'}
                </label>
                <input
                  type="text"
                  value={newBalance.identifier}
                  onChange={(e) =>
                    setNewBalance({ ...newBalance, identifier: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newBalance.name}
                  onChange={(e) =>
                    setNewBalance({ ...newBalance, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Debit/Credit
                </label>
                <select
                  value={newBalance.debitCredit}
                  onChange={(e) =>
                    setNewBalance({
                      ...newBalance,
                      debitCredit: e.target.value as 'DEBIT' | 'CREDIT',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (Kes)
                </label>
                <input
                  type="number"
                  value={newBalance.amount}
                  onChange={(e) =>
                    setNewBalance({
                      ...newBalance,
                      amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBalance}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
