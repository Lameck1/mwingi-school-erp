import { describe, expect, it } from 'vitest'

import { hasMoreSpecificSiblingMatch, pathMatches } from '../nav-utils'

import type { NavItem } from '../types'

const stubIcon = (() => null) as unknown as NavItem['icon']

const siblings: NavItem[] = [
    { path: '/students', label: 'Students', icon: stubIcon },
    { path: '/students/promotions', label: 'Promotions', icon: stubIcon },
    { path: '/attendance', label: 'Attendance', icon: stubIcon }
]

describe('nav utils', () => {
    it('matches exact and descendant paths', () => {
        expect(pathMatches('/students', '/students')).toBe(true)
        expect(pathMatches('/students/promotions', '/students')).toBe(true)
        expect(pathMatches('/studentship', '/students')).toBe(false)
    })

    it('detects when a more specific sibling should own active state', () => {
        expect(hasMoreSpecificSiblingMatch('/students/promotions', '/students', siblings)).toBe(true)
        expect(hasMoreSpecificSiblingMatch('/students/promotions/history', '/students', siblings)).toBe(true)
    })

    it('keeps parent active when no specific sibling matches current path', () => {
        expect(hasMoreSpecificSiblingMatch('/students/new', '/students', siblings)).toBe(false)
        expect(hasMoreSpecificSiblingMatch('/students', '/students', siblings)).toBe(false)
    })
})
