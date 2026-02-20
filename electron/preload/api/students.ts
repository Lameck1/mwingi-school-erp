import { ipcRenderer } from 'electron'

import type { StudentData, StudentFilters } from '../types'

export function createStudentAPI() {
  return {
    getStudents: (filters?: StudentFilters) => ipcRenderer.invoke('student:getAll', filters),
    getStudentById: (id: number) => ipcRenderer.invoke('student:getById', id),
    createStudent: (data: Partial<StudentData>, userId?: number) => ipcRenderer.invoke('student:create', data, userId),
    updateStudent: (id: number, data: Partial<StudentData>) => ipcRenderer.invoke('student:update', id, data),
    uploadStudentPhoto: (studentId: number, dataUrl: string) => ipcRenderer.invoke('student:uploadPhoto', studentId, dataUrl),
    removeStudentPhoto: (studentId: number) => ipcRenderer.invoke('student:removePhoto', studentId),
    getStudentPhotoDataUrl: (studentId: number) => ipcRenderer.invoke('student:getPhotoDataUrl', studentId),
    getStudentBalance: (studentId: number) => ipcRenderer.invoke('student:getBalance', studentId),
    purgeStudent: (id: number, reason?: string) => ipcRenderer.invoke('student:purge', id, reason),
  }
}
