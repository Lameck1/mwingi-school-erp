/**
 * Shared data transformation utilities for DB ↔ App boundary conversions.
 */

export const toDbGender = (gender: string): string => {
    const normalized = gender.toUpperCase()
    if (normalized === 'MALE') {return 'M'}
    if (normalized === 'FEMALE') {return 'F'}
    return gender
}

export const fromDbGender = (gender: string): string => {
    if (gender === 'M') {return 'MALE'}
    if (gender === 'F') {return 'FEMALE'}
    return gender
}

export const toDbActiveFlag = (value: boolean): number => {
    return value ? 1 : 0
}
