export function getAttendanceSchema(): string {
    return `
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
        notes TEXT,
        marked_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (marked_by_user_id) REFERENCES user(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    `;
}
