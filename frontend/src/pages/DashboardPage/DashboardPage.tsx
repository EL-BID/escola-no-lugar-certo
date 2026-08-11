import { EducationMap } from '@/components/maps/EducationMap';
import { BrandHeader } from '@/components/layout/BrandHeader';
import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { useHexagonData } from '@/hooks/api';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SlidersHorizontal, Check, Calculator, Loader2, HelpCircle, Maximize2, Minimize2, ChevronLeft, ChevronRight, Scan, X, AlertTriangle } from 'lucide-react';
import { StateSelector } from '@/components/controls/StateSelector';
import { MunicipalitySelector } from '@/components/controls/MunicipalitySelector';
import { EducationLevelSelector } from '@/components/controls/EducationLevelSelector';
import { ResolutionSelector } from '@/components/controls/ResolutionSelector';
import { NeededClassroomsCalculator } from '@/components/calculator/NeededClassroomsCalculator';
import { HistogramWidget, InfoWidget, ReportGenerator, ReportModal } from '@/components/widgets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { queryClient } from '@/lib/api/client';

const DASHBOARD_PAGE_SIZE = 2000;
const SOURCE_HEXAGON_RESOLUTION = 8;
const CONTROL_HEADER_HIDE_KEY = 'edu-brazil-hide-control-header';
const PANEL_EXPAND_CONTENT_DELAY_MS = 220;
const SLOW_LOADING_WARNING_MS = 45000;

function estimateHexagonsFromRes8(countRes8: number, targetResolution: number): number {
  if (countRes8 <= 0) {
    return 0;
  }

  if (targetResolution === SOURCE_HEXAGON_RESOLUTION) {
    return countRes8;
  }

  const delta = SOURCE_HEXAGON_RESOLUTION - targetResolution;
  if (delta > 0) {
    return Math.max(1, Math.round(countRes8 / Math.pow(7, delta)));
  }

  return Math.round(countRes8 * Math.pow(7, Math.abs(delta)));
}

export function DashboardPage() {
  const [showControlHeader, setShowControlHeader] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(CONTROL_HEADER_HIDE_KEY) !== '1';
  });
  const [showExpandedControls, setShowExpandedControls] = useState(true);
  const [showExpandedCalculator, setShowExpandedCalculator] = useState(true);
  const [showSlowLoadingWarning, setShowSlowLoadingWarning] = useState(false);
  const [dontShowControlHeaderAgain, setDontShowControlHeaderAgain] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CONTROL_HEADER_HIDE_KEY) === '1';
  });

  const {
    appliedState,
    appliedMunicipality,
    appliedEducationLevels,
    selectedEducationLevels,
    appliedMapResolution,
    applyFilters,
    calculatorExpanded,
    controlsCollapsed,
    calculatorCollapsed,
    setControlsCollapsed,
    setCalculatorCollapsed,
    resetSelections,
    stateHexagonCountRes8ByState,
  } = useDashboardStore();

  useEffect(() => {
    if (controlsCollapsed) {
      setShowExpandedControls(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowExpandedControls(true);
    }, PANEL_EXPAND_CONTENT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [controlsCollapsed]);

  useEffect(() => {
    if (calculatorCollapsed) {
      setShowExpandedCalculator(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowExpandedCalculator(true);
    }, PANEL_EXPAND_CONTENT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [calculatorCollapsed]);

  const effectiveResolution = appliedMunicipality?.code_ibge ? appliedMapResolution : 5;
  const municipalityRes8Count = appliedMunicipality?.hexagon_counts_by_resolution?.['8'] ?? 0;
  const stateRes8Count = appliedState?.code
    ? (stateHexagonCountRes8ByState[appliedState.code] ?? 0)
    : 0;
  const baseRes8Count = appliedMunicipality?.code_ibge ? municipalityRes8Count : stateRes8Count;
  const estimatedTotalHint = baseRes8Count > 0
    ? estimateHexagonsFromRes8(baseRes8Count, effectiveResolution)
    : undefined;

  const { data: hexagonData, isFetching, isError, error, refetch, loadProgress } = useHexagonData({
    state: appliedState?.code || '',
    municipality_code: appliedMunicipality?.code_ibge || undefined,
    resolution: appliedMapResolution,
    education_levels: appliedEducationLevels,
    page_size: DASHBOARD_PAGE_SIZE,
    parallel_page_requests: 4,
    initial_total_hint: estimatedTotalHint,
  });

  const progressPercent = Math.max(0, Math.min(100, loadProgress.percent || 0));
  const displayProgressPercent = isFetching
    ? Math.max(1, progressPercent)
    : progressPercent;
  const totalHexagons = loadProgress.total ?? 0;
  const loadedHexagons = loadProgress.loaded;
  const hasDeterminateProgress = loadProgress.total != null && totalHexagons > 0;
  const isEstimatedTotal = loadProgress.isEstimatedTotal;
  const hasMapData = !!(hexagonData?.results && hexagonData.results.length > 0);
  const isMapLoadInProgress =
    isFetching || (loadProgress.phase !== 'idle' && !loadProgress.isComplete);
  const progressCounterText = hasDeterminateProgress
    ? `${loadedHexagons} / ${totalHexagons}`
    : (isEstimatedTotal && totalHexagons > 0 ? `0 / ~${totalHexagons}` : 'Estimando total...');
  const loadingErrorMessage = error instanceof Error
    ? error.message
    : 'Falha ao carregar dados do mapa.';

  const mapData = hexagonData ?? { results: [] };

  useEffect(() => {
    if (!isMapLoadInProgress) {
      setShowSlowLoadingWarning(false);
      return;
    }

    setShowSlowLoadingWarning(false);
    const timer = window.setTimeout(() => {
      setShowSlowLoadingWarning(true);
    }, SLOW_LOADING_WARNING_MS);

    return () => window.clearTimeout(timer);
  }, [
    isMapLoadInProgress,
    appliedState?.code,
    appliedMunicipality?.id,
    appliedMapResolution,
    appliedEducationLevels,
  ]);

  // Ref for scrolling to dashboard
  const dashboardRef = useRef<HTMLDivElement>(null);

  const scrollToDashboard = useCallback((behavior: ScrollBehavior = 'smooth') => {
    dashboardRef.current?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  useEffect(() => {
    const timers: number[] = [];

    const ensureDashboardInView = () => {
      const node = dashboardRef.current;
      if (!node) return;

      // Only force-scroll when the dashboard is visibly shifted from the top.
      if (Math.abs(node.getBoundingClientRect().top) > 2) {
        node.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    };

    // Retry a few times because external header/footer can mount after initial paint.
    [0, 120, 320, 700, 1400].forEach((delay) => {
      timers.push(window.setTimeout(ensureDashboardInView, delay));
    });

    const handleLoad = () => ensureDashboardInView();
    window.addEventListener('load', handleLoad);

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener('load', handleLoad);
    };
  }, [scrollToDashboard]);

  const selectedLevelCount = Math.max(
    1,
    (selectedEducationLevels?.length || appliedEducationLevels?.length || 1),
  );

  const floatingCalculatorWidthClass = useMemo(() => {
    if (calculatorCollapsed) {
      return 'w-12';
    }

    if (calculatorExpanded) {
      if (selectedLevelCount <= 1) {
        return 'w-[min(24rem,calc(100vw-1.5rem))] lg:w-[24rem]';
      }
      if (selectedLevelCount === 2) {
        return 'w-[min(32rem,calc(100vw-1.5rem))] lg:w-[32rem]';
      }
      if (selectedLevelCount === 3) {
        return 'w-[min(40rem,calc(100vw-1.5rem))] lg:w-[40rem]';
      }
      return 'w-[min(48rem,calc(100vw-1.5rem))] lg:w-[48rem]';
    }

    return 'w-[min(23rem,calc(100vw-1.5rem))] lg:w-[23rem]';
  }, [calculatorCollapsed, calculatorExpanded, selectedLevelCount]);

  const sidePanelCollapsedCenterClass = 'md:top-1/2 md:-translate-y-1/2';
  const sidePanelExpandedCenterClass = 'top-[6.5rem] md:top-1/2 md:-translate-y-1/2';
  const sidePanelLeftInsetClass = 'left-3 md:left-4';
  const sidePanelRightInsetClass = 'right-3 md:right-4';

  const setControlHeaderPersistence = useCallback((persist: boolean) => {
    if (typeof window === 'undefined') return;

    if (persist) {
      window.localStorage.setItem(CONTROL_HEADER_HIDE_KEY, '1');
    } else {
      window.localStorage.removeItem(CONTROL_HEADER_HIDE_KEY);
    }
  }, []);

  const handleControlHeaderClose = useCallback(() => {
    setControlHeaderPersistence(dontShowControlHeaderAgain);
    setShowControlHeader(false);
  }, [dontShowControlHeaderAgain, setControlHeaderPersistence]);

  const handleDontShowControlHeaderAgainChange = useCallback((checked: boolean) => {
    setDontShowControlHeaderAgain(checked);
    setControlHeaderPersistence(checked);
  }, [setControlHeaderPersistence]);

  const handleExpandControls = useCallback(() => {
    setControlsCollapsed(false);
  }, [setControlsCollapsed]);

  const handleCollapseControls = useCallback(() => {
    setShowExpandedControls(false);
    setControlsCollapsed(true);
  }, [setControlsCollapsed]);

  const handleExpandCalculator = useCallback(() => {
    setCalculatorCollapsed(false);
  }, [setCalculatorCollapsed]);

  const handleCollapseCalculator = useCallback(() => {
    setShowExpandedCalculator(false);
    setCalculatorCollapsed(true);
  }, [setCalculatorCollapsed]);

  const cancelInFlightDashboardQueries = useCallback(async () => {
    await Promise.allSettled([
      queryClient.cancelQueries({ queryKey: ['hexagon-data'] }),
      queryClient.cancelQueries({ queryKey: ['state-baseline'] }),
      queryClient.cancelQueries({ queryKey: ['municipality-baseline'] }),
    ]);
  }, []);

  const handleApplyFilters = useCallback(async () => {
    await cancelInFlightDashboardQueries();
    applyFilters();
  }, [cancelInFlightDashboardQueries, applyFilters]);

  const handleResetSelections = useCallback(async () => {
    await cancelInFlightDashboardQueries();
    resetSelections();
  }, [cancelInFlightDashboardQueries, resetSelections]);

  const controlsExpanding = !controlsCollapsed && !showExpandedControls;
  const calculatorExpanding = !calculatorCollapsed && !showExpandedCalculator;

  const calculatorPanel = (
    <Card
      className={cn(
        'overflow-hidden bg-card/95 shadow-lg backdrop-blur-sm transition-[width] duration-300 ease-in-out',
        calculatorCollapsed ? 'w-12' : 'w-full'
      )}
    >
      {calculatorCollapsed ? (
        <div className="h-full flex items-center justify-center p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleExpandCalculator}
                className="p-2 hover:bg-muted rounded-lg transition-colors flex items-center justify-center"
                aria-label="Expandir calculadora"
              >
                <Calculator className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Expandir calculadora</TooltipContent>
          </Tooltip>
        </div>
      ) : calculatorExpanding ? (
        <>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="h-5 w-44 rounded bg-muted/80 animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-muted/80 animate-pulse" />
                <div className="h-7 w-7 rounded-full bg-muted/80 animate-pulse" />
                <div className="h-7 w-7 rounded-full bg-muted/80 animate-pulse" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="h-8 w-full rounded bg-muted/80 animate-pulse" />
            <div className="h-8 w-full rounded bg-muted/80 animate-pulse" />
            <div className="h-8 w-full rounded bg-muted/80 animate-pulse" />
            <div className="h-px w-full bg-border/70" />
            <div className="h-8 w-full rounded bg-muted/80 animate-pulse" />
            <div className="h-8 w-full rounded bg-muted/80 animate-pulse" />
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm leading-tight">
              <Calculator className="h-4 w-4" />
              Calculadora de Necessidades
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    aria-label="Ajuda da calculadora"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  Ajuste os parâmetros educacionais para calcular as necessidades de infraestrutura.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => useDashboardStore.getState().setCalculatorExpanded(!calculatorExpanded)}
                    className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-muted transition-colors"
                    aria-label={calculatorExpanded ? 'Compactar calculadora' : 'Expandir calculadora'}
                  >
                    {calculatorExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{calculatorExpanded ? 'Compactar' : 'Expandir'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCollapseCalculator}
                    className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-muted transition-colors"
                    aria-label="Minimizar calculadora"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Minimizar</TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0 max-h-[calc(100svh-8rem)] overflow-y-auto overflow-x-hidden">
            <NeededClassroomsCalculator />
          </CardContent>
        </>
      )}
    </Card>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div ref={dashboardRef} id="dashboard" className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-background">
      <div className="absolute inset-0">
        <EducationMap
          hexagonData={mapData}
          selectedEducationLevel={appliedEducationLevels[0] ?? 'INF_CRE'}
        />

        {isError && !isMapLoadInProgress && !hasMapData && (
          <div className="absolute inset-0 bg-background/55 backdrop-blur-sm flex items-center justify-center z-20">
            <Card className="bg-card/95 shadow-lg p-6 w-[min(30rem,92%)]">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <p className="text-sm font-medium">Não foi possível carregar os dados do mapa</p>
                <p className="text-xs text-muted-foreground">{loadingErrorMessage}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            </Card>
          </div>
        )}

        {isMapLoadInProgress && !hasMapData && (
          <div className="absolute inset-0 bg-background/55 backdrop-blur-sm flex items-center justify-center z-20">
            <Card className="bg-card/95 shadow-lg backdrop-blur-sm p-6 w-[min(28rem,92%)]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm font-medium">Atualizando dados do mapa...</p>
                {showSlowLoadingWarning && (
                  <p className="text-xs text-amber-600 text-center">
                    Esta consulta está demorando mais do que o normal. Você pode aguardar ou reduzir o detalhamento.
                  </p>
                )}
                <div className="w-full">
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                    <span>
                      {displayProgressPercent}% concluido
                      {isEstimatedTotal ? ' (estimado)' : ''}
                    </span>
                    <span>{progressCounterText}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${displayProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {isMapLoadInProgress && hasMapData && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(28rem,92%)]">
            <Card className="bg-card/95 shadow-lg backdrop-blur-sm px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <p className="text-xs font-medium">Atualizando dados do mapa...</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {displayProgressPercent}%
                  {isEstimatedTotal ? ' (est.)' : ''}
                </span>
              </div>
              {showSlowLoadingWarning && (
                <div className="text-[11px] text-amber-600 mb-2">
                  Consulta lenta detectada. Considere reduzir o detalhamento para acelerar.
                </div>
              )}
              <>
                <div className="text-[11px] text-muted-foreground mb-1">
                  {progressCounterText} hexagonos
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${displayProgressPercent}%` }}
                  />
                </div>
              </>
            </Card>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="pointer-events-auto absolute left-3 top-3 md:left-4 md:top-4">
          <BrandHeader />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card
              className="pointer-events-auto absolute right-3 top-3 md:right-4 md:top-4 bg-card/95 shadow-lg backdrop-blur-sm cursor-pointer hover:bg-accent transition-colors"
              onClick={() => scrollToDashboard()}
              role="button"
              tabIndex={0}
              aria-label="Rolar para o painel"
            >
              <div className="p-2">
                <Scan className="h-5 w-5" />
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Centralizar painel</TooltipContent>
        </Tooltip>

        {showControlHeader && (
          <Card className="pointer-events-auto absolute left-1/2 top-3 md:top-4 -translate-x-1/2 w-[min(26rem,calc(100vw-8rem))] bg-card/95 shadow-lg backdrop-blur-sm">
            <CardContent className="relative py-3">
              <div className="space-y-1 pr-7">
                <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                  Painel de Controle Educacional
                </h2>
                <p className="text-sm font-medium text-foreground/85">
                  Visualize necessidade de novas salas de aula com base na capacidade atual e na demanda por região.
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleControlHeaderClose}
                    className="absolute right-2 top-2 inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Fechar painel de controle educacional"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Fechar</TooltipContent>
              </Tooltip>

              <div className="mt-2 pt-2 border-t border-border/60">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dontShowControlHeaderAgain}
                    onChange={(e) => handleDontShowControlHeaderAgainChange(e.target.checked)}
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  Não mostrar novamente
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={cn(
          'pointer-events-auto absolute transition-[width,transform,top] duration-300 ease-in-out',
          sidePanelLeftInsetClass,
          controlsCollapsed ? sidePanelCollapsedCenterClass : sidePanelExpandedCenterClass,
          controlsCollapsed ? 'w-12' : 'w-[min(23rem,calc(100vw-1.5rem))] lg:w-[22rem]'
        )}>
          <Card className={cn(
            'overflow-hidden bg-card/95 shadow-lg backdrop-blur-sm transition-[width] duration-300 ease-in-out',
            controlsCollapsed ? 'w-12' : 'w-full'
          )}>
            {controlsCollapsed ? (
              <div className="h-full flex items-center justify-center p-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleExpandControls}
                      className="p-2 hover:bg-muted rounded-lg transition-colors flex items-center justify-center"
                      aria-label="Expandir controles"
                    >
                      <SlidersHorizontal className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Expandir controles</TooltipContent>
                </Tooltip>
              </div>
            ) : controlsExpanding ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-28 rounded bg-muted/80 animate-pulse" />
                    <div className="h-7 w-7 rounded-full bg-muted/80 animate-pulse" />
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="h-3 w-full rounded bg-muted/70 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-muted/70 animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <div className="h-14 w-full rounded bg-muted/80 animate-pulse" />
                  <div className="h-14 w-full rounded bg-muted/80 animate-pulse" />
                  <div className="h-14 w-full rounded bg-muted/80 animate-pulse" />
                  <div className="h-14 w-full rounded bg-muted/80 animate-pulse" />
                  <div className="h-10 w-full rounded bg-muted/80 animate-pulse" />
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="flex items-center gap-2 text-sm leading-tight">
                    <SlidersHorizontal className="h-4 w-4" />
                    Controles
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex text-muted-foreground hover:text-foreground transition-colors ml-auto"
                          aria-label="Ajuda dos controles"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                        <div className="space-y-3">
                          <p>
                            Os hexágonos no mapa representam a densidade de necessidades educacionais dos níveis de ensino selecionados.
                          </p>
                          <p className="font-semibold">
                            Configure os filtros de visualização e clique em Aplicar para atualizar o mapa.
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleCollapseControls}
                          className="inline-flex items-center justify-center rounded-full p-1.5 hover:bg-muted transition-colors"
                          aria-label="Minimizar controles"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Minimizar</TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 pt-0 max-h-[calc(100svh-11rem)] overflow-auto">
                  <StateSelector />
                  <MunicipalitySelector />
                  <EducationLevelSelector />
                  <ResolutionSelector />

                  <div className="pt-2 space-y-2">
                    <Button
                      size="lg"
                      variant="default"
                      aria-label="Aplicar os filtros de Estado/Município e atualizar o mapa"
                      className="w-full bg-blue-500 text-white hover:bg-blue-600 hover:text-white"
                      onClick={handleApplyFilters}
                    >
                      {isMapLoadInProgress ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {`Atualizando... ${displayProgressPercent}%`}
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Aplicar
                        </>
                      )}
                    </Button>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleResetSelections}
                        className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>

        <div className={cn(
          'pointer-events-auto absolute transition-all duration-300 ease-in-out',
          calculatorCollapsed
            ? cn(sidePanelRightInsetClass, sidePanelCollapsedCenterClass, 'w-12')
            : cn(sidePanelRightInsetClass, 'bottom-20 md:bottom-auto md:top-1/2 md:-translate-y-1/2', floatingCalculatorWidthClass)
        )}>
          {calculatorPanel}
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(58rem,calc(100vw-1.5rem))]">
          <div className="flex flex-wrap items-end justify-center gap-2 md:gap-3">
            <InfoWidget />
            <HistogramWidget />
            <ReportGenerator />
          </div>
        </div>
      </div>

      <ReportModal />
      </div>
    </TooltipProvider>
  );
}
