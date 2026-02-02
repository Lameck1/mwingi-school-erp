import { Menu, MenuItemConstructorOptions, app, shell, BrowserWindow, dialog } from 'electron'

export function createApplicationMenu(mainWindow: BrowserWindow): void {
    const isMac = process.platform === 'darwin'

    const template: MenuItemConstructorOptions[] = [
        // App Menu (macOS only)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const }
            ]
        }] : []),

        // File Menu
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Student',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    click: () => mainWindow.webContents.send('navigate', '/students/new')
                },
                {
                    label: 'Record Payment',
                    accelerator: 'CmdOrCtrl+Shift+P',
                    click: () => mainWindow.webContents.send('navigate', '/fee-payment')
                },
                { type: 'separator' },
                {
                    label: 'Import Data...',
                    accelerator: 'CmdOrCtrl+I',
                    click: () => mainWindow.webContents.send('open-import-dialog')
                },
                // {
                //   label: 'Export Data...',
                //   accelerator: 'CmdOrCtrl+E',
                //   click: () => mainWindow.webContents.send('open-export-dialog')
                // },
                { type: 'separator' },
                {
                    label: 'Print',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => mainWindow.webContents.send('trigger-print')
                },
                { type: 'separator' },
                {
                    label: 'Backup Database',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: 'Backup Database',
                            defaultPath: `school-erp-backup-${new Date().toISOString().slice(0, 10)}.db`,
                            filters: [{ name: 'Database', extensions: ['db'] }]
                        })
                        if (!result.canceled && result.filePath) {
                            mainWindow.webContents.send('backup-database', result.filePath)
                        }
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' as const } : { role: 'quit' as const }
            ]
        },

        // Edit Menu
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' as const },
                { role: 'redo' as const },
                { type: 'separator' },
                { role: 'cut' as const },
                { role: 'copy' as const },
                { role: 'paste' as const },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle' as const },
                    { role: 'delete' as const },
                    { role: 'selectAll' as const },
                ] : [
                    { role: 'delete' as const },
                    { type: 'separator' as const },
                    { role: 'selectAll' as const }
                ])
            ]
        },

        // View Menu
        {
            label: 'View',
            submenu: [
                { role: 'reload' as const },
                { role: 'forceReload' as const },
                { role: 'toggleDevTools' as const },
                { type: 'separator' },
                { role: 'resetZoom' as const },
                { role: 'zoomIn' as const },
                { role: 'zoomOut' as const },
                { type: 'separator' },
                { role: 'togglefullscreen' as const }
            ]
        },

        // Navigate Menu
        {
            label: 'Navigate',
            submenu: [
                {
                    label: 'Dashboard',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => mainWindow.webContents.send('navigate', '/')
                },
                {
                    label: 'Students',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => mainWindow.webContents.send('navigate', '/students')
                },
                {
                    label: 'Fee Payment',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => mainWindow.webContents.send('navigate', '/fee-payment')
                },
                {
                    label: 'Invoices',
                    accelerator: 'CmdOrCtrl+4',
                    click: () => mainWindow.webContents.send('navigate', '/invoices')
                },
                {
                    label: 'Reports',
                    accelerator: 'CmdOrCtrl+5',
                    click: () => mainWindow.webContents.send('navigate', '/reports')
                },
                { type: 'separator' },
                {
                    label: 'Go Back',
                    accelerator: 'CmdOrCtrl+[',
                    click: () => mainWindow.webContents.goBack()
                },
                {
                    label: 'Go Forward',
                    accelerator: 'CmdOrCtrl+]',
                    click: () => mainWindow.webContents.goForward()
                },
                { type: 'separator' },
                {
                    label: 'Command Palette',
                    accelerator: 'CmdOrCtrl+K',
                    click: () => mainWindow.webContents.send('open-command-palette')
                }
            ]
        },

        // Reports Menu
        {
            label: 'Reports',
            submenu: [
                {
                    label: 'Fee Collection Report',
                    click: () => mainWindow.webContents.send('navigate', '/reports?tab=fee-collection')
                },
                {
                    label: 'Fee Defaulters',
                    click: () => mainWindow.webContents.send('navigate', '/reports?tab=defaulters')
                },
                {
                    label: 'Financial Summary',
                    click: () => mainWindow.webContents.send('navigate', '/reports?tab=financial')
                },
                { type: 'separator' },
                {
                    label: 'Attendance Report',
                    click: () => mainWindow.webContents.send('navigate', '/reports/attendance')
                },
                {
                    label: 'Student Enrollment',
                    click: () => mainWindow.webContents.send('navigate', '/reports/enrollment')
                },
                { type: 'separator' },
                {
                    label: 'Audit Log',
                    click: () => mainWindow.webContents.send('navigate', '/audit-log')
                }
            ]
        },

        // Window Menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' as const },
                { role: 'zoom' as const },
                ...(isMac ? [
                    { type: 'separator' as const },
                    { role: 'front' as const },
                ] : [
                    { role: 'close' as const }
                ])
            ]
        },

        // Help Menu
        {
            role: 'help' as const,
            submenu: [
                {
                    label: 'Documentation',
                    click: async () => {
                        await shell.openExternal('https://github.com/Lameck1/mwingi-school-erp/wiki')
                    }
                },
                {
                    label: 'Report Issue',
                    click: async () => {
                        await shell.openExternal('https://github.com/Lameck1/mwingi-school-erp/issues')
                    }
                },
                { type: 'separator' },
                {
                    label: 'Check for Updates',
                    click: () => mainWindow.webContents.send('check-for-updates')
                },
                { type: 'separator' },
                {
                    label: `About ${app.name}`,
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: `About ${app.name}`,
                            message: `${app.name}`,
                            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`
                        })
                    }
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}
