# Fix _event: any to _event: IpcMainInvokeEvent

Get-ChildItem -Path ./electron/main/ipc -Include *.ts -Recurse -File | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    $changed = $false
    
    # Check if IpcMainInvokeEvent is imported
    if ($content -match 'IpcMainInvokeEvent') {
        # Already imported, just replace _event: any
        $content = $content -replace '(_event):\s*any', '$1: IpcMainInvokeEvent'
        if ($content -ne $original) { $changed = $true }
    }
    elseif ($content -match '_event:\s*any') {
        # Need to add import
        if ($content -match "import\s*\{[^}]*\}\s*from\s*'electron'") {
            # Has electron import, add to existing
            $content = $content -replace "(import\s*\{)([^}]*)\}\s*from\s*'electron'", "$1$2, type IpcMainInvokeEvent } from 'electron'"
        }
        elseif ($content -match "import.*from\s*'../../electron-env'") {
            # Has electron-env import, add to existing
            $content = $content -replace "(import\s*\{)([^}]*)\}\s*from\s*'../../electron-env'", "$1$2, type IpcMainInvokeEvent } from '../../electron-env'"
        }
        
        # Replace _event: any
        $content = $content -replace '(_event):\s*any', '$1: IpcMainInvokeEvent'
        if ($content -ne $original) { $changed = $true }
    }
    
    if ($changed) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed IPC handler: $($_.Name)"
    }
}

Write-Host "IPC event type fix complete"
