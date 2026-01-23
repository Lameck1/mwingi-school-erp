export interface TaxCalculationResult {
  paye: number
  nhif: number
  nssf: number
  totalDeductions: number
  netSalary: number
}

export interface TaxStrategy {
  calculate(grossSalary: number): TaxCalculationResult // eslint-disable-line no-unused-vars
}

export class TaxCalculator {
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
     if (grossSalary < 6000) return 150;
     if (grossSalary < 8000) return 300;
     if (grossSalary < 12000) return 400;
     if (grossSalary < 15000) return 500;
     if (grossSalary < 20000) return 600;
     if (grossSalary < 25000) return 750;
     if (grossSalary < 30000) return 850;
     if (grossSalary < 35000) return 900;
     if (grossSalary < 40000) return 950;
     if (grossSalary < 45000) return 1000;
     if (grossSalary < 50000) return 1100;
     if (grossSalary < 60000) return 1200;
     if (grossSalary < 70000) return 1300;
     if (grossSalary < 80000) return 1400;
     if (grossSalary < 90000) return 1500;
     if (grossSalary < 100000) return 1600;
     return 1700; // 100k+
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


