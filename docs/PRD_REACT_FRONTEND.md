# 📋 Product Requirements Document: React Dashboard Frontend

## 🎯 **PROJECT OVERVIEW**

### **Product Name**: Brazilian Education Infrastructure Dashboard - React Frontend

### **Purpose**
Build a high-performance React dashboard frontend that integrates with the GeoDjango backend API, providing an interactive visualization and analysis platform for Brazilian education infrastructure data with hexagonal spatial aggregation and real-time calculations.

### **Success Criteria**
- ✅ Modern, responsive dashboard supporting 27 Brazilian states
- ✅ Real-time map visualization with DeckGL and hexagonal overlays
- ✅ Interactive parameter controls for classroom need calculations
- ✅ Sub-second response times for data visualization updates
- ✅ Mobile-responsive design with adaptive layouts
- ✅ Production-ready deployment with optimized bundle sizes

---

## 🏗️ **SYSTEM ARCHITECTURE**

### **Technology Stack**
- **Frontend Framework**: React 18+ with TypeScript
- **Build Tool**: Vite 6.x for fast development and optimized builds
- **Package Manager**: Bun 1.x for ultra-fast package management
- **Routing**: React Router 6.x for client-side navigation
- **State Management**: Zustand 5.x for lightweight, type-safe global state
- **API Layer**: TanStack Query (React Query) 5.x for server state management
- **UI Framework**: Shadcn/ui + Tailwind CSS 3.x for modern design system
- **Maps & Visualization**: DeckGL 9.x + MapLibre GL JS for spatial visualization
- **Data Visualization**: Recharts for charts and analytics
- **Form Management**: React Hook Form + Zod for validation
- **Deployment**: Vercel/Netlify with CDN optimization

### **Core Architecture Principles**
1. **Component-Driven Development** - Modular, reusable components
2. **Type Safety** - Full TypeScript coverage with strict typing
3. **Performance First** - Code splitting, lazy loading, and virtualization
4. **Accessibility** - WCAG 2.1 AA compliance
5. **Mobile First** - Responsive design with touch-friendly interactions
6. **Real-time Updates** - Optimistic UI with background synchronization

---

## 📊 **APPLICATION STRUCTURE**

### **Page Architecture**

```
src/
├── app/                     # App setup and configuration
│   ├── App.tsx             # Main app component
│   ├── main.tsx            # App entry point
│   └── router.tsx          # Route configuration
├── pages/                  # Page components
│   ├── DashboardPage/      # Main dashboard page
│   ├── StatePage/          # State-specific analysis
│   ├── MunicipalityPage/   # Municipality deep dive
│   └── ComparePage/        # Multi-region comparison
├── components/             # Shared components
│   ├── ui/                 # Shadcn/ui components
│   ├── layout/             # Layout components
│   ├── maps/               # Map-related components
│   ├── charts/             # Chart components
│   └── forms/              # Form components
├── lib/                    # Utilities and configurations
│   ├── api/                # API client and types
│   ├── stores/             # Zustand stores
│   ├── utils/              # Helper functions
│   └── constants/          # App constants
├── hooks/                  # Custom React hooks
├── types/                  # TypeScript type definitions
└── assets/                 # Static assets
```

### **Route Structure**

```typescript
// Route configuration
const routes = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'state/:stateCode',
        element: <StatePage />,
      },
      {
        path: 'state/:stateCode/municipality/:municipalityId',
        element: <MunicipalityPage />,
      },
      {
        path: 'compare',
        element: <ComparePage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
];
```

---

## 🗂️ **CORE FEATURES SPECIFICATION**

### **1. State Management with Zustand**

#### **Dashboard Store**
```typescript
// stores/dashboardStore.ts
interface DashboardState {
  // Current selections
  selectedState: State | null;
  selectedMunicipality: Municipality | null;
  selectedEducationLevels: EducationLevel[];
  mapResolution: number;
  
  // UI state
  sidebarOpen: boolean;
  mapViewState: MapViewState;
  activePanel: 'controls' | 'analytics' | 'results';
  
  // Calculation parameters
  calculationParams: CalculationParameters;
  
  // Actions
  selectState: (state: State) => void;
  selectMunicipality: (municipality: Municipality | null) => void;
  updateEducationLevels: (levels: EducationLevel[]) => void;
  updateMapResolution: (resolution: number) => void;
  updateCalculationParams: (params: Partial<CalculationParameters>) => void;
  resetSelections: () => void;
}

// Education levels
type EducationLevel = 'INF_CRE' | 'INF_PRE' | 'FUND_AI' | 'FUND_AF' | 'MED';

// Calculation parameters
interface CalculationParameters {
  [key: string]: {
    popNotInSchoolPct: number;
    studentsPrivatePct: number;
    studentsIntegralPct: number;
    studentsNocturnalPct: number;
    studentsPerClassroom: number;
  };
}
```

#### **API Store**
```typescript
// stores/apiStore.ts
interface ApiState {
  // Cache settings
  staleTime: number;
  cacheTime: number;
  
  // Loading states
  isLoadingStates: boolean;
  isLoadingMunicipalities: boolean;
  isLoadingHexagons: boolean;
  
  // Error handling
  lastError: string | null;
  
  // Actions
  setError: (error: string | null) => void;
  clearCache: () => void;
}
```

### **2. API Integration with React Query**

#### **API Client Setup**
```typescript
// lib/api/client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// API base configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001/api/v1';

export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseURL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

export const apiClient = new ApiClient();
```

#### **API Hooks**
```typescript
// hooks/api/useStates.ts
export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: () => apiClient.get<StatesResponse>('/states/'),
    select: (data) => data.results,
  });
}

// hooks/api/useMunicipalities.ts
export function useMunicipalities(stateCode: string | null) {
  return useQuery({
    queryKey: ['municipalities', stateCode],
    queryFn: () => apiClient.get<MunicipalitiesResponse>(`/states/${stateCode}/municipalities/`),
    enabled: !!stateCode,
    select: (data) => data.results,
  });
}

// hooks/api/useHexagonData.ts
export function useHexagonData(params: HexagonDataParams) {
  return useQuery({
    queryKey: ['hexagon-data', params],
    queryFn: () => apiClient.get<HexagonDataResponse>('/hexagons/education-data/', params),
    enabled: !!params.state,
    staleTime: 2 * 60 * 1000, // 2 minutes for map data
  });
}

// hooks/api/useCalculateNeeds.ts
export function useCalculateNeeds() {
  return useMutation({
    mutationFn: (data: CalculateNeedsRequest) => 
      apiClient.post<CalculateNeedsResponse>('/hexagons/calculate-needs/', data),
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

// hooks/api/useAnalytics.ts
export function useAnalyticsSummary(params: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', 'summary', params],
    queryFn: () => apiClient.get<AnalyticsSummaryResponse>('/analytics/summary/', params),
    enabled: !!params.state,
  });
}

export function useAnalyticsHistogram(params: HistogramParams) {
  return useQuery({
    queryKey: ['analytics', 'histogram', params],
    queryFn: () => apiClient.get<AnalyticsHistogramResponse>('/analytics/histogram/', params),
    enabled: !!params.state && params.education_levels.length > 0,
  });
}
```

### **3. Map Visualization with DeckGL**

#### **Map Component Structure**
```typescript
// components/maps/EducationMap.tsx
interface EducationMapProps {
  hexagonData: HexagonFeature[];
  selectedEducationLevel: EducationLevel;
  calculationResults?: CalculationResult[];
  onHexagonClick?: (hexagon: HexagonFeature) => void;
  onViewStateChange?: (viewState: MapViewState) => void;
}

export function EducationMap({
  hexagonData,
  selectedEducationLevel,
  calculationResults,
  onHexagonClick,
  onViewStateChange,
}: EducationMapProps) {
  const mapViewState = useDashboardStore((state) => state.mapViewState);
  
  // DeckGL layers configuration
  const layers = [
    new H3HexagonLayer({
      id: 'education-hexagons',
      data: hexagonData,
      getHexagon: (d) => d.properties.h3_index,
      getFillColor: (d) => getEducationColorScale(d, selectedEducationLevel),
      getElevation: (d) => getEducationValue(d, selectedEducationLevel),
      elevationScale: 100,
      pickable: true,
      autoHighlight: true,
      onClick: ({ object }) => onHexagonClick?.(object),
    }),
    
    // Calculation results overlay
    ...(calculationResults ? [
      new H3HexagonLayer({
        id: 'calculation-results',
        data: calculationResults,
        getHexagon: (d) => d.h3_index,
        getFillColor: (d) => getClassroomNeedColorScale(d),
        stroked: true,
        getLineColor: [255, 255, 255, 200],
        lineWidthMinPixels: 2,
        pickable: true,
      })
    ] : []),
  ];

  return (
    <div className="relative w-full h-full">
      <DeckGL
        initialViewState={mapViewState}
        controller={true}
        layers={layers}
        onViewStateChange={onViewStateChange}
        getCursor={({ isDragging, isHovering }) => 
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
      >
        <Map
          mapLib={maplibregl}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          preventStyleDiffing={true}
        />
      </DeckGL>
      
      {/* Map controls */}
      <MapControls />
      
      {/* Legend */}
      <MapLegend 
        educationLevel={selectedEducationLevel}
        showCalculationResults={!!calculationResults}
      />
    </div>
  );
}
```

#### **Color Scales and Visualization Utils**
```typescript
// lib/utils/mapUtils.ts
export function getEducationColorScale(
  hexagon: HexagonFeature, 
  level: EducationLevel
): [number, number, number, number] {
  const value = getEducationValue(hexagon, level);
  const normalized = Math.min(value / getMaxValue(level), 1);
  
  // Color scale from light blue to dark red
  const colorScale = d3.scaleSequential(d3.interpolateViridis);
  const color = d3.rgb(colorScale(normalized));
  
  return [color.r, color.g, color.b, 200];
}

export function getClassroomNeedColorScale(
  result: CalculationResult
): [number, number, number, number] {
  const needsRatio = result.calculations.qt_salas_necesarias_extra / 
                    Math.max(result.calculations.qt_salas_actuales, 1);
  
  if (needsRatio <= 0) return [46, 125, 50, 180];      // Green: No additional needs
  if (needsRatio <= 0.5) return [255, 193, 7, 180];   // Yellow: Low needs
  if (needsRatio <= 1) return [255, 152, 0, 180];     // Orange: Medium needs
  return [244, 67, 54, 180];                          // Red: High needs
}

// Viewport calculations for Brazil regions
export const BRAZIL_BOUNDS = {
  north: { latitude: 5.2717, longitude: -34.7299 },
  south: { latitude: -33.7683, longitude: -73.9830 },
  center: { latitude: -14.2350, longitude: -51.9253 },
};

export function getStateViewport(stateCode: string): MapViewState {
  // Predefined viewports for each state
  const stateViewports: Record<string, MapViewState> = {
    'SP': { latitude: -23.5505, longitude: -46.6333, zoom: 7 },
    'RJ': { latitude: -22.9068, longitude: -43.1729, zoom: 8 },
    'MG': { latitude: -19.9167, longitude: -43.9345, zoom: 6 },
    // ... other states
  };
  
  return stateViewports[stateCode] || {
    latitude: BRAZIL_BOUNDS.center.latitude,
    longitude: BRAZIL_BOUNDS.center.longitude,
    zoom: 4
  };
}
```

### **4. Dashboard UI Components**

#### **Main Dashboard Layout**
```typescript
// pages/DashboardPage/DashboardPage.tsx
export function DashboardPage() {
  const {
    selectedState,
    selectedMunicipality,
    selectedEducationLevels,
    mapResolution,
  } = useDashboardStore();

  const { data: hexagonData, isLoading } = useHexagonData({
    state: selectedState?.code,
    municipality: selectedMunicipality?.name,
    resolution: mapResolution,
    education_levels: selectedEducationLevels,
  });

  const { data: analyticsData } = useAnalyticsSummary({
    state: selectedState?.code,
    municipality: selectedMunicipality?.name,
  });

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Controls */}
        <div className="w-80 bg-card border-r border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            <StateSelector />
            <MunicipalitySelector />
            <EducationLevelSelector />
            <ResolutionSelector />
            <ParameterControls />
          </div>
        </div>

        {/* Main Content - Map and Analysis */}
        <div className="flex-1 flex flex-col">
          {/* Map Area */}
          <div className="flex-1 relative">
            {isLoading ? (
              <MapSkeleton />
            ) : (
              <EducationMap
                hexagonData={hexagonData?.results || []}
                selectedEducationLevel={selectedEducationLevels[0]}
              />
            )}
          </div>

          {/* Bottom Panel - Analytics */}
          <div className="h-64 bg-card border-t border-border">
            <AnalyticsPanel data={analyticsData} />
          </div>
        </div>

        {/* Right Sidebar - Results (Collapsible) */}
        <Collapsible>
          <div className="w-80 bg-card border-l border-border overflow-y-auto">
            <ResultsPanel />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
```

#### **Control Components**
```typescript
// components/controls/StateSelector.tsx
export function StateSelector() {
  const { data: states, isLoading } = useStates();
  const { selectedState, selectState } = useDashboardStore();

  return (
    <div className="space-y-2">
      <Label htmlFor="state-select">Estado</Label>
      <Select
        value={selectedState?.code || ''}
        onValueChange={(code) => {
          const state = states?.find(s => s.code === code);
          if (state) selectState(state);
        }}
      >
        <SelectTrigger id="state-select">
          <SelectValue placeholder="Selecione um estado..." />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <SelectItem value="" disabled>Carregando...</SelectItem>
          ) : (
            states?.map((state) => (
              <SelectItem key={state.code} value={state.code}>
                {state.name} ({state.code})
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

// components/controls/ParameterControls.tsx
export function ParameterControls() {
  const { 
    calculationParams, 
    updateCalculationParams, 
    selectedEducationLevels 
  } = useDashboardStore();

  const { mutate: calculateNeeds, isPending } = useCalculateNeeds();

  const handleParameterChange = (
    level: EducationLevel,
    param: string,
    value: number
  ) => {
    updateCalculationParams({
      [level]: {
        ...calculationParams[level],
        [param]: value,
      },
    });
  };

  const handleCalculate = () => {
    calculateNeeds({
      state: selectedState?.code,
      municipality: selectedMunicipality?.name,
      resolution: mapResolution,
      education_levels: selectedEducationLevels,
      parameters: calculationParams,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parâmetros de Cálculo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedEducationLevels.map((level) => (
          <div key={level} className="space-y-3">
            <h4 className="font-medium text-sm">
              {getEducationLevelLabel(level)}
            </h4>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <Label htmlFor={`${level}-private`}>Rede Privada (%)</Label>
                <Slider
                  id={`${level}-private`}
                  min={0}
                  max={100}
                  step={0.1}
                  value={[calculationParams[level]?.studentsPrivatePct || 0]}
                  onValueChange={([value]) => 
                    handleParameterChange(level, 'studentsPrivatePct', value)
                  }
                />
              </div>
              
              <div>
                <Label htmlFor={`${level}-integral`}>Tempo Integral (%)</Label>
                <Slider
                  id={`${level}-integral`}
                  min={0}
                  max={100}
                  step={0.1}
                  value={[calculationParams[level]?.studentsIntegralPct || 0]}
                  onValueChange={([value]) => 
                    handleParameterChange(level, 'studentsIntegralPct', value)
                  }
                />
              </div>
              
              <div>
                <Label htmlFor={`${level}-classroom-size`}>Alunos/Sala</Label>
                <Slider
                  id={`${level}-classroom-size`}
                  min={10}
                  max={50}
                  step={1}
                  value={[calculationParams[level]?.studentsPerClassroom || 25]}
                  onValueChange={([value]) => 
                    handleParameterChange(level, 'studentsPerClassroom', value)
                  }
                />
              </div>
            </div>
          </div>
        ))}
        
        <Button 
          onClick={handleCalculate} 
          disabled={isPending}
          className="w-full"
        >
          {isPending ? 'Calculando...' : 'Calcular Necessidades'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

#### **Analytics Components**
```typescript
// components/analytics/AnalyticsPanel.tsx
export function AnalyticsPanel({ data }: { data?: AnalyticsSummary }) {
  const [activeTab, setActiveTab] = useState('summary');

  if (!data) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">
      Selecione um estado para ver a análise
    </div>;
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="charts">Gráficos</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="summary" className="flex-1 p-4">
          <SummaryMetrics data={data} />
        </TabsContent>
        
        <TabsContent value="charts" className="flex-1 p-4">
          <AnalyticsCharts />
        </TabsContent>
        
        <TabsContent value="metrics" className="flex-1 p-4">
          <DetailedMetrics data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// components/analytics/SummaryMetrics.tsx
export function SummaryMetrics({ data }: { data: AnalyticsSummary }) {
  const metrics = [
    {
      title: 'População Total',
      value: Object.values(data.summary.total_population).reduce((a, b) => a + b, 0),
      format: 'number',
      icon: Users,
    },
    {
      title: 'Matrículas Totais',
      value: Object.values(data.summary.total_enrollment).reduce((a, b) => a + b, 0),
      format: 'number',
      icon: GraduationCap,
    },
    {
      title: 'Salas de Aula',
      value: data.summary.infrastructure.total_classrooms,
      format: 'number',
      icon: Building,
    },
    {
      title: 'Alunos/Sala (Média)',
      value: data.summary.infrastructure.avg_students_per_classroom,
      format: 'decimal',
      icon: Calculator,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.title} className="p-4">
          <div className="flex items-center space-x-2">
            <metric.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{metric.title}</span>
          </div>
          <p className="text-2xl font-bold mt-2">
            {formatValue(metric.value, metric.format)}
          </p>
        </Card>
      ))}
    </div>
  );
}

// components/analytics/AnalyticsCharts.tsx
export function AnalyticsCharts() {
  const { selectedState, selectedEducationLevels } = useDashboardStore();
  const { data: histogramData } = useAnalyticsHistogram({
    state: selectedState?.code,
    education_levels: selectedEducationLevels,
  });

  if (!histogramData) return <ChartSkeleton />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-4">
        <CardTitle className="text-lg mb-4">Distribuição por Nível</CardTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={histogramData.histogram}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bin" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      
      <Card className="p-4">
        <CardTitle className="text-lg mb-4">Necessidades por Região</CardTitle>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={[
                { name: 'Atendidas', value: 75 },
                { name: 'Necessidades Baixas', value: 15 },
                { name: 'Necessidades Altas', value: 10 },
              ]}
              cx="50%"
              cy="50%"
              outerRadius={80}
              fill="hsl(var(--primary))"
              dataKey="value"
            />
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
```

### **5. TypeScript Type Definitions**

```typescript
// types/api.ts
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
  population: number | null;
}

export interface HexagonFeature {
  type: 'Feature';
  properties: {
    id: number;
    h3_index: string;
    municipality_name: string | null;
    education_data: EducationData;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
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
  
  // Infrastructure
  qt_salas_utilizadas: number;
  
  // Other metrics...
}

export interface CalculateNeedsRequest {
  state: string;
  municipality?: string;
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

// types/map.ts
export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

// types/dashboard.ts
export interface DashboardFilters {
  state: string | null;
  municipality: string | null;
  educationLevels: EducationLevel[];
  resolution: number;
  dateRange?: [Date, Date];
}

export type EducationLevel = 'INF_CRE' | 'INF_PRE' | 'FUND_AI' | 'FUND_AF' | 'MED';
```

---

## 🎨 **UI/UX DESIGN SPECIFICATION**

### **Design System (Shadcn + Tailwind)**

#### **Color Palette**
```css
/* CSS Variables - Light Theme */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
}

/* Dark Theme */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... other dark theme variables */
}
```

#### **Component Variants**
```typescript
// lib/variants.ts - CVA (Class Variance Authority) setup
import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

#### **Responsive Layout Breakpoints**
```typescript
// tailwind.config.ts
export default {
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
};
```

### **Mobile-First Responsive Design**

#### **Layout Adaptations**
```typescript
// components/layout/ResponsiveLayout.tsx
export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const [isMobile] = useMediaQuery('(max-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  return (
    <div className="h-screen bg-background flex flex-col">
      {isMobile ? (
        <>
          {/* Mobile Header with Drawer */}
          <MobileHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          
          {/* Mobile Drawer */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-80 p-0">
              <MobileControls />
            </SheetContent>
          </Sheet>

          {/* Main Content - Full Screen */}
          <div className="flex-1">
            {children}
          </div>

          {/* Bottom Sheet for Analytics */}
          <BottomSheet>
            <MobileAnalytics />
          </BottomSheet>
        </>
      ) : (
        <>
          {/* Desktop Layout */}
          <Header />
          <div className="flex-1 flex">
            <Sidebar />
            <main className="flex-1">{children}</main>
            <RightPanel />
          </div>
        </>
      )}
    </div>
  );
}

// Custom hook for media queries
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return [matches];
}
```

### **Accessibility Features**

#### **ARIA Labels and Screen Reader Support**
```typescript
// components/ui/AccessibleMap.tsx
export function AccessibleMap({ children, ...props }: MapProps) {
  return (
    <div
      role="application"
      aria-label="Mapa interativo de dados educacionais do Brasil"
      aria-describedby="map-instructions"
      tabIndex={0}
      className="relative w-full h-full focus:outline-none focus:ring-2 focus:ring-primary"
      {...props}
    >
      <div id="map-instructions" className="sr-only">
        Use as setas do teclado para navegar pelo mapa. Pressione Enter para interagir com os elementos.
      </div>
      
      {children}
      
      {/* Keyboard navigation overlay */}
      <KeyboardNavigationOverlay />
    </div>
  );
}

// Keyboard navigation for map
export function KeyboardNavigationOverlay() {
  const { mapViewState, updateMapViewState } = useDashboardStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!document.activeElement?.closest('[role="application"]')) return;

      const step = 0.1;
      let newViewState = { ...mapViewState };

      switch (e.key) {
        case 'ArrowUp':
          newViewState.latitude += step;
          break;
        case 'ArrowDown':
          newViewState.latitude -= step;
          break;
        case 'ArrowLeft':
          newViewState.longitude -= step;
          break;
        case 'ArrowRight':
          newViewState.longitude += step;
          break;
        case '+':
        case '=':
          newViewState.zoom = Math.min(newViewState.zoom + 1, 20);
          break;
        case '-':
          newViewState.zoom = Math.max(newViewState.zoom - 1, 1);
          break;
        default:
          return;
      }

      e.preventDefault();
      updateMapViewState(newViewState);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mapViewState, updateMapViewState]);

  return null;
}
```

---

## ⚡ **PERFORMANCE OPTIMIZATION**

### **Code Splitting and Lazy Loading**

```typescript
// app/router.tsx
import { lazy } from 'react';

// Lazy load page components
const DashboardPage = lazy(() => import('../pages/DashboardPage/DashboardPage'));
const StatePage = lazy(() => import('../pages/StatePage/StatePage'));
const MunicipalityPage = lazy(() => import('../pages/MunicipalityPage/MunicipalityPage'));
const ComparePage = lazy(() => import('../pages/ComparePage/ComparePage'));

// Route-based code splitting
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'state/:stateCode',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <StatePage />
          </Suspense>
        ),
      },
      // ... other routes
    ],
  },
]);

// Dynamic imports for heavy components
const DeckGLMap = lazy(() => import('../components/maps/DeckGLMap'));
const AdvancedCharts = lazy(() => import('../components/charts/AdvancedCharts'));
```

### **Data Virtualization**

```typescript
// components/lists/VirtualizedHexagonList.tsx
import { FixedSizeList as List } from 'react-window';

interface VirtualizedHexagonListProps {
  hexagons: HexagonFeature[];
  onHexagonSelect: (hexagon: HexagonFeature) => void;
}

export function VirtualizedHexagonList({
  hexagons,
  onHexagonSelect,
}: VirtualizedHexagonListProps) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const hexagon = hexagons[index];
    
    return (
      <div style={style}>
        <HexagonListItem 
          hexagon={hexagon}
          onClick={() => onHexagonSelect(hexagon)}
        />
      </div>
    );
  };

  return (
    <List
      height={400}
      itemCount={hexagons.length}
      itemSize={60}
      overscanCount={5}
    >
      {Row}
    </List>
  );
}
```

### **Optimized Map Rendering**

```typescript
// hooks/useOptimizedMapData.ts
export function useOptimizedMapData(
  hexagonData: HexagonFeature[],
  viewState: MapViewState
) {
  return useMemo(() => {
    // Only render hexagons visible in current viewport
    const bounds = getBoundsFromViewState(viewState);
    
    return hexagonData.filter((hexagon) => {
      const [lon, lat] = hexagon.geometry.coordinates[0][0];
      return isPointInBounds([lon, lat], bounds);
    });
  }, [hexagonData, viewState]);
}

// Level of detail based on zoom
export function useLevelOfDetail(zoom: number) {
  return useMemo(() => {
    if (zoom < 6) return 'country';
    if (zoom < 8) return 'state';
    if (zoom < 10) return 'municipality';
    return 'hexagon';
  }, [zoom]);
}
```

### **Bundle Optimization (Vite Config)**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'query': ['@tanstack/react-query'],
          'state': ['zustand'],
          
          // UI framework chunks
          'ui-core': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          
          // Map and visualization chunks
          'deckgl': ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react'],
          'map': ['maplibre-gl'],
          
          // Chart chunks
          'charts': ['recharts'],
          'virtualization': ['react-window'],
        },
      },
    },
    
    // Optimize chunk sizes for map-heavy application
    chunkSizeWarningLimit: 1500, // Increased for DeckGL
    
    // Enable source maps for production debugging
    sourcemap: true,
    
    // Target modern browsers for better optimization
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
  
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@deck.gl/core',
      '@deck.gl/layers',
      '@deck.gl/react',
      'maplibre-gl',
      '@tanstack/react-query',
      'zustand',
    ],
    exclude: [
      // Exclude large binaries that should be loaded dynamically
      'maplibre-gl/dist/maplibre-gl.css',
    ],
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // Development optimizations
  server: {
    hmr: {
      overlay: false, // Disable error overlay for better map debugging
    },
  },
  
  // Performance optimizations for map applications
  define: {
    // Enable DeckGL production optimizations
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
```

---

## 🚀 **DEPLOYMENT SPECIFICATION**

### **Environment Configuration**

```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_MAPBOX_TOKEN: z.string().optional(),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
});

export const env = envSchema.parse({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT,
  VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
});

// Type-safe environment variables
declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
    readonly VITE_MAPBOX_TOKEN?: string;
    readonly VITE_SENTRY_DSN?: string;
    readonly VITE_ENVIRONMENT: 'development' | 'staging' | 'production';
    readonly VITE_APP_VERSION: string;
  }
}
```

### **Docker Configuration**

```dockerfile
# Dockerfile
FROM oven/bun:1 as builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: .
    ports:
      - "3000:80"
    environment:
      - VITE_API_BASE_URL=http://backend:8000/api/v1
    depends_on:
      - backend
    networks:
      - app-network

  backend:
    # Reference to Django backend
    extends:
      file: ../docker-compose.yml
      service: web
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### **Vercel Deployment**

```json
// vercel.json
{
  "framework": "vite",
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "installCommand": "bun install",
  "devCommand": "bun dev",
  "env": {
    "VITE_API_BASE_URL": "@api-base-url"
  },
  "build": {
    "env": {
      "VITE_API_BASE_URL": "@api-base-url-prod"
    }
  },
  "headers": [
    {
      "source": "/static/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "$VITE_API_BASE_URL/$1"
    }
  ]
}
```

---

## 📋 **PROJECT STRUCTURE & SETUP**

### **Package.json Configuration**

```json
{
  "name": "geo-edu-brazil-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.8.0",
    "zustand": "^4.4.0",
    "@deck.gl/core": "^9.0.0",
    "@deck.gl/layers": "^9.0.0",
    "@deck.gl/react": "^9.0.0",
    "maplibre-gl": "^3.6.0",
    "recharts": "^2.8.0",
    "react-hook-form": "^7.48.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.294.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-slider": "^1.1.0",
    "react-window": "^1.8.0",
    "@types/react-window": "^1.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vitejs/plugin-react-swc": "^3.5.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.53.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.1.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "bun": ">=1.0.0"
  }
}
```

### **Development Setup Commands**

```bash
# Initial setup
bun create vite geo-edu-brazil-frontend --template react-ts
cd geo-edu-brazil-frontend

# Install dependencies
bun install

# Add UI framework
bunx shadcn-ui@latest init
bunx shadcn-ui@latest add button card select tabs slider

# Install additional packages
bun add @tanstack/react-query zustand @deck.gl/core @deck.gl/layers @deck.gl/react
bun add maplibre-gl recharts react-hook-form @hookform/resolvers zod
bun add clsx tailwind-merge class-variance-authority lucide-react
bun add react-window @types/react-window

# Development tools
bun add -d @testing-library/react @testing-library/jest-dom vitest
bun add -d eslint-plugin-react-hooks eslint-plugin-react-refresh

# Start development server
bun dev
```

---

## ✅ **ACCEPTANCE CRITERIA**

### **Phase 1: Foundation & Core Components (Week 1)**
- [ ] **Project Setup**: Vite + React + TypeScript + Bun configuration
- [ ] **UI Framework**: Shadcn/ui components integrated with Tailwind CSS
- [ ] **Routing**: React Router 6 with proper route protection and loading states
- [ ] **State Management**: Zustand stores for dashboard state and user preferences
- [ ] **API Layer**: React Query setup with proper error handling and caching
- [ ] **Basic Layout**: Responsive header, sidebar, and main content area

### **Phase 2: Map Integration & Data Visualization (Week 2)**
- [ ] **DeckGL Integration**: H3 hexagon layer rendering with education data
- [ ] **Map Controls**: Pan, zoom, state/municipality selection via map interaction  
- [ ] **Color Coding**: Dynamic color scales for education levels and classroom needs
- [ ] **Performance**: Viewport culling and level-of-detail rendering for 1000+ hexagons
- [ ] **Mobile Support**: Touch-friendly map controls and responsive design
- [ ] **Accessibility**: Keyboard navigation and screen reader support for maps

### **Phase 3: Dashboard Controls & Analytics (Week 3)**
- [ ] **Parameter Controls**: Interactive sliders and inputs for calculation parameters
- [ ] **Real-time Calculations**: Integration with `/calculate-needs/` API endpoint
- [ ] **Analytics Panel**: Summary statistics, charts, and histogram visualizations
- [ ] **Data Export**: CSV/JSON export functionality for calculated results
- [ ] **State Persistence**: URL-based state management for shareable links
- [ ] **Error Handling**: Graceful error states with retry mechanisms

### **Phase 4: Advanced Features & Polish (Week 4)**
- [ ] **Comparison Mode**: Side-by-side state/municipality analysis
- [ ] **Filter System**: Advanced filtering by population, enrollment, infrastructure
- [ ] **Chart Interactions**: Drill-down capabilities from summary to detail views
- [ ] **Performance Optimization**: Code splitting, lazy loading, bundle optimization
- [ ] **Testing**: Unit tests for components and integration tests for critical flows
- [ ] **Documentation**: Component storybook and API integration guide

### **Phase 5: Production Ready (Week 5)**
- [ ] **Deployment**: Docker containerization and Vercel/Netlify deployment
- [ ] **Monitoring**: Error tracking with Sentry and performance monitoring
- [ ] **SEO**: Meta tags, OpenGraph integration, and search engine optimization
- [ ] **PWA Features**: Service worker, offline support, app manifest
- [ ] **Security**: Content Security Policy, environment variable management
- [ ] **Load Testing**: Performance validation under expected user loads

---

## 🎯 **SUCCESS METRICS**

### **Performance Targets**
- **Initial Load**: <3 seconds on 3G network
- **Route Navigation**: <500ms between pages
- **Map Rendering**: <2 seconds for 1000+ hexagons
- **API Response**: <1 second for data updates
- **Bundle Size**: <500KB initial bundle, <2MB total assets
- **Lighthouse Score**: >90 Performance, >95 Accessibility, >90 SEO

### **User Experience Targets**
- **Mobile Responsive**: 100% feature parity across desktop/tablet/mobile
- **Browser Support**: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
- **Accessibility**: WCAG 2.1 AA compliance
- **Offline Support**: Basic functionality without network connection
- **Touch Support**: Optimized for touch devices and stylus input
- **Keyboard Navigation**: Full keyboard accessibility for all features

### **Developer Experience Targets**
- **Build Time**: <30 seconds for production builds
- **HMR**: <200ms hot reload during development
- **Type Safety**: 100% TypeScript coverage with strict mode
- **Code Quality**: ESLint + Prettier with zero warnings
- **Test Coverage**: >80% unit test coverage for critical components
- **Documentation**: Complete component documentation with examples

### **Integration Targets**
- **API Compatibility**: 100% feature parity with existing Dash application
- **Data Accuracy**: Perfect data integrity with backend calculations
- **Real-time Updates**: <2 second latency for parameter changes
- **Error Recovery**: Graceful handling of API timeouts and failures
- **State Synchronization**: URL state persistence and browser history support
- **Cross-browser Compatibility**: Consistent behavior across target browsers

---

## 🔄 **MIGRATION STRATEGY**

### **Gradual Replacement Approach**
1. **Phase 1**: Build React frontend alongside existing Dash application
2. **Phase 2**: Create feature toggle to switch between Dash and React versions
3. **Phase 3**: User testing and feedback collection from beta testers
4. **Phase 4**: Gradual rollout to production users with ability to fallback
5. **Phase 5**: Complete migration and deprecation of Dash application

### **Data Migration & Validation**
- **API Compatibility**: Ensure 100% API compatibility before frontend migration
- **Feature Parity**: Validate all existing features work identically in React version
- **Performance Comparison**: Benchmark against current Dash application performance
- **User Acceptance Testing**: Gather feedback from key stakeholders and end users
- **Rollback Plan**: Maintain ability to revert to Dash application if needed

### **Training & Documentation**
- **User Guide**: Comprehensive documentation for new React interface
- **Migration Guide**: Step-by-step instructions for transitioning users
- **API Documentation**: Updated documentation reflecting React frontend integration
- **Troubleshooting**: Common issues and solutions during migration period
- **Support Plan**: Dedicated support during transition period

---

## 📚 **TECHNICAL DOCUMENTATION**

### **API Integration Examples**

```typescript
// Example: Complete workflow from state selection to calculation
async function completeWorkflow() {
  // 1. Load available states
  const { data: states } = await useStates();
  
  // 2. User selects state
  const selectedState = states.find(s => s.code === 'SP');
  
  // 3. Load municipalities for selected state
  const { data: municipalities } = await useMunicipalities(selectedState.code);
  
  // 4. Load hexagon data for state
  const { data: hexagonData } = await useHexagonData({
    state: selectedState.code,
    resolution: 7,
    education_levels: ['INF_CRE', 'INF_PRE']
  });
  
  // 5. Calculate classroom needs
  const calculateMutation = useCalculateNeeds();
  const results = await calculateMutation.mutateAsync({
    state: selectedState.code,
    resolution: 7,
    education_levels: ['INF_CRE'],
    parameters: {
      INF_CRE: {
        pop_not_in_school_pct: 15.0,
        students_private_pct: 8.5,
        students_integral_pct: 25.0,
        students_nocturnal_pct: 0.0,
        students_per_classroom: 15
      }
    }
  });
  
  return { hexagonData, results };
}
```

### **Component Architecture Examples**

```typescript
// Example: Reusable map layer component
interface MapLayerProps<T> {
  data: T[];
  getColor: (item: T) => [number, number, number, number];
  getTooltip: (item: T) => string;
  onClick?: (item: T) => void;
}

function createMapLayer<T extends { h3_index: string }>({
  data,
  getColor,
  getTooltip,
  onClick,
}: MapLayerProps<T>) {
  return new H3HexagonLayer({
    id: 'data-layer',
    data,
    getHexagon: (d) => d.h3_index,
    getFillColor: getColor,
    pickable: true,
    onClick: onClick ? ({ object }) => onClick(object) : undefined,
    getTooltip: ({ object }) => object ? getTooltip(object) : null,
  });
}
```

This comprehensive PRD provides a complete roadmap for building a modern, performant React frontend that seamlessly integrates with the GeoDjango backend while providing an enhanced user experience compared to the existing Dash application.

The specification covers all aspects from technical architecture to deployment, ensuring the frontend can handle the complex educational data visualization requirements while maintaining high performance and accessibility standards.