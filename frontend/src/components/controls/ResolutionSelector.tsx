import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { useEffect, useMemo, useState } from 'react';
import {
  getAvailableResolutions,
  getSafeResolution,
  MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST,
  normalizeResolutionCounts,
} from '../../lib/resolutionPolicy';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { LabelWithTooltip } from '../ui/label-with-tooltip';

// Resolution options with area approximations (H3 hexagon areas)
const resolutionOptions = [
  { value: 5, label: '~253 km² (Regional)', description: 'Visão ampla' },
  { value: 6, label: '~36 km² (Bairro)', description: 'Nível de bairro' },
  { value: 7, label: '~5 km² (Vizinhança)', description: 'Vizinhança' },
  { value: 8, label: '~0.7 km² (Quarteirão)', description: 'Mais detalhado' },
];

export function ResolutionSelector() {
  const { mapResolution, updateMapResolution, selectedMunicipality } = useDashboardStore();
  const [autoAdjustNotice, setAutoAdjustNotice] = useState<string | null>(null);

  // State-level views are fixed at resolution 5
  const isStateOnly = !selectedMunicipality;
  const hasMunicipalityCounts = !!selectedMunicipality?.hexagon_counts_by_resolution;
  const effectiveResolution = isStateOnly ? 5 : mapResolution;

  const resolutionCounts = useMemo(
    () => normalizeResolutionCounts(selectedMunicipality?.hexagon_counts_by_resolution),
    [selectedMunicipality?.hexagon_counts_by_resolution]
  );

  const availableResolutions = useMemo(
    () => {
      if (isStateOnly) {
        return [5];
      }

      if (!hasMunicipalityCounts) {
        // Conservative fallback while municipality count metadata is loading.
        return [5, 6, 7];
      }

      return getAvailableResolutions(selectedMunicipality?.hexagon_counts_by_resolution);
    },
    [isStateOnly, hasMunicipalityCounts, selectedMunicipality?.hexagon_counts_by_resolution]
  );

  const safeResolution = useMemo(
    () => {
      if (isStateOnly) {
        return 5;
      }

      if (!hasMunicipalityCounts) {
        return Math.min(mapResolution, 7);
      }

      return getSafeResolution(mapResolution, selectedMunicipality?.hexagon_counts_by_resolution);
    },
    [isStateOnly, hasMunicipalityCounts, mapResolution, selectedMunicipality?.hexagon_counts_by_resolution]
  );

  const maxAllowedResolution = useMemo(
    () => {
      if (isStateOnly) {
        return 5;
      }

      if (!hasMunicipalityCounts) {
        return 7;
      }

      return getSafeResolution(8, selectedMunicipality?.hexagon_counts_by_resolution);
    },
    [isStateOnly, hasMunicipalityCounts, selectedMunicipality?.hexagon_counts_by_resolution]
  );

  useEffect(() => {
    if (isStateOnly) {
      if (mapResolution !== 5) {
        updateMapResolution(5);
      }
      setAutoAdjustNotice(null);
      return;
    }

    if (!availableResolutions.includes(mapResolution)) {
      updateMapResolution(safeResolution);
      setAutoAdjustNotice(
        `Ajustado automaticamente para resolução ${safeResolution} para manter o processamento estável.`
      );
      return;
    }

    setAutoAdjustNotice(null);
  }, [
    isStateOnly,
    mapResolution,
    safeResolution,
    availableResolutions,
    updateMapResolution,
  ]);

  const maxAllowedEstimate = resolutionCounts[String(maxAllowedResolution)] ?? 0;
  const resolutionHelpText = isStateOnly
    ? "Selecione um município para escolher outros tamanhos de hexágono. Visão estadual usa hexágonos regionais."
    : !hasMunicipalityCounts
      ? "Carregando limites de detalhamento para este município."
      : autoAdjustNotice
        ? `${autoAdjustNotice} Hexágonos menores mostram mais detalhes, porém podem deixar a visualização mais lenta em municípios grandes. O limite automático é aplicado acima de ${MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST.toLocaleString('pt-BR')} hexágonos estimados.`
        : `Maior detalhamento disponível: resolução ${maxAllowedResolution}${maxAllowedEstimate > 0 ? ` (~${maxAllowedEstimate.toLocaleString('pt-BR')} hexágonos)` : ''}. Hexágonos menores mostram mais detalhes, porém podem deixar a visualização mais lenta em municípios grandes. O limite automático é aplicado acima de ${MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST.toLocaleString('pt-BR')} hexágonos estimados.`;
  const resolutionDetailText = maxAllowedEstimate > 0
    ? `Maior detalhamento disponível: resolução ${maxAllowedResolution} (~${maxAllowedEstimate.toLocaleString('pt-BR')} hexágonos).`
    : `Maior detalhamento disponível: resolução ${maxAllowedResolution}.`;
  const resolutionPerformanceText = `Hexágonos menores mostram mais detalhes, porém podem deixar a visualização mais lenta em municípios grandes. O limite automático é aplicado acima de ${MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST.toLocaleString('pt-BR')} hexágonos estimados.`;

  return (
    <div className="space-y-2">
      <LabelWithTooltip 
        htmlFor="resolution-select" 
        label="Tamanho do Hexágono"
        tooltip={resolutionHelpText}
        tooltipContent={
          isStateOnly || !hasMunicipalityCounts ? (
            resolutionHelpText
          ) : (
            <div className="space-y-3">
              <p>{autoAdjustNotice ?? resolutionDetailText}</p>
              <p className="font-semibold">{resolutionPerformanceText}</p>
            </div>
          )
        }
      />
      <Select
        value={effectiveResolution.toString()}
        onValueChange={(value) => {
          const nextResolution = parseInt(value, 10);
          const nextSafeResolution = getSafeResolution(
            nextResolution,
            selectedMunicipality?.hexagon_counts_by_resolution
          );

          updateMapResolution(nextSafeResolution);
          if (nextSafeResolution !== nextResolution) {
            setAutoAdjustNotice(
              `Resolução ${nextResolution} indisponível para este município. Ajustado para ${nextSafeResolution}.`
            );
          }
        }}
        disabled={isStateOnly}
      >
        <SelectTrigger id="resolution-select" className={isStateOnly ? "opacity-60" : ""}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card/95 shadow-lg backdrop-blur-sm">
          {resolutionOptions.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value.toString()}
              disabled={
                (isStateOnly && option.value !== 5)
                || (!isStateOnly && !availableResolutions.includes(option.value))
              }
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
