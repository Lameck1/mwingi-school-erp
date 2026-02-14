export interface PasswordStrengthResult {
  isValid: boolean
  score: number // 0-4
  label: 'Weak' | 'Fair' | 'Good' | 'Strong'
  errors: string[]
}

const MIN_LENGTH = 8

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = []
  let score = 0

  if (password.length >= MIN_LENGTH) {
    score++
  } else {
    errors.push(`At least ${MIN_LENGTH} characters`)
  }

  if (/[a-z]/.test(password)) {
    score++
  } else {
    errors.push('At least one lowercase letter')
  }

  if (/[A-Z]/.test(password)) {
    score++
  } else {
    errors.push('At least one uppercase letter')
  }

  if (/\d/.test(password)) {
    score++
  } else {
    errors.push('At least one digit')
  }

  const labels: Record<number, PasswordStrengthResult['label']> = {
    0: 'Weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  }

  return {
    isValid: errors.length === 0,
    score,
    label: labels[score] ?? 'Weak',
    errors,
  }
}
