import { useStates } from '../../hooks/api';
import { useDashboardStore } from '../../lib/stores/dashboardStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { LabelWithTooltip } from '../ui/label-with-tooltip';

export function StateSelector() {
  const { data: states, isLoading } = useStates();
  const { selectedState, selectState } = useDashboardStore();

  return (
    <div className="space-y-2">
      <LabelWithTooltip 
        htmlFor="state-select" 
        label="Estado"
        tooltip="Selecione o estado brasileiro que deseja visualizar. Os dados serão filtrados para mostrar apenas a região selecionada."
      />
      <Select
        value={selectedState?.code || ''}
        onValueChange={(code) => {
          const state = states?.find(s => s.code === code);
          if (state) selectState(state);
        }}
      >
        <SelectTrigger id="state-select">
          <SelectValue placeholder="Selecione um estado..." />
        </SelectTrigger>
        <SelectContent className="bg-card/95 shadow-lg backdrop-blur-sm">
          {isLoading ? (
            <SelectItem value="loading" disabled>Carregando...</SelectItem>
          ) : (
            states?.map((state) => (
              <SelectItem key={state.code} value={state.code}>
                {state.name} ({state.code})
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}