/**
 * CalculatorCardView Component
 * 
 * Unified calculator view matching wireframe design.
 * Displays all fields in order with visual separators between sections.
 */

import { CalculatorField } from './CalculatorField';
import { getAllFieldsInOrder } from '@/lib/calculatorFields';
import { getFieldValue } from '@/lib/calculatorHelpers';
import type { EducationLevel } from '@/types/api';
import type { EditableInputs, DerivedPerLevel } from '@/lib/educationCalculator';

interface CalculatorCardViewProps {
  level: EducationLevel;
  inputs: EditableInputs;
  computed: DerivedPerLevel;
  onFieldChange: (fieldKey: string, value: number) => void;
}

export function CalculatorCardView({
  level,
  inputs,
  computed,
  onFieldChange,
}: CalculatorCardViewProps) {
  const allFields = getAllFieldsInOrder();

  return (
    <div className="space-y-2 animate-in fade-in-50 duration-300">
      {allFields.map((field, index) => {
        const value = getFieldValue(field.key, level, inputs, computed);
        
        return (
          <div key={field.key}>
            <CalculatorField
              label={field.label}
              tooltip={field.tooltip}
              value={value}
              fieldType={field.type}
              isEditable={!field.isReadOnly}
              isPrimary={field.isPrimary}
              onChange={(newValue) => onFieldChange(field.key, newValue)}
            />
            
            {/* Add separator after field if specified */}
            {field.separatorAfter && index < allFields.length - 1 && (
              <div className="border-t border-gray-200 my-2" />
            )}
          </div>
        );
      })}
    </div>
  );
}
