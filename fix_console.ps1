# Replace console.log with console.error in migration files and handlers

Get-ChildItem -Path ./electron/main/database/migrations -Include *.ts -Recurse -File | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    
    # Replace console.log with console.error (more appropriate for migrations)
    $content = $content -replace 'console\.log\(', 'console.error('
    
    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed console in: $($_.Name)"
    }
}

# Also fix console.log in migration-runner and main index
Get-ChildItem -Path ./electron/main -Include migration-runner.ts,index.ts -Recurse -File | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    
    $content = $content -replace 'console\.log\(', 'console.error('
    
    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed console in: $($_.Name)"
    }
}

# Fix console in test files - modular-ipc.test.ts
$testFile = "./electron/main/__tests__/modular-ipc.test.ts"
if (Test-Path $testFile) {
    $content = Get-Content $testFile -Raw
    $content = $content -replace 'console\.log\(', 'console.error('
    Set-Content -Path $testFile -Value $content -NoNewline
    Write-Host "Fixed console in: modular-ipc.test.ts"
}

Write-Host "Console statement fix complete"
