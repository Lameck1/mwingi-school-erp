# Mwingi School ERP — Full-Spectrum Audit Prompt

> **Usage**: Feed this prompt to an LLM with full repository context to produce a
> zero-trust, evidence-backed audit of the Mwingi School ERP codebase.

---

You are acting as a **Principal Software Auditor** with deep expertise in
Electron desktop security, TypeScript type safety, financial-system integrity,
and education-sector data governance. Perform a full-spectrum, zero-trust audit
of the **Mwingi School ERP** repository.

## 0. Repository Identity & Stack Context

Before auditing, internalize these facts (do NOT re-discover them):

| Attribute | Value |
|---|---|
| **Product** | Desktop ERP for a Kenyan secondary school (accounting, academics, payroll, operations) |
| **Runtime** | Electron 40 (Chromium + Node 20) — single-instance, local-first |
| **Frontend** | React 19, Vite 6, Tailwind CSS 3, Zustand 4, react-router-dom 6 |
| **Backend** | Electron main process — TypeScript 5.3, ESM |
| **Database** | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher encryption at rest) |
| **Auth** | bcryptjs password hashing, session stored in OS keychain via `keytar` |
| **IPC contract** | `contextBridge.exposeInMainWorld` with role-filtered preload bridge |
| **Build/Pack** | Vite + vite-plugin-electron → electron-builder (NSIS/portable on Windows x64) |
| **CI** | GitHub Actions: lint → vitest → npm audit → electron-builder (Windows runner only) |
| **Test stack** | Vitest (unit/integration, 80% line threshold), Playwright (e2e, 2 spec files) |
| **Linting** | ESLint flat config with @typescript-eslint, security, sonarjs, unicorn, jsx-a11y, import, promise plugins |
| **OS targets** | Primary: Windows x64. Secondary: macOS (dmg), Linux (AppImage/deb) — CI only builds Windows |

---

## 1. Scope Boundaries

Audit **all** of the following scopes. If a scope is empty or missing, flag that as a finding.

| Scope | Path(s) | What to audit |
|---|---|---|
| **Electron main process** | `electron/main/` | Services, IPC handlers, database layer, security, utils, startup lifecycle |
| **Preload bridge** | `electron/preload/` | API surface, role filtering, type contracts, IPC channel exposure |
| **React renderer** | `src/` | Pages, components, stores, hooks, contexts, types, utils |
| **Database schema & migrations** | `electron/main/database/schema/`, `electron/main/database/migrations/` | Schema correctness, migration safety, rollback capability |
| **Scripts** | `scripts/` | Utility/maintenance scripts — safety, correctness |
| **CI/CD pipelines** | `.github/workflows/` | Pipeline gates, branch protection, artifact integrity, secret handling |
| **Build & packaging** | `vite.config.ts`, `electron-builder` config in `package.json` | Build correctness, code-signing, target parity |
| **Config files** | `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `.dependency-cruiser.cjs`, `postcss.config.js`, `tailwind.config.js` | Correctness, strictness gaps, drift |
| **Documentation** | `docs/`, `*.md` in root | Accuracy, completeness, drift from implementation |
| **Tests** | `electron/main/__tests__/`, `src/**/__tests__/`, `tests/e2e/`, `src/utils/__tests__/` | Coverage, quality, flakiness, critical-path gaps |
| **Dependency manifests** | `package.json`, `package-lock.json` | Supply chain hygiene, vulnerability exposure |

**Out of scope**: `node_modules/`, `dist/`, `dist-electron/`, `release/`, `coverage/`, archived migrations (`migrations/archive/`, `migrations/legacy/`, `migrations/v2/`).

---

## 2. Runtime & Environment Targets

Validate all audit findings against these runtime constraints:

- **Node.js**: 20.x LTS (CI pinned)
- **Electron**: 40.x (Chromium ~130, Node ~20)
- **OS parity**: Production is Windows x64. macOS/Linux are declared but **not CI-tested** — flag parity gaps.
- **SQLite**: WAL mode, foreign keys ON, encrypted via SQLCipher (hex key from `safeStorage`)
- **Desktop context**: No HTTP server. All data is local. Network only for: auto-update checks, optional email (nodemailer), optional SMS.

---

## 3. Release Gate Policy

Apply this release-readiness model to all findings:

| Gate | Condition |
|---|---|
| **NO-GO** | ≥1 Critical finding, OR ≥3 High findings with confidence ≥ 0.7 |
| **GO WITH CONDITIONS** | 1-2 High findings (any confidence), OR ≥5 Medium findings |
| **GO** | Only Low/Medium findings with total count ≤ 4 |

- Any **Critical** finding blocks release — no exceptions.
- Any **High** finding with confidence ≥ 0.8 blocks release unless an accepted mitigation plan exists.
- The auditor must explicitly justify the release gate decision with evidence references.

---

## 4. Evidence Standard

### Minimum proof per finding

| Finding severity | Required evidence |
|---|---|
| **Critical** | Exact `file:line` citation + reproducible exploit/failure scenario + proof the path is reachable |
| **High** | Exact `file:line` citation + plausible trigger scenario |
| **Medium** | `file:line` citation OR command output + risk explanation |
| **Low** | `file:line` citation OR pattern reference |

### Handling conflicting signals

- If static analysis contradicts runtime behavior, state both and label the finding with **`CONFLICTING_EVIDENCE`**.
- If a tool reports a vulnerability but code inspection shows it is unreachable, downgrade severity but keep the finding with a note explaining why.
- If two findings overlap, **merge** them under the higher-impact version and cross-reference.
- If evidence is insufficient to confirm or deny, label **`UNVERIFIED`** and specify exactly what additional proof is needed (command, test, or manual check).

---

## 5. TypeScript Type Safety Policy

This codebase uses `"strict": true` in both `tsconfig.json` (renderer) and `tsconfig.node.json` (main/preload). The audit must evaluate strict typing **beyond the baseline**:

### 5a. Compiler strictness gaps — check for absence of

| Flag | Expected | Risk if missing |
|---|---|---|
| `noUncheckedIndexedAccess` | **should be ON** | Silent `undefined` at runtime from array/object access |
| `exactOptionalPropertyTypes` | **should be ON** | `undefined` vs missing property confusion |
| `noPropertyAccessFromIndexSignature` | should be ON | Typo-prone access on index-signature types |
| `verbatimModuleSyntax` | evaluate | Import elision correctness |
| `noImplicitOverride` | should be ON | Accidental override in class hierarchies |

Flag each missing flag as a finding with concrete impact examples from this codebase.

### 5b. `any` budget — target: ZERO in production code

- `@typescript-eslint/no-explicit-any` is currently `"warn"` — **this should be `"error"` for production code** (`src/`, `electron/main/`, `electron/preload/`).
- Enumerate every `any` occurrence in non-test code. For each, state whether it is:
  - **Eliminable** (can be replaced with a concrete type or `unknown`)
  - **Justified** (e.g., third-party API boundary — must have a suppression comment explaining why)
- Test files (`**/*.test.ts`, `__tests__/`) may use `any` — but flag gratuitous usage.

### 5c. Banned type-escape patterns

Search for and flag ALL occurrences of:

| Pattern | Risk |
|---|---|
| `@ts-ignore` | Silently suppresses errors — must be zero |
| `@ts-expect-error` without adjacent comment | Acceptable only with justification comment |
| `as any` | Type laundering — must be zero in prod code |
| `as unknown as T` | Double-cast escape hatch — must be justified |
| `// eslint-disable.*no-explicit-any` | Suppression of type safety — must be justified |
| `Function` type | Untyped callable — replace with specific signature |
| `Object` type | Use `Record<string, unknown>` or specific shape |
| `{}` type | Means "any non-nullish" — almost always wrong |

For each occurrence, provide: `file:line | pattern | eliminable? | recommended fix`.

### 5d. Runtime validation for external/untrusted input

This codebase has **no runtime validation library** (no Zod, io-ts, runtypes, superstruct, or ajv).

- **IPC boundary** (`electron/preload/` → `electron/main/ipc/`): All data crossing this boundary comes from the renderer and must be validated at the main process side. Audit every `ipcMain.handle` registration for input validation.
- **File imports** (CSV via `csv-parse`, Excel via `exceljs`): Imported data must be validated before DB insertion. Audit `DataImportService` and all import handlers.
- **Database reads**: `JSON.parse` on stored JSON fields must validate shape, not just cast.
- **Session deserialization**: `getSession()` in `electron/main/security/session.ts` does `JSON.parse(raw) as AuthSession` — this is an unsafe cast. Flag and recommend runtime validation.

For each unvalidated boundary, state: `boundary | file:line | data shape expected | current validation (if any) | risk | fix`.

### 5e. Type contract drift

- Compare `electron/preload/types.ts` (IPC input types) against `src/types/electron-api/` (IPC return types). Flag any mismatches, missing channels, or undocumented contracts.
- Compare IPC handler function signatures against preload bridge calls. Flag any channel where the main process accepts a different shape than what the preload sends.

---

## 6. Security Threat Model

### 6a. Crown-jewel assets

| Asset | Location | Classification |
|---|---|---|
| Student PII (names, DOB, gender, guardian info, admission data) | SQLite DB, IPC transit | **HIGH sensitivity** |
| Staff PII (ID numbers, KRA PINs, NHIF/NSSF numbers, bank accounts, salary) | SQLite DB, IPC transit | **CRITICAL sensitivity** |
| Financial records (payments, invoices, GL transactions, budgets) | SQLite DB | **HIGH sensitivity** — integrity critical |
| Authentication credentials (bcrypt hashes, session tokens) | SQLite DB, OS keychain | **CRITICAL sensitivity** |
| Database encryption key | OS secure storage (`safeStorage`) | **CRITICAL sensitivity** |
| Application binary & auto-update channel | electron-builder, GitHub releases | **HIGH sensitivity** — supply chain |

### 6b. Attacker profiles

| Profile | Access | Goal |
|---|---|---|
| **Malicious student/parent** | Physical access to school computer | View other students' data, modify grades/fees |
| **Disgruntled staff** | Authenticated session, local file access | Exfiltrate PII, manipulate payroll/financials |
| **Local attacker** | Physical access to Windows machine | Extract DB, decrypt data, tamper with app |
| **Supply chain attacker** | Compromised npm dependency | Code execution in main process |

### 6c. Trust boundaries to audit

| Boundary | Direction | Risk |
|---|---|---|
| **Renderer → Main (IPC)** | `ipcRenderer.invoke` → `ipcMain.handle` | Input injection, privilege escalation, missing RBAC |
| **Main → SQLite** | Prepared statements vs string concat | SQL injection |
| **Main → Filesystem** | Backup, import/export, PDF generation | Path traversal, arbitrary file write |
| **Main → Network** | nodemailer, electron-updater | SSRF, credential leakage, MITM on updates |
| **Main → OS keychain** | keytar read/write | Session hijacking if keychain is compromised |
| **Build → Release** | electron-builder, GitHub Actions | Unsigned binaries, compromised artifacts |

### 6d. Tenant isolation

This is a single-tenant desktop app. However, audit:

- **User role isolation**: Can a `TEACHER` role access `ADMIN`-only or `ACCOUNTS_CLERK`-only IPC channels?
- **Preload role filtering**: Is `roleFilter.ts` correctly restricting API surface per role?
- **Session separation**: Can leftover session state from one user affect another?

---

## 7. Data Governance

### 7a. PII classification

Audit all database tables and IPC types for PII fields. Classify each as:

| Class | Examples | Required controls |
|---|---|---|
| **PII-Critical** | Staff ID numbers, KRA PINs, bank accounts, NHIF/NSSF | Encryption at rest, access logging, no bulk export without RBAC |
| **PII-High** | Student names, DOB, guardian phone/email, addresses | Encryption at rest, access logging |
| **PII-Standard** | Staff phone/email, student admission numbers | Basic access control |

### 7b. Retention & deletion

- Is there any data retention policy implemented? TTL on audit logs? Ability to purge a student's data?
- Flag absence of data deletion capability as a finding (relevant for Kenya Data Protection Act 2019).

### 7c. Encryption

- **At rest**: DB encryption via SQLCipher — audit key lifecycle, rotation capability, strength.
- **In transit (IPC)**: Electron IPC is in-process — acceptable. But audit any network transit (nodemailer SMTP credentials, auto-update URLs).
- **Backups**: Are database backups encrypted? Audit `BackupService.ts` and `backupDatabase()`.

### 7d. Audit logging

- Audit the `audit-handlers.ts` and audit log tables. Are all sensitive operations (payments, grade changes, user creation, role changes, data exports) logged with actor ID and timestamp?
- Flag any sensitive operation that lacks an audit trail.

---

## 8. Supply Chain Controls

### 8a. Lockfile hygiene

- Verify `package-lock.json` is committed and matches `package.json`.
- Check for `overrides` in `package.json` — are they justified and documented?
- Flag any `file:` or `link:` protocol dependencies.

### 8b. Vulnerability / CVE gating

- The CI runs `npm audit --audit-level=high || true` — the `|| true` means **audit failures do not block the build**. Flag this.
- Run `npm audit` and report all High/Critical vulnerabilities.
- Check if `electron` version 40.x has known CVEs.

### 8c. Secret scanning

- Search the entire repo for hardcoded secrets, API keys, passwords, tokens.
- Audit `.gitignore` for proper exclusion of: `.env`, `*.key`, `*.pem`, `userData/`, backup files.
- Audit GitHub Actions for secret handling (`CSC_LINK`, `CSC_KEY_PASSWORD`, `GITHUB_TOKEN`).

### 8d. Dependency provenance

- Check `electron-builder` code-signing config: `forceCodeSigning: true` is set for Windows, but `cscLink: null` in package.json — flag the contradiction.
- Audit `softprops/action-gh-release` action pin — is it a commit SHA (good) or tag (risky)?

---

## 9. Reliability SLOs & Disaster Recovery

Since this is a desktop school ERP (not a web service), translate SLOs to desktop context:

| Metric | Target | How to verify |
|---|---|---|
| **App startup time** | < 5s from launch to usable window | Measure `bootstrap()` → `ready-to-show` |
| **Database operation latency** | < 200ms for any single query, < 2s for reports | Profile hot queries |
| **Crash recovery** | No data loss on crash (WAL mode) | Verify WAL + checkpoint behavior |
| **Backup/restore RTO** | < 5 min to restore from backup | Test `backupDatabase()` + restore flow |
| **Backup RPO** | < 24h (auto-backup frequency) | Audit `BackupService.init()` schedule |
| **Update reliability** | Auto-update never corrupts install | Audit `autoUpdater` error handling |
| **Data integrity** | Zero silent data corruption | Foreign keys ON, transaction boundaries, constraint checks |

Audit each against the actual implementation and flag gaps.

---

## 10. Database Migration Safety

Audit all files in `electron/main/database/migrations/`:

| Check | Requirement |
|---|---|
| **Backward compatibility** | Can the app run against a DB that has been migrated forward but the app is rolled back? |
| **Rollback strategy** | Is there a `down()` migration for each `up()`? If not, flag. |
| **Idempotency** | Can migrations run twice without error? (e.g., `CREATE TABLE IF NOT EXISTS`) |
| **Data preservation** | Do any migrations drop columns/tables with data? Flag as High if PII or financial. |
| **Transaction wrapping** | Are migrations wrapped in transactions? A partial migration = corrupted DB. |
| **Migration verification** | Audit `verify_migrations.ts` — does it catch drift? |
| **Schema consistency** | Does `schema/` match the result of running all migrations? |

---

## 11. Testing Quality Bar

### 11a. Coverage expectations

| Area | Expected coverage | Current |
|---|---|---|
| **Services** (`electron/main/services/`) | ≥ 80% line | Audit actual |
| **IPC handlers** (`electron/main/ipc/`) | ≥ 80% line | Audit actual |
| **Database layer** | ≥ 80% line | Audit actual |
| **React pages** (critical paths) | At least smoke tests | Audit actual |
| **E2E** (fee payment, login, core workflows) | Critical path coverage | Audit actual (2 spec files) |

### 11b. Critical-path test gaps

These paths **must** have dedicated tests. Flag any that are missing:

- Login → session creation → role-based access
- Fee payment → balance update → receipt generation → audit log
- Grade entry → report card generation
- Student enrollment → fee structure assignment
- Payroll run → salary calculation → disbursement record
- Backup → restore → data integrity verification
- Database migration → schema verification
- Auto-update flow (at least error paths)

### 11c. Advanced testing requirements

| Test type | Expectation |
|---|---|
| **Mutation testing** | Not required yet, but flag if coverage numbers are misleading (high coverage, low assertion density) |
| **Contract tests** | IPC contract between preload types and main handler signatures — flag drift |
| **Performance tests** | Flag any query or operation that lacks timeout protection or could degrade with scale (e.g., generating report cards for 500+ students) |
| **Concurrency tests** | SQLite is single-writer — flag any code that assumes concurrent writes will succeed |

---

## 12. Non-Negotiable Audit Rules

1. **Evidence-first only.** Every claim must include:
   - `path/to/file.ext:line` evidence, OR
   - Exact command output evidence.
2. If unverifiable, label `UNVERIFIED` and state exactly what is missing.
3. **No fluff, no praise, no generic advice, no speculation.**
4. Do not invent files, configs, tests, or line numbers.
5. De-duplicate overlapping findings; keep the highest-impact version.
6. Prioritize exploitability, business impact, and operational risk over style.
7. Use standards-backed reasoning where relevant (OWASP ASVS 4.0, CWE, Kenya Data Protection Act 2019, secure SDLC, Electron security checklist).
8. If tools cannot run, provide exact commands and required outputs.

---

## 13. Mandatory Audit Dimensions

Audit ALL of these. For each, produce findings or explicitly state "no findings":

1. **Requirements/domain correctness** — Does the code match school ERP domain rules (Kenyan curriculum: CBC/8-4-4/JSS, NEMIS reporting, fee structures by term/stream/student-type)?
2. **Architecture & boundaries** — Coupling between layers, dependency direction violations (renderer importing from main?), circular dependencies, god-service classes.
3. **IPC/API correctness** — Input validation, error handling, idempotency (especially payments — `idempotency_key`), contract integrity between preload and main.
4. **Frontend quality** — State management consistency, error boundaries, loading/error states, accessibility (jsx-a11y compliance), UX failure modes (offline, DB error, session expiry).
5. **Data layer** — Schema quality, migration safety (see §10), referential integrity, transaction boundaries, PII handling (see §7).
6. **Security** — Full threat model audit (see §6). Authn/authz, secrets, injection, path traversal, XSS via Electron, CSRF (N/A for desktop but check), deserialization, file upload/import, dependency supply chain.
7. **Performance** — Hot paths (report generation, bulk operations, dashboard queries), N+1 patterns, missing indices, unbounded queries, memory/CPU risks (PDF generation, Excel export for large datasets).
8. **Reliability** — Timeout handling, retry logic, single-instance lock, startup/shutdown lifecycle, crash recovery, WAL checkpoint behavior, uncaughtException handling.
9. **Testing strategy** — Full analysis per §11.
10. **CI/CD & release controls** — Pipeline gaps, missing gates, branch protection, artifact signing, rollback capability.
11. **Observability** — Logging quality (`electron-log`), error tracking, audit trail completeness, ability to diagnose production issues from logs alone.
12. **Documentation/process** — Runbook accuracy, architecture doc drift, onboarding completeness, ADR existence.
13. **Compliance/legal** — Kenya Data Protection Act 2019 signals, license compliance (MIT declared — check all deps), PII handling adequacy.

---

## 14. Coding Principles Audit

For each principle, provide `file:line` evidence:

### SOLID

- **S (SRP)**: Flag services/components with >1 responsibility.
- **O (OCP)**: Flag switch statements that must be edited to add new entity types.
- **L (LSP)**: Flag type hierarchies with substitution violations.
- **I (ISP)**: Flag large interfaces (e.g., the flat preload API surface) forcing consumers to depend on unused methods.
- **D (DIP)**: Flag concrete dependencies where abstractions should exist (e.g., services directly importing `getDatabase()`).

### DRY

- Flag duplicated business logic, queries, validation rules, or type definitions across files.

### KISS / YAGNI

- Flag unnecessary abstraction, speculative generality, dead code paths, unused exports.

### Code smells

- God classes/files (>500 lines of logic)
- Long methods (>80 lines)
- Primitive obsession (string-typed enums, magic numbers)
- Feature envy (function heavily accessing another module's data)
- Shotgun surgery (one change requires edits in 5+ files)

### Maintainability metrics

- Cyclomatic complexity hotspots (ESLint threshold is 12 base, 20 for pages/services)
- Cognitive complexity hotspots (SonarJS threshold is 18)
- Naming clarity issues
- Boundary leakage and hidden coupling

**Output format for each violation:**

| Principle | Evidence (file:line) | Risk | Refactor recommendation | Regression tests needed |
|---|---|---|---|---|

---

## 15. Execution Protocol

Follow this order:

### Phase 1: Inventory (do NOT skip)

- Map all entry points, services, IPC channels, database tables, migration versions.
- Record: build command, test command, lint command, type-check command.
- Record: environment assumptions (env vars, file paths, OS-specific behavior).

### Phase 2: Verification

Run (or provide exact commands for) these checks and record **real outcomes**:

```bash
## Type checking
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.node.json

## Linting
npm run lint:eslint:strict

## Architecture rules
npm run lint:architecture

## Unit/integration tests
npx vitest run --reporter=verbose

## Coverage
npx vitest run --coverage

## Dependency audit
npm audit --audit-level=moderate

## Search for type escapes
grep -rn "@ts-ignore\|@ts-expect-error\|as any\|as unknown as" src/ electron/ --include="*.ts" --include="*.tsx"

## Search for hardcoded secrets
grep -rn "password\|secret\|api_key\|token" src/ electron/ --include="*.ts" --include="*.tsx" -l
```

### Phase 3: Deep Review

Start with these **critical paths** (in order), then cover the full codebase:

1. **Authentication**: `auth-handlers.ts` → `session.ts` → `roleFilter.ts` → `Login.tsx`
2. **Payments/Finance**: `finance-handlers.ts` → `PaymentService*.ts` → fee structure → GL accounting
3. **PII handling**: Student/staff CRUD → data export → backup → import
4. **Admin actions**: User creation, role assignment, settings changes, period locking
5. **External integrations**: nodemailer, electron-updater, CSV/Excel import
6. **Data writes**: Any `INSERT`/`UPDATE`/`DELETE` path — transaction boundaries, validation

### Phase 4: Risk Scoring

For each finding, assign:

| Attribute | Scale |
|---|---|
| **Severity** | Critical / High / Medium / Low (see §16) |
| **Likelihood** | 0.0–1.0 (probability of occurrence in 12 months) |
| **Confidence** | 0.0–1.0 (auditor's confidence in the finding) |

### Phase 5: Remediation Roadmap

Produce actionable plan per §18.

---

## 16. Severity Model

| Severity | Definition | Examples in this codebase |
|---|---|---|
| **Critical** | Probable immediate data breach, data loss, RCE, or complete system compromise | Unvalidated IPC input leading to SQL injection; DB encryption key exposed; unsigned auto-update accepting arbitrary code |
| **High** | Serious security or data integrity risk with plausible trigger | Missing RBAC on financial IPC channels; backup files stored unencrypted; session token not expiring |
| **Medium** | Meaningful risk with lower blast radius or harder trigger | Missing input validation on non-financial IPC; no audit log for grade changes; React error boundary gaps |
| **Low** | Minor risk, weak guardrail, or code quality issue | `any` type in non-critical path; missing accessibility attribute; documentation drift |

---

## 17. Required Output Format

**CAP: Maximum 60 findings.** If more exist, merge lower-severity findings into summary groups.

### Executive Summary

```
## Executive Summary
- Overall risk score: [0–100] (0 = no risk, 100 = critical)
- Release readiness: NO-GO | GO WITH CONDITIONS | GO
  - Justification: [specific evidence references]
- Type safety score: [0–10] (10 = fully sound)
- Top risk themes (max 5 bullets)
```

### Findings Table

```
## Findings Table
| ID | Severity | Confidence | Category | Evidence (file:line or command) | Impact | Fix Summary | Owner Role | ETA |
```

- **Owner Role**: Which role should fix this (e.g., `backend-dev`, `frontend-dev`, `devops`, `security`, `tech-lead`)
- **ETA**: Estimated time: `1h`, `4h`, `1d`, `3d`, `1w`, `2w`

### Detailed Findings

**Cap at 40 detailed write-ups.** Remaining findings go in the Findings Table only.

For each detailed finding:

```
## [ID] Title
- **Severity**: Critical | High | Medium | Low
- **Likelihood**: 0.0–1.0
- **Confidence**: 0.0–1.0
- **Category**: [from audit dimensions]
- **Principle impact**: [SOLID letter / DRY / KISS / YAGNI / N/A]
- **Evidence**: [exact file:line or command output]
- **Why this is a problem**: [1-3 sentences]
- **Realistic failure/exploit scenario**: [concrete scenario in school context]
- **Recommended fix**: [precise, implementation-ready]
- **PR-ready patch sketch**:
  ```typescript
  // file: path/to/file.ts
  // Before:
  [current code]
  // After:
  [fixed code]
  ```

- **Validation tests to add**: [specific test descriptions]
- **Owner role**: [who fixes this]
- **Estimated effort**: S (< 2h) / M (2h–1d) / L (1d–1w)

```

## Type Safety Report

```

## Compiler Strictness

| Flag | Status | Risk | Recommendation |

## `any` Census

| File:Line | Pattern | Eliminable? | Recommended replacement |

## Type-Escape Patterns

| File:Line | Pattern | Justified? | Fix |

## Unvalidated Boundaries

| Boundary | File:Line | Expected shape | Current validation | Risk | Fix |

## Contract Drift

| IPC Channel | Preload type | Main handler type | Mismatch description |

```

## Coding Principles Scorecard

```

- SOLID: S [pass/fail] | O [pass/fail] | L [pass/fail] | I [pass/fail] | D [pass/fail]
  - Evidence for each failure
- DRY: [key violations with file:line]
- KISS/YAGNI: [key violations with file:line]
- Maintainability hotspots: [ranked by risk]

```

## Coverage Map

```

## Fully Audited

- [list with confidence level]

## Partially Audited

- [list with what was covered and what was not]

## Not Auditable

- [list with reason — e.g., "no test environment", "encrypted config", "OS-specific behavior"]

```

## 30-60-90 Day Remediation Plan

## 0–7 Days: Containment

- [Immediate actions — each with finding ID reference, owner, and concrete deliverable]

## 8–30 Days: High-Impact Fixes

- [Prioritized by risk score — each with finding ID, owner, ETA]

## 31–90 Days: Hardening & Process

- [Systemic improvements — each with finding ID(s), owner, success criteria]

```

## Commands Run / Evidence Log

| # | Command | Exit code | Key output (truncated) | Used for finding(s) |

```

---

## 18. Final Constraints

1. If no Critical/High findings exist, **explicitly justify** with strong evidence — do not assume safety.
2. All recommendations must be **repository-specific and implementation-ready** — no generic "consider using X" without showing exactly where and how.
3. Every PR-ready patch sketch must be syntactically valid TypeScript that fits the existing code style (no semicolons in electron/, consistent with ESLint config).
4. Cross-reference the `REMEDIATION_CHECKLIST.md`, `AUDIT_REPORT.md`, `CODING_STANDARDS.md`, and `OPERATIONS_RUNBOOK.md` in the repo root — flag any drift between these documents and actual implementation.
5. End your audit with exactly: **`AUDIT_COMPLETE`**
