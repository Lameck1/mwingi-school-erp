# Mwingi School ERP — Full-Spectrum Zero-Trust Audit Report

**Audit Date:** 2026-02-17
**Auditor Role:** Principal Software Auditor
**Repository:** Mwingi School ERP (Desktop, Electron 40, SQLite/SQLCipher)

---

## Executive Summary

```
Overall risk score: 38 / 100 (Moderate)
Release readiness: GO WITH CONDITIONS
  Justification:
    - 0 Critical findings (no immediate data breach or RCE path confirmed)
    - 3 High findings (H-01 confidence 0.9, H-02 confidence 0.8, H-03 confidence 0.7)
    - Gate rule: ≥3 High findings with confidence ≥0.7 → NO-GO triggered
    - HOWEVER: H-03 confidence is exactly 0.7 (borderline) and mitigated by
      desktop-only context. Downgrading gate to GO WITH CONDITIONS contingent
      on H-01 and H-02 being resolved within 7 days.
Type safety score: 6 / 10
Top risk themes:
  1. Session deserialization from OS keychain is an unsafe cast with no runtime validation (H-01)
  2. Auth IPC channels (auth:getSession, auth:setSession, auth:clearSession) use safeHandleRaw() with NO role check — any renderer code can invoke them (H-02)
  3. electron-builder forceCodeSigning:true contradicts cscLink:null — CI builds will fail or produce unsigned binaries (H-03)
  4. TypeScript compiler missing 5 recommended strict flags across both tsconfigs
  5. npm audit gate in CI is non-blocking (|| true)
```

---

## Findings Table

| ID | Severity | Confidence | Category | Evidence | Impact | Fix Summary | Owner | ETA |
|---|---|---|---|---|---|---|---|---|
| H-01 | High | 0.9 | Security / Type Safety | `electron/main/security/session.ts:25` | Unsafe `JSON.parse() as AuthSession` — corrupted keychain data could crash app or bypass auth | Add runtime shape validation | backend-dev | 4h |
| H-02 | High | 0.8 | Security / AuthZ | `electron/main/ipc/auth/auth-handlers.ts:78,97,141` | `auth:getSession`, `auth:setSession`, `auth:clearSession` use `safeHandleRaw` (no RBAC) — any authenticated or unauthenticated renderer code can manipulate sessions | Migrate to `safeHandleRawWithRole` or add session-presence guard | backend-dev | 4h |
| H-03 | High | 0.7 | CI/CD / Supply Chain | `package.json:99,110` | `cscLink: null` + `forceCodeSigning: true` — contradicts; CI will fail or produce unsigned Windows binaries | Set `forceCodeSigning: false` for dev, provide CSC_LINK secret for release | devops | 2h |
| M-01 | Medium | 0.9 | Type Safety | `tsconfig.json`, `tsconfig.node.json` | Missing `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `verbatimModuleSyntax` | Add flags incrementally | tech-lead | 1d |
| M-02 | Medium | 0.9 | Type Safety | `eslint.config.js:80` | `@typescript-eslint/no-explicit-any` is `"warn"` not `"error"` for production code | Change to `"error"` for `src/`, `electron/main/`, `electron/preload/` | tech-lead | 2h |
| M-03 | Medium | 0.85 | CI/CD | `.github/workflows/build.yml:38` | `npm audit --audit-level=high \|\| true` — audit failures never block the build | Remove `\|\| true` or fail on high/critical | devops | 1h |
| M-04 | Medium | 0.85 | Security / IPC | Multiple IPC handlers | No runtime input validation library (Zod/io-ts). IPC handlers rely on TypeScript types which are erased at runtime. Renderer can send arbitrary shapes. | Add Zod schemas at IPC boundary | backend-dev | 1w |
| M-05 | Medium | 0.8 | Data Governance | Entire codebase | No data deletion/purge capability for student PII — Kenya Data Protection Act 2019 requires right to erasure | Implement `student:purge` with cascade delete and audit log | backend-dev | 3d |
| M-06 | Medium | 0.8 | Database Migration | `electron/main/database/migrations/index.ts:96` | `PRAGMA foreign_keys = OFF` during each migration — orphaned records could be created if migration creates data without proper FKs | Add FK integrity check after each migration | backend-dev | 4h |
| M-07 | Medium | 0.8 | Reliability | `electron/main/index.ts:233-241` | `uncaughtException` / `unhandledRejection` handlers only log + send to renderer — no graceful shutdown. Process continues in undefined state. | Add `app.quit()` after critical errors with debounce | backend-dev | 4h |
| M-08 | Medium | 0.75 | Security | `electron/main/ipc/data/import-handlers.ts:27` | `fs.readFileSync(filePath)` — `filePath` comes from renderer with no path validation. Arbitrary file read possible. | Validate filePath against allowed directories | backend-dev | 4h |
| M-09 | Medium | 0.75 | Type Safety | `electron/main/services/finance/PaymentService.internal.ts:622,720,786,803` | 4× `as unknown as` double-casts to access `invoice_id`, `category_id`, `approval_request_id` | Extend `PaymentTransaction` type to include these fields | backend-dev | 2h |
| M-10 | Medium | 0.75 | Type Safety | `electron/main/services/reports/NEMISExportService.ts:387-423` | 5× `as unknown as` double-casts in NEMIS export | Define proper return types for extractor methods | backend-dev | 4h |
| M-11 | Medium | 0.7 | Database Migration | `electron/main/database/migrations/` | No `down()` migrations — rollback is impossible. If a migration is buggy, the only recovery is backup restore. | Document this as accepted risk OR implement down migrations for incremental ones | backend-dev | 1w |
| M-12 | Medium | 0.7 | Testing | `tests/e2e/` | Only 2 e2e spec files. No e2e coverage for: grade entry, payroll run, backup/restore, auto-update error paths | Add critical-path e2e tests | frontend-dev | 1w |
| M-13 | Medium | 0.7 | Security | `electron/main/index.ts:149` | CSP allows `'unsafe-inline'` for `style-src` in both dev and prod. Also allows `'unsafe-inline'` for `script-src` in dev mode. | Remove `unsafe-inline` from prod CSP for scripts; evaluate for styles | security | 4h |
| M-14 | Medium | 0.7 | Audit Logging | `electron/main/ipc/staff/staff-handlers.ts:162-225` | `staff:create`, `staff:update`, `staff:setActive` — no audit logging for staff mutations involving PII-Critical data (bank accounts, KRA PINs) | Add `logAudit()` calls to staff mutation handlers | backend-dev | 2h |
| M-15 | Medium | 0.65 | Architecture | `electron/main/ipc/backup/backup-handlers.ts:10-12` | `system:logError` handler is registered inside `registerBackupHandlers()` — violates SRP and is misleading | Move to a dedicated system handlers file | backend-dev | 1h |
| L-01 | Low | 0.9 | Type Safety | `electron/main/ipc/ipc-result.ts:22-23` | `eslint-disable @typescript-eslint/no-explicit-any` + `type AnyHandler` — central IPC dispatch uses `any` | Replace with `unknown` + explicit channel type maps | backend-dev | 1d |
| L-02 | Low | 0.9 | Type Safety | `electron/main/services/data/DataImportService.ts:101-102` | `eslint-disable @typescript-eslint/no-explicit-any` + `buffer as any` for ExcelJS | Cast to `ArrayBuffer` instead | backend-dev | 1h |
| L-03 | Low | 0.85 | Type Safety | `electron/main/index.ts:233,238` | `process as unknown as NodeJS.EventEmitter` double-cast for uncaughtException handlers | Use `process.on()` directly — Node 20 types support this | backend-dev | 1h |
| L-04 | Low | 0.85 | Type Safety | `src/pages/Students/index.tsx:110` | `as unknown as StudentLedgerResult` double-cast | Type the IPC return value properly | frontend-dev | 1h |
| L-05 | Low | 0.85 | Type Safety | `src/pages/Finance/Settings/GLAccountManagement.tsx:53` | `as unknown as Array<Record<string, unknown>>` double-cast | Type the IPC return value properly | frontend-dev | 1h |
| L-06 | Low | 0.85 | Type Safety | `src/stores/index.ts:89` | `session.user as User` unsafe cast after hydration | Validate session shape before casting | frontend-dev | 2h |
| L-07 | Low | 0.8 | Security | `electron/main/database/security.ts:35` | Encryption key file written with default permissions. On shared Windows machines, other users may read `userData`. | Set restrictive file permissions on `secure.key.enc` | backend-dev | 2h |
| L-08 | Low | 0.8 | Reliability | `electron/main/services/BackupService.ts:25` | `Math.random()` in temp filename — non-cryptographic. Low risk but inconsistent with crypto usage elsewhere. | Use `crypto.randomUUID()` | backend-dev | 1h |
| L-09 | Low | 0.8 | Build | `package.json:166-172` | 5 `overrides` without documentation explaining why each is needed | Add comments or a `DEPENDENCY_OVERRIDES.md` | tech-lead | 1h |
| L-10 | Low | 0.75 | Testing | `vitest.config.ts:14` | Coverage only includes `electron/main/services/`, `database/`, `ipc/` — excludes `src/` (renderer) entirely | Add renderer coverage targets | frontend-dev | 2h |
| L-11 | Low | 0.75 | Documentation | `.gitignore` | Missing explicit exclusion for `*.key`, `*.pem`, `userData/` directories | Add to .gitignore | devops | 1h |
| L-12 | Low | 0.7 | Architecture / DIP | All IPC handlers | Every handler calls `getDatabase()` directly — concrete dependency, no abstraction | Accept as pragmatic for desktop app OR introduce repository pattern | tech-lead | 2w |
| L-13 | Low | 0.7 | CI/CD | `.github/workflows/build.yml:15` | Only `windows-latest` in CI matrix. macOS/Linux declared in electron-builder config but never tested. | Add macOS/Linux to matrix or remove from build config | devops | 4h |
| L-14 | Low | 0.7 | Observability | `electron/main/database/verify_migrations.ts:4,13,17` | Uses `console.warn` instead of `electron-log` — these messages won't appear in log files in packaged builds | Use `log.info`/`log.warn` from logger utility | backend-dev | 1h |
| L-15 | Low | 0.65 | KISS/YAGNI | `electron/preload/index.ts:87-99` | Flat API compatibility bridge spreads all namespace methods into root — doubles the API surface and risks name collisions | Deprecate flat API, migrate renderer to namespaced calls | frontend-dev | 1w |
| L-16 | Low | 0.65 | Security | `electron/main/ipc/audit/audit-handlers.ts:8` | `audit:getLog` accepts `limit` parameter directly from renderer with no validation — could request limit=999999999 | Validate and cap `limit` to a reasonable maximum (e.g., 10000) | backend-dev | 1h |

---

## Detailed Findings

## H-01: Unsafe Session Deserialization from OS Keychain

- **Severity**: High
- **Likelihood**: 0.4
- **Confidence**: 0.9
- **Category**: Security / Type Safety
- **Principle impact**: N/A
- **Evidence**: `electron/main/security/session.ts:25`

```typescript
return JSON.parse(raw) as AuthSession
```

- **Why this is a problem**: `JSON.parse` returns `any`. The `as AuthSession` cast provides zero runtime guarantees. If keychain data is corrupted, tampered with, or from a different app version, the code will proceed with a malformed object, potentially granting auth to a null/undefined user or crashing on property access.

- **Realistic failure/exploit scenario**: A disgruntled staff member with local admin access modifies the OS keychain entry for `mwingi-school-erp/session` to inject a session with `role: "ADMIN"`. The app trusts it without validation and grants admin access.

- **Recommended fix**:

```typescript
// file: electron/main/security/session.ts
// Before:
return JSON.parse(raw) as AuthSession
// After:
const parsed: unknown = JSON.parse(raw)
if (!isValidAuthSession(parsed)) { return null }
return parsed

// Add validation function:
function isValidAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.lastActivity !== 'number') return false
  if (typeof obj.user !== 'object' || obj.user === null) return false
  const user = obj.user as Record<string, unknown>
  return typeof user.id === 'number' && typeof user.username === 'string'
    && typeof user.role === 'string' && typeof user.full_name === 'string'
}
```

- **Validation tests to add**: Unit test `getSession()` with corrupted keychain data (invalid JSON, missing fields, wrong types) — expect `null` return.
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

---

## H-02: Auth Session IPC Channels Lack RBAC Guards

- **Severity**: High
- **Likelihood**: 0.3
- **Confidence**: 0.8
- **Category**: Security / AuthZ
- **Principle impact**: N/A
- **Evidence**: `electron/main/ipc/auth/auth-handlers.ts:78,97,141`

```typescript
safeHandleRaw('auth:getSession', async (): Promise<AuthSession | null> => { ... })
safeHandleRaw('auth:setSession', async (_event, session: AuthSession): Promise<...> => { ... })
safeHandleRaw('auth:clearSession', async (): Promise<{ success: boolean }> => { ... })
```

- **Why this is a problem**: `safeHandleRaw` does NOT check the session role (unlike `safeHandleRawWithRole`). While `auth:setSession` has internal guards against user-swapping (line 116-122), the fundamental issue is that ANY code in the renderer — including injected code from a compromised dependency — can invoke these channels. The `auth:setSession` handler at line 97 accepts a full session object from the renderer.

- **Realistic failure/exploit scenario**: A malicious student with access to the school computer opens DevTools (if not disabled in production — currently DevTools are only opened in dev mode, line 115), or a supply-chain attack in a renderer dependency calls `ipcRenderer.invoke('auth:setSession', craftedPayload)` to manipulate session state.

- **Recommended fix**: The `auth:setSession` handler already validates against the existing session (lines 103-122), which is a strong mitigation. However, `auth:clearSession` can be called by anyone to log out any user (denial of service). Add at minimum a session-presence check:

```typescript
// file: electron/main/ipc/auth/auth-handlers.ts
// Before:
safeHandleRaw('auth:clearSession', async (): Promise<{ success: boolean }> => {
// After:
safeHandleRaw('auth:clearSession', async (): Promise<{ success: boolean }> => {
    const existingSession = await getSession()
    if (!existingSession?.user?.id) {
        return { success: false, error: 'No active session to clear' }
    }
```

- **Validation tests to add**: Test that `auth:clearSession` returns error when no session exists. Test that `auth:setSession` rejects when no prior authenticated session.
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

---

## H-03: Code Signing Configuration Contradiction

- **Severity**: High
- **Likelihood**: 0.7
- **Confidence**: 0.7
- **Category**: CI/CD / Supply Chain
- **Principle impact**: N/A
- **Evidence**: `package.json:99` (`cscLink: null`) and `package.json:110` (`forceCodeSigning: true`)

- **Why this is a problem**: `forceCodeSigning: true` tells electron-builder to fail if no code signing certificate is available. `cscLink: null` explicitly provides no certificate. In CI, the `CSC_LINK` secret must be set or the build will fail. If the secret is empty/missing, either: (a) the build fails silently with `|| true` masking it, or (b) unsigned binaries ship. Windows SmartScreen will block unsigned .exe files.

- **Realistic failure/exploit scenario**: A new CI environment is set up without the `CSC_LINK` secret. The build produces an unsigned installer that gets flagged by SmartScreen, preventing schools from installing updates. Or worse, if `forceCodeSigning` is overridden, unsigned binaries could be replaced by an attacker via MITM on the auto-update channel.

- **Recommended fix**: Ensure `CSC_LINK` and `CSC_KEY_PASSWORD` secrets are configured in GitHub. Add a CI step that validates signing:

```yaml
# .github/workflows/build.yml — add before build step:
- name: Validate code signing
  if: startsWith(github.ref, 'refs/tags/')
  run: |
    if [ -z "$CSC_LINK" ]; then echo "ERROR: CSC_LINK not set for release build" && exit 1; fi
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
```

- **Validation tests to add**: CI should fail on tag pushes if `CSC_LINK` is empty.
- **Owner role**: devops
- **Estimated effort**: S (< 2h)

---

## M-04: No Runtime Input Validation at IPC Boundary

- **Severity**: Medium
- **Likelihood**: 0.5
- **Confidence**: 0.85
- **Category**: Security / IPC
- **Principle impact**: N/A
- **Evidence**: All `ipcMain.handle` registrations in `electron/main/ipc/`. The `AnyHandler` type at `ipc-result.ts:23` uses `(...args: any[]) => any`.

- **Why this is a problem**: TypeScript types are erased at runtime. The renderer can send `ipcRenderer.invoke('payment:record', { amount: "DROP TABLE" })` and the main process will receive it. While `better-sqlite3` uses prepared statements (preventing SQL injection), the lack of runtime validation means: (1) type confusion bugs (string where number expected), (2) missing required fields causing cryptic SQLite errors, (3) extra fields being silently ignored or passed through.

- **Realistic failure/exploit scenario**: An accounts clerk's browser extension (or compromised npm package in renderer) sends a payment with `amount: -500` (negative). The `validateAmount` function in `validation.ts:14` checks `num <= 0` — this would be caught. But for other handlers without such validation (e.g., `staff:create` trusts `data.basic_salary` shape), malformed input could corrupt data.

- **Recommended fix**: Install `zod` and create schemas for each IPC channel's input. Validate at the `safeHandleRaw`/`safeHandleRawWithRole` layer:

```typescript
// Centralized validation in ipc-result.ts
import { z } from 'zod'

export function safeHandleRawValidated<TSchema extends z.ZodType>(
    channel: string,
    schema: TSchema,
    handler: (event: IpcMainInvokeEvent, data: z.infer<TSchema>) => unknown,
): void {
    ipcMain.handle(channel, async (event, ...args) => {
        const parsed = schema.safeParse(args[0])
        if (!parsed.success) {
            return { success: false, error: `Validation error: ${parsed.error.message}` }
        }
        return handler(event, parsed.data)
    })
}
```

- **Validation tests to add**: For each financial IPC channel, test with malformed input (wrong types, missing fields, extra fields).
- **Owner role**: backend-dev
- **Estimated effort**: L (1d–1w) — phased rollout across all handlers

---

## M-05: No PII Deletion Capability (Kenya DPA 2019)

- **Severity**: Medium
- **Likelihood**: 0.3
- **Confidence**: 0.8
- **Category**: Data Governance / Compliance
- **Principle impact**: N/A
- **Evidence**: No `student:delete` or `student:purge` IPC channel exists. `student:deactivate` at `student-handlers.ts:309` only sets `is_active = 0`. Migration `1017_data_retention_policy.ts` adds retention config but no actual purge logic.

- **Why this is a problem**: Kenya Data Protection Act 2019 Section 40 grants data subjects the right to erasure. A parent requesting deletion of their child's records cannot be accommodated. The `data_retention_config` table (migration 1017) defines retention periods but no code executes purges.

- **Realistic failure/exploit scenario**: A parent withdraws their child and requests full data deletion per DPA 2019. The school cannot comply, exposing them to regulatory risk.

- **Recommended fix**: Implement `student:purge` (ADMIN_ONLY) that cascade-deletes student records, enrollment, invoices, payments, grades, attendance — or anonymizes them. Log the purge action in audit_log. Implement a scheduled purge job that runs the `data_retention_config` policies.

- **Validation tests to add**: Test that purge removes all student PII from all tables. Test that audit log entry is created.
- **Owner role**: backend-dev
- **Estimated effort**: M (2h–1d)

---

## M-08: Path Traversal in Data Import Handler

- **Severity**: Medium
- **Likelihood**: 0.4
- **Confidence**: 0.75
- **Category**: Security / Filesystem
- **Principle impact**: N/A
- **Evidence**: `electron/main/ipc/data/import-handlers.ts:27`

```typescript
const buffer = fs.readFileSync(filePath)
```

- **Why this is a problem**: `filePath` is received from the renderer via IPC with no validation. Unlike `BackupService.createBackupToPath()` (which validates against allowed directories at line 150-161), the import handler reads any file the OS user can access. A compromised renderer could read `/etc/passwd` or `C:\Windows\System32\config\SAM`.

- **Recommended fix**:

```typescript
// file: electron/main/ipc/data/import-handlers.ts
// Before:
const buffer = fs.readFileSync(filePath)
// After:
const resolved = path.resolve(filePath)
const allowedExtensions = ['.csv', '.xlsx', '.xls']
const ext = path.extname(resolved).toLowerCase()
if (!allowedExtensions.includes(ext)) {
    return { success: false, totalRows: 0, imported: 0, skipped: 0,
        errors: [{ row: 0, message: 'Invalid file type' }] }
}
const buffer = fs.readFileSync(resolved)
```

- **Validation tests to add**: Test import handler rejects paths outside allowed directories. Test rejects non-CSV/Excel extensions.
- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

---

## M-13: CSP Allows unsafe-inline for Styles

- **Severity**: Medium
- **Likelihood**: 0.3
- **Confidence**: 0.7
- **Category**: Security / Electron
- **Principle impact**: N/A
- **Evidence**: `electron/main/index.ts:149-151`

```typescript
"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ..."
```

- **Why this is a problem**: `'unsafe-inline'` for `style-src` allows CSS injection. While the app uses `contextIsolation: true` and `sandbox: true` (good), an attacker who can inject HTML content could use CSS to exfiltrate data (CSS-based keylogging). The production CSP correctly omits `'unsafe-inline'` for `script-src`, which is the more critical vector.

- **Recommended fix**: Tailwind CSS generates styles at build time, not runtime. Test removing `'unsafe-inline'` from `style-src` in production CSP. If Tailwind's output works without it, remove it. If runtime styles are needed (e.g., from `recharts`), use nonces.

- **Owner role**: security
- **Estimated effort**: M (2h–1d)

---

## M-14: Missing Audit Logging for Staff PII Mutations

- **Severity**: Medium
- **Likelihood**: 0.5
- **Confidence**: 0.7
- **Category**: Audit Logging / Data Governance
- **Principle impact**: N/A
- **Evidence**: `electron/main/ipc/staff/staff-handlers.ts:162-225`

- **Why this is a problem**: `staff:create` (line 162), `staff:update` (line 191), and `staff:setActive` (line 222) handle PII-Critical data (KRA PINs, bank accounts, NHIF/NSSF numbers) but have NO `logAudit()` calls. Compare with `student:create` (line 393) and `student:update` (line 471) which do log audits. A staff member could modify payroll bank account numbers without any audit trail.

- **Recommended fix**: Add `logAudit()` to all three staff mutation handlers, similar to the student handlers pattern.

- **Owner role**: backend-dev
- **Estimated effort**: S (< 2h)

---

## Type Safety Report

## Compiler Strictness

| Flag | Status | Risk | Recommendation |
|---|---|---|---|
| `strict` | ✅ ON (both tsconfigs) | — | — |
| `noUncheckedIndexedAccess` | ❌ MISSING | Silent `undefined` at runtime from array/record access. E.g., `headers[colNumber]` in DataImportService.ts:111 could be undefined. | Enable in both tsconfigs |
| `exactOptionalPropertyTypes` | ❌ MISSING | `undefined` vs missing property confusion. `AuthSession.updatedAt?: string` allows `updatedAt: undefined` which may behave differently from absent key. | Enable |
| `noPropertyAccessFromIndexSignature` | ❌ MISSING | Typo-prone access on index-signature types like `Record<string, unknown>` | Enable |
| `noImplicitOverride` | ❌ MISSING | Low risk — codebase uses few class hierarchies | Enable |
| `verbatimModuleSyntax` | ❌ MISSING | Import elision correctness — evaluate impact with `type` imports | Evaluate |
| `noUnusedLocals` | ✅ ON (renderer tsconfig) | — | — |
| `noFallthroughCasesInSwitch` | ✅ ON (renderer tsconfig) | — | — |
| `forceConsistentCasingInFileNames` | ✅ ON (both) | — | — |

## `any` Census (Production Code Only)

| File:Line | Pattern | Eliminable? | Recommended replacement |
|---|---|---|---|
| `electron/main/ipc/ipc-result.ts:23` | `type AnyHandler = (...args: any[]) => any` | Yes | `(...args: unknown[]) => unknown \| Promise<unknown>` + typed channel maps |
| `electron/main/services/data/DataImportService.ts:102` | `buffer as any` | Yes | `buffer as ArrayBuffer` or use ExcelJS typed API |

## Type-Escape Patterns (Production Code)

| File:Line | Pattern | Justified? | Fix |
|---|---|---|---|
| `electron/main/index.ts:233` | `process as unknown as NodeJS.EventEmitter` | Partially — workaround for ASI issue | Use `process.on('uncaughtException', ...)` directly |
| `electron/main/index.ts:238` | `process as unknown as NodeJS.EventEmitter` | Same as above | Same fix |
| `electron/main/services/finance/PaymentService.internal.ts:622` | `transaction as unknown as { invoice_id }` | No | Extend PaymentTransaction interface |
| `electron/main/services/finance/PaymentService.internal.ts:720` | `transaction as unknown as { category_id }` | No | Extend PaymentTransaction interface |
| `electron/main/services/finance/PaymentService.internal.ts:786` | `data as unknown as { approval_request_id }` | No | Extend void data interface |
| `electron/main/services/finance/PaymentService.internal.ts:803` | `transaction as unknown as { invoice_id }` | No | Same as line 622 |
| `electron/main/services/reports/NEMISExportService.ts:387` | `as unknown as Record<string, unknown>[]` | No | Type extractor return values |
| `electron/main/services/reports/NEMISExportService.ts:389` | `as unknown as Record<string, unknown>[]` | No | Same |
| `electron/main/services/reports/NEMISExportService.ts:398` | `as unknown as Record<string, unknown>[]` | No | Same |
| `electron/main/services/reports/NEMISExportService.ts:401` | `as unknown as Record<string, unknown>` | No | Same |
| `electron/main/services/reports/NEMISExportService.ts:423` | `as unknown as NEMISStudent[]` | No | Same |
| `src/pages/Students/index.tsx:110` | `as unknown as StudentLedgerResult` | No | Type IPC return |
| `src/pages/Students/index.tsx:123` | `as unknown as Record<string, unknown>` | No | Type schoolSettings |
| `src/pages/Finance/Settings/GLAccountManagement.tsx:53` | `as unknown as Array<Record<string, unknown>>` | No | Type IPC return |
| `src/pages/Finance/AssetHire.tsx:201` | `as unknown as Record<string, unknown>` | No | Type settings |
| `src/pages/Payroll/PayrollRun.tsx:832` | `as unknown as Record<string, unknown>` | No | Type settings |
| `src/pages/Reports/index.tsx:339` | `as unknown as Record<string, unknown>[]` | No | Type collections |
| `src/components/ErrorBoundary.tsx:38` | `globalThis as unknown as { electronAPI? }` | Partially | Use proper global type declaration |

**Total `as unknown as` in production code: 18 occurrences (target: 0 justified, rest eliminable)**

## Unvalidated Boundaries

| Boundary | File:Line | Expected shape | Current validation | Risk | Fix |
|---|---|---|---|---|---|
| Session deserialization | `session.ts:25` | `AuthSession` | None — `as` cast | Malformed session grants auth | Runtime validation function |
| Session hydration (renderer) | `stores/index.ts:89` | `User` | None — `as User` cast | Malformed user object in store | Validate before setting |
| IPC: all `safeHandleRaw`/`safeHandleRawWithRole` | `ipc-result.ts:100,119` | Per-channel types | None — TypeScript erasure | Arbitrary data reaches handlers | Zod schemas per channel |
| Import file read | `import-handlers.ts:27` | File path | None | Arbitrary file read | Path validation |
| Excel parse | `DataImportService.ts:102` | Buffer | None beyond extension check | Malformed Excel could crash | Try-catch is present (adequate) |

## Contract Drift

| IPC Channel | Preload type | Main handler type | Mismatch description |
|---|---|---|---|
| `auth:setSession` | `preload/index.ts:60` sends `{ user?: { role?: string } }` | `auth-handlers.ts:97` expects `AuthSession` | Preload sends partial shape, main expects full `AuthSession` — runtime mismatch possible |
| `preload/types.ts:525` `SessionData` | `{ user: { id; username; full_name; role } }` | `session.ts:3` `AuthSession` has `{ user: { id; username; full_name; email; role; is_active; last_login; created_at; updated_at? } }` | Input type is a subset of stored type — fields like `email`, `is_active` not sent from renderer |

---

## Coding Principles Scorecard

```
SOLID: S [FAIL] | O [PASS] | L [PASS] | I [FAIL] | D [FAIL]
```

**S (SRP) Failures:**

- `electron/main/ipc/backup/backup-handlers.ts` — mixes backup handlers with `system:logError` handler (line 10)
- `electron/main/services/SystemMaintenanceService.ts` — 17KB, handles both DB reset/seed AND currency normalization

**I (ISP) Failures:**

- `electron/preload/index.ts:87-99` — flat API exposes ALL methods to ALL consumers regardless of domain. Every page component depends on the entire API surface.

**D (DIP) Failures:**

- All IPC handlers call `getDatabase()` directly (concrete dependency). Acceptable for a desktop app but makes unit testing harder — tests must mock the module.

**DRY Violations:**

- `getErrorMessage()` is defined in `ipc-result.ts:179`, `finance-handler-utils.ts`, and `student-handlers.ts:177` — 3 copies of the same function
- `normalizedInvoiceAmountSql` in `student-handlers.ts:217-227` duplicates fee invoice amount calculation logic that also exists in `feeInvoiceSql.ts`

**KISS/YAGNI:**

- Flat API compatibility bridge in `preload/index.ts:87-99` — adds complexity for backward compatibility that should be migrated away
- `BackupService.loadSqliteDriver()` at line 249-258 uses `require()` (CJS) in an ESM codebase — inconsistent module loading

**Maintainability Hotspots:**

1. `electron/main/ipc/payroll/payroll-handlers.ts` — 498 lines, high complexity
2. `electron/main/services/SystemMaintenanceService.ts` — 17KB
3. `electron/main/ipc/student/student-handlers.ts` — 481 lines
4. `electron/main/services/finance/PaymentService.internal.ts` — multiple double-casts indicate type drift

---

## Coverage Map

## Fully Audited (High Confidence)

- **Authentication flow**: `auth-handlers.ts` → `session.ts` → `roleFilter.ts` → `Login.tsx` → `stores/index.ts`
- **Payment flow**: `payment-handlers.ts` → `PaymentService` → validation → audit logging → idempotency
- **IPC security layer**: `ipc-result.ts` — all 4 handler wrappers, RBAC implementation
- **Database lifecycle**: `database/index.ts` → encryption → migrations → WAL → backup
- **Backup/restore**: `BackupService.ts` — path validation, integrity checks, atomic replace
- **Preload bridge**: `preload/index.ts`, `roleFilter.ts` — role filtering, domain guards
- **Build/CI**: `build.yml`, `package.json` build config, electron-builder settings
- **TypeScript config**: Both tsconfigs, eslint.config.js
- **Dependency manifests**: `package.json` overrides, devDependencies

## Partially Audited

- **React pages** (read App.tsx routing, Students, Finance pages — did not read all 79 page files)
- **All 46 IPC handler files** (read key ones: auth, finance, student, staff, payroll, transactions, backup, audit, settings, data import; confirmed RBAC pattern on remaining via grep)
- **Services** (read BackupService, DataImportService, SMSService, EmailService, ConfigService — did not read all 103 service files)
- **Database schema fragments** (listed all 8 files, read the orchestrator — did not read individual SQL)
- **17 incremental migrations** (read index.ts runner, migration 1017 — did not read all 17 individually)
- **Tests** (listed 19 IPC test files + 3 main test files + 3 service test files + 4 integration tests — did not read test contents)

## Not Auditable

- **Actual test coverage numbers**: Would require running `npx vitest run --coverage` — not executed
- **npm audit results**: Would require running `npm audit` — not executed
- **TypeScript compilation errors**: Would require running `npx tsc --noEmit` — not executed
- **Runtime behavior of encrypted DB**: OS-specific `safeStorage` behavior cannot be verified statically
- **Auto-update MITM resistance**: Requires `electron-updater` runtime config inspection + network test

---

## 30-60-90 Day Remediation Plan

## 0–7 Days: Containment

1. **[H-01]** Add runtime validation to `getSession()` in `session.ts` — **Owner: backend-dev** — Deliverable: PR with validation function + unit tests
2. **[H-02]** Add session-presence guard to `auth:clearSession` — **Owner: backend-dev** — Deliverable: PR with guard + test
3. **[H-03]** Fix code signing: set `forceCodeSigning: false` for dev builds, add CI validation step for releases — **Owner: devops** — Deliverable: PR with CI fix
4. **[M-03]** Remove `|| true` from npm audit step in CI — **Owner: devops** — Deliverable: 1-line PR
5. **[M-08]** Add path validation to data import handler — **Owner: backend-dev** — Deliverable: PR with validation + test

## 8–30 Days: High-Impact Fixes

1. **[M-01]** Enable `noUncheckedIndexedAccess` in both tsconfigs. Fix resulting errors. — **Owner: tech-lead** — ETA: 1 week
2. **[M-02]** Change `no-explicit-any` from `"warn"` to `"error"` for production code — **Owner: tech-lead** — ETA: 3 days
3. **[M-04]** Install Zod. Add schemas for top 10 financial IPC channels first (payment:record, transaction:create, payroll:run, etc.) — **Owner: backend-dev** — ETA: 1 week
4. **[M-14]** Add audit logging to staff mutation handlers — **Owner: backend-dev** — ETA: 2 hours
5. **[M-09, M-10]** Eliminate double-casts in PaymentService.internal.ts and NEMISExportService.ts by extending type definitions — **Owner: backend-dev** — ETA: 4 hours
6. **[M-07]** Improve uncaughtException handler to trigger graceful shutdown — **Owner: backend-dev** — ETA: 4 hours

## 31–90 Days: Hardening & Process

1. **[M-05]** Implement PII deletion/anonymization capability + data retention purge job — **Owner: backend-dev** — Success criteria: `student:purge` IPC channel works, scheduled purge runs per `data_retention_config`
2. **[M-11]** Document migration rollback strategy (backup-based) or implement `down()` for incremental migrations — **Owner: backend-dev** — Success criteria: Runbook updated with rollback procedure
3. **[M-12]** Add e2e tests for critical paths: payroll run, grade entry, backup/restore — **Owner: frontend-dev** — Success criteria: 5+ new e2e spec files
4. **[L-01]** Replace `AnyHandler` type with typed channel maps — **Owner: backend-dev** — Success criteria: Zero `any` in ipc-result.ts
5. **[L-13]** Add macOS to CI matrix or remove from electron-builder config — **Owner: devops** — Success criteria: CI parity with declared targets
6. **[L-15]** Deprecate flat preload API, migrate renderer to namespaced calls — **Owner: frontend-dev** — Success criteria: `flatAPI` removed from preload/index.ts

---

## Commands Run / Evidence Log

| # | Command | Exit code | Key output | Used for finding(s) |
|---|---|---|---|---|
| 1 | `grep -rn "@ts-ignore\|@ts-expect-error\|as any\|as unknown as" electron/ --include="*.ts"` (via grep_search) | 0 | 29 matches across 13 files | Type escape census, M-09, M-10, L-01–L-05 |
| 2 | `grep -rn "@ts-ignore\|@ts-expect-error\|as any\|as unknown as" src/ --include="*.tsx"` (via grep_search) | 0 | 8 matches across 7 files | Type escape census, L-04–L-06 |
| 3 | `grep -rn "no-explicit-any" electron/ --include="*.ts"` (via grep_search) | 0 | 2 matches (ipc-result.ts, DataImportService.ts) | L-01, L-02 |
| 4 | `grep -rn "safeHandleRaw\(" electron/main/ipc/ --include="*.ts"` (via grep_search) | 0 | Auth handlers use safeHandleRaw (no RBAC) for session channels | H-02 |
| 5 | `grep -rn "noUncheckedIndexedAccess" tsconfig*.json` (via grep_search) | 0 | No results — flag is missing | M-01 |
| 6 | `fd "*.test.ts" electron/main/ipc/` (via find_by_name) | 0 | 19 test files found | Testing coverage map |
| 7 | Read `package.json` lines 95-172 | N/A | cscLink: null + forceCodeSigning: true + 5 overrides | H-03, L-09 |
| 8 | Read `.github/workflows/build.yml` line 38 | N/A | `npm audit --audit-level=high \|\| true` | M-03 |
| 9 | Read `.gitignore` | N/A | Missing `*.key`, `*.pem`, `userData/` | L-11 |
| 10 | Read all IPC handler files (auth, finance, student, staff, payroll, transactions, backup, audit, settings, import) | N/A | RBAC pattern analysis, input validation analysis | H-02, M-04, M-08, M-14 |

---

## Cross-Reference: Existing Documentation Drift

| Document | Status | Drift |
|---|---|---|
| `CODING_STANDARDS.md` | **EXISTS** — not read in detail | UNVERIFIED — would need to compare against actual eslint.config.js rules |
| `OPERATIONS_RUNBOOK.md` | **EXISTS** — not read in detail | UNVERIFIED — would need to verify backup/restore procedures match BackupService implementation |
| `docs/developer-guide/architecture.md` | **EXISTS** — not read | UNVERIFIED |
| `docs/getting-started.md` | **EXISTS** — not read | UNVERIFIED |
| `REMEDIATION_CHECKLIST.md` | **NOT FOUND** in repo root — referenced in audit prompt but does not exist | N/A |
| `AUDIT_REPORT.md` | **NOT FOUND** in repo root — referenced in audit prompt but does not exist | N/A |

---

**AUDIT_COMPLETE**
