/**
 * Tests for operations-schemas.ts
 * Covers TransportRouteSchema union/transform (71.79% stmts), line 51 branches
 */
import { describe, expect, it } from 'vitest'
import {
  BoardingExpenseSchema,
  TransportExpenseSchema,
  TransportRouteSchema,
  GetExpensesTuple,
  GrantCreateSchema,
  GrantUtilizationSchema,
} from '../operations-schemas'

describe('operations-schemas', () => {
  // ─── TransportRouteSchema canonical ─────────────────────────────
  describe('TransportRouteSchema', () => {
    it('accepts canonical route schema', () => {
      const result = TransportRouteSchema.safeParse({
        route_name: 'Route A',
        distance_km: 25,
        estimated_students: 40,
        budget_per_term_cents: 500000,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.route_name).toBe('Route A')
        expect(result.data.distance_km).toBe(25)
        expect(result.data.estimated_students).toBe(40)
        expect(result.data.budget_per_term_cents).toBe(500000)
      }
    })

    it('accepts canonical route with optional fields', () => {
      const result = TransportRouteSchema.safeParse({
        route_name: 'Route B',
        distance_km: 10,
        estimated_students: 20,
        budget_per_term_cents: 300000,
        driver_id: 5,
        vehicle_registration: 'KAA 123B',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.driver_id).toBe(5)
        expect(result.data.vehicle_registration).toBe('KAA 123B')
      }
    })

    // ─── TransportRouteSchema legacy transform (line 51) ──────────
    it('transforms legacy route schema to canonical', () => {
      const result = TransportRouteSchema.safeParse({
        route_name: 'Legacy Route',
        cost_per_term: 40000,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.route_name).toBe('Legacy Route')
        expect(result.data.distance_km).toBe(0)
        expect(result.data.estimated_students).toBe(0)
        expect(result.data.budget_per_term_cents).toBe(40000)
      }
    })

    it('transforms legacy route with description as vehicle_registration', () => {
      const result = TransportRouteSchema.safeParse({
        route_name: 'Bus Route',
        cost_per_term: 25000,
        description: 'Main bus route',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.vehicle_registration).toBe('Main bus route')
      }
    })

    it('legacy route without description has no vehicle_registration', () => {
      const result = TransportRouteSchema.safeParse({
        route_name: 'Simple Route',
        cost_per_term: 10000,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.vehicle_registration).toBeUndefined()
      }
    })

    it('rejects invalid route (missing required fields)', () => {
      const result = TransportRouteSchema.safeParse({ route_name: 'Bad' })
      expect(result.success).toBe(false)
    })
  })

  // ─── BoardingExpenseSchema ──────────────────────────────────────
  describe('BoardingExpenseSchema', () => {
    it('accepts valid boarding expense', () => {
      const result = BoardingExpenseSchema.safeParse({
        facility_id: 1,
        amount_cents: 5000,
        fiscal_year: 2026,
        gl_account_code: '5100',
        recorded_by: 9,
        term: 1,
        description: 'Food',
        expense_type: 'FOOD',
      })
      expect(result.success).toBe(true)
    })

    it('accepts optional payment_method', () => {
      const result = BoardingExpenseSchema.safeParse({
        facility_id: 1,
        amount_cents: 5000,
        fiscal_year: 2026,
        gl_account_code: '5100',
        recorded_by: 9,
        term: 2,
        description: 'Electricity',
        expense_type: 'UTILITIES',
        payment_method: 'BANK',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid expense_type', () => {
      const result = BoardingExpenseSchema.safeParse({
        facility_id: 1,
        amount_cents: 5000,
        fiscal_year: 2026,
        gl_account_code: '5100',
        recorded_by: 9,
        term: 1,
        description: 'Bad',
        expense_type: 'INVALID_TYPE',
      })
      expect(result.success).toBe(false)
    })
  })

  // ─── TransportExpenseSchema ─────────────────────────────────────
  describe('TransportExpenseSchema', () => {
    it('accepts valid transport expense', () => {
      const result = TransportExpenseSchema.safeParse({
        route_id: 1,
        amount_cents: 3000,
        fiscal_year: 2026,
        gl_account_code: '5200',
        recorded_by: 9,
        term: 3,
        description: 'Fuel purchase',
        expense_type: 'FUEL',
      })
      expect(result.success).toBe(true)
    })

    it('rejects negative amount', () => {
      const result = TransportExpenseSchema.safeParse({
        route_id: 1,
        amount_cents: -100,
        fiscal_year: 2026,
        gl_account_code: '5200',
        recorded_by: 9,
        term: 1,
        description: 'Bad',
        expense_type: 'FUEL',
      })
      expect(result.success).toBe(false)
    })
  })

  // ─── GetExpensesTuple ───────────────────────────────────────────
  describe('GetExpensesTuple', () => {
    it('accepts full tuple with optional term', () => {
      const result = GetExpensesTuple.safeParse([1, 2026, 2])
      expect(result.success).toBe(true)
    })

    it('accepts tuple without optional term', () => {
      const result = GetExpensesTuple.safeParse([1, 2026])
      expect(result.success).toBe(true)
    })
  })

  // ─── GrantCreateSchema ─────────────────────────────────────────
  describe('GrantCreateSchema', () => {
    it('accepts valid grant', () => {
      const result = GrantCreateSchema.safeParse({
        grant_name: 'School Grant',
        grant_type: 'CAPITATION',
        amount_allocated: 100000,
        amount_received: 50000,
        fiscal_year: 2026,
        source: 'Government',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      })
      expect(result.success).toBe(true)
    })

    it('accepts optional notes', () => {
      const result = GrantCreateSchema.safeParse({
        grant_name: 'Infrastructure',
        grant_type: 'INFRASTRUCTURE',
        amount_allocated: 200000,
        amount_received: 0,
        fiscal_year: 2026,
        source: 'CDF',
        start_date: '2026-03-01',
        end_date: '2026-09-30',
        notes: 'Phase 1',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid date format', () => {
      const result = GrantCreateSchema.safeParse({
        grant_name: 'Bad Grant',
        grant_type: 'OTHER',
        amount_allocated: 100000,
        amount_received: 0,
        fiscal_year: 2026,
        source: 'Test',
        start_date: '03/01/2026',
        end_date: '2026-12-31',
      })
      expect(result.success).toBe(false)
    })
  })

  // ─── GrantUtilizationSchema ────────────────────────────────────
  describe('GrantUtilizationSchema', () => {
    it('accepts valid utilization', () => {
      const result = GrantUtilizationSchema.safeParse({
        grantId: 1,
        amount: 5000,
        utilizationDate: '2026-04-15',
        description: 'Purchase desks',
        glAccountCode: '5100',
      })
      expect(result.success).toBe(true)
    })

    it('accepts optional category and userId', () => {
      const result = GrantUtilizationSchema.safeParse({
        grantId: 1,
        amount: 3000,
        utilizationDate: '2026-05-01',
        description: 'Books',
        glAccountCode: '5200',
        category: 'SUPPLIES',
        userId: 9,
      })
      expect(result.success).toBe(true)
    })
  })
})
