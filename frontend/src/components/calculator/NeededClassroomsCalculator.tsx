import React from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { useMunicipalityBaseline, useStateBaseline } from '@/hooks/api';
import { LEVELS, buildEditableDefaults, computeTable, EDUCATION_LEVEL_LABELS, type EditableInputs } from '@/lib/educationCalculator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalculatorCardView } from './CalculatorCardView';
import { getAllFieldsInOrder } from '@/lib/calculatorFields';
import { getFieldValue } from '@/lib/calculatorHelpers';
import { CalculatorField } from './CalculatorField';
import type { EducationLevel } from '@/types/api';
import { LabelWithTooltip } from '../ui/label-with-tooltip';
import { cn } from '@/lib/utils';

function clampPct(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function NeededClassroomsCalculator() {
  const { appliedMunicipality, appliedState, calculatorExpanded, selectedEducationLevels } = useDashboardStore();
  const municipalityId = appliedMunicipality?.id ?? null;
  const stateCode = appliedState?.code ?? null;

  const { data: muniBaseline, isLoading: muniLoading, isError: muniError, refetch: refetchMuni } = useMunicipalityBaseline(municipalityId);
  const { data: stateBaseline, isLoading: stateLoading, isError: stateError, refetch: refetchState } = useStateBaseline(!municipalityId ? stateCode : null);
  const baselineData = muniBaseline || stateBaseline;

  const [values, setValues] = React.useState<EditableInputs | null>(null);
  
  // State for calculation status indicator
  const [calcStatus, setCalcStatus] = React.useState<'idle' | 'calculating' | 'updated'>('idle');
  const isInitialMount = React.useRef(true);

  // Initialize form values when baseline arrives or municipality changes
  React.useEffect(() => {
    if (baselineData?.levels) {
      const defaults = buildEditableDefaults(baselineData.levels);
      setValues(defaults);
    } else {
      setValues(null);
    }
  }, [baselineData?.levels, municipalityId, stateCode]);

  const computed = React.useMemo(() => (values ? computeTable(values) : null), [values]);

  // Show update indicator when values change (but not on initial load)
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (!values) return;
    
    // Show calculating briefly, then updated
    setCalcStatus('calculating');
    const timer = setTimeout(() => {
      setCalcStatus('updated');
      // Reset to idle after showing the checkmark
      setTimeout(() => setCalcStatus('idle'), 1500);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [values]);

  // Sync live calculator inputs and computed to the store for the map
  React.useEffect(() => {
    if (values && computed) {
      useDashboardStore.getState().updateCalculatorState(values, computed);
    }
    return () => {
      // Do not clear on unmount to keep map consistent when toggling UI, only clear on resetSelections
    };
  }, [values, computed, selectedEducationLevels]);

  const isLoading = (muniLoading || stateLoading) && !values;
  const isError = municipalityId ? muniError : stateError;
  const refetch = municipalityId ? refetchMuni : refetchState;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-red-600 p-2">
        Não foi possível carregar os dados base. <button className="underline" onClick={() => refetch()}>Tentar novamente</button>.
      </div>
    );
  }

  // Show guidance message if no selection and nothing computed yet
  if ((!municipalityId && !stateCode) && (!values || !computed)) {
    return (
      <div className="text-sm text-muted-foreground">
        Selecione um estado ou município e clique em "Aplicar" para visualizar a calculadora.
      </div>
    );
  }
  if (!values || !computed) return null;

  // Show guidance message if no education levels are selected
  if (!selectedEducationLevels || selectedEducationLevels.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md">
        Selecione um nível educacional para visualizar a calculadora de salas necessárias.
      </div>
    );
  }

  const labels = EDUCATION_LEVEL_LABELS;

  const onNumChange = (
    level: typeof LEVELS[number],
    field: keyof EditableInputs,
    value: number,
  ) => {
    if (!values) return;
    const next: EditableInputs = { ...values };
    if (field === 'pctOutOfSchool') {
      next.pctOutOfSchool = { ...next.pctOutOfSchool, [level]: clampPct(value) };
    } else if (field === 'pctPrivate') {
      next.pctPrivate = { ...next.pctPrivate, [level]: clampPct(value) };
    } else if (field === 'pctIntegral') {
      next.pctIntegral = { ...next.pctIntegral, [level]: clampPct(value) };
    } else if (field === 'pctNocturnal') {
      next.pctNocturnal = { ...next.pctNocturnal, [level]: clampPct(value) };
    } else if (field === 'seatsPerClass') {
      const v = Math.max(1, Math.round(value));
      next.seatsPerClass = { ...next.seatsPerClass, [level]: v };
    } else if (field === 'existingClassrooms') {
      const v = Math.max(0, Math.round(value));
      next.existingClassrooms = { ...next.existingClassrooms, [level]: v };
    } else if (field === 'pop') {
      const v = Math.max(0, Math.round(value));
      next.pop = { ...next.pop, [level]: v };
    }
    setValues(next);
  };

  const onFieldChange = (level: EducationLevel, fieldKey: string, value: number) => {
    onNumChange(level, fieldKey as keyof EditableInputs, value);
  };

  const shownLevels: EducationLevel[] = selectedEducationLevels as EducationLevel[];
  const defaultTab: EducationLevel = selectedEducationLevels[0];
  const compactExpandedGrid = shownLevels.length <= 2;
  const labelColumnClass = compactExpandedGrid ? 'w-44' : 'w-48';
  const valueColumnClass = compactExpandedGrid ? 'w-[7.75rem]' : 'w-[8.25rem]';
  const headerCellWidthClass = compactExpandedGrid ? 'w-[7rem]' : 'w-[7.5rem]';
  const columnGapClass = compactExpandedGrid ? 'gap-x-2.5' : 'gap-x-2';
  const rowGapClass = compactExpandedGrid ? 'mb-1.5' : 'mb-2';
  const separatorMarginClass = compactExpandedGrid ? 'my-2' : 'my-2.5';

  const allFields = getAllFieldsInOrder();

  return (
    <div>
      {!calculatorExpanded && (
        <Tabs defaultValue={defaultTab} className="w-full">
          <div className="pb-2 -mx-1 px-1 overflow-x-auto overflow-y-hidden">
            <TabsList className="inline-flex w-max bg-transparent gap-2 p-0">
              {shownLevels.map((level) => (
                <TabsTrigger 
                  key={level} 
                  value={level} 
                  className="text-xs py-2 px-3 border border-gray-300 rounded-md text-gray-500 bg-transparent data-[state=active]:border-black data-[state=active]:text-black data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:border-gray-400 hover:text-gray-700 whitespace-nowrap flex-shrink-0"
                >
                  {labels[level]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {shownLevels.map((level) => (
            <TabsContent key={level} value={level} className="mt-0">
              <CalculatorCardView
                level={level}
                inputs={values}
                computed={computed.byLevel[level]}
                onFieldChange={(fieldKey, value) => onFieldChange(level, fieldKey, value)}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {calculatorExpanded && (
          <div className="overflow-x-auto overflow-y-hidden px-1 sm:px-2">
            <div className="inline-block min-w-max pr-2 sm:pr-3">
              {/* Header row with education levels */}
              <div className={cn('flex mb-3', columnGapClass)}>
                <div className={cn(labelColumnClass, 'flex-shrink-0')} /> {/* Spacer for labels column */}
                {shownLevels.map((level) => (
                  <div key={level} className={cn(valueColumnClass, 'flex-shrink-0 flex justify-end')}>
                    <div className={cn(
                      'min-h-7 px-2 text-xs font-semibold leading-tight border border-black rounded-md bg-transparent flex items-center justify-center text-center',
                      headerCellWidthClass,
                    )}>
                      {labels[level]}
                    </div>
                  </div>
                ))}
              </div>

              {/* Field rows */}
              {allFields.map((field, index) => {
                const showSeparator = field.separatorAfter && index < allFields.length - 1;
                
                return (
                  <div key={field.key}>
                    <div className={cn('flex', columnGapClass, rowGapClass)}>
                      {/* Label column */}
                      {/* <div className="w-48 flex-shrink-0 flex items-center"> */}
                        {/* <span className="text-sm font-medium text-gray-700"> */}
                          {/* {field.label} */}
                        {/* </span> */}
                      {/* </div> */}
                      <LabelWithTooltip
                        label={field.label} 
                        tooltip={field.tooltip}
                        className={cn(
                          labelColumnClass,
                          'flex-shrink-0 flex items-center text-xs min-w-0 pr-2',
                          'font-semibold text-gray-800'
                        )}
                        labelClassName="text-xs whitespace-nowrap"
                      />

                      {/* Value columns for each education level */}
                      {shownLevels.map((level) => {
                        const value = getFieldValue(field.key, level, values, computed.byLevel[level]);
                        
                        return (
                          <div key={`${field.key}-${level}`} className={cn(valueColumnClass, 'flex-shrink-0')}>
                            <CalculatorField
                              label={''}
                              tooltip={''}
                              showTooltip={false}
                              value={value}
                              fieldType={field.type}
                              isEditable={!field.isReadOnly}
                              isPrimary={field.isPrimary}
                              onChange={(newValue) => onFieldChange(level, field.key, newValue)}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Separator */}
                    {showSeparator && (
                      <div className={cn('w-full border-t border-gray-200', separatorMarginClass)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 mt-2 border-t">
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-muted-foreground px-1">
              Origem dos valores: {municipalityId ? `Município (${appliedMunicipality?.name})` : `Estado (${appliedState?.code})`}
            </div>
            {/* Calculation status indicator */}
            {calcStatus === 'calculating' && (
              <div className="text-xs text-blue-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando...
              </div>
            )}
            {calcStatus === 'updated' && (
              <div className="text-xs text-blue-600 flex items-center gap-1 animate-in fade-in duration-200">
                <Check className="h-3 w-3" />
                Valor atualizado
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar valores iniciais
          </button>
        </div>
      </div>
  );
}
