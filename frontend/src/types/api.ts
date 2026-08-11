// API Response Types
export interface State {
  id: number;
  code: string;
  name: string;
  region: string;
  total_municipalities: number;
}

export interface Municipality {
  id: number;
  name: string;
  code_ibge: string | null;
  area_km2?: number | null;
  population: number | null;
  hexagon_counts_by_resolution?: Record<string, number>;
}

export interface HexagonFeature {
  hexagon_id: number | null;
  h3_index: string;
  municipality_name: string | null;
  education_data: EducationData | null;
}

export interface EducationData {
  // Population estimates
  pop_inf_cre: number;
  pop_inf_pre: number;
  pop_fund_ai: number;
  pop_fund_af: number;
  pop_med: number;

  // Enrollment numbers
  qt_mat_inf_cre: number;
  qt_mat_inf_pre: number;
  qt_mat_fund_ai: number;
  qt_mat_fund_af: number;
  qt_mat_med: number;
  qt_mat_inf_cre_int?: number;
  qt_mat_inf_pre_int?: number;
  qt_mat_fund_ai_int?: number;
  qt_mat_fund_af_int?: number;
  qt_mat_med_int?: number;
  private_qt_mat_inf_cre?: number;
  private_qt_mat_inf_pre?: number;
  private_qt_mat_fund_ai?: number;
  private_qt_mat_fund_af?: number;
  private_qt_mat_med?: number;
  qt_mat_bas_n?: number;

  // Infrastructure
  qt_salas_utilizadas: number;

  // Per-level classroom proportions (from backend, 0..1)
  // Used to distribute qt_salas_utilizadas across levels
  qt_mat_inf_cre_prop?: number;
  qt_mat_inf_pre_prop?: number;
  qt_mat_fund_ai_prop?: number;
  qt_mat_fund_af_prop?: number;
  qt_mat_med_prop?: number;

  // Precomputed rollup fields. When present, these preserve the canonical
  // res-8 classroom weighting after serving a coarser H3 resolution.
  qt_salas_weighted_inf_cre?: number;
  qt_salas_weighted_inf_pre?: number;
  qt_salas_weighted_fund_ai?: number;
  qt_salas_weighted_fund_af?: number;
  qt_salas_weighted_med?: number;
  nocturnal_weighted_fund_af?: number;
  nocturnal_weighted_med?: number;
}

// Education levels enum
export type EducationLevel = 'INF_CRE' | 'INF_PRE' | 'FUND_AI' | 'FUND_AF' | 'MED';

// API Request/Response interfaces
export type StatesResponse = State[];

export interface MunicipalitiesResponse {
  results: Municipality[];
}

export interface HexagonDataResponse {
  count?: number;
  metadata?: HexagonDataMetadata;
  results: HexagonFeature[];
}

export interface HexagonDataMetadata {
  state: string;
  resolution: number;
  municipality?: string;
  aggregated: boolean;
  total_hexagons: number;
  total_count?: number;
  effective_total_count?: number;
  count_skipped?: boolean;
  direct_count_cached?: boolean;
  rollup?: boolean;
  truncated?: boolean;
  source_resolution?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  has_next?: boolean;
  has_previous?: boolean;
}

export interface HexagonDataParams {
  state?: string;
  municipality_code?: string;
  resolution: number;
  education_levels: EducationLevel[];

}

export interface CalculateNeedsRequest {
  state: string;
  municipality_code?: string;
  resolution: number;
  education_levels: EducationLevel[];
  parameters: Record<string, {
    pop_not_in_school_pct: number;
    students_private_pct: number;
    students_integral_pct: number;
    students_nocturnal_pct: number;
    students_per_classroom: number;
  }>;
}

export interface CalculateNeedsResponse {
  results: CalculationResult[];
  summary: {
    total_new_classrooms_needed: number;
    total_hexagons_analyzed: number;
  };
}

export interface CalculationResult {
  hexagon_id: number;
  h3_index: string;
  calculations: {
    [key: string]: number;
  };
}

// Analytics types
export interface AnalyticsSummaryResponse {
  summary: AnalyticsSummary;
}

export interface AnalyticsSummary {
  total_population: Record<string, number>;
  total_enrollment: Record<string, number>;
  infrastructure: {
    total_classrooms: number;
    avg_students_per_classroom: number;
  };
}

export interface AnalyticsParams {
  state?: string;
  municipality_code?: string;
}

export interface HistogramParams {
  state?: string;
  education_levels: EducationLevel[];
}

export interface AnalyticsHistogramResponse {
  histogram: Array<{
    bin: string;
    count: number;
  }>;
}

// Baseline types for Needed Classrooms Calculator
export interface BaselineLevel {
  pop: number;
  totalEnroll: number;
  privateEnroll: number;
  integralEnrollShare: number; // 0..1
  nocturnalShare: number;      // 0..1
  existingClassrooms: number;
  seatsPerClass: number;
}

export type BaselinePayload = Record<EducationLevel, BaselineLevel>;

export interface MunicipalityBaselineResponse {
  municipalityId: number;
  municipalityName: string;
  state: string; // state code
  code_ibge: string | null;
  levels: BaselinePayload;
}

export interface MunicipalityResolutionCountsResponse {
  municipalityId: number;
  municipalityCode: string | null;
  counts: Record<string, number>;
}
