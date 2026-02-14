import { Suspense, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'

import { ErrorBoundary } from './ErrorBoundary'
import { Header } from './layout/Header'
import { OfflineBanner } from './layout/OfflineBanner'
import { PageLoader } from './layout/PageLoader'
import { Sidebar } from './layout/Sidebar'
import { SidebarBackdrop } from './layout/SidebarBackdrop'
import { useLayoutModel } from './layout/useLayoutModel'
import { CommandPalette } from './patterns/CommandPalette'

export default function Layout() {
    const model = useLayoutModel()
    const mainRef = useRef<HTMLElement>(null)

    // Scroll to top on route change
    useEffect(() => {
        mainRef.current?.scrollTo(0, 0)
    }, [model.pathname])

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <CommandPalette />
            <SidebarBackdrop isOpen={model.isSidebarOpen} closeSidebar={() => model.setIsSidebarOpen(false)} />
            <Sidebar model={model} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {!model.isOnline && <OfflineBanner />}
                <Header model={model} />
                <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 no-scrollbar scroll-smooth">
                    <div className="max-w-7xl mx-auto pb-12">
                        <ErrorBoundary>
                            <Suspense fallback={<PageLoader />}>
                                <Outlet />
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                </main>
            </div>
        </div>
    )
}
