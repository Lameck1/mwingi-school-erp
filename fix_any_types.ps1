# Script to fix common lint warnings

# 1. Fix 'as any' to proper types in db queries - replace with 'unknown'
Get-ChildItem -Path . -Include *.ts,*.tsx -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    
    # Replace '.get() as any' with '.get() as unknown'
    $content = $content -replace '\.get\(\)\s*as\s+any', '.get() as unknown'
    
    # Replace '.all() as any' with '.all() as unknown'  
    $content = $content -replace '\.all\(\)\s*as\s+any', '.all() as unknown'
    
    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed: $($_.Name)"
    }
}

Write-Host "Batch fix complete"
