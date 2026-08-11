export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export interface DashboardFilters {
  state: string | null;
  municipality: string | null;
  educationLevels: EducationLevel[];
  resolution: number;
  dateRange?: [Date, Date];
}

export type EducationLevel = 'INF_CRE' | 'INF_PRE' | 'FUND_AI' | 'FUND_AF' | 'MED';