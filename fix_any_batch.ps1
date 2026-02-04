# Fix common 'any' parameter patterns

Get-ChildItem -Path . -Include *.ts,*.tsx -Recurse -File | Where-Object { 
    $_.FullName -notmatch 'node_modules' -and 
    $_.FullName -notmatch 'dist' 
} | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    
    # Fix common patterns where 'any' can be replaced with 'unknown'
    # Pattern: function params, array types, variables
    
    # Fix: (data: any) => to (data: unknown) => in handlers where data is just passed through
    $content = $content -replace '\(([a-zA-Z_][a-zA-Z0-9_]*):\s*any\)(\s*=>)', '($1: unknown)$2'
    
    # Fix: : any[] to : unknown[]
    $content = $content -replace ':\s*any\[\]', ': unknown[]'
    
    # Fix: variable declarations like 'let x: any'
    $content = $content -replace '(let|const|var)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*any\s*=', '$1 $2: unknown ='
    
    # Fix: return type any to unknown in simple cases
    $content = $content -replace '(async\s+)?function\s+[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\):\s*any\s*\{', '$1function $2($3): unknown {'
    
    if ($content -ne $original) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed any types in: $($_.Name)"
    }
}

Write-Host "Batch 'any' type replacement complete"
