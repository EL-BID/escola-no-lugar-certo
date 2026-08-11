import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDashboardStore } from '@/lib/stores/dashboardStore';

export function InfoPopover() {
  const { selectedState, selectedMunicipality, selectedEducationLevels } = useDashboardStore();

  // Map education level codes to readable names
  const educationLevelNames: Record<string, string> = {
    INF_CRE: 'Educação Infantil - Creche',
    INF_PRE: 'Educação Infantil - Pré-escola',
    FUND_AI: 'Ensino Fundamental - Anos Iniciais',
    FUND_AF: 'Ensino Fundamental - Anos Finais',
    MED: 'Ensino Médio',
  };

  return (
    <TooltipProvider delayDuration={120}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger
              type="button"
              aria-label="Ver resumo da seleção atual e informações sobre o mapa"
              className="inline-flex items-center justify-center border border-input bg-card/95 backdrop-blur-sm rounded-full h-10 w-10 shadow-lg"
            >
                <Info className="h-4 w-4" />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Ver resumo da seleção atual e informações sobre o mapa</TooltipContent>
        </Tooltip>
      <PopoverContent side="top" align="end" className="w-80 bg-card/95 backdrop-blur-sm">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm mb-2">Seleção Atual</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">Estado:</span>{' '}
                {selectedState ? `${selectedState.name} (${selectedState.code})` : 'Nenhum'}
              </p>
              <p>
                <span className="font-medium">Município:</span>{' '}
                {selectedMunicipality ? selectedMunicipality.name : 'Nenhum'}
              </p>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold text-sm mb-2">Níveis de Ensino</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              {selectedEducationLevels.length > 0 ? (
                selectedEducationLevels.map((level) => (
                  <p key={level} className="pl-2">• {educationLevelNames[level]}</p>
                ))
              ) : (
                <p className="text-muted-foreground/60">Nenhum selecionado</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>
              Os hexágonos no mapa representam a densidade de necessidades educacionais
              para os níveis de ensino selecionados.
            </p>
          </div>
        </div>
      </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
