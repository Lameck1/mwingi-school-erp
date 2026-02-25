const fs = require('node:fs')
const path = require('node:path')

const checklistPath = path.resolve(process.cwd(), 'REMEDIATION_CHECKLIST.md')

if (fs.existsSync(checklistPath)) {
  console.log('Remediation checklist present.')
  process.exit(0)
}

const isCI = process.env.CI === 'true'
const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN

async function run() {
  if (!isCI || !repository || !token) {
    console.error('REMEDIATION_CHECKLIST.md is missing.')
    console.error('Cannot verify audit ticket state outside CI/GitHub context.')
    process.exit(1)
  }

  const query = encodeURIComponent(`repo:${repository} is:issue is:open AUDIT-F`)
  const response = await fetch(`https://api.github.com/search/issues?q=${query}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'mwingi-school-erp-ci'
    }
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Unable to verify open AUDIT-F tickets (${response.status}).`)
    console.error(body)
    process.exit(1)
  }

  const payload = await response.json()
  const openAuditTickets = Number(payload.total_count || 0)

  if (openAuditTickets > 0) {
    console.error(`REMEDIATION_CHECKLIST.md is required while ${openAuditTickets} AUDIT-F ticket(s) are open.`)
    process.exit(1)
  }

  console.log('No open AUDIT-F tickets detected and checklist missing is tolerated.')
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
