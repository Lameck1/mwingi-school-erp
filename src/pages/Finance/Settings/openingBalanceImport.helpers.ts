import { getIPCFailureMessage, isIPCFailure } from '../../../utils/ipc'

export interface ImportedBalance {
  type: 'STUDENT' | 'GL_ACCOUNT';
  identifier: string;
  name: string;
  amount: number;
  debitCredit: 'DEBIT' | 'CREDIT';
}

const findFirstIndex = (values: string[], candidates: string[]): number => {
  for (const candidate of candidates) {
    const idx = values.indexOf(candidate);
    if (idx >= 0) {
      return idx;
    }
  }
  return -1;
};

export const parseCsvBalances = (text: string): { balances: ImportedBalance[]; error?: string } => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { balances: [], error: 'CSV file must have a header row and at least one data row' };
  }

  const header = (lines[0] ?? '').split(',').map(h => h.trim().toLowerCase());
  const typeIdx = header.indexOf('type');
  const idIdx = findFirstIndex(header, ['identifier', 'id', 'code']);
  const nameIdx = header.indexOf('name');
  const amountIdx = header.indexOf('amount');
  const dcIdx = findFirstIndex(header, ['debit_credit', 'debitcredit', 'dc']);

  if (typeIdx === -1 || idIdx === -1 || amountIdx === -1) {
    return { balances: [], error: 'CSV must have columns: type, identifier, amount (and optionally: name, debit_credit)' };
  }

  const parsed: ImportedBalance[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(',').map(c => c.trim());
    if (cols.length < Math.max(typeIdx, idIdx, amountIdx) + 1) {continue;}

    const type = (cols[typeIdx] ?? '').toUpperCase() as 'STUDENT' | 'GL_ACCOUNT';
    const amount = Number.parseFloat(cols[amountIdx] ?? '');
    if (Number.isNaN(amount) || amount <= 0) {continue;}

    parsed.push({
      type: type === 'GL_ACCOUNT' ? 'GL_ACCOUNT' : 'STUDENT',
      identifier: cols[idIdx] ?? '',
      name: nameIdx >= 0 ? (cols[nameIdx] ?? '') : (cols[idIdx] ?? ''),
      amount,
      debitCredit: dcIdx >= 0 && (cols[dcIdx] ?? '').toUpperCase().startsWith('C') ? 'CREDIT' : 'DEBIT'
    });
  }

  return { balances: parsed };
};

export const getResultMessage = (value: unknown, fallback: string): string => {
  if (isIPCFailure(value)) {
    return getIPCFailureMessage(value, fallback)
  }
  if (value && typeof value === 'object') {
    const maybe = value as { error?: unknown; message?: unknown }
    if (typeof maybe.error === 'string' && maybe.error.trim()) {
      return maybe.error
    }
    if (typeof maybe.message === 'string' && maybe.message.trim()) {
      return maybe.message
    }
  }
  return fallback
}
