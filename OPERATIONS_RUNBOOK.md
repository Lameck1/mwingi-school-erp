# Mwingi School ERP — Operations Runbook

## 1. Application Overview

- **Stack**: Electron (main) + React/Vite (renderer) + SQLite (better-sqlite3)
- **Encryption**: `better-sqlite3-multiple-ciphers` with AES-256; key derived from Electron `safeStorage`
- **Auth**: Session stored in OS credential store via `keytar`; RBAC enforced on every IPC handler

---

## 2. First-Time Setup

1. Install Node.js 20 LTS
2. `npm ci` to install dependencies
3. `npm run dev` starts Vite dev server + Electron main process
4. On first launch the app creates `userData/data/school_erp_clean_v3.db` and runs all migrations

---

## 3. Database

### Location

- Dev: `<projectRoot>/userData/data/school_erp_clean_v3.db`
- Production: `<userData>/data/school_erp_clean_v3.db` (platform-specific app data directory)

### Migrations

- Registered in `electron/main/database/migrations/index.ts`
- Run automatically on app start via `runMigrations(db)`
- Each migration runs inside a SAVEPOINT; FK constraints are disabled per-migration and re-enabled immediately after

### Backups

- Managed by `BackupService`
- Stored in `userData/backups/`
- Supports atomic file replacement, retention limits, integrity verification (SHA-256)
- Path traversal validation rejects `..` segments and restricts to allowed user directories

---

## 4. Security

### Role-Based Access Control (RBAC)

Every IPC handler is registered via `safeHandleRawWithRole(channel, minimumRole, handler)`.

| Role | Level | Access |
|------|-------|--------|
| ADMIN | 0 | Full system access, backups, reset, secure config |
| MANAGEMENT | 1 | Settings update, message templates, audit logs |
| FINANCE | 2 | Payments, invoices, budgets, GL accounts, assets |
| STAFF | 3 | Read-only on students, staff, settings; log errors |
| TEACHER | 3 | Same as STAFF (included in STAFF tier) |

### Sensitive Data

- **SMS API keys**: Stored encrypted in `system_config` table via `ConfigService` (migrated from plaintext `school_settings` in migration 1016)
- **Database encryption key**: Managed by Electron `safeStorage`; hard failure in production if unavailable
- **Settings API**: `sms_api_key` and `sms_api_secret` are masked (`********`) for non-ADMIN roles

### Content Security Policy

- Defined in `index.html` `<meta>` tag
- `default-src 'self'`; `script-src 'self'`
- `connect-src` allows `self` plus known SMS/email API endpoints
- `style-src` allows `'self'`, `'unsafe-inline'`, and Google Fonts

---

## 5. Data Retention

Configured in `data_retention_config` table (migration 1017):

| Table | Retention | Notes |
|-------|-----------|-------|
| `message_log` | 365 days | SMS/email communication logs |
| `audit_log` | 1095 days (3 years) | Compliance requirement |
| `backup_log` | 730 days (2 years) | Backup metadata |

Purge can be triggered via a scheduled maintenance task or manual ADMIN action.

---

## 6. CI/CD Pipeline

### GitHub Actions (`.github/workflows/build.yml`)

1. **Lint** — `npm run lint:eslint:strict`
2. **Test** — `npx vitest run`
3. **Audit** — `npm audit --audit-level=high`
4. **Build** — `npm run electron:build`
5. **Upload artifacts** — `.exe`, `.dmg`, `.AppImage`
6. **Release** — auto-creates GitHub Release on tag push

### Code Signing (Windows)

- `forceCodeSigning: true` in `package.json` → build fails without valid cert
- Requires `CSC_LINK` (base64 .pfx) and `CSC_KEY_PASSWORD` GitHub Secrets
- **Action required**: Procure a code signing certificate and add secrets to the repo

---

## 7. Common Operations

### Reset Database (Dev Only)

- Via `system:resetAndSeed` IPC handler (ADMIN only)
- Blocked in production (`app.isPackaged` guard)

### Backup & Restore

- `backup:create` — creates timestamped backup with SHA-256 integrity hash
- `backup:restore` — restores from backup with safety backup of current DB
- `backup:getList` — lists available backups with integrity status

### Normalize Currency Scale

- `system:normalizeCurrencyScale` — one-time migration to standardize amounts

### Update SMS Credentials

- Via Settings UI → saved to encrypted `system_config` via `ConfigService`
- Old plaintext columns in `school_settings` are NULLed by migration 1016

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Encryption module failed to load" on startup | Missing `better-sqlite3-multiple-ciphers` native binding | Rebuild: `npm run postinstall` or `npx electron-rebuild` |
| "SafeStorage is not available" | OS keychain unavailable (e.g., headless Linux) | Ensure a display server is running; check `DISPLAY` env var |
| Build fails with "Code signing failed" | Missing `CSC_LINK`/`CSC_KEY_PASSWORD` secrets | Add code signing certificate to GitHub Secrets |
| "Unauthorized" on IPC call | User role insufficient for the handler | Check role hierarchy; promote user if appropriate |
| Migration failure | Schema conflict or data integrity issue | Check `migrations` table; review error log; fix and re-run |

---

## 9. ESLint Complexity Thresholds

Configured in `eslint.config.js`:

| Rule | Threshold | Level |
|------|-----------|-------|
| `max-lines` | 600 | warn |
| `max-lines-per-function` | 200 | warn |
| `max-statements` | 40 | warn |
| `complexity` | 20 | warn |
| `max-params` | 8 | warn |

---

## 10. Test Coverage

- Framework: **Vitest**
- Config: `vitest.config.ts`
- Coverage includes: `electron/main/**/*.ts`, `electron/main/ipc/**/*.ts`
- Role guard tests: `electron/main/__tests__/role-guards.test.ts` (42 tests)
- Run: `npx vitest run` or `npm test`
