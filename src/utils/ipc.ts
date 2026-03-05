export interface IPCFailure {
  success: false
  error?: string
  message?: string
  errors?: string[]
}

export function isIPCFailure(value: unknown): value is IPCFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as { success?: unknown }).success === false
  )
}

export function getIPCFailureMessage(value: IPCFailure, fallback = 'Operation failed'): string {
  if (value.error?.trim()) {
    return value.error
  }
  if (value.message?.trim()) {
    return value.message
  }
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    return value.errors.join(', ')
  }
  return fallback
}

export function unwrapIPCResult<T>(value: T | IPCFailure, fallback = 'Operation failed'): T {
  if (isIPCFailure(value)) {
    throw new TypeError(getIPCFailureMessage(value, fallback))
  }
  return value
}

export function unwrapArrayResult<T>(value: T[] | IPCFailure, fallback = 'Expected a list response'): T[] {
  const resolved = unwrapIPCResult(value, fallback)
  if (!Array.isArray(resolved)) {
    throw new TypeError(fallback)
  }
  return resolved
}
