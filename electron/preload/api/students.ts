import { ipcRenderer } from 'electron'

export function createStudentAPI() {
  return {
    getStudents: (filters?: unknown) => ipcRenderer.invoke('student:getAll', filters),
    getStudentById: (id: number) => ipcRenderer.invoke('student:getById', id),
    createStudent: (data: unknown) => ipcRenderer.invoke('student:create', data),
    updateStudent: (id: number, data: unknown) => ipcRenderer.invoke('student:update', id, data),
    getStudentBalance: (studentId: number) => ipcRenderer.invoke('student:getBalance', studentId),
  }
}
