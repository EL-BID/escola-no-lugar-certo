/**
 * Calculator Helper Functions
 * 
 * Utilities for accessing and formatting calculator data in a structured way.
 */

import type { EducationLevel } from '../types/api';
import type { EditableInputs, DerivedPerLevel } from './educationCalculator';
import { formatInteger, formatPercentInput } from './utils';
import type { FieldType } from './calculatorFields';

/**
 * Get value from inputs or computed data
 */
export function getFieldValue(
  fieldKey: string,
  level: EducationLevel,
  inputs: EditableInputs,
  computed: DerivedPerLevel
): number {
  // Check if it's in EditableInputs
  if (fieldKey in inputs) {
    const value = inputs[fieldKey as keyof EditableInputs];
    if (typeof value === 'object' && value !== null) {
      const rec = value as Record<EducationLevel, number>;
      if (level in rec) return rec[level] ?? 0;
    }
    return 0;
  }

  // Check if it's in computed data
  if (fieldKey in computed) {
    return computed[fieldKey as keyof DerivedPerLevel] ?? 0;
  }

  return 0;
}

/**
 * Format field value based on its type
 */
export function formatFieldValue(value: number, fieldType: FieldType): string {
  switch (fieldType) {
    case 'integer':
    case 'readonly-integer':
      return formatInteger(value);
    case 'percentage':
      return formatPercentInput(value);
    default:
      return formatInteger(value);
  }
}

/**
 * Get display value for a field (formatted)
 */
export function getFormattedFieldValue(
  fieldKey: string,
  level: EducationLevel,
  inputs: EditableInputs,
  computed: DerivedPerLevel,
  fieldType: FieldType
): string {
  const rawValue = getFieldValue(fieldKey, level, inputs, computed);
  return formatFieldValue(rawValue, fieldType);
}

/**
 * Check if a field is editable
 */
export function isFieldEditable(fieldKey: string, inputs: EditableInputs): boolean {
  return fieldKey in inputs && fieldKey !== 'existingClassrooms';
}

/**
 * Get input type for HTML input element
 */
export function getInputTypeProps(fieldType: FieldType): {
  type: string;
  min?: number;
  max?: number;
  step?: number;
} {
  switch (fieldType) {
    case 'percentage':
      return { type: 'number', min: 0, max: 100, step: 0.1 };
    case 'integer':
      return { type: 'number', min: 0, step: 1 };
    case 'readonly-integer':
      return { type: 'number', min: 0, step: 1 };
    default:
      return { type: 'number', min: 0 };
  }
}

/**
 * Get CSS classes for field based on category
 */
export function getFieldClasses(
  category: 'input' | 'computed',
  isPrimary: boolean = false
): {
  containerClass: string;
  labelClass: string;
  valueClass: string;
} {
  if (category === 'input') {
    return {
      containerClass: 'bg-green-50/30 rounded-lg p-3 space-y-2',
      labelClass: 'text-sm font-medium text-gray-700',
      valueClass: 'text-base font-mono',
    };
  }

  // Computed category
  if (isPrimary) {
    return {
      containerClass: 'bg-blue-100 rounded-lg p-3 border-2 border-blue-300',
      labelClass: 'text-sm font-semibold text-gray-800',
      valueClass: 'text-lg font-bold font-mono text-blue-900',
    };
  }

  return {
    containerClass: 'bg-blue-50/50 rounded-lg p-3',
    labelClass: 'text-sm font-medium text-gray-700',
    valueClass: 'text-base font-mono text-gray-800',
  };
}

/**
 * Get suffix for display (e.g., "%" for percentages)
 */
export function getFieldSuffix(fieldType: FieldType): string {
  return fieldType === 'percentage' ? '%' : '';
}
