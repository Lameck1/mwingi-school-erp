import type { AllocationData, ScholarshipData } from './ScholarshipService'

export interface LegacyScholarshipData {
  name?: unknown
  description?: unknown
  scholarship_type?: unknown
  type?: unknown
  amount?: unknown
  totalAmount?: unknown
  total_amount?: unknown
  percentage?: unknown
  max_beneficiaries?: unknown
  maxBeneficiaries?: unknown
  eligibility_criteria?: unknown
  eligibilityCriteria?: unknown
  valid_from?: unknown
  startDate?: unknown
  validFrom?: unknown
  valid_to?: unknown
  endDate?: unknown
  validTo?: unknown
  sponsor_name?: unknown
  sponsor_contact?: unknown
  userId?: unknown
  user_id?: unknown
}

export interface LegacyAllocationData {
  scholarship_id?: unknown
  scholarshipId?: unknown
  student_id?: unknown
  studentId?: unknown
  amount_allocated?: unknown
  amount?: unknown
  allocation_notes?: unknown
  notes?: unknown
  effective_date?: unknown
  allocationDate?: unknown
  userId?: unknown
  user_id?: unknown
}

const toNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const toStringValue = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

const firstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const candidate = toNumber(value)
    if (candidate !== undefined) {
      return candidate
    }
  }

  return undefined
}

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const candidate = toStringValue(value)
    if (candidate !== undefined) {
      return candidate
    }
  }

  return undefined
}

const todayIsoDate = (): string => new Date().toISOString().split('T')[0]

export const normalizeScholarshipData = (data: ScholarshipData | LegacyScholarshipData): ScholarshipData => {
  return {
    name: firstString(data.name) ?? '',
    description: firstString(data.description) ?? '',
    scholarship_type:
      (firstString(data.scholarship_type, data.type) as ScholarshipData['scholarship_type'] | undefined) ??
      'MERIT',
    amount: firstNumber(data.amount, data.totalAmount, data.total_amount) ?? 0,
    percentage: toNumber(data.percentage),
    max_beneficiaries: firstNumber(data.max_beneficiaries, data.maxBeneficiaries) ?? 9999,
    eligibility_criteria: firstString(data.eligibility_criteria, data.eligibilityCriteria) ?? '',
    valid_from: firstString(data.valid_from, data.startDate, data.validFrom) ?? todayIsoDate(),
    valid_to: firstString(data.valid_to, data.endDate, data.validTo) ?? todayIsoDate(),
    sponsor_name: firstString(data.sponsor_name),
    sponsor_contact: firstString(data.sponsor_contact)
  }
}

export const normalizeAllocationData = (data: AllocationData | LegacyAllocationData): AllocationData => {
  return {
    scholarship_id: firstNumber(data.scholarship_id, data.scholarshipId) ?? 0,
    student_id: firstNumber(data.student_id, data.studentId) ?? 0,
    amount_allocated: firstNumber(data.amount_allocated, data.amount) ?? 0,
    allocation_notes: firstString(data.allocation_notes, data.notes) ?? '',
    effective_date: firstString(data.effective_date, data.allocationDate) ?? todayIsoDate()
  }
}

export const extractLegacyUserId = (data: LegacyScholarshipData | LegacyAllocationData): number | undefined => {
  return firstNumber(data.userId, data.user_id)
}
