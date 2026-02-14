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
