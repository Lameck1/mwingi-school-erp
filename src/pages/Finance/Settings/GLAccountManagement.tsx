/**
 * GL Account Management Page
 * 
 * Allows viewing and managing the Chart of Accounts
 * Finance managers can activate/deactivate accounts and view account details
 */

import React, { useState, useEffect, useCallback } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb';
import { formatCurrencyFromCents } from '../../../utils/format';


interface GLAccount {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  isActive: boolean;
  description: string;
  currentBalance: number;
}

const getTypeColor = (type: string): string => {
  switch (type) {
    case 'ASSET':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
    case 'LIABILITY':
      return 'bg-red-500/15 text-red-600 dark:text-red-400';
    case 'EQUITY':
      return 'bg-purple-100 text-purple-800';
    case 'REVENUE':
      return 'bg-green-500/15 text-green-600 dark:text-green-400';
    case 'EXPENSE':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-secondary text-foreground';
  }
};

export const GLAccountManagement: React.FC = () => {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<GLAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await globalThis.electronAPI.getGLAccounts(
        filterType === 'ALL' ? undefined : { type: filterType }
      );
      const data = result?.data ?? [];
      // Map backend response to local interface
      const mapped: GLAccount[] = data.map((a) => ({
        code: a.account_code || '',
        name: a.account_name || '',
        type: a.account_type || 'ASSET',
        isActive: a.is_active !== false,
        description: a.description || '',
        currentBalance: Number(a.current_balance ?? 0),
      }));
      setAccounts(mapped);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    loadAccounts().catch((err: unknown) => console.error('Failed to load GL accounts', err));
  }, [loadAccounts]);

  const filteredAccounts = accounts.filter((account) => {
    const matchesType = filterType === 'ALL' || account.type === filterType;
    const matchesSearch =
      searchQuery === '' ||
      account.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Chart of Accounts' }]} />
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-foreground/50 mt-1">
            Manage General Ledger accounts and view balances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground/50">
            {filteredAccounts.length} accounts
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label htmlFor="gl-search" className="block text-sm font-medium text-foreground/70 mb-1">
              Search
            </label>
            <input
              id="gl-search"
              type="text"
              placeholder="Search by code or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Account Type Filter */}
          <div>
            <label htmlFor="gl-account-type-filter" className="block text-sm font-medium text-foreground/70 mb-1">
              Account Type
            </label>
            <select
              id="gl-account-type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="ALL">All Types</option>
              <option value="ASSET">Assets</option>
              <option value="LIABILITY">Liabilities</option>
              <option value="EQUITY">Equity</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expenses</option>
            </select>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-card rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading accounts...</div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-secondary">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Account Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Current Balance
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredAccounts.map((account) => (
                <tr
                  key={account.code}
                  className="hover:bg-secondary"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                    {account.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {account.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeColor(
                        account.type
                      )}`}
                    >
                      {account.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-foreground font-medium">
                    {formatCurrencyFromCents(account.currentBalance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${account.isActive
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-secondary text-foreground'
                        }`}
                    >
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedAccount(account)}
                      className="text-primary hover:text-primary/80 mr-3"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && filteredAccounts.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No accounts match your filters
          </div>
        )}
      </div>

      {/* Account Detail Modal */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-background/60 backdrop-blur-sm cursor-default"
            onClick={() => setSelectedAccount(null)}
            aria-label="Close modal"
          />
          <dialog
            className="bg-card rounded-lg shadow-xl p-6 max-w-md w-full relative z-10"
            open
            aria-label="Account Details"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Account Details
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground/70">Code</p>
                <p className="text-foreground font-mono">{selectedAccount.code}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground/70">Name</p>
                <p className="text-foreground">{selectedAccount.name}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground/70">Type</p>
                <p>
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeColor(
                      selectedAccount.type
                    )}`}
                  >
                    {selectedAccount.type}
                  </span>
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground/70">
                  Description
                </p>
                <p className="text-foreground">{selectedAccount.description}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground/70">
                  Current Balance
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrencyFromCents(selectedAccount.currentBalance)}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground/70">Status</p>
                <p>
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${selectedAccount.isActive
                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                        : 'bg-secondary text-foreground'
                      }`}
                  >
                    {selectedAccount.isActive ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSelectedAccount(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/70 bg-card border border-border rounded-md hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50"
              >
                Close
              </button>
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
};
