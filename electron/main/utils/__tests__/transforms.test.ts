import { describe, it, expect } from 'vitest'

import { toDbGender, fromDbGender, toDbActiveFlag } from '../transforms'

describe('toDbGender', () => {
    it('converts "MALE" to "M"', () => {
        expect(toDbGender('MALE')).toBe('M')
    })

    it('converts "male" to "M"', () => {
        expect(toDbGender('male')).toBe('M')
    })

    it('converts "Male" to "M"', () => {
        expect(toDbGender('Male')).toBe('M')
    })

    it('converts "FEMALE" to "F"', () => {
        expect(toDbGender('FEMALE')).toBe('F')
    })

    it('converts "female" to "F"', () => {
        expect(toDbGender('female')).toBe('F')
    })

    it('passes through unknown gender values', () => {
        expect(toDbGender('OTHER')).toBe('OTHER')
    })
})

describe('fromDbGender', () => {
    it('converts "M" to "MALE"', () => {
        expect(fromDbGender('M')).toBe('MALE')
    })

    it('converts "F" to "FEMALE"', () => {
        expect(fromDbGender('F')).toBe('FEMALE')
    })

    it('passes through unknown gender values', () => {
        expect(fromDbGender('X')).toBe('X')
    })
})

describe('toDbActiveFlag', () => {
    it('converts true to 1', () => {
        expect(toDbActiveFlag(true)).toBe(1)
    })

    it('converts false to 0', () => {
        expect(toDbActiveFlag(false)).toBe(0)
    })
})
