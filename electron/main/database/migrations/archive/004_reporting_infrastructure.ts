export function getReportingSchema(): string {
    return `
    -- Scheduled Reports
    CREATE TABLE IF NOT EXISTS scheduled_report (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_name TEXT NOT NULL,
        report_type TEXT NOT NULL,
        parameters TEXT, -- JSON configuration
        schedule_type TEXT NOT NULL CHECK(schedule_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'TERM_END', 'YEAR_END')),
        day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
        day_of_month INTEGER, -- 1-31
        time_of_day TEXT NOT NULL, -- HH:mm
        recipients TEXT NOT NULL, -- JSON array of emails
        export_format TEXT DEFAULT 'PDF' CHECK(export_format IN ('PDF', 'EXCEL', 'CSV')),
        is_active BOOLEAN DEFAULT 1,
        last_run_at DATETIME,
        next_run_at DATETIME,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    -- Report Execution Log
    CREATE TABLE IF NOT EXISTS report_execution_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scheduled_report_id INTEGER NOT NULL,
        execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED')),
        recipients_notified INTEGER DEFAULT 0,
        error_message TEXT,
        file_path TEXT,
        FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_report(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_report_active ON scheduled_report(is_active);
    CREATE INDEX IF NOT EXISTS idx_report_log_report ON report_execution_log(scheduled_report_id);
    `;
}
