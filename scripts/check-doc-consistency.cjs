const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.readFileSync(absolutePath, 'utf8')
}

function assertContains(content, needle, context, failures) {
  if (!content.includes(needle)) {
    failures.push(`${context} is missing required text: ${needle}`)
  }
}

const failures = []

const workflow = read('.github/workflows/build.yml')
const runbook = read('OPERATIONS_RUNBOOK.md')
const signingDoc = read('CODE_SIGNING_CONFIG.md')
const gettingStarted = read('docs/getting-started.md')
const packageJson = JSON.parse(read('package.json'))

const workflowCommands = [
  'npm run typecheck:renderer',
  'npm run typecheck:node',
  'npm run lint:eslint:strict',
  'npm run lint:architecture',
  'npx vitest run --reporter=verbose',
  'npx vitest run --coverage',
  'npm run coverage:critical',
  'npm run audit:prod',
  'npm run audit:full:json',
  'npm run build:vite'
]

for (const command of workflowCommands) {
  assertContains(workflow, command, '.github/workflows/build.yml', failures)
  if (command !== 'npm run coverage:critical') {
    assertContains(runbook, command, 'OPERATIONS_RUNBOOK.md', failures)
  }
}

assertContains(runbook, 'REMEDIATION_CHECKLIST.md', 'OPERATIONS_RUNBOOK.md', failures)
assertContains(signingDoc, 'CSC_LINK', 'CODE_SIGNING_CONFIG.md', failures)
assertContains(signingDoc, 'CSC_KEY_PASSWORD', 'CODE_SIGNING_CONFIG.md', failures)
assertContains(signingDoc, 'forceCodeSigning', 'CODE_SIGNING_CONFIG.md', failures)

const outputDirectory = packageJson?.build?.directories?.output
if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
  failures.push('package.json build.directories.output is missing')
} else {
  assertContains(gettingStarted, `\`${outputDirectory}\``, 'docs/getting-started.md', failures)
}

assertContains(gettingStarted, 'Node.js 20', 'docs/getting-started.md', failures)
assertContains(gettingStarted, 'NPM 10', 'docs/getting-started.md', failures)

if (failures.length > 0) {
  console.error('Documentation consistency check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Documentation consistency check passed.')
