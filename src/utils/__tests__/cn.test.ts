import { describe, it, expect } from 'vitest'

import { cn } from '../cn'

describe('cn', () => {
  it('merges class strings', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })

  it('resolves Tailwind conflicts (last wins)', () => {
    // twMerge ensures px-4 overrides px-2
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes via clsx', () => {
    const isHidden = false
    expect(cn('base', isHidden && 'hidden', 'text-sm')).toBe('base text-sm')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null gracefully', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b')
  })
})
