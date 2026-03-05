const fs = require('node:fs')
const path = require('node:path')

const coverageSummaryPath = path.resolve(process.cwd(), 'coverage', 'coverage-summary.json')

if (!fs.existsSync(coverageSummaryPath)) {
  console.error(`Coverage summary not found: ${coverageSummaryPath}`)
  console.error('Run `npx vitest run --coverage` before checking critical module floors.')
  process.exit(1)
}

const summary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'))
const files = Object.keys(summary).filter((key) => key !== 'total')

const CRITICAL_FLOORS = {
  'electron/main/ipc/ipc-result.ts': { lines: 60, functions: 55, branches: 45, statements: 60 },
  'electron/main/ipc/auth/auth-handlers.ts': { lines: 60, functions: 55, branches: 45, statements: 60 },
  'electron/main/services/data/DataImportService.ts': { lines: 60, functions: 55, branches: 45, statements: 60 },
  'electron/main/services/reports/ReportScheduler.ts': { lines: 60, functions: 55, branches: 45, statements: 60 }
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/')
}

const failures = []

for (const [targetSuffix, floors] of Object.entries(CRITICAL_FLOORS)) {
  const target = files.find((file) => normalizePath(file).endsWith(targetSuffix))
  if (!target) {
    failures.push(`Missing coverage entry for critical module: ${targetSuffix}`)
    continue
  }

  const metrics = summary[target]
  for (const metric of ['lines', 'functions', 'branches', 'statements']) {
    const actual = metrics?.[metric]?.pct
    const required = floors[metric]
    if (typeof actual !== 'number') {
      failures.push(`Coverage metric missing for ${targetSuffix} -> ${metric}`)
      continue
    }
    if (actual < required) {
      failures.push(
        `${targetSuffix} ${metric} coverage ${actual.toFixed(2)}% is below required ${required}%`
      )
    }
  }
}

if (failures.length > 0) {
  console.error('Critical coverage check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Critical coverage check passed for all guarded modules.')
