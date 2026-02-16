export interface MatchSelectionValidation {
    canMatch: boolean
    reason?: string
}

export interface MatchCandidate {
    id: number
    transaction_date: string
    debit_amount?: number
    credit_amount?: number
    amount?: number
}

export interface ParsedStatementLine {
    transaction_date: string
    description: string
    reference?: string | null
    debit_amount: number
    credit_amount: number
    running_balance?: number | null
}

export interface ParsedStatementCSV {
    lines: ParsedStatementLine[]
    errors: string[]
}

interface StatementColumnIndexes {
    dateIndex: number
    descriptionIndex: number
    debitIndex: number
    creditIndex: number
    referenceIndex: number
    runningBalanceIndex: number
}

interface ParsedRowResult {
    line?: ParsedStatementLine
    error?: string
}

function parseCsvRow(row: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < row.length; index += 1) {
        const char = row[index]
        if (char === '"') {
            const nextChar = row[index + 1]
            if (inQuotes && nextChar === '"') {
                current += '"'
                index += 1
                continue
            }
            inQuotes = !inQuotes
            continue
        }
        if (char === ',' && !inQuotes) {
            values.push(current.trim())
            current = ''
            continue
        }
        current += char
    }

    values.push(current.trim())
    return values
}

function parseAmountToCents(raw: string): number | null {
    if (!raw) {
        return 0
    }
    const sanitized = raw.replaceAll(/[^0-9.-]/g, '')
    if (!sanitized) {
        return 0
    }
    const amount = Number.parseFloat(sanitized)
    if (!Number.isFinite(amount)) {
        return null
    }
    return Math.round(amount * 100)
}

function normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

function findColumnIndex(headers: string[], candidates: string[]): number {
    const normalizedCandidates = candidates.map((candidate) => normalizeHeader(candidate))
    return headers.findIndex((header) => normalizedCandidates.includes(header))
}

function parseStatementRow(values: string[], rowLabel: string, indexes: StatementColumnIndexes): ParsedRowResult {
    const rawDate = values[indexes.dateIndex] || ''
    const rawDescription = values[indexes.descriptionIndex] || ''
    const rawDebit = indexes.debitIndex >= 0 ? values[indexes.debitIndex] || '' : '0'
    const rawCredit = indexes.creditIndex >= 0 ? values[indexes.creditIndex] || '' : '0'

    if (!rawDate) {
        return { error: `${rowLabel}: transaction date is required` }
    }
    if (!rawDescription) {
        return { error: `${rowLabel}: description is required` }
    }

    const parsedDate = new Date(rawDate)
    if (Number.isNaN(parsedDate.getTime())) {
        return { error: `${rowLabel}: invalid transaction date "${rawDate}"` }
    }

    const debitCents = parseAmountToCents(rawDebit)
    const creditCents = parseAmountToCents(rawCredit)
    if (debitCents === null || creditCents === null) {
        return { error: `${rowLabel}: invalid debit or credit amount` }
    }

    const hasDebit = debitCents > 0
    const hasCredit = creditCents > 0
    if (hasDebit === hasCredit) {
        return { error: `${rowLabel}: exactly one of debit or credit must be greater than zero` }
    }

    const runningBalanceRaw = indexes.runningBalanceIndex >= 0 ? values[indexes.runningBalanceIndex] || '' : ''
    const runningBalance = parseAmountToCents(runningBalanceRaw)
    if (runningBalanceRaw && runningBalance === null) {
        return { error: `${rowLabel}: invalid running balance` }
    }

    return {
        line: {
            transaction_date: parsedDate.toISOString().slice(0, 10),
            description: rawDescription,
            reference: indexes.referenceIndex >= 0 ? values[indexes.referenceIndex] || null : null,
            debit_amount: debitCents,
            credit_amount: creditCents,
            running_balance: runningBalance
        }
    }
}

export function parseStatementCSV(csv: string): ParsedStatementCSV {
    const rows = csv
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter((row) => row.length > 0)

    if (rows.length < 2) {
        return { lines: [], errors: ['CSV must contain a header row and at least one data row'] }
    }

    const headers = parseCsvRow(rows[0]).map((header) => normalizeHeader(header))
    const indexes: StatementColumnIndexes = {
        dateIndex: findColumnIndex(headers, ['date', 'transactiondate', 'transaction_date']),
        descriptionIndex: findColumnIndex(headers, ['description', 'narration', 'details']),
        debitIndex: findColumnIndex(headers, ['debit', 'withdrawal', 'amountout']),
        creditIndex: findColumnIndex(headers, ['credit', 'deposit', 'amountin']),
        referenceIndex: findColumnIndex(headers, ['reference', 'ref', 'transactionref']),
        runningBalanceIndex: findColumnIndex(headers, ['runningbalance', 'balance', 'closingbalance'])
    }

    if (indexes.dateIndex < 0 || indexes.descriptionIndex < 0 || (indexes.debitIndex < 0 && indexes.creditIndex < 0)) {
        return {
            lines: [],
            errors: ['CSV must include date, description, and at least one of debit/credit columns']
        }
    }

    const errors: string[] = []
    const lines: ParsedStatementLine[] = []

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const values = parseCsvRow(rows[rowIndex])
        const rowLabel = `Row ${rowIndex + 1}`
        const parsedRow = parseStatementRow(values, rowLabel, indexes)
        if (parsedRow.error) {
            errors.push(parsedRow.error)
            continue
        }
        if (parsedRow.line) {
            lines.push(parsedRow.line)
        }
    }

    return { lines, errors }
}

export function validateMatchSelection(
    selectedLine: MatchCandidate | null,
    selectedTransaction: MatchCandidate | null,
    accountId: number | null,
    amountToleranceCents = 100,
    dateToleranceDays = 7
): MatchSelectionValidation {
    if (!accountId) {
        return {
            canMatch: false,
            reason: 'Select a bank account first'
        }
    }

    if (!selectedLine) {
        return {
            canMatch: false,
            reason: 'Select a bank statement line first'
        }
    }

    if (!selectedTransaction) {
        return {
            canMatch: false,
            reason: 'Select a ledger transaction to match'
        }
    }

    const lineAmount = Math.abs((selectedLine.credit_amount || 0) - (selectedLine.debit_amount || 0))
    const txAmount = Math.abs(selectedTransaction.amount || 0)
    if (Math.abs(lineAmount - txAmount) > amountToleranceCents) {
        return {
            canMatch: false,
            reason: `Amount mismatch exceeds tolerance (${amountToleranceCents} cents)`
        }
    }

    const lineDate = new Date(selectedLine.transaction_date)
    const txDate = new Date(selectedTransaction.transaction_date)
    const diffDays = Math.abs(lineDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > dateToleranceDays) {
        return {
            canMatch: false,
            reason: `Date mismatch exceeds ${dateToleranceDays}-day tolerance`
        }
    }

    return { canMatch: true }
}
