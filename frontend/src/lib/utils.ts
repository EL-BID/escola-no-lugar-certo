import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('pt-BR', options).format(value)
}

export function formatValue(value: number, format: 'number' | 'decimal' | 'percentage' | 'currency'): string {
  switch (format) {
    case 'number':
      return formatNumber(value, { maximumFractionDigits: 0 })
    case 'decimal':
      return formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'percentage':
      return formatNumber(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'currency':
      return formatNumber(value, { style: 'currency', currency: 'BRL' })
    default:
      return value.toString()
  }
}

// ============================================
// CALCULATOR-SPECIFIC FORMATTERS
// ============================================

/**
 * Format an integer with thousand separators
 * @example formatInteger(4171) => "4.171"
 * @example formatInteger(0) => "0"
 */
export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(value));
}

/**
 * Format a percentage value (stored as 0-100 range) with % symbol
 * @example formatPercentInput(93.023255881395348) => "93,02%"
 * @example formatPercentInput(0) => "0%"
 * @example formatPercentInput(6.976744186046512) => "6,98%"
 */
export function formatPercentInput(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '0%';
  const clamped = Math.min(100, Math.max(0, value));
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(clamped);
  return formatted + '%';
}

/**
 * Format a decimal number with controlled precision
 * @example formatDecimalNumber(93.023255881395348, 2) => "93.02"
 * @example formatDecimalNumber(4171.5, 0) => "4.172"
 */
export function formatDecimalNumber(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Smart formatter for calculator values - auto-detects type
 * Use this for display-only fields in the calculator
 */
export function formatCalculatorValue(
  value: number,
  type: 'integer' | 'percentage' | 'decimal' = 'integer'
): string {
  switch (type) {
    case 'integer':
      return formatInteger(value);
    case 'percentage':
      return formatPercentInput(value);
    case 'decimal':
      return formatDecimalNumber(value);
    default:
      return formatInteger(value);
  }
}
