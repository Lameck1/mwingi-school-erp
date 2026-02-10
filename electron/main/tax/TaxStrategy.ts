export interface TaxCalculationResult {
  paye: number
  nhif: number
  nssf: number
  totalDeductions: number
  netSalary: number
}

export interface TaxStrategy {
  calculate(grossSalary: number): TaxCalculationResult
}

export class TaxCalculator {
  private static readonly NHIF_BRACKETS: ReadonlyArray<{ maxSalary: number; deduction: number }> = [
    { maxSalary: 6000, deduction: 150 },
    { maxSalary: 8000, deduction: 300 },
    { maxSalary: 12000, deduction: 400 },
    { maxSalary: 15000, deduction: 500 },
    { maxSalary: 20000, deduction: 600 },
    { maxSalary: 25000, deduction: 750 },
    { maxSalary: 30000, deduction: 850 },
    { maxSalary: 35000, deduction: 900 },
    { maxSalary: 40000, deduction: 950 },
    { maxSalary: 45000, deduction: 1000 },
    { maxSalary: 50000, deduction: 1100 },
    { maxSalary: 60000, deduction: 1200 },
    { maxSalary: 70000, deduction: 1300 },
    { maxSalary: 80000, deduction: 1400 },
    { maxSalary: 90000, deduction: 1500 },
    { maxSalary: 100000, deduction: 1600 }
  ]

  private static readonly NHIF_MAX_DEDUCTION = 1700

  calculatePAYE(grossSalary: number): number {
    // 2024/2025 Kenya PAYE Bands (Simplified for example)
    // 24,000 - 10%
    // Next 8,333 - 25%
    // Next 467,667 - 30%
    // Over 500,000 - 32.5% or 35%
    
    // For now, let's use a simplified logical approximation or 0
    // Personal Relief is 2400
    
    let tax = 0;
    let remainder = grossSalary;
    
    // First 24,000
    if (remainder > 24000) {
        tax += 24000 * 0.1;
        remainder -= 24000;
    } else {
        tax += remainder * 0.1;
        return Math.max(0, tax - 2400);
    }
    
    // Next 8,333
    if (remainder > 8333) {
        tax += 8333 * 0.25;
        remainder -= 8333;
    } else {
        tax += remainder * 0.25;
        return Math.max(0, tax - 2400);
    }
    
    // Remaining at 30% (Standard)
    tax += remainder * 0.3;
    
    return Math.max(0, tax - 2400);
  }

  calculateNHIF(grossSalary: number): number {
      const bracket = TaxCalculator.NHIF_BRACKETS.find((entry) => grossSalary < entry.maxSalary)
      return bracket?.deduction ?? TaxCalculator.NHIF_MAX_DEDUCTION
  }

  calculateNSSF(grossSalary: number): number {
      // Tier 1: 6% of min(salary, 7000)
      // Tier 2: 6% of min(salary, 36000) - Tier 1
      const tier1 = Math.min(grossSalary, 7000) * 0.06;
      const tier2 = (Math.min(grossSalary, 36000) - 7000) * 0.06;
      return tier1 + (grossSalary > 7000 ? Math.max(0, tier2) : 0);
  }

  calculate(grossSalary: number): TaxCalculationResult {
      const paye = this.calculatePAYE(grossSalary);
      const nhif = this.calculateNHIF(grossSalary);
      const nssf = this.calculateNSSF(grossSalary);
      const totalDeductions = paye + nhif + nssf;
      const netSalary = grossSalary - totalDeductions;
      
      return {
          paye,
          nhif,
          nssf,
          totalDeductions,
          netSalary
      }
  }
}


