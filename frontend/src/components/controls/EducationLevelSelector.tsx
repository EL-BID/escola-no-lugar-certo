import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { LabelWithTooltip } from '../ui/label-with-tooltip';
import MultiSelect, { type MultiSelectOption } from '../ui/multi-select';
import type { EducationLevel } from '../../types/api';

const educationLevels: { value: EducationLevel; label: string; chipLabel: string }[] = [
  { value: 'INF_CRE', label: 'Infantil - Creche', chipLabel: 'Creche' },
  { value: 'INF_PRE', label: 'Infantil - Pré-escola', chipLabel: 'Pré-Escola' },
  { value: 'FUND_AI', label: 'Fundamental - Anos Iniciais', chipLabel: 'Fund. A. Iniciais' },
  { value: 'FUND_AF', label: 'Fundamental - Anos Finais', chipLabel: 'Fund. A. Finais' },
  { value: 'MED', label: 'Ensino Médio', chipLabel: 'Ensino Médio' },
];

// Note: label helper is defined where needed (e.g., map tooltip).

export function EducationLevelSelector() {
  const { selectedEducationLevels, updateEducationLevels } = useDashboardStore();

  const options: MultiSelectOption[] = educationLevels;

  return (
    <div className="space-y-2">
      <LabelWithTooltip 
        htmlFor="education-level-multiselect" 
        label="Níveis de Ensino"
        tooltip="É possível selecionar múltiplos níveis para comparar cenários e ajustar parâmetros por aba. Marque um ou mais níveis educacionais para análise e cálculo de necessidades."
        tooltipContent={(
          <div className="space-y-3">
            <p>
              É possível selecionar múltiplos níveis para comparar cenários e ajustar parâmetros por aba.
            </p>
            <p className="font-semibold">
              Marque um ou mais níveis educacionais para análise e cálculo de necessidades.
            </p>
          </div>
        )}
      />
      <MultiSelect
        options={options}
        value={selectedEducationLevels as string[]}
        onChange={(vals) => updateEducationLevels(vals as EducationLevel[])}
        placeholder="Selecione os níveis de ensino"
        className="bg-background"
      />
    </div>
  );
}
