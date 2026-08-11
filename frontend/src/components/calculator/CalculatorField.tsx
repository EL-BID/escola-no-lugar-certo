/**
 * CalculatorField Component
 *
 * A single field row in the calculator with:
 * - Label with tooltip
 * - Value display or input
 * - Smart formatting based on field type
 * - Visual styling based on category (input/computed)
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { formatFieldValue } from '@/lib/calculatorHelpers';
import { cn } from '@/lib/utils';
import type { FieldType } from '@/lib/calculatorFields';

interface CalculatorFieldProps {
  label: string;
  tooltip: string;
  value: number;
  fieldType: FieldType;
  isEditable: boolean;
  isPrimary?: boolean;
  showTooltip?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}

export function CalculatorField({
  label,
  tooltip,
  value,
  fieldType,
  isEditable,
  isPrimary = false,
  showTooltip = true,
  onChange,
  className,
}: CalculatorFieldProps) {
  const formattedValue = formatFieldValue(value, fieldType);
  const [localValue, setLocalValue] = React.useState<string>('');
  const [isEditing, setIsEditing] = React.useState(false);
  const hasLabel = Boolean(label?.trim());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleFocus = () => {
    setIsEditing(true);
    setLocalValue(value === 0 ? '' : formattedValue);
  };

  const handleBlur = () => {
    setIsEditing(false);

    if (localValue === '') {
      onChange?.(0);
      return;
    }

    // For pt-BR: remove thousand separators (dots), remove %, and replace decimal comma with dot.
    const cleaned = localValue.replace(/\./g, '').replace(/%/g, '').replace(/,/g, '.');
    const parsed = Number(cleaned);

    if (!Number.isNaN(parsed) && parsed !== value) {
      onChange?.(parsed);
    }
  };

  const displayValue = isEditing ? localValue : value === 0 ? '' : formattedValue;

  if (!hasLabel) {
    return (
      <div className={cn('w-full', className)}>
        {isEditable ? (
          <Input
            type="text"
            inputMode={fieldType === 'percentage' ? 'decimal' : 'numeric'}
            value={displayValue}
            placeholder="0"
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(
              'h-7 w-full text-right font-mono text-xs',
              'bg-white border border-gray-300',
              'focus:ring-2 focus:ring-green-400 focus:border-green-400',
              'transition-all duration-200'
            )}
          />
        ) : (
          <div
            className={cn(
              'h-7 px-1 flex items-center justify-end w-full',
              'font-mono',
              isPrimary
                ? 'text-sm font-bold text-blue-900 bg-blue-100 rounded-md border border-blue-200 px-2'
                : 'text-sm font-bold text-gray-800'
            )}
          >
            {formattedValue}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-[11rem_minmax(8.5rem,1fr)] items-center gap-x-2', className)}>
      <LabelWithTooltip
        label={label}
        tooltip={tooltip}
        showTooltip={showTooltip}
        className={cn(
          'text-xs min-w-0',
          isPrimary ? 'font-semibold text-gray-800' : 'font-medium text-gray-700'
        )}
        labelClassName="text-xs whitespace-nowrap"
      />

      {isEditable ? (
        <Input
          type="text"
          inputMode={fieldType === 'percentage' ? 'decimal' : 'numeric'}
          value={displayValue}
          placeholder="0"
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(
            'h-7 w-full text-right font-mono text-xs',
            'bg-white border border-gray-300',
            'focus:ring-2 focus:ring-green-400 focus:border-green-400',
            'transition-all duration-200'
          )}
        />
      ) : (
        <div
          className={cn(
            'h-7 px-1 flex items-center justify-end w-full',
            'font-mono',
            isPrimary
              ? 'text-sm font-bold text-blue-900 bg-blue-100 rounded-md border border-blue-200 px-2'
              : 'text-sm font-bold text-gray-800'
          )}
        >
          {formattedValue}
        </div>
      )}
    </div>
  );
}
