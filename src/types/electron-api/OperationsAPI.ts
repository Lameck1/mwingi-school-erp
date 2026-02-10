export interface BoardingFacility {
  id: number;
  name: string;
  capacity: number;
  current_occupancy: number;
  is_active: boolean;
  occupancy_rate?: number; // Computed on frontend usually
}

export interface CBCStrand {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface TransportRoute {
  id: number;
  route_name: string;
  distance_km: number;
  estimated_students: number;
  budget_per_term_cents: number;
  is_active: boolean;
}

export interface Grant {
  id: number;
  grant_name: string;
  grant_type: string;
  nemis_reference_number?: string;
  amount_allocated: number;
  amount_received: number;
  utilization_percentage?: number;
  status?: 'ACTIVE' | 'EXPIRED' | 'FULLY_UTILIZED';
  created_at?: string;
}

export interface ExpenseRecord {
  id?: number;
  facility_id?: number;
  route_id?: number;
  expense_type: string;
  amount_cents: number;
  description: string;
  gl_account_code?: string;
  fiscal_year: number;
  term: number;
  recorded_by: number;
}

export interface ExpenseSummary {
  category: string;
  total_amount: number;
  percentage?: number;
}

export interface GrantSummary {
  grant: Grant;
  utilization_records: Array<{
    id: number;
    amount: number;
    description: string;
    utilization_date: string;
    gl_account_code: string;
  }>;
  total_utilized: number;
  remaining_amount: number;
}

export interface StudentCostResult {
  total_cost: number;
  breakdown: Record<string, number>;
}

export interface StudentCostBreakdownItem {
  category: string;
  amount: number;
  details?: string;
}

export interface StudentCostTrendItem {
  period_name: string;
  total_cost: number;
  academic_year: number;
  term: number;
}

export interface OperationsAPI {
  // CBC Strands
  getCBCStrands: () => Promise<{ success: boolean; data: CBCStrand[]; message?: string }>
  getActiveCBCStrands: () => Promise<{ success: boolean; data: CBCStrand[]; message?: string }>
  linkFeeCategoryToStrand: (feeCategoryId: number, strandId: number, allocationPercentage: number, userId: number) => Promise<{ success: boolean; data?: number; message?: string }>

  // Operations - Boarding
  getBoardingFacilities: () => Promise<BoardingFacility[]>
  getActiveBoardingFacilities: () => Promise<BoardingFacility[]>
  recordBoardingExpense: (params: ExpenseRecord) => Promise<number>
  getBoardingExpenses: (facilityId: number, fiscalYear: number, term?: number) => Promise<ExpenseRecord[]>
  getBoardingExpenseSummary: (facilityId: number, fiscalYear: number, term?: number) => Promise<ExpenseSummary[]>

  // Operations - Transport
  getTransportRoutes: () => Promise<TransportRoute[]>
  getActiveTransportRoutes: () => Promise<TransportRoute[]>
  createTransportRoute: (params: Omit<TransportRoute, 'id' | 'is_active'>) => Promise<number>
  recordTransportExpense: (params: ExpenseRecord) => Promise<number>
  getTransportExpenses: (routeId: number, fiscalYear: number, term?: number) => Promise<ExpenseRecord[]>
  getTransportExpenseSummary: (routeId: number, fiscalYear: number, term?: number) => Promise<ExpenseSummary[]>

  // Operations - Grants
  createGrant: (data: Omit<Grant, 'id'>, userId: number) => Promise<{ success: boolean, id?: number, message?: string }>
  recordGrantUtilization: (payload: {
    grantId: number
    amount: number
    description: string
    glAccountCode: string | null
    utilizationDate: string
    userId: number
  }) => Promise<{ success: boolean, message?: string }>
  getGrantSummary: (grantId: number) => Promise<{ success: boolean, data?: GrantSummary }>
  getGrantsByStatus: (status: 'ACTIVE' | 'EXPIRED' | 'FULLY_UTILIZED') => Promise<Grant[]>
  getExpiringGrants: (daysThreshold: number) => Promise<Grant[]>
  generateNEMISExport: (fiscalYear: number) => Promise<string>

  // Operations - Student Cost
  calculateStudentCost: (studentId: number, termId: number, academicYearId: number) => Promise<StudentCostResult>
  getStudentCostBreakdown: (studentId: number, termId: number) => Promise<StudentCostBreakdownItem[]>
  getStudentCostVsRevenue: (studentId: number, termId: number) => Promise<{ cost: number, revenue: number, subsidy: number }>
  getAverageStudentCost: (grade: number, termId: number) => Promise<number>
  getStudentCostTrend: (studentId: number, periods: number) => Promise<StudentCostTrendItem[]>
}
