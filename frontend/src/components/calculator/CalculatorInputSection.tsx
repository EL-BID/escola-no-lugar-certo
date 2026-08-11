/**
 * CalculatorInputSection Component
 * 
 * Green-themed section for editable input parameters.
 * Displays all input fields in the correct order with proper formatting.
 */

import { CalculatorField } from './CalculatorField';
import { getInputFields } from '@/lib/calculatorFields';
import { getFieldValue } from '@/lib/calculatorHelpers';
import type { EducationLevel } from '@/types/api';
import type { EditableInputs, DerivedPerLevel } from '@/lib/educationCalculator';

interface CalculatorInputSectionProps {
  level: EducationLevel;
  inputs: EditableInputs;
  computed: DerivedPerLevel;
  onFieldChange: (fieldKey: string, value: number) => void;
}

export function CalculatorInputSection({
  level,
  inputs,
  computed,
  onFieldChange,
}: CalculatorInputSectionProps) {
  const inputFields = getInputFields();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-green-500 rounded-full" />
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Parâmetros de Entrada
        </h3>
      </div>

      <div className="bg-green-50/30 rounded-lg p-3 space-y-2 border border-green-100">
        {inputFields.map((field) => {
          const value = getFieldValue(field.key, level, inputs, computed);
          
          return (
            <CalculatorField
              key={field.key}
              label={field.label}
              tooltip={field.tooltip}
              value={value}
              fieldType={field.type}
              isEditable={!field.isReadOnly}
              onChange={(newValue) => onFieldChange(field.key, newValue)}
            />
          );
        })}
      </div>
    </div>
  );
}
