import { useState, useCallback } from 'react'

export interface PayslipData {
    payslip_id: string
    generated_at: string
    school_name: string
    period_name: string

    employee: {
        staff_number: string
        name: string
        id_number: string
        kra_pin: string
        department: string
        job_title: string
    }

    earnings: {
        basic_salary: number
        allowances: Array<{ name: string; amount: number }>
        gross_pay: number
    }

    deductions: {
        items: Array<{ name: string; amount: number }>
        total_deductions: number
    }

    net_pay: number
}

export function usePayrollExports() {
    const [isExportingP10, setIsExportingP10] = useState(false)
    const [isGeneratingPayslips, setIsGeneratingPayslips] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const UNKNOWN_ERROR = 'An unknown error occurred'

    const exportP10Csv = useCallback(async (periodId: number): Promise<string | null> => {
        try {
            setIsExportingP10(true)
            setError(null)
            const res = await window.electronAPI.generateP10Csv(periodId)
            if (res.success && res.data) {
                return res.data
            } else {
                setError(res.error || 'Failed to generate P10 CSV')
                return null
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : UNKNOWN_ERROR)
            return null
        } finally {
            setIsExportingP10(false)
        }
    }, [])

    const getPayrollIds = useCallback(async (periodId: number): Promise<number[] | null> => {
        try {
            const res = await window.electronAPI.getPayrollIdsForPeriod(periodId)
            if (res.success && res.data) {
                return res.data
            } else {
                setError(res.error || 'Failed to retrieve payroll IDs')
                return null
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : UNKNOWN_ERROR)
            return null
        }
    }, [])

    const generatePayslip = useCallback(async (payrollId: number): Promise<PayslipData | null> => {
        try {
            const res = await window.electronAPI.generatePayslip(payrollId)
            if (res.success && res.data) {
                return res.data as PayslipData
            } else {
                setError(res.error || `Failed to generate payslip for payroll ${payrollId}`)
                return null
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : UNKNOWN_ERROR)
            return null
        }
    }, [])

    return {
        isExportingP10,
        isGeneratingPayslips,
        setIsGeneratingPayslips,
        error,
        exportP10Csv,
        getPayrollIds,
        generatePayslip
    }
}
