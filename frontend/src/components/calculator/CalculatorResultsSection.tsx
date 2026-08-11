/**
 * CalculatorResultsSection Component
 * 
 * Blue-themed section for computed/read-only results.
 * Displays calculated values with primary result highlighted.
 */

import { CalculatorField } from './CalculatorField';
import { getComputedFields } from '@/lib/calculatorFields';
import { getFieldValue } from '@/lib/calculatorHelpers';
import type { EducationLevel } from '@/types/api';
import type { EditableInputs, DerivedPerLevel } from '@/lib/educationCalculator';

interface CalculatorResultsSectionProps {
  level: EducationLevel;
  inputs: EditableInputs;
  computed: DerivedPerLevel;
}

export function CalculatorResultsSection({
  level,
  inputs,
  computed,
}: CalculatorResultsSectionProps) {
  const computedFields = getComputedFields();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-blue-500 rounded-full" />
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Resultados Calculados
        </h3>
      </div>

      <div className="bg-blue-50/30 rounded-lg p-3 space-y-2 border border-blue-100">
        {computedFields.map((field) => {
          const value = getFieldValue(field.key, level, inputs, computed);
          
          return (
            <div key={field.key}>
              {/* Add separator before primary result */}
              {field.isPrimary && (
                <div className="border-t border-blue-200 my-2" />
              )}
              
              <CalculatorField
                label={field.label}
                tooltip={field.tooltip}
                value={value}
                fieldType={field.type}
                isEditable={false}
                isPrimary={field.isPrimary}
                className={field.isPrimary ? 'py-1' : ''}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
