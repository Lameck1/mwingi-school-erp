# Incremental Migrations

Post-deployment schema & data changes go here.

## How to add a migration

1. Create a new file: `1001_short_description.ts`
2. Export an `up` function:

```typescript
import type * as Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE students ADD COLUMN receipt_number TEXT`)
}
```

3. Register it in `../index.ts`:

```typescript
import { up as addReceiptUp } from './incremental/1001_short_description.js'

// Add to the migrations array:
{ name: '1001_short_description', fn: addReceiptUp },
```

## Conventions

- **Numbering**: Use 1001+ for incremental migrations (0001–0999 = initial schema)
- **Idempotence**: Prefer `IF NOT EXISTS` / `IF EXISTS` where SQL supports it
- **Atomicity**: Each migration runs inside a SAVEPOINT — if it throws, only that
  migration is rolled back
- **No destructive changes**: Never drop columns or tables that may contain user data.
  Add a new column and migrate data instead.
