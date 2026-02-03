/* eslint-disable no-console */
import * as Database from 'better-sqlite3'
import { getSchema } from './schema.js'
import { getSeedData } from './seed-data.js'
import { getDemoData } from './demo-data.js'
import { getEnhancedSchema } from './002_enhanced_schema.js'
import { getAcademicSchema, getAcademicSeedData } from './003_academic_reporting.js'
import { getReportingSchema } from './004_reporting_infrastructure.js'
import { getNotificationFixSchema } from './005_notification_fix.js'
import { getReportFixesSchema } from './006_report_fixes.js'
import { getAttendanceSchema } from './007_attendance_schema.js'
import { migrate_008_asset_hire_exemptions } from './008_asset_hire_exemptions.js'
import { fixCurrencyScale } from './009_fix_currency_scale.js'
import { up as chartOfAccountsUp } from './011_chart_of_accounts.js'
import { up as cbcFeaturesUp } from './012_cbc_features.js'

export function runMigrations(db: Database.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    const migrations = [
        { name: 'initial_schema', sql: getSchema() },
        { name: 'seed_data', sql: getSeedData() },
        { name: 'seed_demo_data_v2', sql: getDemoData() },
        { name: 'add_student_credit_balance', sql: 'ALTER TABLE student ADD COLUMN credit_balance DECIMAL(12, 2) DEFAULT 0;' },
        {
            name: 'add_staff_allowance_table', sql: `CREATE TABLE IF NOT EXISTS staff_allowance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            allowance_name TEXT NOT NULL,
            amount DECIMAL(12, 2) NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id)
        );` },
        {
            name: 'convert_to_cents_v1', sql: `
            UPDATE fee_structure SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE ledger_transaction SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE fee_invoice SET total_amount = CAST(total_amount * 100 AS INTEGER), amount_paid = CAST(COALESCE(amount_paid, 0) * 100 AS INTEGER);
            UPDATE invoice_item SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE receipt SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE student SET credit_balance = CAST(COALESCE(credit_balance, 0) * 100 AS INTEGER);
            UPDATE staff SET basic_salary = CAST(COALESCE(basic_salary, 0) * 100 AS INTEGER);
            UPDATE payroll SET 
                basic_salary = CAST(basic_salary * 100 AS INTEGER), 
                gross_salary = CAST(gross_salary * 100 AS INTEGER), 
                total_deductions = CAST(total_deductions * 100 AS INTEGER), 
                net_salary = CAST(net_salary * 100 AS INTEGER);
            UPDATE payroll_deduction SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE payroll_allowance SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE staff_allowance SET amount = CAST(amount * 100 AS INTEGER);
            UPDATE statutory_rates SET 
                min_amount = CAST(min_amount * 100 AS INTEGER), 
                max_amount = CAST(max_amount * 100 AS INTEGER), 
                fixed_amount = CAST(fixed_amount * 100 AS INTEGER);
        ` },
        { name: 'enhanced_schema', sql: getEnhancedSchema() },
        {
            name: 'add_system_config', sql: `CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            is_encrypted BOOLEAN DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`
        },
        { name: 'academic_reporting_schema', sql: getAcademicSchema() },
        { name: 'academic_reporting_seed', sql: getAcademicSeedData() },
        { name: 'reporting_infrastructure', sql: getReportingSchema() },
        { name: 'notification_category_fix', sql: getNotificationFixSchema() },
        { name: 'report_fixes_v1', sql: getReportFixesSchema() },
        { name: 'attendance_schema', sql: getAttendanceSchema() },
        { name: 'add_term_status_column', sql: "ALTER TABLE term ADD COLUMN status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED'));" },
        { name: 'asset_hire_exemptions', fn: migrate_008_asset_hire_exemptions },
        { name: 'fix_currency_scale_v1', fn: fixCurrencyScale },
        { name: 'chart_of_accounts_v1', fn: chartOfAccountsUp },
        { name: 'cbc_features_v1', fn: cbcFeaturesUp }
    ]

    const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[]
    const appliedNames = new Set(applied.map(m => m.name))

    for (const m of migrations) {
        if (!appliedNames.has(m.name)) {
            console.log(`Applying: ${m.name}`)
            // Support both SQL-based and function-based migrations
            if ('fn' in m && typeof m.fn === 'function') {
                m.fn(db)
            } else if ('sql' in m && m.sql) {
                db.exec(m.sql)
            }
            db.prepare('INSERT INTO migrations (name) VALUES (?)').run(m.name)
        }
    }
}

