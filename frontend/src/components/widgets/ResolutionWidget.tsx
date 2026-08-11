import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Hexagon } from 'lucide-react';

// Known average areas (km2) and human descriptions for resolutions we use.
const RESOLUTION_INFO: Record<number, { areaKm2: number; description: string }> = {
  5: {
    areaKm2: 252.903858182,
    description: 'Visão ampla, ideal para tendências em nível de estado.'
  },
  8: {
    areaKm2: 0.737327598,
    description: 'Detalhamento fino para identificar áreas críticas específicas.'
  }
};

function formatArea(km2: number) {
  if (km2 >= 100) return km2.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km²';
  if (km2 >= 10) return km2.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km²';
  if (km2 >= 1) return km2.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km²';
  return (km2 * 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' m²';
}

export function ResolutionWidget() {
  const { appliedMapResolution, appliedMunicipality } = useDashboardStore();
  // Effective resolution mirrors data hook logic: force 5 when no municipality selected
  const effectiveResolution = appliedMunicipality ? appliedMapResolution : 5;
  const info = RESOLUTION_INFO[effectiveResolution];

  return (
    <TooltipProvider delayDuration={120}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger
              type="button"
              aria-label={`Resolução H3 ${effectiveResolution}`}
              className="inline-flex items-center justify-center border border-input bg-card/95 backdrop-blur-sm rounded-full h-16 w-16 shadow-lg relative"
            >
                <Hexagon strokeWidth={1.5} size={56} className="text-foreground/70" />
                <span className="absolute inset-0 flex items-center justify-center text-base font-semibold text-foreground">
                  {effectiveResolution}
                </span>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Ver área e descrição da resolução atual</TooltipContent>
        </Tooltip>
      <PopoverContent side="top" align="center" className="w-72 bg-card/95 backdrop-blur-sm">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm mb-1">Resolução H3 {effectiveResolution}</h4>
            {info ? (
              <div className="text-sm text-muted-foreground space-y-1">
                <p><span className="font-medium">Área média:</span> {formatArea(info.areaKm2)}</p>
                <p>{info.description}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem informações detalhadas para esta resolução.</p>
            )}
          </div>
          <div className="pt-2 border-t text-[11px] text-muted-foreground">
            Hexágonos menores (maior resolução) = mais detalhe e maior custo de processamento.
            {!appliedMunicipality && ' Estado sem município selecionado: resolução forçada para 5.'}
          </div>
        </div>
      </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
