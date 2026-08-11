import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { State, Municipality, EducationLevel } from '../../types/api';
import type { EditableInputs, TableOutput } from '@/lib/educationCalculator';
import type { MapViewState } from '../../types/dashboard';

interface DashboardState {
  // Current selections (draft state - not yet applied)
  selectedState: State | null;
  selectedMunicipality: Municipality | null;
  selectedEducationLevels: EducationLevel[];
  mapResolution: number;
  
  // Applied selections (used for API queries)
  appliedState: State | null;
  appliedMunicipality: Municipality | null;
  appliedEducationLevels: EducationLevel[];
  appliedMapResolution: number;
  
  // UI state
  sidebarOpen: boolean;
  mapViewState: MapViewState;
  activePanel: 'controls' | 'analytics' | 'results';
  // Calculator UI state
  calculatorExpanded: boolean;
  // Panel collapse states
  controlsCollapsed: boolean;
  calculatorCollapsed: boolean;
  // Report modal
  reportModalOpen: boolean;
  // Calculator data synced for map coloring
  calculatorInputs: EditableInputs | null;
  calculatorComputed: TableOutput | null;
  // Map filter range for SalasNecessariasAcum
  filterRange: [number, number];
  // Resolution-8 totals per state for progress estimation
  stateHexagonCountRes8ByState: Record<string, number>;
  
  // Actions
  selectState: (state: State) => void;
  selectMunicipality: (municipality: Municipality | null) => void;
  updateEducationLevels: (levels: EducationLevel[]) => void;
  updateMapResolution: (resolution: number) => void;
  applyFilters: () => void;
  updateMapViewState: (viewState: MapViewState) => void;
  setActivePanel: (panel: 'controls' | 'analytics' | 'results') => void;
  toggleSidebar: () => void;
  setCalculatorExpanded: (expanded: boolean) => void;
  setControlsCollapsed: (collapsed: boolean) => void;
  setCalculatorCollapsed: (collapsed: boolean) => void;
  updateCalculatorState: (inputs: EditableInputs | null, computed: TableOutput | null) => void;
  updateFilterRange: (range: [number, number]) => void;
  setStateHexagonCountRes8: (stateCode: string, total: number) => void;
  setReportModalOpen: (open: boolean) => void;
  resetSelections: () => void;
}

// Default map view for Brazil
const defaultMapViewState: MapViewState = {
  latitude: -14.2350,
  longitude: -51.9253,
  zoom: 4,
  pitch: 0,
  bearing: 0,
};

function sameEducationLevels(a: EducationLevel[], b: EducationLevel[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((level, index) => level === b[index]);
}

function sameFilterRange(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

function sameMapViewState(a: MapViewState, b: MapViewState) {
  return (
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.zoom === b.zoom &&
    a.pitch === b.pitch &&
    a.bearing === b.bearing
  );
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        selectedState: null,
        selectedMunicipality: null,
        selectedEducationLevels: [],
        mapResolution: 8,
        appliedState: null,
        appliedMunicipality: null,
        appliedEducationLevels: [],
        appliedMapResolution: 8,
        sidebarOpen: true,
        mapViewState: defaultMapViewState,
        activePanel: 'controls',
        calculatorExpanded: false,
        controlsCollapsed: false,
        calculatorCollapsed: false,
        reportModalOpen: false,
        calculatorInputs: null,
        calculatorComputed: null,
        filterRange: [0, 100],
        stateHexagonCountRes8ByState: {},

        // Actions
        selectState: (state) =>
          set((prev) => {
            const nextViewport = getStateViewport(state.code);
            const sameState = prev.selectedState?.code === state.code;

            if (sameState && !prev.selectedMunicipality && sameMapViewState(prev.mapViewState, nextViewport)) {
              return prev;
            }

            return {
              selectedState: state,
              selectedMunicipality: null, // Reset municipality when state changes
              mapViewState: nextViewport,
            };
          }, false, 'selectState'),

        selectMunicipality: (municipality) =>
          set((prev) => {
            const prevId = prev.selectedMunicipality?.id ?? null;
            const nextId = municipality?.id ?? null;
            const prevHasCounts = !!prev.selectedMunicipality?.hexagon_counts_by_resolution;
            const nextHasCounts = !!municipality?.hexagon_counts_by_resolution;

            if (prevId === nextId && prevHasCounts === nextHasCounts) {
              return prev;
            }

            return { selectedMunicipality: municipality };
          }, false, 'selectMunicipality'),

        updateEducationLevels: (levels) =>
          set((prev) => {
            if (sameEducationLevels(prev.selectedEducationLevels, levels)) {
              return prev;
            }

            return { selectedEducationLevels: levels };
          }, false, 'updateEducationLevels'),

        updateMapResolution: (resolution) =>
          set((prev) => {
            if (prev.mapResolution === resolution) {
              return prev;
            }

            return { mapResolution: resolution };
          }, false, 'updateMapResolution'),

        applyFilters: () =>
          set((state) => {
            const sameAppliedState = state.appliedState?.code === state.selectedState?.code;
            const sameAppliedMunicipality = (state.appliedMunicipality?.id ?? null) === (state.selectedMunicipality?.id ?? null);
            const sameAppliedLevels = sameEducationLevels(state.appliedEducationLevels, state.selectedEducationLevels);
            const sameAppliedResolution = state.appliedMapResolution === state.mapResolution;

            if (sameAppliedState && sameAppliedMunicipality && sameAppliedLevels && sameAppliedResolution) {
              return state;
            }

            return {
              appliedState: state.selectedState,
              appliedMunicipality: state.selectedMunicipality,
              appliedEducationLevels: state.selectedEducationLevels,
              appliedMapResolution: state.mapResolution,
            };
          }, false, 'applyFilters'),

        updateMapViewState: (viewState) =>
          set((prev) => {
            if (sameMapViewState(prev.mapViewState, viewState)) {
              return prev;
            }

            return { mapViewState: viewState };
          }, false, 'updateMapViewState'),

        setActivePanel: (panel) => 
          set({ activePanel: panel }, false, 'setActivePanel'),

        toggleSidebar: () => 
          set((prev) => ({ sidebarOpen: !prev.sidebarOpen }), false, 'toggleSidebar'),

        setCalculatorExpanded: (expanded) =>
          set((prev) => {
            if (prev.calculatorExpanded === expanded) {
              return prev;
            }

            return { calculatorExpanded: expanded };
          }, false, 'setCalculatorExpanded'),

        setControlsCollapsed: (collapsed) =>
          set((prev) => {
            if (prev.controlsCollapsed === collapsed) {
              return prev;
            }

            return { controlsCollapsed: collapsed };
          }, false, 'setControlsCollapsed'),

        setCalculatorCollapsed: (collapsed) =>
          set((prev) => {
            if (prev.calculatorCollapsed === collapsed) {
              return prev;
            }

            return { calculatorCollapsed: collapsed };
          }, false, 'setCalculatorCollapsed'),

        updateCalculatorState: (inputs, computed) =>
          set((prev) => {
            if (prev.calculatorInputs === inputs && prev.calculatorComputed === computed) {
              return prev;
            }

            return { calculatorInputs: inputs, calculatorComputed: computed };
          }, false, 'updateCalculatorState'),

        updateFilterRange: (range) =>
          set((prev) => {
            if (sameFilterRange(prev.filterRange, range)) {
              return prev;
            }

            return { filterRange: range };
          }, false, 'updateFilterRange'),

        setStateHexagonCountRes8: (stateCode, total) =>
          set((state) => {
            if (state.stateHexagonCountRes8ByState[stateCode] === total) {
              return state;
            }

            return {
              stateHexagonCountRes8ByState: {
                ...state.stateHexagonCountRes8ByState,
                [stateCode]: total,
              }
            };
          }, false, 'setStateHexagonCountRes8'),

        setReportModalOpen: (open) =>
          set((prev) => {
            if (prev.reportModalOpen === open) {
              return prev;
            }

            return { reportModalOpen: open };
          }, false, 'setReportModalOpen'),

        resetSelections: () => 
          set({
            selectedState: null,
            selectedMunicipality: null,
            selectedEducationLevels: ['INF_CRE'],
            appliedState: null,
            appliedMunicipality: null,
            appliedEducationLevels: ['INF_CRE'],
            appliedMapResolution: 8,
            mapViewState: defaultMapViewState,
            calculatorInputs: null,
            calculatorComputed: null,
            filterRange: [0, 100],
            stateHexagonCountRes8ByState: {},
          }, false, 'resetSelections'),
      }),
      {
        name: 'edu-brazil-dashboard-v2',
        // Only persist the important selections, not transient UI state
        partialize: (state) => ({
          selectedState: state.selectedState,
          selectedMunicipality: state.selectedMunicipality,
          selectedEducationLevels: state.selectedEducationLevels,
          mapResolution: state.mapResolution,
          appliedState: state.appliedState,
          appliedMunicipality: state.appliedMunicipality,
          appliedEducationLevels: state.appliedEducationLevels,
          appliedMapResolution: state.appliedMapResolution,
          calculatorInputs: state.calculatorInputs,
          filterRange: state.filterRange,
          mapViewState: state.mapViewState,
          stateHexagonCountRes8ByState: state.stateHexagonCountRes8ByState,
        }),
      }
    ),
    { name: 'DashboardStore' }
  )
);

// Viewport calculations for Brazil states
function getStateViewport(stateCode: string): MapViewState {
  const stateViewports: Record<string, MapViewState> = {
    'AC': { latitude: -9.0238, longitude: -70.8120, zoom: 6, pitch: 0, bearing: 0 },
    'AL': { latitude: -9.5713, longitude: -36.7819, zoom: 7, pitch: 0, bearing: 0 },
    'AP': { latitude: 1.4155, longitude: -51.7779, zoom: 6, pitch: 0, bearing: 0 },
    'AM': { latitude: -4.0336, longitude: -63.0264, zoom: 5, pitch: 0, bearing: 0 },
    'BA': { latitude: -12.5797, longitude: -41.7007, zoom: 6, pitch: 0, bearing: 0 },
    'CE': { latitude: -5.4984, longitude: -39.3206, zoom: 7, pitch: 0, bearing: 0 },
    'DF': { latitude: -15.7998, longitude: -47.8645, zoom: 9, pitch: 0, bearing: 0 },
    'ES': { latitude: -19.1834, longitude: -40.3089, zoom: 7, pitch: 0, bearing: 0 },
    'GO': { latitude: -15.827, longitude: -49.8362, zoom: 6, pitch: 0, bearing: 0 },
    'MA': { latitude: -4.9609, longitude: -45.2744, zoom: 6, pitch: 0, bearing: 0 },
    'MT': { latitude: -12.6819, longitude: -56.9211, zoom: 5, pitch: 0, bearing: 0 },
    'MS': { latitude: -20.7722, longitude: -54.7852, zoom: 6, pitch: 0, bearing: 0 },
    'MG': { latitude: -18.5122, longitude: -44.5550, zoom: 6, pitch: 0, bearing: 0 },
    'PA': { latitude: -3.9889, longitude: -52.0257, zoom: 5, pitch: 0, bearing: 0 },
    'PB': { latitude: -7.2399, longitude: -36.7819, zoom: 7, pitch: 0, bearing: 0 },
    'PR': { latitude: -24.8979, longitude: -51.8696, zoom: 6, pitch: 0, bearing: 0 },
    'PE': { latitude: -8.8137, longitude: -36.9541, zoom: 7, pitch: 0, bearing: 0 },
    'PI': { latitude: -8.5756, longitude: -42.7985, zoom: 6, pitch: 0, bearing: 0 },
    'RJ': { latitude: -22.9068, longitude: -43.1729, zoom: 8, pitch: 0, bearing: 0 },
    'RN': { latitude: -5.4026, longitude: -36.9541, zoom: 7, pitch: 0, bearing: 0 },
    'RS': { latitude: -30.0346, longitude: -51.2177, zoom: 6, pitch: 0, bearing: 0 },
    'RO': { latitude: -11.5057, longitude: -63.5806, zoom: 6, pitch: 0, bearing: 0 },
    'RR': { latitude: 1.99, longitude: -61.33, zoom: 6, pitch: 0, bearing: 0 },
    'SC': { latitude: -27.2423, longitude: -50.2189, zoom: 7, pitch: 0, bearing: 0 },
    'SP': { latitude: -23.5505, longitude: -46.6333, zoom: 6, pitch: 0, bearing: 0 },
    'SE': { latitude: -10.5741, longitude: -37.3857, zoom: 8, pitch: 0, bearing: 0 },
    'TO': { latitude: -10.1753, longitude: -48.2982, zoom: 6, pitch: 0, bearing: 0 },
  };
  
  return stateViewports[stateCode] || defaultMapViewState;
}