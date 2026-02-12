import { BaseService } from '../base/BaseService'

export interface Student {
    id: number
    full_name: string
    admission_number: string
    // ... other fields
}

export interface CreateStudentDTO {
    full_name: string
    admission_number: string
}

export class StudentService extends BaseService<Student, CreateStudentDTO> {
    protected getTableName(): string { return 'student' }
    protected getPrimaryKey(): string { return 'id' }

    protected buildSelectQuery(): string {
        return 'SELECT * FROM student'
    }

    protected mapRowToEntity(row: unknown): Student {
        const r = row as Student
        return {
            id: r.id,
            full_name: r.full_name,
            admission_number: r.admission_number,
        }
    }

    protected validateCreate(data: CreateStudentDTO): string[] | null {
        const errors: string[] = []
        if (!data.full_name) {errors.push('Full name is required')}
        if (!data.admission_number) {errors.push('Admission number is required')}
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(_id: number, _data: Partial<CreateStudentDTO>): Promise<string[] | null> {
        return null
    }

    protected executeCreate(data: CreateStudentDTO): { lastInsertRowid: number | bigint } {
        return this.db.prepare(
            'INSERT INTO student (full_name, admission_number) VALUES (?, ?)'
        ).run(data.full_name, data.admission_number)
    }

    private static readonly ALLOWED_COLUMNS = new Set([
        'full_name', 'admission_number', 'first_name', 'last_name', 'middle_name',
        'date_of_birth', 'gender', 'student_type', 'admission_date', 'stream_id',
        'guardian_name', 'guardian_phone', 'guardian_email', 'guardian_relationship',
        'address', 'is_active', 'status', 'medical_info', 'notes', 'updated_at',
    ])

    protected executeUpdate(id: number, data: Partial<CreateStudentDTO>): void {
        const sets: string[] = []
        const params: unknown[] = []

        Object.entries(data).forEach(([key, value]) => {
            if (!StudentService.ALLOWED_COLUMNS.has(key)) {
                throw new Error(`Invalid column name: ${key}`)
            }
            sets.push(`${key} = ?`)
            params.push(value)
        })

        if (sets.length === 0) { return }
        params.push(id)
        this.db.prepare(`UPDATE student SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
}

