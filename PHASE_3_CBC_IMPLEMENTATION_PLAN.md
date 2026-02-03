# Phase 3 Implementation Plan: CBC/CBE Domain Model

## Overview

**Phase:** 3 (Domain Model Gaps - CBC/CBE Features)  
**Duration:** 3 weeks  
**Start Date:** February 3, 2026  
**Target Completion:** February 24, 2026  
**Current Audit Score:** 8.5/10  
**Target Audit Score:** 9.0/10  

---

## Objectives

Implement Kenyan education-specific features identified in the financial audit:
1. CBC activity fee categorization and tracking
2. Junior Secondary School (JSS) transition workflows
3. Boarding cost attribution and profitability
4. Transport cost attribution per route
5. Government grant tracking (NEMIS integration)
6. Per-student vs pooled cost tracking

---

## Priority 1: CBC Activity Fee System (Week 1)

### 1.1 Database Schema Updates
**File:** `electron/main/database/migrations/012_cbc_features.ts`

**Tables to Create:**
```sql
-- CBC strand for activity categorization
cbc_strand:
  - id (primary key)
  - code (PERF_ARTS, SPORTS, HOME_SCI, AGRICULTURE, ICT)
  - name (Performing Arts, Sports & PE, etc.)
  - is_active

-- Link fee categories to CBC strands
fee_category_strand:
  - fee_category_id (foreign key)
  - cbc_strand_id (foreign key)
  - allocation_percentage (if split across strands)

-- Equipment/Resource costs per strand
cbc_strand_expense:
  - id (primary key)
  - cbc_strand_id (foreign key)
  - gl_account_code (foreign key to gl_account)
  - fiscal_year
  - allocated_budget (cents)
  - spent_amount (cents)
  - description

-- Per-student activity participation
student_activity_participation:
  - id (primary key)
  - student_id (foreign key)
  - cbc_strand_id (foreign key)
  - academic_year
  - term
  - participation_level (PRIMARY, SECONDARY, INTEREST)
```

### 1.2 Service Implementation
**File:** `electron/main/services/academics/CBCStrandService.ts`

**Methods:**
- `createStrand()` - Add new CBC strand
- `linkFeeCategoryToStrand()` - Associate fees with strands
- `recordStrandExpense()` - Track costs per strand
- `getStrandProfitability()` - Revenue vs Expense per strand
- `getStrandUtilization()` - Student participation rates
- `recordStudentParticipation()` - Track individual participation

### 1.3 IPC Handlers
**File:** `electron/main/ipc/academics/cbc-handlers.ts`

**Endpoints:**
- `cbc:getStrands` - Get all CBC strands
- `cbc:linkFeeCategory` - Associate fee with strand
- `cbc:recordExpense` - Post strand-related expense
- `cbc:getProfitabilityReport` - Revenue/cost analysis
- `cbc:recordParticipation` - Track student participation

### 1.4 UI Components
**File:** `src/pages/Academics/CBC/StrandManagement.tsx`

**Features:**
- View all CBC strands
- Link fee categories to strands
- Track equipment budgets
- View profitability by strand
- Student participation tracking

---

## Priority 2: JSS Transition Workflows (Week 1)

### 2.1 Database Schema Updates
**File:** Same migration `012_cbc_features.ts`

**Tables:**
```sql
-- Grade transition records
grade_transition:
  - id (primary key)
  - student_id (foreign key)
  - from_grade (1-9)
  - to_grade (1-9)
  - transition_date
  - is_jss_entry (BOOLEAN - true if Grade 6→7)
  - fee_structure_changed (BOOLEAN)
  - boarding_status_before
  - boarding_status_after
  - balance_migrated_amount (cents)
  - created_by_user_id

-- JSS-specific fees
jss_fee_structure:
  - id (primary key)
  - grade (7, 8, or 9)
  - academic_year
  - tuition_fee (cents)
  - boarding_fee (cents)
  - activity_fee (cents)
  - ict_fee (cents)
  - is_active
```

### 2.2 Service Implementation
**File:** `electron/main/services/academics/JSSTransitionService.ts`

**Methods:**
- `initiateTransition()` - Start Grade 6→7 transition
- `applyJSSFeeStructure()` - Auto-update fees for Grade 7 students
- `migrateOutstandingBalance()` - Transfer primary balance to JSS
- `updateBoardingStatus()` - Handle boarding changes
- `getTransitionReport()` - List all transitions with status
- `validateTransition()` - Pre-checks before promotion

### 2.3 IPC Handlers
**File:** `electron/main/ipc/academics/jss-handlers.ts`

**Endpoints:**
- `jss:initiateTransition` - Promote student to JSS
- `jss:getFeeStructure` - Get JSS fee schedule
- `jss:setFeeStructure` - Update JSS fees
- `jss:getTransitionReport` - View transition history
- `jss:bulkTransition` - Promote multiple students

---

## Priority 3: Boarding Cost Attribution (Week 2)

### 3.1 Service Implementation
**File:** `electron/main/services/finance/BoardingCostService.ts`

**Features:**
- Track boarding-specific expenses (food, utilities, staff)
- Calculate per-student boarding cost
- Generate boarding profitability report
- Track occupancy rates
- Alert on low occupancy (<70%)

**Methods:**
- `recordBoardingExpense()` - Post food/utility costs
- `calculatePerStudentCost()` - Total cost / boarders
- `getBoardingProfitability()` - Revenue vs cost
- `getOccupancyRate()` - Beds filled / total beds
- `getBoardingUtilizationReport()` - Monthly trends

### 3.2 IPC Handlers
**File:** Extend `electron/main/ipc/finance/boarding-handlers.ts`

**Endpoints:**
- `boarding:recordExpense` - Post boarding cost
- `boarding:getProfitability` - Revenue vs expense
- `boarding:getOccupancy` - Current occupancy %
- `boarding:getCostPerStudent` - Average cost

### 3.3 UI Component
**File:** `src/pages/Finance/Reports/BoardingProfitability.tsx`

**Features:**
- Boarding revenue (fees collected)
- Boarding expenses (food, utilities, staff)
- Net profit/loss
- Occupancy rate chart
- Cost per student trend

---

## Priority 4: Transport Cost Attribution (Week 2)

### 4.1 Database Schema Updates
**File:** Same migration `012_cbc_features.ts`

**Tables:**
```sql
-- Transport routes
transport_route:
  - id (primary key)
  - route_name
  - start_location
  - end_location
  - distance_km
  - monthly_fuel_budget (cents)
  - monthly_maintenance_budget (cents)
  - driver_id (foreign key to staff)
  - vehicle_registration
  - capacity
  - is_active

-- Route expenses
transport_route_expense:
  - id (primary key)
  - route_id (foreign key)
  - expense_date
  - expense_type (FUEL, MAINTENANCE, INSURANCE, OTHER)
  - amount (cents)
  - description
  - gl_account_code

-- Student route assignment
student_route_assignment:
  - id (primary key)
  - student_id (foreign key)
  - route_id (foreign key)
  - start_date
  - end_date
  - is_active
```

### 4.2 Service Implementation
**File:** `electron/main/services/finance/TransportCostService.ts`

**Methods:**
- `createRoute()` - Add transport route
- `assignStudentToRoute()` - Link student to route
- `recordRouteExpense()` - Post fuel/maintenance cost
- `getRouteProfitability()` - Revenue vs cost per route
- `getRouteUtilization()` - Students using route / capacity
- `getCostPerStudentPerRoute()` - Expense / students

### 4.3 UI Component
**File:** `src/pages/Finance/Reports/TransportProfitability.tsx`

**Features:**
- Route-by-route profitability
- Utilization rates
- Cost per student per route
- Fuel consumption trends
- Maintenance cost tracking

---

## Priority 5: Government Grant Tracking (Week 3)

### 5.1 Database Schema Updates
**File:** Same migration `012_cbc_features.ts`

**Tables:**
```sql
-- Government grants
government_grant:
  - id (primary key)
  - grant_name
  - grant_type (CAPITATION, FREE_DAY_SECONDARY, SPECIAL_NEEDS, INFRASTRUCTURE)
  - fiscal_year
  - amount_allocated (cents)
  - amount_received (cents)
  - date_received
  - nemis_reference_number
  - conditions (text - usage restrictions)
  - is_utilized

-- Grant utilization
grant_utilization:
  - id (primary key)
  - grant_id (foreign key)
  - gl_account_code (where grant was spent)
  - amount_used (cents)
  - utilization_date
  - description
  - journal_entry_id (link to GL)
```

### 5.2 Service Implementation
**File:** `electron/main/services/finance/GrantTrackingService.ts`

**Methods:**
- `recordGrant()` - Log grant receipt
- `recordUtilization()` - Track spending of grant funds
- `getGrantUtilizationReport()` - Allocation vs usage
- `getUnusedGrants()` - Identify underutilized grants
- `exportNEMISReport()` - Generate NEMIS-compliant report
- `validateGrantUsage()` - Check compliance with conditions

### 5.3 UI Component
**File:** `src/pages/Finance/Grants/GrantTracking.tsx`

**Features:**
- List all government grants
- Track utilization percentage
- View compliance status
- Export NEMIS reports
- Alert on underutilized grants

---

## Priority 6: Per-Student Cost Tracking (Week 3)

### 6.1 Service Implementation
**File:** `electron/main/services/analytics/StudentCostService.ts`

**Features:**
- Calculate total cost per student
- Break down by category (teaching, facilities, activities)
- Compare to fee revenue per student
- Identify subsidy per student (if cost > revenue)
- Track cost trends over time

**Methods:**
- `calculateCostPerStudent()` - Total expenses / students
- `getCostBreakdown()` - By category
- `getRevenueVsCostPerStudent()` - Profitability analysis
- `getSubsidyAnalysis()` - If running at a loss
- `getTrendAnalysis()` - Cost trends over years

### 6.2 UI Component
**File:** `src/pages/Finance/Analytics/StudentCostAnalysis.tsx`

**Features:**
- Cost per student dashboard
- Cost breakdown pie chart
- Revenue vs cost comparison
- Trend analysis (3-year view)
- Identify cost drivers

---

## Success Criteria

### Technical
- ✅ CBC strands fully integrated
- ✅ JSS transition workflow automated
- ✅ Boarding profitability tracked
- ✅ Transport cost attribution by route
- ✅ Grant tracking with NEMIS export
- ✅ Per-student costing implemented

### Business
- ✅ Activity fees properly categorized
- ✅ Grade 7 fee changes automated
- ✅ Boarding break-even identified
- ✅ Unprofitable routes flagged
- ✅ Grant compliance ensured
- ✅ True cost per student known

### Audit Score
- **Current:** 8.5/10
- **Target:** 9.0/10
- **Improvement:** +0.5 (domain completeness)

---

## Timeline

| Week | Priority | Deliverables | Status |
|------|----------|--------------|--------|
| 1 | CBC + JSS | Migration, 2 services, 2 UIs | Pending |
| 2 | Boarding + Transport | 2 services, 2 UIs | Pending |
| 3 | Grants + Costing | 2 services, 2 UIs | Pending |

**Total Duration:** 3 weeks  
**Estimated Completion:** February 24, 2026

---

## Deliverables Summary

**Services:** 6 new  
**UI Components:** 6 new  
**API Handlers:** 3 new  
**Migrations:** 1 new (012_cbc_features.ts)  
**Estimated Code:** ~2,000 lines  

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| NEMIS format changes | Medium | High | Design flexible export format |
| JSS fee disputes | Low | Medium | Clear communication to parents |
| Route unprofitability | High | Medium | Early warning system |
| Grant compliance issues | Medium | High | Built-in validation rules |

---

## Next Steps After Phase 3

**Phase 4:** Enhanced Reporting & Analytics  
**Phase 5:** Advanced Security & Audit Controls  
**Phase 6:** Performance Optimization & Final Testing  

**Target Production Date:** March 31, 2026
