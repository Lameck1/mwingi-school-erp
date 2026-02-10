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

    protected executeUpdate(id: number, data: Partial<CreateStudentDTO>): void {
        // Basic implementation
        const sets: string[] = []
        const params: unknown[] = []

        Object.entries(data).forEach(([key, value]) => {
            sets.push(`${key} = ?`)
            params.push(value)
        })

        params.push(id)
        this.db.prepare(`UPDATE student SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
}

