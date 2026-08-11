import { useQuery, useMutation } from '@tanstack/react-query';
import type { Feature as GeoJSONFeature } from 'geojson';
import { useEffect, useMemo } from 'react';
import { apiClient, queryClient } from '../../lib/api/client';
import type {
  StatesResponse,
  MunicipalitiesResponse,
  HexagonDataResponse,
  HexagonDataParams,
  CalculateNeedsRequest,
  CalculateNeedsResponse,
  AnalyticsSummaryResponse,
  AnalyticsHistogramResponse,
  AnalyticsParams,
  HistogramParams,
  MunicipalityBaselineResponse
  ,MunicipalityResolutionCountsResponse
} from '../../types/api';

export interface HexagonDataLoadProgress {
  loaded: number;
  total: number | null;
  totalAvailable: number | null;
  currentPage: number;
  totalPages: number | null;
  percent: number;
  isComplete: boolean;
  phase: 'idle' | 'counting' | 'loading' | 'complete';
  isEstimatedTotal: boolean;
}

export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: ({ signal }) => apiClient.get<StatesResponse>('/states/', undefined, { signal })
  });
}

export function useMunicipalities(
  stateCode: string | null,
  includeCounts: boolean = false,
  options?: {
    enabled?: boolean;
    staleTime?: number;
  }
) {
  return useQuery({
    queryKey: ['municipalities', stateCode, includeCounts ? 'with-counts' : 'no-counts'],
    queryFn: ({ signal }) => apiClient.get<MunicipalitiesResponse>(
      `/states/${stateCode}/municipalities/`,
      {
        include_counts: includeCounts,
      },
      { signal }
    ),
    enabled: (options?.enabled ?? true) && !!stateCode,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
    select: (data) => data.results,
  });
}

export function useHexagonData(
  params: HexagonDataParams & {
    page?: number;
    page_size?: number;
    fetch_all_pages?: boolean;
    count_before_first_page?: boolean;
    initial_total_hint?: number;
    parallel_page_requests?: number;
    enabled?: boolean;
  }
) {
  // Build stable primitives for query key to ensure cache reuse & instant display.
  // State-level: always resolution 5 (backend aggregates). Municipality: user-selected resolution.
  const effectiveResolution = params.municipality_code ? params.resolution : 5;
  const educationLevelsKey = [...params.education_levels].sort().join(',');
  const pageSize = params.page_size ?? 500;
  const pageKey = params.page ?? 1;
  const fetchAllPages = params.fetch_all_pages !== false && !params.page;
  const parallelPageRequests = Math.max(1, Math.min(params.parallel_page_requests ?? 4, 8));
  const countBeforeFirstPage = params.count_before_first_page === true;
  const initialTotalHint = typeof params.initial_total_hint === 'number' && params.initial_total_hint > 0
    ? Math.round(params.initial_total_hint)
    : null;

  const baseHexagonQueryKey = useMemo(
    () => [
      'hexagon-data',
      params.state || 'nostate',
      params.municipality_code || 'nomunicipality',
      effectiveResolution,
      educationLevelsKey,
      fetchAllPages ? 'all-pages' : 'single-page',
      countBeforeFirstPage ? 'count-first' : 'first-page-first',
      parallelPageRequests,
      pageKey,
      pageSize,
    ] as const,
    [
      params.state,
      params.municipality_code,
      effectiveResolution,
      educationLevelsKey,
      fetchAllPages,
      countBeforeFirstPage,
      parallelPageRequests,
      pageKey,
      pageSize,
    ]
  );

  const progressQueryKey = useMemo(
    () => [...baseHexagonQueryKey, 'progress'] as const,
    [baseHexagonQueryKey]
  );

  const initialProgress = useMemo<HexagonDataLoadProgress>(
    () => ({
      loaded: 0,
      total: initialTotalHint,
      totalAvailable: null,
      currentPage: 0,
      totalPages: null,
      percent: 0,
      isComplete: false,
      phase: params.state
        ? (fetchAllPages && countBeforeFirstPage ? 'counting' : 'loading')
        : 'idle',
      isEstimatedTotal: initialTotalHint != null,
    }),
    [params.state, fetchAllPages, countBeforeFirstPage, initialTotalHint]
  );

  const updateSharedProgress = (progress: HexagonDataLoadProgress) => {
    queryClient.setQueryData(progressQueryKey, progress);
  };

  const progressQuery = useQuery({
    queryKey: progressQueryKey,
    queryFn: async () => initialProgress,
    enabled: false,
    initialData: () => {
      const cached = queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined;
      return cached ?? initialProgress;
    },
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const current = queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined;

    if (
      current?.isComplete ||
      (current && (current.loaded > 0 || current.percent > 0))
    ) {
      return;
    }

    updateSharedProgress(initialProgress);
  }, [
    initialProgress,
    progressQueryKey,
  ]);

  const query = useQuery({
    queryKey: baseHexagonQueryKey,
    queryFn: async ({ signal }): Promise<HexagonDataResponse> => {
      const q: Record<string, string | number | boolean> = {
        resolution: effectiveResolution,
        education_levels: educationLevelsKey,
        page: pageKey,
        page_size: pageSize,
        compact: true,
      };
      if (params.state) q.state = params.state;
      if (params.municipality_code) q.municipality_code = params.municipality_code;

      let totalCountFromProbe: number | null = null;
      const useUnknownTotalPagination = fetchAllPages && !countBeforeFirstPage;
      if (useUnknownTotalPagination) {
        q.skip_total_count = true;
      }

      const currentProgress = (queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined) ?? initialProgress;
      const startupPercent = currentProgress.total && currentProgress.total > 0
        ? Math.max(currentProgress.percent, 1)
        : 0;
      const startupLoaded = currentProgress.total && startupPercent > 0
        ? Math.max(
            currentProgress.loaded,
            Math.max(1, Math.floor((currentProgress.total * startupPercent) / 100))
          )
        : currentProgress.loaded;

      updateSharedProgress({
        ...currentProgress,
        loaded: startupLoaded,
        currentPage: 0,
        percent: startupPercent,
        isComplete: false,
        phase: fetchAllPages && countBeforeFirstPage ? 'counting' : 'loading',
      });

      if (fetchAllPages && countBeforeFirstPage) {
        const current = (queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined) ?? initialProgress;
        updateSharedProgress({
          ...current,
          phase: 'counting',
          loaded: 0,
          percent: 0,
          currentPage: 0,
        });
      }

      // Preflight request to learn total count before fetching the first full page.
      // Uses count_only mode to avoid pulling the first page payload.
      if (fetchAllPages && countBeforeFirstPage) {
        const countProbe = await apiClient.get<HexagonDataResponse>(
          '/hexagons/education-data/',
          {
            ...q,
            count_only: true,
          },
          { signal }
        );

        const totalFromProbe = countProbe.metadata?.total_count ?? countProbe.count ?? 0;
        totalCountFromProbe = totalFromProbe;
        const plannedTotalPages = totalFromProbe > 0
          ? Math.max(1, Math.ceil(totalFromProbe / pageSize))
          : 1;

        q.skip_total_count = true;
        q.total_count_hint = totalFromProbe;

        updateSharedProgress({
          loaded: 0,
          total: totalFromProbe,
          totalAvailable: totalFromProbe,
          currentPage: 0,
          totalPages: plannedTotalPages,
          percent: 0,
          isComplete: totalFromProbe === 0,
          phase: totalFromProbe === 0 ? 'complete' : 'loading',
          isEstimatedTotal: false,
        });

        if (totalFromProbe === 0) {
          return {
            ...countProbe,
            count: 0,
            metadata: {
              ...countProbe.metadata,
              state: countProbe.metadata?.state ?? (params.state || ''),
              resolution: countProbe.metadata?.resolution ?? effectiveResolution,
              page: 1,
              page_size: pageSize,
              total_pages: 1,
              total_count: 0,
              has_next: false,
              has_previous: false,
            },
            results: [],
          } as HexagonDataResponse;
        }
      }

      const firstPage = await apiClient.get<HexagonDataResponse>(
        '/hexagons/education-data/',
        q,
        { signal }
      );
      const firstResults = Array.isArray(firstPage.results) ? firstPage.results : [];
      const totalCountFromResponse = firstPage.metadata?.total_count ?? firstPage.count ?? null;
      const totalCount = totalCountFromProbe ?? totalCountFromResponse;
      const totalPages = totalCount != null
        ? (fetchAllPages
          ? Math.max(1, Math.ceil(totalCount / pageSize))
          : (firstPage.metadata?.total_pages ?? 1))
        : null;
      const hasNextAfterFirstPage = !!firstPage.metadata?.has_next;

      const progressTotal = totalCount ?? initialTotalHint ?? null;
      const initialPercent = progressTotal && progressTotal > 0
        ? Math.min(hasNextAfterFirstPage ? 99 : 100, Math.round((firstResults.length / progressTotal) * 100))
        : 0;

      updateSharedProgress({
        loaded: firstResults.length,
        total: progressTotal,
        totalAvailable: totalCount,
        currentPage: firstPage.metadata?.page ?? pageKey,
        totalPages,
        percent: initialPercent,
        isComplete: !fetchAllPages || !hasNextAfterFirstPage,
        phase: !fetchAllPages || !hasNextAfterFirstPage ? 'complete' : 'loading',
        isEstimatedTotal: totalCount == null && initialTotalHint != null,
      });

      if (!fetchAllPages || !hasNextAfterFirstPage) {
        return firstPage;
      }

      const runBackgroundMerge = async () => {
        try {
          if (useUnknownTotalPagination) {
            const mergedResults = [...firstResults];
            let nextPage = (firstPage.metadata?.page ?? 1) + 1;
            let hasNext: boolean = hasNextAfterFirstPage;

            while (hasNext) {
              const nextPagePayload = await apiClient.get<HexagonDataResponse>(
                '/hexagons/education-data/',
                {
                  ...q,
                  page: nextPage,
                },
                { signal }
              );

              const nextResults = Array.isArray(nextPagePayload.results) ? nextPagePayload.results : [];
              mergedResults.push(...nextResults);
              hasNext = !!nextPagePayload.metadata?.has_next;

              const estimatedTotal = initialTotalHint ?? null;
              const percent = estimatedTotal && estimatedTotal > 0
                ? Math.min(hasNext ? 99 : 100, Math.round((mergedResults.length / estimatedTotal) * 100))
                : (hasNext ? 0 : 100);

              updateSharedProgress({
                loaded: mergedResults.length,
                total: estimatedTotal,
                totalAvailable: null,
                currentPage: nextPage,
                totalPages: null,
                percent,
                isComplete: !hasNext,
                phase: hasNext ? 'loading' : 'complete',
                isEstimatedTotal: estimatedTotal != null,
              });

              nextPage += 1;
            }

            const finalTotalCount = mergedResults.length;
            const finalTotalPages = Math.max(1, Math.ceil(finalTotalCount / pageSize));
            queryClient.setQueryData(baseHexagonQueryKey, {
              ...firstPage,
              count: finalTotalCount,
              metadata: {
                ...firstPage.metadata,
                state: firstPage.metadata?.state ?? (params.state || ''),
                resolution: firstPage.metadata?.resolution ?? effectiveResolution,
                page: 1,
                page_size: pageSize,
                total_pages: finalTotalPages,
                total_count: finalTotalCount,
                has_next: false,
                has_previous: false,
              },
              results: mergedResults,
            } as HexagonDataResponse);

            return;
          }

          const mergedResults = [...firstResults];
          const knownTotalCount = totalCount ?? firstResults.length;
          const knownTotalPages = totalPages ?? 1;
          const remainingPages = Array.from({ length: knownTotalPages - 1 }, (_, idx) => idx + 2);
          const pageResults = new Map<number, HexagonDataResponse['results']>();
          let loaded = firstResults.length;
          let completedPages = 1;

          const worker = async () => {
            while (remainingPages.length > 0) {
              const page = remainingPages.shift();
              if (!page) {
                return;
              }

              const nextPage = await apiClient.get<HexagonDataResponse>(
                '/hexagons/education-data/',
                {
                  ...q,
                  page,
                },
                { signal }
              );

              const nextResults = Array.isArray(nextPage.results) ? nextPage.results : [];
              pageResults.set(page, nextResults);
              loaded += nextResults.length;
              completedPages += 1;

              const percent = knownTotalCount > 0
                ? Math.min(100, Math.round((loaded / knownTotalCount) * 100))
                : 0;

              updateSharedProgress({
                loaded,
                total: knownTotalCount,
                totalAvailable: knownTotalCount,
                currentPage: completedPages,
                totalPages,
                percent,
                isComplete: completedPages === totalPages,
                phase: completedPages === totalPages ? 'complete' : 'loading',
                isEstimatedTotal: false,
              });
            }
          };

          await Promise.all(
            Array.from({ length: Math.min(parallelPageRequests, remainingPages.length) }, () => worker())
          );

          for (let page = 2; page <= knownTotalPages; page++) {
            const pageData = pageResults.get(page);
            if (pageData) {
              mergedResults.push(...pageData);
            }
          }

          queryClient.setQueryData(baseHexagonQueryKey, {
            ...firstPage,
            count: totalCount ?? mergedResults.length,
            metadata: {
              ...firstPage.metadata,
              state: firstPage.metadata?.state ?? (params.state || ''),
              resolution: firstPage.metadata?.resolution ?? effectiveResolution,
              page: 1,
              page_size: pageSize,
              total_pages: knownTotalPages,
              total_count: totalCount ?? mergedResults.length,
              has_next: false,
              has_previous: false,
            },
            results: mergedResults,
          } as HexagonDataResponse);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }

          const current = (queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined) ?? initialProgress;
          updateSharedProgress({
            ...current,
            isComplete: true,
            phase: 'complete',
          });
        }
      };

      void runBackgroundMerge();

      return firstPage;
    },
    enabled: (params.enabled ?? true) && !!params.state,
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    gcTime: 15 * 60 * 1000, // Retain cache a bit longer
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    // Provide immediate cached data if identical key existed previously
    placeholderData: queryClient.getQueryData<HexagonDataResponse>(baseHexagonQueryKey),
    retry: 0,
    meta: { description: 'Hexagon aggregated education data' },
  });

  useEffect(() => {
    if (!query.data || query.isFetching) {
      return;
    }

    if (fetchAllPages && query.data.metadata?.has_next) {
      return;
    }

    const total = query.data.metadata?.total_count ?? query.data.count ?? query.data.results.length;
    updateSharedProgress({
      loaded: query.data.results.length,
      total,
      totalAvailable: total,
      currentPage: query.data.metadata?.page ?? 1,
      totalPages: query.data.metadata?.total_pages ?? 1,
      percent: total > 0 ? 100 : 0,
      isComplete: true,
      phase: 'complete',
      isEstimatedTotal: false,
    });
  }, [query.data, query.isFetching, progressQueryKey, fetchAllPages]);

  useEffect(() => {
    if (!query.error || query.isFetching) {
      return;
    }

    const current = (queryClient.getQueryData(progressQueryKey) as HexagonDataLoadProgress | undefined) ?? initialProgress;
    updateSharedProgress({
      ...current,
      isComplete: true,
      phase: 'complete',
    });
  }, [query.error, query.isFetching, progressQueryKey, initialProgress]);

  return {
    ...query,
    loadProgress: (progressQuery.data as HexagonDataLoadProgress | undefined) ?? initialProgress,
  };
}

export function useCalculateNeeds() {
  return useMutation({
    mutationFn: (data: CalculateNeedsRequest) =>
      apiClient.post<CalculateNeedsResponse>('/hexagons/calculate-needs/', data),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useAnalyticsSummary(params: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', 'summary', params],
    queryFn: ({ signal }) => {
      const q: Record<string, string | number | boolean> = {};
      if (params.state) q.state = params.state;
      if (params.municipality_code) q.municipality_code = params.municipality_code;
      return apiClient.get<AnalyticsSummaryResponse>('/analytics/summary/', q, { signal });
    },
    enabled: !!params.state,
    staleTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

export function useAnalyticsHistogram(params: HistogramParams) {
  return useQuery({
    queryKey: ['analytics', 'histogram', params],
    queryFn: ({ signal }) => apiClient.get<AnalyticsHistogramResponse>(
      '/analytics/histogram/',
      {
        ...(params.state ? { state: params.state } : {}),
        education_levels: params.education_levels.join(','),
      },
      { signal }
    ),
    enabled: !!params.state && params.education_levels.length > 0,
    staleTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

export function useMunicipalityBaseline(municipalityId: number | null) {
  return useQuery({
    queryKey: ['municipality-baseline', municipalityId],
    queryFn: ({ signal }) => apiClient.get<MunicipalityBaselineResponse>(
      `/municipalities/${municipalityId}/table-baseline/`,
      undefined,
      { signal }
    ),
    enabled: !!municipalityId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

// State baseline (mirrors municipality baseline schema but without municipality fields)
export function useStateBaseline(stateCode: string | null) {
  return useQuery({
    queryKey: ['state-baseline', stateCode],
    queryFn: ({ signal }) => apiClient.get<MunicipalityBaselineResponse>(
      `/states/${stateCode}/table-baseline/`,
      undefined,
      { signal }
    ),
    enabled: !!stateCode,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

export function useMunicipalityGeometry(municipalityId: number | null) {
  return useQuery({
    queryKey: ['municipality-geometry', municipalityId],
    queryFn: ({ signal }) => apiClient.get<GeoJSONFeature>(
      `/municipalities/${municipalityId}/geometry/`,
      undefined,
      { signal }
    ),
    enabled: !!municipalityId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useMunicipalityResolutionCounts(
  municipalityId: number | null,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ['municipality-resolution-counts', municipalityId],
    queryFn: ({ signal }) => apiClient.get<MunicipalityResolutionCountsResponse>(
      `/municipalities/${municipalityId}/resolution-counts/`,
      undefined,
      { signal }
    ),
    enabled: enabled && !!municipalityId,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
