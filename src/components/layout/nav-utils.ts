import type { NavItem } from './types'

export function getSectionTitle(pathname: string): string {
    if (pathname === '/') {
        return 'Overview'
    }
    const [firstSegment] = pathname.substring(1).split('/')
    return firstSegment.replace('-', ' ')
}

export function pathMatches(pathname: string, itemPath: string): boolean {
    if (itemPath === '/') { return pathname === '/' }
    return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

/** Walk the nav tree and return the chain of parent labels leading to `pathname`. */
export function findMenuChainForPath(pathname: string, items: NavItem[]): string[] | null {
    for (const item of items) {
        if (item.path && pathMatches(pathname, item.path)) {
            return []
        }
        if (item.children) {
            const result = findMenuChainForPath(pathname, item.children)
            if (result !== null) {
                return [item.label, ...result]
            }
        }
    }
    return null
}
