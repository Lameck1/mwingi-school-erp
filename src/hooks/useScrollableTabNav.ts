import { useRef, useCallback } from 'react'

/**
 * Reusable hook for horizontal tab navigation with bidirectional auto-scroll.
 *
 * When a user clicks a tab near the edges of the scrollable container,
 * `scrollIntoView` smoothly reveals hidden tabs in both directions.
 *
 * Usage:
 *   const { navRef, handleTabClick } = useScrollableTabNav(setActiveTab)
 *   <nav ref={navRef}>
 *     <button data-tab={id} onClick={() => handleTabClick(id)} ... />
 *   </nav>
 */
export function useScrollableTabNav<T extends string>(
    onTabChange: (tabId: T) => void
) {
    const navRef = useRef<HTMLElement>(null)

    const handleTabClick = useCallback(
        (tabId: T) => {
            onTabChange(tabId)

            // Scroll the clicked tab into the visible area of the nav container
            const nav = navRef.current
            if (nav) {
                const btn = nav.querySelector<HTMLElement>(`[data-tab="${tabId}"]`)
                btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }
        },
        [onTabChange]
    )

    return { navRef, handleTabClick } as const
}
