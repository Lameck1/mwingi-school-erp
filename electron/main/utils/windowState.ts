import { app, BrowserWindow, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface WindowState {
    x: number
    y: number
    width: number
    height: number
    isMaximized: boolean
}

const DEFAULT_STATE: WindowState = {
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
    isMaximized: false
}

export class WindowStateManager {
    private state: WindowState
    private window: BrowserWindow | null = null
    private stateFilePath: string
    private saveTimeout: NodeJS.Timeout | null = null

    constructor(windowName: string = 'main') {
        this.stateFilePath = path.join(app.getPath('userData'), `window-state-${windowName}.json`)
        this.state = this.loadState()
    }

    /**
     * Load state from file
     */
    private loadState(): WindowState {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const data = fs.readFileSync(this.stateFilePath, 'utf-8')
                const savedState = JSON.parse(data) as WindowState

                // Validate state is within screen bounds
                if (this.isValidState(savedState)) {
                    return savedState
                }
            }
        } catch (error) {
            console.error('Failed to load window state:', error)
        }

        return { ...DEFAULT_STATE }
    }

    /**
     * Validate that window position is visible on a screen
     */
    private isValidState(state: WindowState): boolean {
        const displays = screen.getAllDisplays()

        return displays.some(display => {
            const { x, y, width, height } = display.bounds
            return (
                state.x >= x &&
                state.y >= y &&
                state.x + state.width <= x + width &&
                state.y + state.height <= y + height
            )
        })
    }

    /**
     * Save state to file (debounced)
     */
    private saveState(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout)
        }

        this.saveTimeout = setTimeout(() => {
            try {
                fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2))
            } catch (error) {
                console.error('Failed to save window state:', error)
            }
        }, 500)
    }

    /**
     * Update state from window
     */
    private updateState(): void {
        if (!this.window || this.window.isDestroyed()) return

        const isMaximized = this.window.isMaximized()

        if (!isMaximized) {
            const bounds = this.window.getBounds()
            this.state.x = bounds.x
            this.state.y = bounds.y
            this.state.width = bounds.width
            this.state.height = bounds.height
        }

        this.state.isMaximized = isMaximized
        this.saveState()
    }

    /**
     * Manage a window's state
     */
    manage(window: BrowserWindow): void {
        this.window = window

        // Apply saved state
        if (this.state.isMaximized) {
            window.maximize()
        } else {
            window.setBounds({
                x: this.state.x,
                y: this.state.y,
                width: this.state.width,
                height: this.state.height
            })
        }

        // Listen for state changes
        window.on('resize', () => this.updateState())
        window.on('move', () => this.updateState())
        window.on('maximize', () => this.updateState())
        window.on('unmaximize', () => this.updateState())
        window.on('close', () => this.updateState())
    }

    /**
     * Get current state for window creation
     */
    getState(): WindowState {
        return { ...this.state }
    }
}
