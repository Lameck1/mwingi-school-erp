import { describe, expect, it } from 'vitest'

import { findMenuChainForPath, getSectionTitle, hasMoreSpecificSiblingMatch, pathMatches } from '../nav-utils'

import type { NavItem } from '../types'

const stubIcon = (() => null) as NavItem['icon']

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

    it('pathMatches root path only matches exactly /', () => {
        expect(pathMatches('/', '/')).toBe(true)
        expect(pathMatches('/students', '/')).toBe(false)
    })

    it('detects when a more specific sibling should own active state', () => {
        expect(hasMoreSpecificSiblingMatch('/students/promotions', '/students', siblings)).toBe(true)
        expect(hasMoreSpecificSiblingMatch('/students/promotions/history', '/students', siblings)).toBe(true)
    })

    it('keeps parent active when no specific sibling matches current path', () => {
        expect(hasMoreSpecificSiblingMatch('/students/new', '/students', siblings)).toBe(false)
        expect(hasMoreSpecificSiblingMatch('/students', '/students', siblings)).toBe(false)
    })

    describe('getSectionTitle', () => {
        it('returns Overview for root path', () => {
            expect(getSectionTitle('/')).toBe('Overview')
        })

        it('returns first segment for simple path', () => {
            expect(getSectionTitle('/students')).toBe('students')
        })

        it('returns first segment for nested path', () => {
            expect(getSectionTitle('/students/new')).toBe('students')
        })

        it('replaces hyphens with spaces', () => {
            expect(getSectionTitle('/fee-management')).toBe('fee management')
        })

        it('returns empty string for empty path', () => {
            expect(getSectionTitle('')).toBe('')
        })
    })

    describe('findMenuChainForPath', () => {
        const tree: NavItem[] = [
            { path: '/', label: 'Dashboard', icon: stubIcon },
            {
                path: undefined, label: 'Academic', icon: stubIcon,
                children: [
                    { path: '/students', label: 'Students', icon: stubIcon },
                    { path: '/classes', label: 'Classes', icon: stubIcon }
                ]
            },
            {
                path: undefined, label: 'Finance', icon: stubIcon,
                children: [
                    {
                        path: undefined, label: 'Fees', icon: stubIcon,
                        children: [
                            { path: '/fees/collection', label: 'Collection', icon: stubIcon }
                        ]
                    }
                ]
            }
        ]

        it('returns empty array for direct top-level match', () => {
            expect(findMenuChainForPath('/', tree)).toEqual([])
        })

        it('returns parent chain for nested child', () => {
            expect(findMenuChainForPath('/students', tree)).toEqual(['Academic'])
        })

        it('returns parent chain for deeply nested child', () => {
            expect(findMenuChainForPath('/fees/collection', tree)).toEqual(['Finance', 'Fees'])
        })

        it('returns null when no match found', () => {
            expect(findMenuChainForPath('/nonexistent', tree)).toBeNull()
        })

        it('matches descendant paths of registered items', () => {
            expect(findMenuChainForPath('/students/new', tree)).toEqual(['Academic'])
        })
    })
})
