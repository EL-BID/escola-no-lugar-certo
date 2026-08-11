import { useMunicipalities } from '../../hooks/api';
import { useMunicipalityResolutionCounts } from '../../hooks/api';
import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { LabelWithTooltip } from '../ui/label-with-tooltip';

export function MunicipalitySelector() {
  const {
    selectedState,
    selectedMunicipality,
    selectMunicipality,
    stateHexagonCountRes8ByState,
    setStateHexagonCountRes8,
  } = useDashboardStore();
  const { data: municipalities, isLoading } = useMunicipalities(selectedState?.code || null, false);

  const hasStateCountCached = useMemo(() => {
    if (!selectedState?.code) {
      return false;
    }

    return Object.prototype.hasOwnProperty.call(
      stateHexagonCountRes8ByState,
      selectedState.code,
    );
  }, [selectedState?.code, stateHexagonCountRes8ByState]);

  const { data: municipalitiesWithCounts } = useMunicipalities(
    selectedState?.code || null,
    true,
    {
      // Start enrichment as soon as a state is selected so progress estimates can appear earlier.
      enabled: !!selectedState?.code
        && !hasStateCountCached,
      staleTime: 30 * 60 * 1000,
    }
  );

  const needsSelectedMunicipalityCounts = !!selectedMunicipality
    && !selectedMunicipality.hexagon_counts_by_resolution;

  const { data: selectedMunicipalityCounts } = useMunicipalityResolutionCounts(
    selectedMunicipality?.id ?? null,
    needsSelectedMunicipalityCounts,
  );

  const municipalitiesForSelection = municipalitiesWithCounts ?? municipalities;

  useEffect(() => {
    if (!selectedState?.code || !municipalitiesWithCounts) {
      return;
    }

    const totalRes8 = municipalitiesWithCounts.reduce((sum, municipality) => {
      const res8Count = municipality.hexagon_counts_by_resolution?.['8'] ?? 0;
      return sum + res8Count;
    }, 0);

    setStateHexagonCountRes8(selectedState.code, totalRes8);

    if (
      selectedMunicipality &&
      !selectedMunicipality.hexagon_counts_by_resolution
    ) {
      const municipalityWithCounts = municipalitiesWithCounts.find(
        (municipality) => municipality.id === selectedMunicipality.id,
      );

      if (municipalityWithCounts?.hexagon_counts_by_resolution) {
        selectMunicipality(municipalityWithCounts);
      }
    }
  }, [
    selectedState?.code,
    selectedMunicipality,
    municipalitiesWithCounts,
    setStateHexagonCountRes8,
    selectMunicipality,
  ]);

  useEffect(() => {
    if (!selectedMunicipality || selectedMunicipality.hexagon_counts_by_resolution) {
      return;
    }

    if (!selectedMunicipalityCounts?.counts) {
      return;
    }

    selectMunicipality({
      ...selectedMunicipality,
      hexagon_counts_by_resolution: selectedMunicipalityCounts.counts,
    });
  }, [
    selectedMunicipality,
    selectedMunicipalityCounts,
    selectMunicipality,
  ]);

  if (!selectedState) {
    return (
      <div className="space-y-2">
        <LabelWithTooltip 
          htmlFor="municipality-select" 
          label="Município"
          tooltip="Selecione um município específico para análise detalhada. Deixe em 'Todos' para visualizar o estado inteiro."
        />
        <Select disabled>
          <SelectTrigger id="municipality-select">
            <SelectValue placeholder="Selecione um estado primeiro..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <LabelWithTooltip 
        htmlFor="municipality-select" 
        label="Município"
        tooltip="Selecione um município específico para análise detalhada. Deixe em 'Todos' para visualizar o estado inteiro."
      />
      <Select
        value={selectedMunicipality?.name || 'all'}
        onValueChange={(name) => {
          if (name === 'all') {
            selectMunicipality(null);
          } else {
            const municipality = municipalitiesForSelection?.find(m => m.name === name);
            if (municipality) selectMunicipality(municipality);
          }
        }}
      >
        <SelectTrigger id="municipality-select">
          <SelectValue placeholder="Todos os municípios" />
        </SelectTrigger>
        <SelectContent className="bg-card/95 shadow-lg backdrop-blur-sm">
          <SelectItem value="all">Todos os municípios</SelectItem>
          {isLoading ? (
            <SelectItem value="loading" disabled>Carregando...</SelectItem>
          ) : (
            municipalitiesForSelection?.map((municipality) => (
              <SelectItem key={municipality.id} value={municipality.name}>
                {municipality.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}