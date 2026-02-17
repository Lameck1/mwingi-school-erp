import type { NavItem } from './types'

export function getSectionTitle(pathname: string): string {
    if (pathname === '/') {
        return 'Overview'
    }
    const segments = pathname.substring(1).split('/')
    const firstSegment = segments[0] ?? ''
    return firstSegment.replace('-', ' ')
}

export function pathMatches(pathname: string, itemPath: string): boolean {
    if (itemPath === '/') { return pathname === '/' }
    return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

export function hasMoreSpecificSiblingMatch(pathname: string, itemPath: string, siblings: NavItem[]): boolean {
    return siblings.some((sibling) => {
        if (!sibling.path || sibling.path === itemPath) {
            return false
        }
        if (!sibling.path.startsWith(itemPath + '/')) {
            return false
        }
        return pathMatches(pathname, sibling.path)
    })
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
