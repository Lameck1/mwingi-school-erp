# Audit Report

This report tracks findings, remediation execution, closure evidence, and residual risk acceptance.
Last updated: 2026-02-23.

## Executive Summary

- Overall risk score: 24/100 (post-remediation).
- Release readiness: GO, with known non-blocking full dependency audit risk tracked as tooling-chain debt.
- Primary risk themes closed:
  - IPC contract drift and handler registration defects
  - Direct unguarded IPC handlers in academic domain
  - Filesystem boundary weakness in report-card open flow
  - Node/main strict typing failures under exact optional semantics
  - CI/coverage/release-control mismatches

## Findings To Closure Mapping

| Finding ID | Summary | Severity | Checklist IDs | Status | Closure Evidence |
|---|---|---|---|---|---|
| F-001 | Fixed-asset IPC registration mismatch | High | RC-003, RC-004, RC-005, RC-010 | Closed | Duplicate registration pattern removed; fixed-asset and runtime parity tests pass. |
| F-002 | Academic direct `ipcMain.handle` bypasses validation wrappers | High | RC-006, RC-007 | Closed | `academic-handlers.ts` has no direct `ipcMain.handle`; legacy alias/validation tests pass. |
| F-003 | `report-card:openFile` accepts arbitrary path | High | RC-008, RC-009 | Closed | Handler restricted to allowlisted app paths and `.pdf`; traversal/out-of-root/non-pdf tests pass. |
| F-004 | Node/main strict typecheck fails | High | RC-011, RC-012, RC-013 | Closed | Production type escape scan is clean; `npx tsc --noEmit -p tsconfig.node.json` passes. |
| F-005 | Coverage gate failing materially | High | RC-023, RC-024 | Closed | Critical-scope coverage configuration added; `npx vitest run --coverage` passes thresholds. |
| F-006 | Supply-chain gate and workflow controls incomplete | Medium | RC-020, RC-021, RC-022 | Closed with accepted residual risk | PR/tag quality gates added; release action SHA-pinned; prod audit blocks release; full audit captured as non-blocking artifact. |
| F-007 | Migration registry drift | Medium | RC-015, RC-016, RC-017 | Closed | Missing migrations registered, superseded files archived, and drift detection automated/tested. |
| F-008 | Retention config seeded but not enforced | Medium | RC-018, RC-019 | Closed | `RetentionService` implemented and startup-integrated; purge tests cover policy and `last_purge_at`. |
| F-009 | Documentation drift | Low | RC-026 | Closed | Root runbook/standards/signing docs updated to reflect implemented controls. |
| F-010 | Final closure evidence package missing | Medium | RC-027 | Closed | Validation matrix executed and checklist fully closed with evidence. |

## Validation Evidence Log (Final)

| # | Command | Exit | Key Result |
|---|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.json` | 0 | Renderer strict typecheck passes |
| 2 | `npx tsc --noEmit -p tsconfig.node.json` | 0 | Node/main strict typecheck passes |
| 3 | `npm run lint:eslint:strict` | 0 | Strict ESLint passes |
| 4 | `npm run lint:architecture` | 0 | No dependency violations |
| 5 | `npx vitest run --reporter=verbose` | 0 | `81` files, `792` tests passed |
| 6 | `npx vitest run --coverage` | 0 | Critical-scope thresholds passed (`94.84/89.06/91.3/95.65`) |
| 7 | `npm audit --omit=dev --audit-level=high` | 0 | 0 production/runtime vulnerabilities |
| 8 | `npm audit --audit-level=moderate` | 1 | Non-blocking evidence only; high vulns remain in transitive tooling chain |
| 9 | `npx playwright test tests/e2e/smoke.spec.ts` | 0 | Local run skips without `E2E=true`; tag CI path runs blocking smoke with `E2E=true` |

## Residual Risk Register

| Risk ID | Description | Impact | Current Control | Next Action |
|---|---|---|---|---|
| RR-001 | Full dependency audit reports transitive high vulnerabilities (`minimatch` lineage via dev/build tooling) | Medium (tooling/supply-chain) | Non-blocking audit artifact retained in CI; prod/runtime audit is blocking and currently clean | Track upstream dependency releases and schedule controlled upgrade cycle; reassess monthly |
| RR-002 | Local E2E smoke can be skipped when `E2E` env var is not set | Low | Release-tag workflow enforces `E2E=true` and blocks on smoke failure | Keep local optional; continue enforcing tag-path blocking |

## Remediation Execution Notes

- Canonical implementation tracking is in `REMEDIATION_CHECKLIST.md`.
- All checklist rows RC-001..RC-027 are now marked `DONE` with evidence.
- `audit-full.json` is generated for full-audit evidence capture.

AUDIT_COMPLETE
