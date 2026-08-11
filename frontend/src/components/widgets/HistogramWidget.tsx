import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { BarChart3, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { useHexagonData, useMunicipalityBaseline, useStateBaseline } from '@/hooks/api';
import { LEVELS, buildEditableDefaults, computeTable } from '@/lib/educationCalculator';
import { computeExtrasPerHex, featuresToPerHexRows } from '@/lib/hexExtras';
import type { EducationLevel, HexagonFeature } from '@/types/api';
import { interpolateRdYlGn } from 'd3-scale-chromatic';

interface HistogramData {
  bin: string;
  count: number;
  value: number; // Numeric value for the bin
}

export function HistogramWidget() {
  const {
    appliedState,
    appliedMunicipality,
    appliedEducationLevels,
    selectedEducationLevels,
    appliedMapResolution,
    filterRange,
    updateFilterRange,
    calculatorInputs,
    calculatorComputed,
  } = useDashboardStore();

  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch hexagon data (cached via react-query with same key as map)
  const { data: hexagonData } = useHexagonData({
    state: appliedState?.code || '',
    municipality_code: appliedMunicipality?.code_ibge || undefined,
    resolution: appliedMapResolution,
    education_levels: appliedEducationLevels,
    page_size: 2000,
    parallel_page_requests: 4,
  });

  // Extract features array
  const features = useMemo<HexagonFeature[]>(() => {
    if (!hexagonData) return [];
    return hexagonData.results;
  }, [hexagonData]);

  // Baseline for defaults when calculator is not ready
  const municipalityId = appliedMunicipality?.id ?? null;
  const { data: municipalityBaseline } = useMunicipalityBaseline(municipalityId);
  const { data: stateBaseline } = useStateBaseline(!municipalityId ? appliedState?.code || null : null);
  const baselineData = municipalityBaseline || stateBaseline;

  // Build parameters (reuse live calculator values when available)
  const tableParams = useMemo(() => {
    if (calculatorInputs && calculatorComputed) {
      const studentsPublic = {} as Record<EducationLevel, number>;
      const existingClassrooms = {} as Record<EducationLevel, number>;
      const pctIntegral = {} as Record<EducationLevel, number>;
      const pctNocturnal = {} as Record<EducationLevel, number>;
      const seatsPerClass = {} as Record<EducationLevel, number>;
      for (const lvl of LEVELS) {
        studentsPublic[lvl] = calculatorComputed.byLevel[lvl].studentsPublic;
        existingClassrooms[lvl] = calculatorInputs.existingClassrooms[lvl];
        pctIntegral[lvl] = calculatorInputs.pctIntegral[lvl];
        pctNocturnal[lvl] = calculatorInputs.pctNocturnal[lvl];
        seatsPerClass[lvl] = calculatorInputs.seatsPerClass[lvl];
      }
      return { studentsPublic, existingClassrooms, pctIntegral, pctNocturnal, seatsPerClass };
    }
    if (!baselineData?.levels) return null;
    const defaults = buildEditableDefaults(baselineData.levels);
    const studentsPublic = {} as Record<EducationLevel, number>;
    const existingClassrooms = {} as Record<EducationLevel, number>;
    const pctIntegral = {} as Record<EducationLevel, number>;
    const pctNocturnal = {} as Record<EducationLevel, number>;
    const seatsPerClass = {} as Record<EducationLevel, number>;
    const computed = computeTable(defaults);
    for (const lvl of LEVELS) {
      studentsPublic[lvl] = computed.byLevel[lvl].studentsPublic;
      existingClassrooms[lvl] = defaults.existingClassrooms[lvl];
      pctIntegral[lvl] = defaults.pctIntegral[lvl];
      pctNocturnal[lvl] = defaults.pctNocturnal[lvl];
      seatsPerClass[lvl] = defaults.seatsPerClass[lvl];
    }
    return { studentsPublic, existingClassrooms, pctIntegral, pctNocturnal, seatsPerClass };
  }, [calculatorInputs, calculatorComputed, baselineData?.levels]);

  // Histogram and slider use the same rounded missing-classroom value as the map.
  const totals = useMemo(() => {
    if (!features.length || !tableParams) return [] as number[];
    const rows = featuresToPerHexRows(features);
    const levelsForHistogram = (selectedEducationLevels?.length
      ? selectedEducationLevels
      : (appliedEducationLevels?.length ? appliedEducationLevels : LEVELS)) as EducationLevel[];
    const extras = computeExtrasPerHex(rows, tableParams, levelsForHistogram);
    return extras.map((e) => e.classroomsNeeded);
  }, [features, tableParams, appliedEducationLevels, selectedEducationLevels]);

  const positives = useMemo(() => totals.filter((v) => v > 0), [totals]);
  const maxExtra = useMemo(() => (positives.length ? Math.max(...positives) : 0), [positives]);
  const minPositive = useMemo(() => (positives.length ? Math.min(...positives) : 0), [positives]);
  // First bin starts at the smaller of 1 and the minimum missing-classroom value.
  const minDomain = useMemo(() => (minPositive > 0 ? Math.min(1, minPositive) : 0), [minPositive]);

  // Initialize filter range to full data range when data changes
  // Only reset when the data domain changes significantly (new municipality/state)
  const prevDomainRef = useRef<{ min: number, max: number } | null>(null);

  useEffect(() => {
    if (positives.length > 0) {
      const lower = Math.max(0, minDomain);
      const upper = Math.max(0, maxExtra);

      // Check if this is a significant domain change (new data loaded)
      const isDomainChange = !prevDomainRef.current ||
        Math.abs(prevDomainRef.current.min - lower) > 0.1 ||
        Math.abs(prevDomainRef.current.max - upper) > 0.1;

      if (isDomainChange) {
        prevDomainRef.current = { min: lower, max: upper };
        updateFilterRange([lower, upper]);
      }
    }
  }, [minDomain, maxExtra, positives.length, updateFilterRange]);

  // Clamp filter range to current domain
  // Local slider state for smoother interaction (avoid heavy map re-renders on every drag)
  const clampedRange = useMemo(() => {
    const [min, max] = filterRange;
    const lower = Math.max(0, minDomain);
    const upper = Math.max(0, maxExtra);
    const newMin = Math.max(lower, Math.min(min, upper));
    const newMax = Math.max(lower, Math.min(max, upper));
    return (newMin <= newMax ? [newMin, newMax] : [lower, upper]) as [number, number];
  }, [filterRange, minDomain, maxExtra]);

  const [pendingRange, setPendingRange] = useState<[number, number]>(clampedRange);

  // Keep pendingRange in sync when external resets happen (new data domain)
  useEffect(() => {
    setPendingRange(clampedRange);
  }, [clampedRange]);

  // Shared bin info (aligns ticks, slider step, and histogram)
  const binsInfo = useMemo(() => {
    const maxVal = Math.max(0, maxExtra);
    if (maxVal === 0) return null as null | { start: number; maxVal: number; binWidth: number; nBins: number; boundaries: number[] };
    const start = Math.max(0, minDomain);
    const span = Math.max(0, maxVal - start);
    const desiredBins = 20;
    const binWidth = Math.max(1, Math.ceil((span || 1) / desiredBins));
    const nBins = Math.max(1, Math.ceil((span || 1) / binWidth));
    const boundaries = Array.from({ length: nBins + 1 }, (_, i) => {
      const v = start + i * binWidth;
      return v > maxVal ? maxVal : v;
    });
    return { start, maxVal, binWidth, nBins, boundaries };
  }, [minDomain, maxExtra]);

  // Build histogram bins from totals
  const histogramData: HistogramData[] = useMemo(() => {
    if (!binsInfo) return [];
    const { start, maxVal, binWidth, nBins } = binsInfo;
    const bins = new Array(nBins).fill(0).map((_, i) => {
      const s = Math.floor(start + i * binWidth);
      const e = Math.ceil(Math.min(maxVal, s + binWidth));
      return { bin: `${s}-${e}`, value: s, count: 0 } as HistogramData;
    });
    for (const v of positives) {
      const idx = Math.min(nBins - 1, Math.floor((v - start) / binWidth));
      if (idx >= 0 && idx < nBins) bins[idx].count += 1;
    }
    // Show only bins with > 0 values
    return bins.filter((b) => b.count > 0);
  }, [positives, binsInfo]);

  const maxCount = histogramData.length ? Math.max(...histogramData.map((d) => d.count)) : 0;

  // Decide which boundary labels to show to avoid overlap when many bins
  const displayedBoundaryLabels = useMemo(() => {
    if (!binsInfo) return [] as number[];
    const boundaries = binsInfo.boundaries;
    const maxLabels = 10; // heuristic maximum labels to display
    if (boundaries.length <= maxLabels) return boundaries;
    const step = (boundaries.length - 1) / (maxLabels - 1);
    const selected: number[] = [];
    for (let i = 0; i < maxLabels; i++) {
      const idx = Math.round(i * step);
      selected.push(boundaries[idx]);
    }
    return selected;
  }, [binsInfo]);

  const isInRange = (value: number) => value >= pendingRange[0] && value <= pendingRange[1];

  // Debounce timer ref for fallback commit
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRangeChange = (values: number[]) => {
    if (values.length === 2) {
      setPendingRange([values[0], values[1]] as [number, number]);

      // Clear any pending timeout
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }

      // Set a debounced fallback commit in case onValueCommit doesn't fire
      commitTimeoutRef.current = setTimeout(() => {
        updateFilterRange([values[0], values[1]] as [number, number]);
      }, 150); // 150ms debounce
    }
  };

  const handleRangeCommit = (values: number[]) => {
    // Clear the debounce timeout since we got an explicit commit
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }

    if (values.length === 2) {
      updateFilterRange([values[0], values[1]] as [number, number]);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  // Check if data is available
  const hasData = features.length > 0 && tableParams && totals.length > 0;

  return (
    <TooltipProvider delayDuration={120}>
      <Card className="w-80 bg-card/95 shadow-lg backdrop-blur-sm">
        <CardHeader className={`${isExpanded ? 'pb-3' : 'py-4'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm flex items-center leading-none">
              <BarChart3 className="mr-2 h-4 w-4" />
              Filtro do Salas Necessárias
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Ajuda do filtro de salas necessárias"
                  className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">
                Visualize como as necessidades educacionais estão distribuídas geograficamente.
              </TooltipContent>
            </Tooltip>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-0 ${isExpanded ? 'h-6 w-6' : 'h-5 w-5'} transition-all duration-300 ease-in-out`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && !hasData && (
        <CardContent className="pb-4">
          <div className="text-sm text-muted-foreground">
            Selecione um estado ou município e clique em "Aplicar" para visualizar o filtro.
          </div>
        </CardContent>
      )}
      {isExpanded && hasData && (
        <CardContent
          className="space-y-3 overflow-hidden transition-all duration-400 ease-[cubic-bezier(.25,.8,.25,1)] opacity-100 max-h-[420px] translate-y-0"
        >
          {/* Selection count */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Hexágonos na seleção</div>
            <div className="font-semibold">{totals.filter((v) => isInRange(v)).length}</div>
          </div>

          {/* Histogram */}
          <div className="h-32 flex items-end justify-between gap-0.5 pt-6">
            {histogramData.map((item, index) => {
              const height = maxCount ? (item.count / maxCount) * 100 : 0;
              const inRange = isInRange(item.value);
              // Compute color using same palette as map (RdYlGn reversed)
              const start = binsInfo?.start ?? 0;
              const maxVal = binsInfo?.maxVal ?? 1;
              const width = binsInfo?.binWidth ?? 1;
              const mid = item.value + width / 2;
              const t = Math.max(0, Math.min(1, (maxVal - start) ? (mid - start) / (maxVal - start) : 0));
              const color = interpolateRdYlGn(1 - t);

              return (
                <div
                  key={index}
                  className="flex-1 relative group h-full flex flex-col justify-end"
                  aria-label={`${item.bin}: ${item.count} hexágonos`}
                >
                  <div
                    className="w-full rounded-t transition-all"
                    style={{ height: `${height}%`, backgroundColor: color, opacity: inRange ? 1 : 0.35 }}
                  />
                  {/* Tooltip on hover (above the bar so it doesn't overlap slider) */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-40">
                    <div className="rounded border border-slate-300/90 bg-[hsl(var(--background)/0.98)] px-2 py-1 text-xs text-[hsl(var(--foreground))] shadow-lg ring-1 ring-black/5 whitespace-nowrap">
                      {item.bin}: {item.count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Numeric tick labels aligned with bins (highlight selected boundaries) */}
          {binsInfo && (
            <div className="relative h-5 mt-1 mb-1">
              {/* Minor tick marks (no labels) */}
              {binsInfo.boundaries.map((b, i) => {
                const left = ((b - binsInfo.start) / (binsInfo.maxVal - binsInfo.start || 1)) * 100;
                return (
                  <span
                    key={`tick-${b}-${i}`}
                    style={{ left: `${left}%`, bottom: 0, height: '4px' }}
                    className="absolute -translate-x-1/2 w-px bg-border"
                  />
                );
              })}
              {/* Condensed labels */}
              {displayedBoundaryLabels.map((b, i) => {
                const left = ((b - binsInfo.start) / (binsInfo.maxVal - binsInfo.start || 1)) * 100;
                const isSelected = b === pendingRange[0] || b === pendingRange[1];
                const label = Math.ceil(b).toString();
                return (
                  <span
                    key={`label-${b}-${i}`}
                    className={`absolute -translate-x-1/2 text-[10px] leading-3 whitespace-nowrap ${isSelected ? 'text-blue-600 font-semibold' : 'text-muted-foreground/70'}`}
                    style={{ left: `${left}%`, bottom: 0 }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Range slider - Always at bottom (no header/labels) */}
          <div className="pt-2">
            <Slider
              size="sm"
              min={binsInfo ? binsInfo.start : Math.max(0, minDomain)}
              max={binsInfo ? binsInfo.maxVal : Math.max(0, maxExtra)}
              // For smoother feel, constrain step to at most binWidth but not exceed 5
              step={binsInfo ? Math.min(binsInfo.binWidth, 5) : 1}
              value={pendingRange}
              onValueChange={handleRangeChange}
              onValueCommit={handleRangeCommit}
              className="w-full"
            />
          </div>
        </CardContent>
      )}
      </Card>
    </TooltipProvider>
  );
}
