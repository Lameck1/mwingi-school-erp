# Mwingi School ERP Audit Report

## Executive Summary
- Overall risk score: 86/100
- Release readiness: NO-GO
  - Justification: high-confidence High findings in supply chain gating (`.github/workflows/build.yml:49`, `audit-artifacts/npm-audit-moderate.log:95`), configuration correctness (`src/pages/Settings/index.tsx:153`, `electron/main/ipc/settings/settings-handlers.ts:33`), and data-governance integrity (`electron/main/services/notifications/NotificationService.ts:221`, `electron/main/database/schema/fragments/010_core_schema_part1.ts:43`, `electron/main/ipc/student/student-handlers.ts:405`)
- Type safety score: 6.3/10
- Top risk themes (max 5 bullets)
- Build pipeline accepts known high vulnerabilities in non-runtime dependency graph
- Settings/config contracts drifted across renderer, preload, main IPC, and services
- PII/audit governance paths have schema drift and missing audit events
- Test/coverage gates are green but scoped narrowly and miss key risk surfaces
- Migration strategy is forward-only for most incremental migrations, limiting safe rollback

## Findings Table
| ID | Severity | Confidence | Category | Evidence (file:line or command) | Impact | Fix Summary | Owner Role | ETA |
|---|---|---:|---|---|---|---|---|---|
| F01 | High | 0.97 | CI/CD & Supply Chain | `.github/workflows/build.yml:49`, `.github/workflows/build.yml:50`, `audit-artifacts/npm-audit-moderate.log:95` | Release pipeline can pass with known High vulnerabilities in full dependency graph | Make full audit blocking or enforce explicit exception allowlist | devops | 4h |
| F02 | High | 0.93 | Supply Chain | `audit-artifacts/npm-audit-moderate.log:3`, `audit-artifacts/npm-audit-moderate.log:5`, `audit-artifacts/npm-audit-moderate.log:95` | 22 High vulnerabilities remain in build/dev transitive dependencies | Upgrade or pin affected dependency branches; remove unresolved vulnerable chains | devops | 1d |
| F03 | High | 0.95 | IPC/API Correctness | `src/pages/Settings/index.tsx:153`, `electron/preload/types.ts:151`, `electron/main/ipc/settings/settings-handlers.ts:33` | School address/phone/email updates are silently dropped | Align Settings payload keys end-to-end (`address`, `phone`, `email`) | frontend-dev | 4h |
| F04 | High | 0.90 | Config Integrity | `src/pages/Settings/Integrations.tsx:67`, `electron/main/services/notifications/NotificationService.ts:89`, `electron/main/database/migrations/incremental/1016_migrate_sms_credentials.ts:48` | SMS settings can be saved under keys NotificationService does not read | Standardize key namespace (`sms_api_key` style) and add compatibility read path | backend-dev | 1d |
| F05 | High | 0.94 | Data Layer / Audit Logging | `electron/main/services/notifications/NotificationService.ts:221`, `electron/main/database/schema/fragments/010_core_schema_part1.ts:43` | Notification logs can fail insert due missing required column, reducing auditability | Include `recipient_contact` in inserts and add regression test | backend-dev | 4h |
| F06 | High | 0.93 | Data Governance | `electron/main/ipc/student/student-handlers.ts:405`, `electron/main/database/schema/fragments/010_core_schema_part1.ts:43` | Student purge flow can fail mid-transaction; deletion compliance control is unreliable | Update purge SQL to `recipient_contact` and verify purge transaction success | backend-dev | 4h |
| F07 | High | 0.90 | Compliance / Security | `electron/main/ipc/auth/auth-handlers.ts:146`, `electron/main/ipc/auth/auth-handlers.ts:164`, `electron/main/ipc/auth/auth-handlers.ts:181`, `electron/main/ipc/auth/auth-handlers.ts:186` | Admin user lifecycle changes are not auditable | Add `logAudit` for create/update/status/password reset user actions | backend-dev | 1d |
| F08 | High | 0.82 | Academic Integrity | `electron/main/services/academic/AcademicSystemService.ts:303`, `electron/main/services/academic/AcademicSystemService.ts:410` | Raw grade entry changes are not audit logged | Add per-batch audit event for `saveResults` with actor/exam/row count | backend-dev | 4h |
| F09 | High | 0.90 | Requirements / Domain Correctness | `electron/main/services/academic/AcademicSystemService.ts:416`, `electron/main/services/academic/AcademicSystemService.ts:423`, `electron/main/ipc/academic/academic-system-handlers.ts:153` | Exposed academic operations return simulated success while unimplemented | Return explicit failure until implemented; gate UI routes accordingly | tech-lead | 1d |
| F10 | Medium | 0.87 | Security Boundary | `electron/main/updates/autoUpdater.ts:119`, `electron/main/ipc/ipc-result.ts:98` | Main-process update channels bypass session/role validation wrappers | Use role-aware validated handlers for update IPC channels | backend-dev | 4h |
| F11 | Medium | 0.88 | Runtime Validation | `electron/main/ipc/schemas/settings-schemas.ts:8` | Sensitive settings update accepts arbitrary key/value payload | Replace loose record schema with strict partial object schema | backend-dev | 4h |
| F12 | Medium | 0.95 | Type Contract Drift | `src/types/electron-api/SettingsAPI.ts:28`, `electron/preload/api/settings.ts:7` | Declared API method is missing in preload implementation | Implement `getSecureConfig` in preload and parity test | backend-dev | 4h |
| F13 | Medium | 0.93 | Type Safety | `src/pages/Students/index.tsx:48`, `src/pages/Finance/components/PaymentEntryForm.tsx:92`, `electron/preload/roleFilter.ts:215` | 20 production `as unknown as` and `Function` weaken static guarantees | Replace cast chains with typed adapters and strict helper types | frontend-dev | 2w |
| F14 | High | 0.92 | Testing Strategy | `vitest.config.ts:14`, `vitest.config.ts:20`, `audit-artifacts/vitest-coverage.log:270` | Coverage gate reports high numbers from only six included files | Expand coverage include set to services/ipc/db critical modules | qa | 1d |
| F15 | Medium | 0.89 | E2E Reliability | `.github/workflows/build.yml:63`, `tests/e2e/smoke.spec.ts:6`, `tests/e2e/fee-payment.spec.ts:59` | CI runs only tag smoke; other E2E specs are gated/scaffolded | Run at least one critical E2E on PR and harden fee-payment workflow assertions | qa | 3d |
| F16 | High | 0.90 | Migration Safety | command: `total=26 withDown=5 withoutDown=21` (incremental migration scan) | App rollback after DB forward-migration has limited recovery options | Add down plans or irreversible migration protocol + restore tooling | backend-dev | 1w |
| F17 | Low | 0.96 | Script Correctness | `scripts/check-users.cjs:4`, `scripts/check-user-1.cjs:3`, `scripts/verify-encryption.ts:8`, `electron/main/database/index.ts:26` | Diagnostic scripts target obsolete DB paths and file names | Align scripts with runtime DB location resolver | backend-dev | 4h |
| F18 | Low | 0.95 | Documentation Drift | `docs/developer-guide/architecture.md:20`, `docs/developer-guide/architecture.md:53`, `package.json:45`, `electron/main/index.ts:145` | Architecture doc misstates DB driver and CSP mechanism | Update docs to match current implementation | tech-writer | 4h |
| F19 | Low | 1.00 | Process / Governance | command output: `REMEDIATION_CHECKLIST.md missing` | Required remediation tracker is absent; weakens audit closure workflow | Add checklist with owner/status per finding ID | tech-lead | 1h |
| F20 | Low | 0.90 | Architecture Hygiene | `.dependency-cruiser.cjs:37` | Dead/orphan module detection disabled | Set `no-orphans` to warn/error and triage exclusions | tech-lead | 4h |
| F21 | Low | 0.80 | Electron Hardening | `electron/main/index.ts:70` | `plugins: true` increases renderer attack surface without clear need | Set `plugins: false` unless required by a documented dependency | backend-dev | 1h |
| F22 | Medium | 0.95 | Quality Gate Stability | `audit-artifacts/lint-eslint-strict.log:7`, `audit-artifacts/lint-eslint-strict.log:11` | Strict lint gate currently red; release quality signal unstable | Fix warning in `verify_migrations.ts` and enforce zero-warning baseline | backend-dev | 1h |
| F23 | Medium | 0.84 | IPC Contract Drift | `src/types/electron-api/UpdateAPI.ts:10`, `electron/main/updates/autoUpdater.ts:22`, `electron/main/updates/autoUpdater.ts:119` | Typed return contracts for updater methods do not match runtime behavior | Align UpdateAPI return types with actual IPC payloads | backend-dev | 4h |

## Detailed Findings
## [F01] Full Dependency Audit Is Non-Blocking While High Vulnerabilities Exist
- **Severity**: High
- **Likelihood**: 0.9
- **Confidence**: 0.97
- **Category**: CI/CD & release controls
- **Principle impact**: DRY
- **Evidence**: `.github/workflows/build.yml:49`, `.github/workflows/build.yml:50`, `audit-artifacts/npm-audit-moderate.log:95`
- **Why this is a problem**: The release gate ignores a failing moderate/full dependency audit. The current full audit reports 22 High vulnerabilities.
- **Realistic failure/exploit scenario**: A vulnerable build-time dependency is exploited in CI or release packaging and publishes compromised artifacts.
- **Recommended fix**: Make full audit blocking by default; if exceptions are needed, gate on an explicit tracked allowlist.
- **PR-ready patch sketch**:
  ```typescript
  // file: .github/workflows/build.yml
  // Before:
  // - name: Audit (Full Dependency Set - Non-Blocking Evidence)
  //   continue-on-error: true
  //   run: npm run audit:full:json > audit-full.json
  //
  // After:
  // - name: Audit (Full Dependency Set - Blocking)
  //   run: npm run audit:full
  // - name: Full Audit Evidence (always)
  //   if: always()
  //   run: npm run audit:full:json > audit-full.json
  ```
- **Validation tests to add**: workflow test/policy check verifying no `continue-on-error` on vulnerability gates
- **Owner role**: devops
- **Estimated effort**: S (< 2h)

## [F02] High Vulnerabilities Persist In Build/Dev Dependency Graph
- **Severity**: High
- **Likelihood**: 0.8
- **Confidence**: 0.93
- **Category**: Supply chain
- **Principle impact**: N/A
- **Evidence**: `audit-artifacts/npm-audit-moderate.log:3`, `audit-artifacts/npm-audit-moderate.log:19`, `audit-artifacts/npm-audit-moderate.log:95`
- **Why this is a problem**: Multiple transitive chains still pull vulnerable `minimatch` ranges in tools used to lint/build/package.
- **Realistic failure/exploit scenario**: Malicious glob inputs in affected tooling trigger ReDoS during CI/release processing and destabilize release pipeline.
- **Recommended fix**: Upgrade affected top-level toolchain packages (`electron-builder`, eslint family) and regenerate lockfile until `npm audit --audit-level=moderate` is clean.
- **PR-ready patch sketch**:
  ```typescript
  // file: package.json
  // After (example policy script)
  // "scripts": {
  //   "audit:full:blocking": "npm audit --audit-level=moderate"
  // }
  //
  // Then run:
  // npm update
  // npm audit fix
  ```
- **Validation tests to add**: CI step asserting `npm audit --audit-level=moderate` exits 0
- **Owner role**: devops
- **Estimated effort**: M (2h–1d)

## [F03] Settings Payload Keys Drift Causes Silent No-Op Updates
- **Severity**: High
- **Likelihood**: 0.9
- **Confidence**: 0.95
- **Category**: IPC/API correctness
- **Principle impact**: DRY
- **Evidence**: `src/pages/Settings/index.tsx:153`, `electron/preload/types.ts:151`, `electron/main/ipc/settings/settings-handlers.ts:33`
- **Why this is a problem**: Renderer sends `school_address/school_phone/school_email` but handler updates `address/phone/email`.
- **Realistic failure/exploit scenario**: Admin updates school contact details, UI shows success toast, but persisted values never change.
- **Recommended fix**: Standardize settings keys across `SettingsData`, renderer forms, and IPC handler schema.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/preload/types.ts
  // Before:
  // school_address?: string
  // school_phone?: string
  // school_email?: string
  //
  // After:
  export interface SettingsData {
    school_name?: string
    school_motto?: string
    address?: string
    phone?: string
    email?: string
    mpesa_paybill?: string
    logo_path?: string
  }
  ```
- **Validation tests to add**: integration test asserting `settings:update` persists `address/phone/email`
- **Owner role**: frontend-dev
- **Estimated effort**: S (< 2h)

## [F04] SMS Secure Config Keys Drift Between UI and Service Reads
- **Severity**: High
- **Likelihood**: 0.8
- **Confidence**: 0.9
- **Category**: Configuration integrity
- **Principle impact**: DRY
- **Evidence**: `src/pages/Settings/Integrations.tsx:67`, `electron/main/services/notifications/NotificationService.ts:89`, `electron/main/database/migrations/incremental/1016_migrate_sms_credentials.ts:48`
- **Why this is a problem**: Integrations UI writes dotted keys (`sms.api_key`), while NotificationService reads underscored keys (`sms_api_key`).
- **Realistic failure/exploit scenario**: SMS appears configured in UI but outgoing notifications fail with "provider not configured".
- **Recommended fix**: Use one canonical key family and support temporary backward compatibility reads.
- **PR-ready patch sketch**:
  ```typescript
  // file: src/pages/Settings/Integrations.tsx
  // Before:
  // saveSecureConfig('sms.api_key', smsConfig.api_key)
  //
  // After:
  saveOperations.push(globalThis.electronAPI.saveSecureConfig('sms_api_key', smsConfig.api_key))
  saveOperations.push(globalThis.electronAPI.saveSecureConfig('sms_api_secret', smsConfig.username))
  saveOperations.push(globalThis.electronAPI.saveSecureConfig('sms_sender_id', smsConfig.sender_id))
  ```
- **Validation tests to add**: test that saved integration keys are consumed by `NotificationService.loadConfig`
- **Owner role**: backend-dev
- **Estimated effort**: M (2h–1d)

## [F05] Notification Communication Log Insert Is Schema-Incompatible
- **Severity**: High
- **Likelihood**: 0.85
- **Confidence**: 0.94
- **Category**: Data layer
- **Principle impact**: S
- **Evidence**: `electron/main/services/notifications/NotificationService.ts:221`, `electron/main/database/schema/fragments/010_core_schema_part1.ts:43`
- **Why this is a problem**: `message_log.recipient_contact` is required, but insert statement omits it.
- **Realistic failure/exploit scenario**: Notifications send externally but DB logging fails, breaking compliance/audit history.
- **Recommended fix**: Add `recipient_contact` in insert columns/values and assert insert success in tests.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/services/notifications/NotificationService.ts
  // Before:
  // INSERT INTO message_log (
  //   recipient_type, recipient_id, message_type, subject, message_body,
  //   status, external_id, error_message, sent_by_user_id
  // ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  //
  // After:
  // INSERT INTO message_log (
  //   recipient_type, recipient_id, recipient_contact, message_type, subject, message_body,
  //   status, external_id, error_message, sent_by_user_id
  // ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //
  // and pass: data.to as recipient_contact
  ```
- **Validation tests to add**: service-level test that `send()` inserts one row with `recipient_contact`
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## [F06] Student Purge Uses Non-Existent `message_log.recipient` Column
- **Severity**: High
- **Likelihood**: 0.85
- **Confidence**: 0.93
- **Category**: Data governance
- **Principle impact**: N/A
- **Evidence**: `electron/main/ipc/student/student-handlers.ts:405`, `electron/main/database/schema/fragments/010_core_schema_part1.ts:43`
- **Why this is a problem**: Purge SQL references `recipient`, but schema has `recipient_contact`.
- **Realistic failure/exploit scenario**: Data-subject deletion request triggers purge; transaction fails and records remain non-anonymized.
- **Recommended fix**: Update purge SQL to correct column and add purge success assertions.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/ipc/student/student-handlers.ts
  // Before:
  // UPDATE message_log SET recipient = ?, message_body = 'purged' WHERE recipient LIKE '%' || ? || '%'
  //
  // After:
  // UPDATE message_log
  // SET recipient_contact = ?, message_body = 'purged'
  // WHERE recipient_contact LIKE '%' || ? || '%'
  ```
- **Validation tests to add**: integration test for `student:purge` with `message_log` rows
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)
## [F07] User Management Actions Are Not Audit Logged
- **Severity**: High
- **Likelihood**: 0.75
- **Confidence**: 0.9
- **Category**: Compliance/legal
- **Principle impact**: S
- **Evidence**: `electron/main/ipc/auth/auth-handlers.ts:146`, `electron/main/ipc/auth/auth-handlers.ts:164`, `electron/main/ipc/auth/auth-handlers.ts:181`, `electron/main/ipc/auth/auth-handlers.ts:186`
- **Why this is a problem**: User create/update/disable/reset-password are sensitive admin actions without immutable audit records.
- **Realistic failure/exploit scenario**: Privilege misuse occurs and investigation cannot identify who changed user access.
- **Recommended fix**: Add `logAudit(actorCtx.id, ...)` calls for all user lifecycle mutations.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/ipc/auth/auth-handlers.ts
  // After user:update run:
  logAudit(_actor.id, 'UPDATE', 'user', id, null, data)
  //
  // After user:create:
  logAudit(_actor.id, 'CREATE', 'user', Number(result.lastInsertRowid), null, { username: data.username, role: data.role })
  //
  // After user:toggleStatus and user:resetPassword:
  logAudit(_actor.id, 'UPDATE', 'user', id, null, { is_active: isActive })
  logAudit(_actor.id, 'RESET_PASSWORD', 'user', id, null, null)
  ```
- **Validation tests to add**: verify `logAudit` called once per admin mutation handler
- **Owner role**: backend-dev
- **Estimated effort**: M (2h–1d)

## [F08] Grade Entry (`saveResults`) Lacks Audit Trail
- **Severity**: High
- **Likelihood**: 0.7
- **Confidence**: 0.82
- **Category**: Academic integrity
- **Principle impact**: N/A
- **Evidence**: `electron/main/services/academic/AcademicSystemService.ts:303`, `electron/main/services/academic/AcademicSystemService.ts:410`
- **Why this is a problem**: Grades are high-impact records; only result processing is logged, not raw score entry.
- **Realistic failure/exploit scenario**: Score tampering occurs before processing with no attributable audit event.
- **Recommended fix**: Log save batch metadata (exam ID, count, actor) inside `saveResults`.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/services/academic/AcademicSystemService.ts
  // After transaction(results)
  logAudit(userId, 'SAVE_RESULTS', 'exam_result', 0, null, {
    examId,
    rows: results.length
  })
  ```
- **Validation tests to add**: unit test asserting `logAudit` called for `saveResults`
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## [F09] Exposed Academic Methods Return Simulated Success
- **Severity**: High
- **Likelihood**: 0.8
- **Confidence**: 0.9
- **Category**: Requirements/domain correctness
- **Principle impact**: KISS
- **Evidence**: `electron/main/services/academic/AcademicSystemService.ts:416`, `electron/main/services/academic/AcademicSystemService.ts:423`, `electron/main/ipc/academic/academic-system-handlers.ts:153`
- **Why this is a problem**: Unimplemented paths return success, causing false operational confidence and hidden workflow failure.
- **Realistic failure/exploit scenario**: Staff trigger certificate/email operations believing they executed, but no documents/messages are produced.
- **Recommended fix**: Return explicit failure (`success: false`) until real implementation ships.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/services/academic/AcademicSystemService.ts
  async generateCertificate(_data: CertificatePayload): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Not implemented' }
  }

  async emailParents(_data: EmailParentsPayload): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Not implemented' }
  }
  ```
- **Validation tests to add**: IPC handler tests asserting non-success response until implementation exists
- **Owner role**: tech-lead
- **Estimated effort**: S (< 2h)

## [F10] Update IPC Uses Raw Handlers Without Main-Process RBAC
- **Severity**: Medium
- **Likelihood**: 0.6
- **Confidence**: 0.87
- **Category**: Security
- **Principle impact**: D
- **Evidence**: `electron/main/updates/autoUpdater.ts:119`, `electron/main/ipc/ipc-result.ts:98`
- **Why this is a problem**: Main process should remain the authorization boundary; current handlers skip role/session validation.
- **Realistic failure/exploit scenario**: If renderer boundary is bypassed, untrusted calls can trigger update operations directly.
- **Recommended fix**: Replace `safeHandleRaw` with role-aware validated wrappers.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/updates/autoUpdater.ts
  import { ROLES, safeHandleRawWithRole } from '../ipc/ipc-result'

  // Before:
  // safeHandleRaw('install-update', () => this.installUpdate())
  //
  // After:
  safeHandleRawWithRole('install-update', ROLES.ADMIN_ONLY, () => this.installUpdate())
  ```
- **Validation tests to add**: role-guard test covering all `*-update` IPC channels
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## [F11] Settings Update Validation Is Effectively Unbounded
- **Severity**: Medium
- **Likelihood**: 0.7
- **Confidence**: 0.88
- **Category**: IPC/API correctness
- **Principle impact**: S
- **Evidence**: `electron/main/ipc/schemas/settings-schemas.ts:8`
- **Why this is a problem**: A generic `record<string, unknown>` accepts arbitrary input and weakens trust-boundary validation.
- **Realistic failure/exploit scenario**: Malformed payloads pass validation and silently no-op or mutate unexpected fields.
- **Recommended fix**: Use a strict partial schema with explicit allowed keys.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/ipc/schemas/settings-schemas.ts
  export const SettingsUpdateSchema = z.object({
    school_name: z.string().min(1).optional(),
    school_motto: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    logo_path: z.string().optional(),
    mpesa_paybill: z.string().optional(),
    sms_api_key: z.string().optional(),
    sms_api_secret: z.string().optional(),
    sms_sender_id: z.string().optional()
  }).strict()
  ```
- **Validation tests to add**: `settings:update` rejects unknown keys and invalid email
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## [F12] Settings API Contract Declares `getSecureConfig` But Preload Omits It
- **Severity**: Medium
- **Likelihood**: 0.7
- **Confidence**: 0.95
- **Category**: Type contract drift
- **Principle impact**: I
- **Evidence**: `src/types/electron-api/SettingsAPI.ts:28`, `electron/preload/api/settings.ts:7`, `electron/main/ipc/settings/settings-handlers.ts:103`
- **Why this is a problem**: Type contracts and runtime bridge diverge; consumers can compile against methods unavailable at runtime.
- **Realistic failure/exploit scenario**: Renderer code calls `getSecureConfig` and throws at runtime in production.
- **Recommended fix**: Add missing preload function and parity test.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/preload/api/settings.ts
  // After:
  getSecureConfig: (key: string) => ipcRenderer.invoke('settings:getSecure', key),
  ```
- **Validation tests to add**: extend IPC contract parity test to verify API method/type parity for settings slice
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)
## [F13] Production Cast Escapes Remain High (`as unknown as`, `Function`)
- **Severity**: Medium
- **Likelihood**: 0.75
- **Confidence**: 0.93
- **Category**: Type safety
- **Principle impact**: DRY
- **Evidence**: command output `as_unknown_as=20 ... function_type=1`, `src/pages/Students/index.tsx:48`, `src/pages/Finance/components/PaymentEntryForm.tsx:92`, `electron/preload/roleFilter.ts:215`, `CODING_STANDARDS.md:6`
- **Why this is a problem**: Cast chains bypass compiler intent, hide contract drift, and conflict with documented standards.
- **Realistic failure/exploit scenario**: Wrong payload shapes pass compile and fail at runtime in finance/student flows.
- **Recommended fix**: Replace cast chains with strongly typed local variables and shared API input types.
- **PR-ready patch sketch**:
  ```typescript
  // file: src/pages/Students/index.tsx
  // Before:
  // normalizeFilters(...) as unknown as Parameters<typeof globalThis.electronAPI.getStudents>[0]
  //
  // After:
  type StudentFiltersInput = Parameters<typeof globalThis.electronAPI.getStudents>[0]
  const payload: StudentFiltersInput = normalizeFilters({
    streamId: filters.streamId || undefined,
    isActive: filters.isActive ?? undefined,
    search: searchRef.current || undefined
  })
  const data = await globalThis.electronAPI.getStudents(payload)
  ```
- **Validation tests to add**: compile-time contract tests for renderer IPC payload builders
- **Owner role**: frontend-dev
- **Estimated effort**: L (1d–1w)

## [F14] Coverage Gate Reports High Percentages Over Narrow Include List
- **Severity**: High
- **Likelihood**: 0.85
- **Confidence**: 0.92
- **Category**: Testing strategy
- **Principle impact**: N/A
- **Evidence**: `vitest.config.ts:14`, `vitest.config.ts:20`, `audit-artifacts/vitest-coverage.log:270`
- **Why this is a problem**: Quality gate looks healthy while skipping most IPC, DB, and service runtime paths.
- **Realistic failure/exploit scenario**: Regression in un-included financial/PII paths ships despite passing coverage gate.
- **Recommended fix**: Expand `coverage.include` to critical folders and enforce thresholds there.
- **PR-ready patch sketch**:
  ```typescript
  // file: vitest.config.ts
  // Before: include hardcoded 6 files
  // After:
  include: [
    'electron/main/ipc/**/*.ts',
    'electron/main/services/**/*.ts',
    'electron/main/database/**/*.ts',
    'src/pages/**/*.ts',
    'src/pages/**/*.tsx'
  ],
  ```
- **Validation tests to add**: CI assertion that coverage includes at least ipc/services/database folders
- **Owner role**: qa
- **Estimated effort**: M (2h–1d)

## [F15] E2E Coverage Is Mostly Tag-Gated And Partly Scaffolded
- **Severity**: Medium
- **Likelihood**: 0.7
- **Confidence**: 0.89
- **Category**: Testing strategy
- **Principle impact**: N/A
- **Evidence**: `.github/workflows/build.yml:63`, `tests/e2e/smoke.spec.ts:6`, `tests/e2e/fee-payment.spec.ts:59`, `tests/e2e/main-workflows.spec.ts:8`
- **Why this is a problem**: Critical flows are not continuously exercised on PRs; one spec explicitly states scaffold-only behavior.
- **Realistic failure/exploit scenario**: Fee payment route changes break production flow but pass PR gates.
- **Recommended fix**: Run a deterministic PR E2E subset and convert scaffold tests into seeded assertions.
- **PR-ready patch sketch**:
  ```typescript
  // file: .github/workflows/build.yml
  // After quality gate tests:
  // - name: E2E Critical Path (PR, blocking)
  //   if: github.event_name == 'pull_request'
  //   env:
  //     E2E: 'true'
  //   run: xvfb-run -a npx playwright test tests/e2e/fee-payment.spec.ts --reporter=line
  ```
- **Validation tests to add**: seeded E2E asserting payment record, balance update, receipt visibility
- **Owner role**: qa
- **Estimated effort**: M (2h–1d)

## [F16] Incremental Migration Rollback Coverage Is Incomplete
- **Severity**: High
- **Likelihood**: 0.75
- **Confidence**: 0.9
- **Category**: Migration safety
- **Principle impact**: N/A
- **Evidence**: command output `total=26 withDown=5 withoutDown=21`, `electron/main/database/migrations/index.ts:41`
- **Why this is a problem**: Most incremental migrations are forward-only, so app rollback after DB forward migration is operationally risky.
- **Realistic failure/exploit scenario**: Release rollback is required after production issue, but DB cannot be safely downgraded.
- **Recommended fix**: Add `down()` where feasible, and mark irreversible migrations with mandatory backup/restore playbook.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/database/migrations/incremental/1007_payment_idempotency_and_invoice_uniqueness.ts
  // After:
  export function down(db: Database.Database): void {
    db.exec(`
      DROP INDEX IF EXISTS idx_payment_idempotency_key;
      DROP INDEX IF EXISTS idx_fee_invoice_unique_open_invoice;
    `)
  }
  ```
- **Validation tests to add**: migration smoke test performing up/down round-trip on a seeded database
- **Owner role**: backend-dev
- **Estimated effort**: L (1d–1w)

## [F22] Strict Lint Gate Is Currently Failing
- **Severity**: Medium
- **Likelihood**: 0.8
- **Confidence**: 0.95
- **Category**: CI/CD gate health
- **Principle impact**: N/A
- **Evidence**: `audit-artifacts/lint-eslint-strict.log:7`, `audit-artifacts/lint-eslint-strict.log:11`, `electron/main/database/verify_migrations.ts:18`
- **Why this is a problem**: `--max-warnings 0` means one warning blocks local/CI strict lint.
- **Realistic failure/exploit scenario**: Release candidates fail quality gate late due non-functional lint regressions.
- **Recommended fix**: Resolve current warning and keep strict lint green as a hard pre-merge requirement.
- **PR-ready patch sketch**:
  ```typescript
  // file: electron/main/database/verify_migrations.ts
  // Before:
  const match = name.match(/^(\d+)_/)
  if (!match) {
    return false
  }
  return Number(match[1]) >= 1000

  // After:
  const match = /^(\d+)_/.exec(name)
  if (!match) {
    return false
  }
  return Number(match[1]) >= 1000
  ```
- **Validation tests to add**: run `npm run lint:eslint:strict` in pre-push hook and CI
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## [F23] Update API Return Types Drift From Runtime Payloads
- **Severity**: Medium
- **Likelihood**: 0.65
- **Confidence**: 0.84
- **Category**: Type contract drift
- **Principle impact**: I
- **Evidence**: `src/types/electron-api/UpdateAPI.ts:10`, `electron/main/updates/autoUpdater.ts:22`, `electron/main/updates/autoUpdater.ts:119`
- **Why this is a problem**: Types declare `Promise<void>`, but runtime can resolve `{ success: false, error: ... }`.
- **Realistic failure/exploit scenario**: Renderer expects throw-based error handling and misses update failure payloads.
- **Recommended fix**: Align method signatures to explicit result union and handle in UI.
- **PR-ready patch sketch**:
  ```typescript
  // file: src/types/electron-api/UpdateAPI.ts
  export type UpdateCommandResult = { success: true } | { success: false; error: string }

  export interface UpdateAPI {
    checkForUpdates: () => Promise<UpdateCommandResult>
    downloadUpdate: () => Promise<UpdateCommandResult>
    installUpdate: () => Promise<UpdateCommandResult>
    getUpdateStatus: () => Promise<{ isAvailable: boolean; downloadProgress: number }>
  }
  ```
- **Validation tests to add**: renderer hook test asserting error payload handling for disabled update mode
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

## Type Safety Report

## Compiler Strictness

| Flag | Status | Risk | Recommendation |
|---|---|---|---|
| `strict` | ON (`tsconfig.json:18`, `tsconfig.node.json:14`) | baseline good | keep enforced |
| `noUncheckedIndexedAccess` | ON (`tsconfig.json:23`, `tsconfig.node.json:15`) | reduced undefined access risk | keep enforced |
| `exactOptionalPropertyTypes` | ON (`tsconfig.json:26`, `tsconfig.node.json:18`) | reduced optional drift | keep enforced |
| `noPropertyAccessFromIndexSignature` | ON (`tsconfig.json:25`, `tsconfig.node.json:17`) | reduced typo risks | keep enforced |
| `verbatimModuleSyntax` | ON (`tsconfig.json:27`, `tsconfig.node.json:19`) | import/export correctness | keep enforced |
| `noImplicitOverride` | ON (`tsconfig.json:24`, `tsconfig.node.json:16`) | override safety | keep enforced |

## `any` Census

| File:Line | Pattern | Eliminable? | Recommended replacement |
|---|---|---|---|
| non-test production scan | `as any` explicit casts | yes (count=0) | keep zero; block regressions in CI |
| test files only | `as any`, `any[]` | mostly | replace with narrowed helper test types gradually |
## Type-Escape Patterns

| File:Line | Pattern | Justified? | Fix |
|---|---|---|---|
| `src/pages/Students/index.tsx:48` | `as unknown as Parameters<...>` | no | typed local payload alias |
| `src/pages/Finance/components/PaymentEntryForm.tsx:92` | `as unknown as Parameters<...>` | no | construct payload with explicit interface |
| `src/components/ErrorBoundary.tsx:50` | `as unknown as Parameters<...>` | partial | introduce `SystemLogPayload` type |
| `src/pages/Attendance/index.tsx:206` | `as unknown as Parameters<...>` | no | create typed adapter function |
| `electron/preload/roleFilter.ts:215` | `as Function` | no | use generic callable type `(…args: unknown[]) => unknown` |
| command output | `as_unknown_as=20` | no | reduce to zero in production paths |

## Unvalidated Boundaries

| Boundary | File:Line | Expected shape | Current validation | Risk | Fix |
|---|---|---|---|---|---|
| Renderer -> `settings:update` | `electron/main/ipc/schemas/settings-schemas.ts:8` | strict settings payload | `z.record(string, unknown)` | malformed payload accepted/no-op drift | strict Zod object schema |
| Renderer -> updater commands | `electron/main/updates/autoUpdater.ts:119` | no args + actor authorization | `safeHandleRaw` without schema/role | bypass of main-process auth boundary | use validated/role-aware handler |
| DB JSON parse (`email_provider_config`) | `electron/main/services/notifications/NotificationService.ts:106` | `EmailProviderConfig` object | raw `JSON.parse` cast | runtime crash/misconfig acceptance | schema parse with validation error path |

## Contract Drift

| IPC Channel | Preload type | Main handler type | Mismatch description |
|---|---|---|---|
| `settings:update` | `SettingsData` uses `school_address/school_phone/school_email` (`electron/preload/types.ts:151`) | handler expects `address/phone/email` (`electron/main/ipc/settings/settings-handlers.ts:33`) | settings updates silently ignored |
| `settings:getSecure` | declared in `SettingsAPI` (`src/types/electron-api/SettingsAPI.ts:28`) | implemented main (`electron/main/ipc/settings/settings-handlers.ts:103`) | missing preload bridge method |
| `check-for-updates` / `download-update` / `install-update` | `Promise<void>` (`src/types/electron-api/UpdateAPI.ts:10`) | runtime may return `{ success: false, error }` (`electron/main/updates/autoUpdater.ts:22`) | renderer error handling contract mismatch |
| SMS config contract | UI writes dotted keys (`src/pages/Settings/Integrations.tsx:67`) | service reads underscored keys (`electron/main/services/notifications/NotificationService.ts:89`) | operational config mismatch |

## Coding Principles Scorecard
- SOLID: S fail | O fail | L pass | I fail | D fail
- S failure evidence: `electron/main/services/academic/AcademicSystemService.ts:303`, `electron/main/services/academic/AcademicSystemService.ts:414` (results, certificates, email in one service)
- O failure evidence: `electron/main/services/reports/ReportScheduler.ts:280` switch on `report_type` requires edits for every new report
- I failure evidence: `src/types/electron-api/index.ts:70` large flat interface forces wide coupling
- D failure evidence: direct DB access in services, e.g. `electron/main/services/notifications/NotificationService.ts:80`
- DRY violations:
- duplicated/competing settings key conventions across settings UI and services (`src/pages/Settings/Integrations.tsx:67`, `electron/main/services/notifications/NotificationService.ts:89`)
- duplicated message logging pathways with schema drift (`electron/main/services/notifications/NotificationService.ts:221`, `electron/main/services/MessageService.ts:59`)
- KISS/YAGNI violations:
- simulated success placeholders in production handlers (`electron/main/services/academic/AcademicSystemService.ts:417`)
- Maintainability hotspots (ranked):
- `electron/main/services/accounting/DoubleEntryJournalService.ts` (~742 lines)
- `src/pages/Payroll/PayrollRun.tsx` (~776 lines)
- `electron/main/ipc/academic/reportcard-handlers.ts` (~667 lines)
- `electron/main/services/finance/ScholarshipService.ts` (~679 lines)
- `src/pages/Reports/index.tsx` (~678 lines)

## Coverage Map

## Fully Audited
- Authentication/session/RBAC path (`electron/main/ipc/auth`, `electron/main/security/session`, `electron/preload/roleFilter`) — confidence high
- Settings and integration config paths (`src/pages/Settings`, `electron/main/ipc/settings`, `ConfigService`, `NotificationService`) — confidence high
- Student purge and PII anonymization path (`electron/main/ipc/student/student-handlers.ts`) — confidence high
- CI/workflow gates and packaging config (`.github/workflows/build.yml`, `package.json`, `vitest.config.ts`) — confidence high
- Type safety escape scan and strictness baselines (`tsconfig*.json`, `eslint.config.js`, `audit-artifacts/type-escapes.log`) — confidence high

## Partially Audited
- Full domain correctness for payroll/accounting/reporting internals: sampled critical handlers/services, not every branch path
- Performance SLO verification (startup/query latency): code-level inspection done, no runtime benchmark instrumentation executed
- Compliance/legal controls beyond code (organizational processes, DPO workflow): not fully represented in repo artifacts

## Not Auditable
- GitHub branch protection/review policy settings (repo UI/admin config not present in code)
- Production certificate lifecycle and secret rotation process (secrets not accessible in audit context)
- Real update feed trust chain end-to-end (requires signed release + production environment validation)

## 30-60-90 Day Remediation Plan
## 0-7 Days: Containment
- F01, F02 (`devops`): make full dependency audit blocking and clear current 22 High vulnerabilities or track signed exception list
- F05, F06 (`backend-dev`): patch message_log schema usage in NotificationService and student purge path; ship regression tests
- F22 (`backend-dev`): clear strict lint warning and keep lint gate green
- F03 (`frontend-dev`): hotfix settings payload keys to stop silent configuration loss

## 8-30 Days: High-Impact Fixes
- F04, F11, F12, F23 (`backend-dev`): unify config key conventions, harden settings schema, resolve preload/type drift
- F07, F08 (`backend-dev`): implement missing audit events for user management and grade entry flows
- F14, F15 (`qa`): broaden coverage include set and enforce PR E2E critical path
- F09 (`tech-lead`): block simulated-success academic operations until full implementation

## 31-90 Days: Hardening & Process
- F16 (`backend-dev`): define reversible migration policy (or explicit irreversible protocol + restore drills)
- F13 (`frontend-dev`, `tech-lead`): reduce production cast escapes to near-zero and add contract compile checks
- F17, F18, F19 (`tech-lead`): align scripts/docs/checklists to runtime implementation and keep remediation tracker current
- F20, F21 (`tech-lead`, `backend-dev`): enable orphan detection and tighten Electron window hardening defaults

## Commands Run / Evidence Log

| # | Command | Exit code | Key output (truncated) | Used for finding(s) |
|---|---|---:|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.json` | 0 | no output (`audit-artifacts/tsc-renderer.log` empty) | baseline typecheck |
| 2 | `npx tsc --noEmit -p tsconfig.node.json` | 0 | no output (`audit-artifacts/tsc-node.log` empty) | baseline typecheck |
| 3 | `npm run lint:eslint:strict` | 1 | `1 warning`, `max-warnings 0` (`audit-artifacts/lint-eslint-strict.log`) | F22 |
| 4 | `npm run lint:architecture` | 0 | `no dependency violations found` (`audit-artifacts/lint-architecture.log:6`) | architecture baseline |
| 5 | `npx vitest run --reporter=verbose` | 0 | `81 passed`, `793 passed` (`audit-artifacts/vitest-verbose.log:968`) | test baseline/F15 |
| 6 | `npx vitest run --coverage` | 0 | `All files 95.65%` but scoped include list (`audit-artifacts/vitest-coverage.log:270`) | F14 |
| 7 | `npm audit --audit-level=moderate` | 1 | `22 high severity vulnerabilities` (`audit-artifacts/npm-audit-moderate.log:95`) | F01, F02 |
| 8 | `npm run audit:prod` | 0 | `found 0 vulnerabilities` (`audit-artifacts/npm-audit-prod.log:5`) | supply-chain context |
| 9 | `rg -n "@ts-ignore|@ts-expect-error|as any|as unknown as" src electron` | 0 | non-test `as unknown as` occurrences captured (`audit-artifacts/type-escapes.log`) | F13 |
| 10 | `rg -n "password|secret|api_key|token" src electron -l` | 0 | filename-level pattern hits (`audit-artifacts/secrets-pattern-files.log`) | secret scan baseline |
| 11 | `Get-ChildItem incremental/*.ts ...` down-count check | 0 | `total=26 withDown=5 withoutDown=21` | F16 |
| 12 | `npm ls electron --depth=0` | 0 | `electron@40.4.0` | dependency baseline |
| 13 | file inspection (`Get-Content`, `rg -n`) across settings, notifications, purge, workflows | 0 | line-level evidence in findings table | F03-F12, F17-F21, F23 |

## External Evidence (Supply Chain Check)
- GitHub Releases page (latest Electron 40.x at audit time): https://github.com/electron/electron/releases
- Electron release notes reference (40.6.0): https://releases.electronjs.org/release/v40.6.0

AUDIT_COMPLETE
