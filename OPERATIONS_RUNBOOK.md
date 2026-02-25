# Operations Runbook

## 1. Runtime Overview

- Platform: Electron main + React/Vite renderer.
- Database: SQLite (`better-sqlite3-multiple-ciphers`) with migration-driven schema evolution.
- Startup sequence:
  1. initialize database
  2. run/verify migrations
  3. verify system accounts
  4. initialize retention purge service
  5. register services and IPC handlers

## 2. Database and Migrations

- Migration registry source of truth: `electron/main/database/migrations/index.ts`.
- Incremental migration files live under `electron/main/database/migrations/incremental/`.
- Superseded files are archived under `electron/main/database/migrations/archive/`.
- Startup migration verification now fails fast on registry/file drift (`verify_migrations.ts`).

## 3. Data Retention Enforcement

- Policy table: `data_retention_config`.
- Runtime enforcement: `RetentionService` executes purge at app startup.
- Purge behavior:
  - reads active table policies
  - deletes rows older than retention horizon using `created_at`/`timestamp`
  - updates `last_purge_at` for each processed policy
- Tests: `electron/main/services/__tests__/RetentionService.test.ts`.

## 4. CI/CD Gates

Workflow: `.github/workflows/build.yml`.

### Pull Requests

- `npm run typecheck:renderer`
- `npm run typecheck:node`
- `npm run lint:eslint:strict`
- `npm run lint:architecture`
- `npm run docs:consistency`
- `npm run ipc:manifest:check`
- `npm run audit:checklist`
- `npx vitest run --reporter=verbose`
- `npx vitest run --coverage`
- `npm run coverage:critical`
- `npm run audit:prod` (blocking)
- `npm run audit:full:json` (non-blocking evidence artifact)
- Windows parity job on `windows-latest`:
  - `npm run typecheck:renderer`
  - `npm run typecheck:node`
  - `npm run lint:eslint:strict`
  - `npm run lint:architecture`
  - `npm run build:vite`
  - `npx vitest run electron/main/ipc/__tests__/ipc-contract-parity.test.ts electron/main/ipc/data/__tests__/import-handlers.test.ts --reporter=verbose`

### Release Tags (`v*`)

- All PR gates above
- Smoke E2E gate (blocking): `npx playwright test tests/e2e/smoke.spec.ts`
- Signed packaging matrix build
- GitHub release publication

## 6. Audit Remediation Tracking

- Remediation tracker: `REMEDIATION_CHECKLIST.md` (repository root).
- Checklist is CI-gated with `npm run audit:checklist` when open `AUDIT-F*` issues exist.
- PRs addressing audit findings must include finding IDs and verification evidence in `.github/PULL_REQUEST_TEMPLATE.md`.

## 7. Incident and Failure Triage

### Migration Verification Failure

- Symptom: startup abort with migration drift/missing table error.
- Actions:
  1. compare incremental files vs registry entries.
  2. resolve orphan/missing registrations.
  3. rerun `verifyMigrations()` path via app startup.

### Retention Purge Failure

- Symptom: startup logs retention initialization error.
- Actions:
  1. verify `data_retention_config` exists and rows are valid.
  2. verify configured table names and timestamp columns.
  3. run retention tests and inspect startup logs.

### Release Gate Failure

- Audit gate failure: address runtime dependency vulnerabilities or document exception and block release.
- Smoke E2E failure: reproduce locally with `E2E=true`, fix login/critical route regression before retag.
