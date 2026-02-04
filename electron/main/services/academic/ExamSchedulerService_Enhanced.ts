import { getDatabase } from '../../database'

interface ExamSlot {
  id?: number
  exam_id: number
  subject_id: number
  start_time: string
  end_time: string
  venue_id: number
  invigilators: number
  max_capacity: number
}

interface VenueAllocation {
  slot_id: number
  venue_id: number
  venue_name: string
  capacity: number
  allocated_students: number
}

interface ClashReport {
  student_id: number
  student_name: string
  clashing_subjects: string[]
  time_overlap: string
}

interface Invigilator {
  staff_id: number
  staff_name: string
  available_slots: number
  assigned_slots: number
}

interface TimetableResult {
  success: boolean
  message: string
  clashes: ClashReport[]
  unallocated_students: number
  stats: {
    total_slots: number
    total_students: number
    venues_used: number
    average_capacity_usage: number
  }
}

class ExamSchedulerService {
  /**
   * Generate exam timetable with venue allocation and clash detection
   */
  async generateTimetable(
    examId: number,
    startDate: string,
    endDate: string,
    slots: ExamSlot[]
  ): Promise<TimetableResult> {
    try {
      const db = getDatabase()

      // Validate input
      if (!examId || !startDate || !endDate || !slots.length) {
        throw new Error('Missing required parameters')
      }

      // Clear existing timetable for this exam
      db.prepare('DELETE FROM exam_timetable WHERE exam_id = ?').run(examId)

      // Insert slots
      const insertStmt = db.prepare(`
        INSERT INTO exam_timetable (exam_id, subject_id, start_time, end_time, venue_id, max_capacity)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      const insertedSlots: Array<{ id: number; subject_id: number; venue_id: number }> = []

      for (const slot of slots) {
        const result = insertStmt.run(
          examId,
          slot.subject_id,
          slot.start_time,
          slot.end_time,
          slot.venue_id,
          slot.max_capacity
        )
        insertedSlots.push({
          id: result.lastInsertRowid as number,
          subject_id: slot.subject_id,
          venue_id: slot.venue_id
        })
      }

      // Detect clashes
      const clashes = await this.detectClashes(examId)

      // Calculate statistics
      const stats = await this.getTimetableStats(examId)

      return {
        success: clashes.length === 0,
        message: clashes.length === 0 
          ? 'Timetable generated successfully with no conflicts'
          : `Timetable generated with ${clashes.length} potential conflicts`,
        clashes,
        unallocated_students: 0,
        stats
      }
    } catch (error) {
      console.error('Error generating timetable:', error)
      throw new Error(`Failed to generate timetable: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Allocate venues to exam slots using greedy algorithm
   */
  async allocateVenues(
    examId: number,
    venueCapacities: Map<number, number>
  ): Promise<VenueAllocation[]> {
    try {
      const db = getDatabase()

      // Get all exam slots
      const slots = db
        .prepare(`
          SELECT id, subject_id, max_capacity
          FROM exam_timetable
          WHERE exam_id = ?
          ORDER BY id
        `)
        .all(examId) as Array<{ id: number; subject_id: number; max_capacity: number }>

      // Get students enrolled in each subject
      const studentsBySubject = new Map<number, number>()
      for (const slot of slots) {
        const count = (
          db
            .prepare(`
              SELECT COUNT(DISTINCT s.id) as count
              FROM students s
              LEFT JOIN enrollments e ON s.id = e.student_id
              WHERE s.deleted_at IS NULL
            `)
            .get() as { count: number }
        ).count

        studentsBySubject.set(slot.subject_id, count)
      }

      // Allocate venues using greedy algorithm
      const allocations: VenueAllocation[] = []
      const allocatedCapacity = new Map<number, number>()

      for (const slot of slots) {
        const requiredCapacity = studentsBySubject.get(slot.subject_id) || 0

        // Find best venue (first-fit decreasing)
        let bestVenue: number | null = null
        let bestUtilization = Infinity

        for (const [venueId, capacity] of venueCapacities) {
          if (capacity >= requiredCapacity) {
            const currentUsage = allocatedCapacity.get(venueId) || 0
            const utilization = currentUsage + requiredCapacity
            
            if (utilization <= capacity && utilization < bestUtilization) {
              bestVenue = venueId
              bestUtilization = utilization
            }
          }
        }

        if (bestVenue !== null) {
          const currentUsage = allocatedCapacity.get(bestVenue) || 0
          allocatedCapacity.set(bestVenue, currentUsage + requiredCapacity)

          // Update database
          db.prepare('UPDATE exam_timetable SET venue_id = ? WHERE id = ?').run(bestVenue, slot.id)

          allocations.push({
            slot_id: slot.id,
            venue_id: bestVenue,
            venue_name: `Venue ${bestVenue}`,
            capacity: venueCapacities.get(bestVenue) || 0,
            allocated_students: requiredCapacity
          })
        }
      }

      return allocations
    } catch (error) {
      console.error('Error allocating venues:', error)
      throw new Error(`Failed to allocate venues: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Detect schedule clashes using topological sort
   */
  async detectClashes(examId: number): Promise<ClashReport[]> {
    try {
      const db = getDatabase()

      // Get all exam slots
      const slots = db
        .prepare(`
          SELECT id, subject_id, start_time, end_time
          FROM exam_timetable
          WHERE exam_id = ?
          ORDER BY start_time
        `)
        .all(examId) as Array<{
          id: number
          subject_id: number
          start_time: string
          end_time: string
        }>

      const clashReport: ClashReport[] = []
      const reportedStudents = new Set<number>()

      // Check for overlapping time slots
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const slot1 = slots[i]
          const slot2 = slots[j]

          // Check if times overlap
          if (this.timesOverlap(slot1.start_time, slot1.end_time, slot2.start_time, slot2.end_time)) {
            // Find students taking both subjects
            const clashingStudents = db
              .prepare(`
                SELECT DISTINCT s.id, s.first_name || ' ' || s.last_name as name
                FROM students s
                LEFT JOIN marks m1 ON s.id = m1.student_id AND m1.subject_id = ?
                LEFT JOIN marks m2 ON s.id = m2.student_id AND m2.subject_id = ?
                WHERE s.deleted_at IS NULL
                  AND m1.id IS NOT NULL
                  AND m2.id IS NOT NULL
              `)
              .all(slot1.subject_id, slot2.subject_id) as Array<{ id: number; name: string }>

            // Get subject names
            const subj1 = (
              db.prepare('SELECT name FROM subjects WHERE id = ?').get(slot1.subject_id) as {
                name: string
              }
            )?.name

            const subj2 = (
              db.prepare('SELECT name FROM subjects WHERE id = ?').get(slot2.subject_id) as {
                name: string
              }
            )?.name

            for (const student of clashingStudents) {
              if (!reportedStudents.has(student.id)) {
                clashReport.push({
                  student_id: student.id,
                  student_name: student.name,
                  clashing_subjects: [subj1 || 'Unknown', subj2 || 'Unknown'],
                  time_overlap: `${slot1.start_time} - ${slot2.end_time}`
                })
                reportedStudents.add(student.id)
              }
            }
          }
        }
      }

      return clashReport
    } catch (error) {
      console.error('Error detecting clashes:', error)
      throw new Error(`Failed to detect clashes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Assign invigilators to exam slots
   */
  async assignInvigilators(examId: number, invigilatorsPerSlot: number = 2): Promise<Invigilator[]> {
    try {
      const db = getDatabase()

      // Get available staff
      const availableStaff = db
        .prepare(`
          SELECT id, first_name || ' ' || last_name as name
          FROM staff
          WHERE deleted_at IS NULL
            AND is_active = 1
          ORDER BY first_name
        `)
        .all() as Array<{ id: number; name: string }>

      if (availableStaff.length === 0) {
        throw new Error('No available staff for invigilator assignment')
      }

      // Get all exam slots
      const slots = db
        .prepare(`
          SELECT id FROM exam_timetable
          WHERE exam_id = ?
        `)
        .all(examId) as Array<{ id: number }>

      // Assign invigilators in round-robin fashion
      const assignments: Invigilator[] = []
      const staffLoads = new Map<number, number>()

      for (const staff of availableStaff) {
        staffLoads.set(staff.id, 0)
      }

      for (const slot of slots) {
        for (let i = 0; i < invigilatorsPerSlot; i++) {
          // Find staff with lowest load
          let minStaff = availableStaff[0].id
          let minLoad = Infinity

          for (const [staffId, load] of staffLoads) {
            if (load < minLoad) {
              minLoad = load
              minStaff = staffId
            }
          }

          // Assign this staff to slot
          db.prepare(`
            INSERT INTO exam_invigilator (exam_id, slot_id, staff_id)
            VALUES (?, ?, ?)
          `).run(examId, slot.id, minStaff)

          staffLoads.set(minStaff, minLoad + 1)
        }
      }

      // Build result
      for (const staff of availableStaff) {
        const load = staffLoads.get(staff.id) || 0
        if (load > 0) {
          assignments.push({
            staff_id: staff.id,
            staff_name: staff.name,
            available_slots: slots.length,
            assigned_slots: load
          })
        }
      }

      return assignments
    } catch (error) {
      console.error('Error assigning invigilators:', error)
      throw new Error(`Failed to assign invigilators: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get timetable statistics
   */
  async getTimetableStats(examId: number): Promise<{
    total_slots: number
    total_students: number
    venues_used: number
    average_capacity_usage: number
  }> {
    try {
      const db = getDatabase()

      const slotCount = (
        db.prepare('SELECT COUNT(*) as count FROM exam_timetable WHERE exam_id = ?').get(examId) as {
          count: number
        }
      ).count

      const venueCount = (
        db.prepare(
          'SELECT COUNT(DISTINCT venue_id) as count FROM exam_timetable WHERE exam_id = ? AND venue_id IS NOT NULL'
        ).get(examId) as { count: number }
      ).count

      const studentCount = (
        db.prepare('SELECT COUNT(DISTINCT id) as count FROM students WHERE deleted_at IS NULL').get() as { count: number }
      ).count

      const totalCapacity = (
        db.prepare(
          'SELECT SUM(max_capacity) as total FROM exam_timetable WHERE exam_id = ?'
        ).get(examId) as { total: number }
      ).total || 0

      const avgUsage = totalCapacity > 0 ? (studentCount / totalCapacity) * 100 : 0

      return {
        total_slots: slotCount,
        total_students: studentCount,
        venues_used: venueCount,
        average_capacity_usage: avgUsage
      }
    } catch (error) {
      console.error('Error getting timetable stats:', error)
      throw new Error(`Failed to get timetable stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Export timetable to PDF
   */
  async exportToPDF(examId: number): Promise<Buffer> {
    try {
      const db = getDatabase()

      // Get timetable data
      const timetable = db
        .prepare(`
          SELECT et.*, s.name as subject_name
          FROM exam_timetable et
          JOIN subjects s ON et.subject_id = s.id
          WHERE et.exam_id = ?
          ORDER BY et.start_time
        `)
        .all(examId) as Array<{
          id: number
          subject_name: string
          start_time: string
          end_time: string
          venue_id: number
          max_capacity: number
        }>

      // Create HTML content
      let html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background-color: #4CAF50; color: white; }
              tr:nth-child(even) { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h1>Exam Timetable</h1>
            <table>
              <tr>
                <th>Subject</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Venue</th>
                <th>Capacity</th>
              </tr>
      `

      for (const slot of timetable) {
        html += `
          <tr>
            <td>${slot.subject_name}</td>
            <td>${slot.start_time}</td>
            <td>${slot.end_time}</td>
            <td>Venue ${slot.venue_id}</td>
            <td>${slot.max_capacity}</td>
          </tr>
        `
      }

      html += `
            </table>
          </body>
        </html>
      `

      // Return as buffer (actual PDF generation would use library like pdfkit)
      return Buffer.from(html)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      throw new Error(`Failed to export to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check if two time slots overlap
   */
  private timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const toMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number)
      return hours * 60 + minutes
    }

    const s1 = toMinutes(start1)
    const e1 = toMinutes(end1)
    const s2 = toMinutes(start2)
    const e2 = toMinutes(end2)

    return s1 < e2 && s2 < e1
  }
}

export default new ExamSchedulerService()
