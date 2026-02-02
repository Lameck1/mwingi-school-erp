export function getNotificationFixSchema(): string {
    return `
    -- Add category column to message_template
    ALTER TABLE message_template ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL';

    -- Update existing templates with reasonable defaults based on name
    UPDATE message_template SET category = 'FEE_REMINDER' WHERE template_name LIKE '%Fee%' OR template_name LIKE '%Payment%';
    UPDATE message_template SET category = 'ATTENDANCE' WHERE template_name LIKE '%Attendance%' OR template_name LIKE '%Absence%';
    UPDATE message_template SET category = 'PAYSLIP' WHERE template_name LIKE '%Payslip%' OR template_name LIKE '%Salary%';
    `;
}
