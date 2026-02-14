export function PageLoader() {
    return (
        <div className="space-y-6 animate-pulse pt-2">
            <div className="h-7 w-56 bg-secondary/50 rounded-lg" />
            <div className="flex gap-4">
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl" />
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl" />
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl hidden md:block" />
            </div>
            <div className="h-96 bg-secondary/20 rounded-xl" />
        </div>
    )
}
