interface SidebarBackdropProps {
    isOpen: boolean
    closeSidebar: () => void
}

export function SidebarBackdrop({ isOpen, closeSidebar }: Readonly<SidebarBackdropProps>) {
    if (!isOpen) {
        return null
    }

    return (
        <button
            type="button"
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
            onClick={closeSidebar}
            aria-label="Close sidebar"
        />
    )
}
