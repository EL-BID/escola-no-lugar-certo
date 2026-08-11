import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { useHexagonData } from '@/hooks/api';
import { EDUCATION_LEVEL_LABELS } from '@/lib/calculatorFields';
import { HEXAGON_RESOLUTION_INFO } from '@/types/report';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Printer, Loader2, MapPin } from 'lucide-react';
import type { EducationLevel, HexagonFeature } from '@/types/api';
import { computeExtrasPerHex, featuresToPerHexRows, LEVELS } from '@/lib/hexExtras';
import * as h3 from 'h3-js';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Signed balance colors: zero/surplus is blue; missing rooms use the demand gradient.
function getHexColor(netBalance: number, maxMissing: number): string {
  if (netBalance >= 0) return '#87cefa';
  const ratio = Math.min(Math.abs(netBalance) / Math.max(1, maxMissing), 1);
  // Green (0) -> Yellow (0.5) -> Red (1)
  if (ratio <= 0.5) {
    const r = Math.round(34 + (234 - 34) * (ratio * 2));
    const g = Math.round(197 + (179 - 197) * (ratio * 2));
    const b = Math.round(94 + (8 - 94) * (ratio * 2));
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(234 + (239 - 234) * ((ratio - 0.5) * 2));
    const g = Math.round(179 + (68 - 179) * ((ratio - 0.5) * 2));
    const b = Math.round(8 + (68 - 8) * ((ratio - 0.5) * 2));
    return `rgb(${r},${g},${b})`;
  }
}

// Component to fit map bounds
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);

  return null;
}

// Overview map showing all hexagons
function OverviewMap({
  hexagons,
  maxValue,
  width = '100%',
  height = 400
}: {
  hexagons: Array<{ hexId: string; netBalance: number }>;
  maxValue: number;
  width?: string | number;
  height?: number;
}) {
  // Get all hexagon boundaries and compute overall bounds
  const { boundaries, overallBounds } = useMemo(() => {
    const allBoundaries: Array<{ boundary: [number, number][]; value: number; hexId: string }> = [];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

    for (const hex of hexagons) {
      try {
        const boundary = h3.cellToBoundary(hex.hexId);
        const latLngs = boundary.map(([lat, lng]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          return [lat, lng] as [number, number];
        });
        allBoundaries.push({ boundary: latLngs, value: hex.netBalance, hexId: hex.hexId });
      } catch {
        // skip invalid hex
      }
    }

    const bounds = minLat !== Infinity
      ? L.latLngBounds([minLat, minLng], [maxLat, maxLng])
      : null;

    return { boundaries: allBoundaries, overallBounds: bounds };
  }, [hexagons]);

  if (!overallBounds || boundaries.length === 0) {
    return (
      <div
        className="rounded-md border bg-muted flex items-center justify-center text-muted-foreground"
        style={{ width, height }}
      >
        Nenhum hexágono para exibir
      </div>
    );
  }

  const center = overallBounds.getCenter();

  return (
    <div style={{ width, height }} className="rounded-md border overflow-hidden relative z-0">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={10}
        style={{ width: '100%', height: '100%', zIndex: 0 }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {boundaries.map(({ boundary, value, hexId }) => (
          <Polygon
            key={hexId}
            positions={boundary}
            pathOptions={{
              color: getHexColor(value, maxValue),
              weight: 1,
              fillColor: getHexColor(value, maxValue),
              fillOpacity: 0.6,
            }}
          />
        ))}
        <FitBounds bounds={overallBounds} />
      </MapContainer>
    </div>
  );
}

// Leaflet map component with hexagon polygon
function LeafletMapImage({ lat, lon, hexId, width = 200, height = 150 }: {
  lat: number;
  lon: number;
  hexId: string;
  width?: string | number;
  height?: number;
}) {
  // Get hexagon boundary from h3 index
  const hexBoundary = useMemo(() => {
    if (!hexId) return null;
    try {
      // h3.cellToBoundary returns [[lat, lng], ...] - Leaflet needs [lat, lng] format
      const boundary = h3.cellToBoundary(hexId);
      return boundary.map(([lat, lng]) => [lat, lng] as [number, number]);
    } catch {
      return null;
    }
  }, [hexId]);

  if (!lat || !lon || !hexBoundary) {
    return (
      <div
        className="rounded-md border bg-muted flex items-center justify-center text-muted-foreground text-xs"
        style={{ width, height }}
      >
        Localização indisponível
      </div>
    );
  }

  return (
    <div style={{ width, height }} className="rounded-md border overflow-hidden relative z-0">
      <MapContainer
        center={[lat, lon]}
        zoom={15}
        style={{ width: '100%', height: '100%', zIndex: 0 }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polygon
          positions={hexBoundary}
          pathOptions={{
            color: '#2563eb',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.4,
          }}
        />
        <FitBounds bounds={hexBoundary} />
      </MapContainer>
    </div>
  );
}

// Reverse geocoding hook
function useReverseGeocode(lat: number, lon: number) {
  const [address, setAddress] = useState<{ short: string; city: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lat || !lon) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchAddress = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'Escola-no-Lugar-Certo/1.0' }
          }
        );
        const data = await response.json();

        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.street || '';
        const suburb = addr.suburb || addr.neighbourhood || addr.district || '';
        const city = addr.city || addr.town || addr.municipality || '';
        const state = addr.state || '';

        setAddress({
          short: road && suburb ? `${road}, ${suburb}` : road || suburb || 'Endereço não disponível',
          city: city && state ? `${city}, ${state}` : city || state || ''
        });
      } catch {
        setAddress({ short: 'Endereço não disponível', city: '' });
      } finally {
        setLoading(false);
      }
    };

    // Delay to respect Nominatim rate limits
    const timer = setTimeout(fetchAddress, 100);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [lat, lon]);

  return { address, loading };
}

// Hexagon detail card component
function HexagonDetailCard({
  hexId,
  rank,
  lat,
  lon,
  netBalance,
  byLevel,
  selectedLevels
}: {
  hexId: string;
  rank: number;
  lat: number;
  lon: number;
  netBalance: number;
  byLevel: Record<EducationLevel, number>;
  selectedLevels: EducationLevel[];
}) {
  const { address, loading: addressLoading } = useReverseGeocode(lat, lon);

  return (
    <Card className="page-break-inside-avoid mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
            {rank}
          </span>
          <div className="flex-1">
            {addressLoading ? (
              <span className="text-muted-foreground">Carregando endereço...</span>
            ) : (
              <>
                <div className="font-semibold">{address?.short}</div>
                <div className="text-sm text-muted-foreground">{address?.city}</div>
              </>
            )}
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${netBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
              {netBalance > 0 ? `+${netBalance}` : netBalance}
            </div>
            <div className="text-xs text-muted-foreground">saldo de salas</div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Map */}
          <div className="w-full lg:w-auto lg:flex-shrink-0">
            <LeafletMapImage lat={lat} lon={lon} hexId={hexId} width="100%" height={170} />
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </div>
          </div>

          {/* Level breakdown */}
          <div className="flex-1">
            <div className="text-sm font-medium mb-2">Saldo por Nível (− faltantes / + excedentes):</div>
            <div className="grid grid-cols-2 gap-2">
              {selectedLevels.map(lvl => (
                <div key={lvl} className="flex justify-between text-sm bg-muted/50 px-2 py-1 rounded">
                  <span className="text-muted-foreground">{EDUCATION_LEVEL_LABELS[lvl]}:</span>
                  <span className="font-semibold">{byLevel[lvl] > 0 ? `+${byLevel[lvl]}` : byLevel[lvl] || 0}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t flex justify-between font-semibold">
              <span>Saldo líquido:</span>
              <span className={netBalance < 0 ? 'text-red-600' : 'text-blue-600'}>
                {netBalance > 0 ? `+${netBalance}` : netBalance}
              </span>
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          ID do Hexágono: {hexId}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportPage() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(true);

  const {
    appliedState,
    appliedMunicipality,
    appliedEducationLevels,
    appliedMapResolution,
    calculatorInputs,
    calculatorComputed,
    filterRange,
  } = useDashboardStore();

  const { data: hexagonData, isLoading: hexagonLoading, loadProgress } = useHexagonData({
    state: appliedState?.code || '',
    municipality_code: appliedMunicipality?.code_ibge || undefined,
    resolution: appliedMapResolution,
    education_levels: appliedEducationLevels,
    fetch_all_pages: true,
    page_size: 2000,
    parallel_page_requests: 4,
  });

  const progressPercent = Math.max(0, Math.min(100, loadProgress.percent || 0));
  const totalHexagons = loadProgress.total ?? 0;
  const loadedHexagons = loadProgress.loaded;
  const remainingHexagons = totalHexagons > 0 ? Math.max(totalHexagons - loadedHexagons, 0) : 0;

  // Build table params from calculator state (same as EducationMap)
  const tableParams = useMemo(() => {
    if (!calculatorInputs || !calculatorComputed) return null;
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
  }, [calculatorInputs, calculatorComputed]);

  // Process hexagon data using the same logic as EducationMap
  const processedHexagons = useMemo(() => {
    if (!hexagonData?.results || !tableParams) return [];

    // Convert to HexagonFeature array
    const features = hexagonData.results as HexagonFeature[];

    // Use the same calculation as EducationMap
    const rows = featuresToPerHexRows(features);
    const extras = computeExtrasPerHex(rows, tableParams, appliedEducationLevels);

    // Build a lookup map for extras by hex id
    const extrasMap = new Map(extras.map(e => [e.hexId, e]));

    const filtered = features
      .map((f) => {
        const hexId = f.h3_index;
        const extraData = extrasMap.get(hexId);
        const byLevel = {} as Record<EducationLevel, number>;

        appliedEducationLevels.forEach(lvl => {
          byLevel[lvl] = extraData?.perLevelBalance[lvl] || 0;
        });

        // Get lat/lon from h3 index
        let latitude = 0;
        let longitude = 0;
        try {
          const [lat, lon] = h3.cellToLatLng(hexId);
          latitude = lat;
          longitude = lon;
        } catch {
          // ignore
        }

        return {
          hexId,
          latitude,
          longitude,
          totalNewClassrooms: extraData?.classroomsNeeded || 0,
          netBalance: extraData?.netBalance || 0,
          byLevel,
        };
      })
      .filter(h => h.totalNewClassrooms === 0
        || (h.totalNewClassrooms >= Math.floor(filterRange[0]) && h.totalNewClassrooms <= Math.ceil(filterRange[1])))
      .sort((a, b) => b.totalNewClassrooms - a.totalNewClassrooms)
      .map((h, idx) => ({ ...h, rank: idx + 1 }));

    return filtered;
  }, [hexagonData, appliedEducationLevels, filterRange, tableParams]);

  useEffect(() => {
    // Small delay to show loading state
    const timer = setTimeout(() => setIsGenerating(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    navigate('/');
  };

  const regionText = appliedMunicipality?.name
    ? `${appliedMunicipality.name}, ${appliedState?.name} (${appliedState?.code})`
    : appliedState?.name ? `${appliedState.name} (${appliedState.code})` : 'Brasil';

  const resInfo = HEXAGON_RESOLUTION_INFO[appliedMapResolution];

  const formatNumber = (num: number) => Math.round(num).toLocaleString('pt-BR');

  if (!appliedState || appliedEducationLevels.length === 0 || !calculatorInputs || !calculatorComputed) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">
              {!calculatorInputs || !calculatorComputed
                ? 'A calculadora não foi configurada. Volte ao painel e configure os parâmetros da calculadora.'
                : 'Nenhum dado selecionado. Volte ao painel e selecione uma região.'}
            </p>
            <Button onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Painel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isGenerating || hexagonLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4 w-[min(26rem,90%)]">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-lg font-medium">Gerando relatório...</p>
            <div className="w-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{progressPercent}% concluído</span>
                <span>{loadedHexagons}{totalHexagons > 0 ? ` / ${totalHexagons}` : ''}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {totalHexagons > 0
                ? `Carregando e analisando hexágonos (${remainingHexagons} restantes)`
                : 'Iniciando carregamento dos hexágonos...'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* Print controls - hidden when printing */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b p-4 flex items-center justify-between">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Painel
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {processedHexagons.length} hexágonos no relatório
          </span>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 print:p-4 print:max-w-none pb-12">
        {/* Header */}
        <div className="text-center mb-8 print:mb-4">
          <h1 className="text-3xl font-bold mb-2">Relatório de Demanda de Salas</h1>
          <p className="text-muted-foreground">
            Gerado em: {new Date().toLocaleString('pt-BR')}
          </p>
          <p className="text-sm text-muted-foreground">Escola no Lugar Certo</p>
        </div>

        {/* Region & Filters Section */}
        <Card className="mb-6 print:mb-4 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Região e Filtros Selecionados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Região:</span> {regionText}
              </div>
              <div>
                <span className="font-semibold">Níveis de Ensino:</span>{' '}
                {appliedEducationLevels.map(l => EDUCATION_LEVEL_LABELS[l]).join(', ')}
              </div>
              <div>
                <span className="font-semibold">Tamanho do hexágono:</span>{' '}
                {resInfo?.area} ({resInfo?.analogy})
              </div>
              <div>
                <span className="font-semibold">Intervalo de salas:</span>{' '}
                {Math.floor(filterRange[0])} - {Math.ceil(filterRange[1])}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Map with all hexagons */}
        <Card className="mb-6 print:mb-4 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mapa de Hexágonos Selecionados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Visualização de todos os {processedHexagons.length} hexágonos selecionados.
              Azul indica saldo zero ou excedente; a demanda varia de verde (menor) a vermelho (maior).
            </p>
            <OverviewMap
              hexagons={processedHexagons}
              maxValue={processedHexagons[0]?.totalNewClassrooms || 0}
              height={400}
            />
            {/* Color scale legend */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="text-xs text-muted-foreground">Menor demanda</span>
              <div className="flex h-4 w-48 rounded overflow-hidden">
                <div className="flex-1" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)' }} />
              </div>
              <span className="text-xs text-muted-foreground">Maior demanda</span>
            </div>
          </CardContent>
        </Card>

        {/* Calculator Parameters */}
        {calculatorInputs && (
          <Card className="mb-6 print:mb-4 print:shadow-none print:border page-break-inside-avoid">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Parâmetros da Calculadora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2">Parâmetro</th>
                      {appliedEducationLevels.map(lvl => (
                        <th key={lvl} className="text-center p-2">{EDUCATION_LEVEL_LABELS[lvl]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'População Estimada', key: 'pop' as const, isEditable: true },
                      { label: '% Fora da escola', key: 'pctOutOfSchool' as const, isEditable: true },
                      { label: '% Rede privada', key: 'pctPrivate' as const, isEditable: true },
                      { label: '% Jornada integral', key: 'pctIntegral' as const, isEditable: true },
                      { label: '% Noturno', key: 'pctNocturnal' as const, isEditable: true },
                      { label: 'Alunos por sala', key: 'seatsPerClass' as const, isEditable: true },
                      { label: 'Salas existentes', key: 'existingClassrooms' as const, isEditable: false },
                    ].map((row) => (
                      <tr key={row.key} className={row.isEditable ? 'bg-green-50' : 'bg-blue-50'}>
                        <td className="p-2 font-medium">{row.label}</td>
                        {appliedEducationLevels.map(lvl => (
                          <td key={lvl} className="text-center p-2">
                            {row.key === 'pop' || row.key === 'existingClassrooms'
                              ? formatNumber(calculatorInputs[row.key]?.[lvl] || 0)
                              : (calculatorInputs[row.key]?.[lvl]?.toFixed(1) || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                🟢 Verde = valores editáveis | 🔵 Azul = valores calculados
              </p>
            </CardContent>
          </Card>
        )}

        {/* Calculator Results */}
        {calculatorComputed && (
          <Card className="mb-6 print:mb-4 print:shadow-none print:border page-break-inside-avoid">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Resultados da Calculadora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                <div className="bg-muted p-3 rounded">
                  <div className="text-xs text-muted-foreground">Alunos Rede Pública</div>
                  <div className="text-xl font-bold">{formatNumber(calculatorComputed.totals.studentsPublic)}</div>
                </div>
                <div className="bg-muted p-3 rounded">
                  <div className="text-xs text-muted-foreground">Vagas Necessárias</div>
                  <div className="text-xl font-bold">{formatNumber(calculatorComputed.totals.totalSeatsNeeded)}</div>
                </div>
                <div className="bg-muted p-3 rounded">
                  <div className="text-xs text-muted-foreground">Salas Necessárias</div>
                  <div className="text-xl font-bold">{formatNumber(calculatorComputed.totals.classroomsNeeded)}</div>
                </div>
                <div className="bg-blue-100 border-2 border-blue-500 p-3 rounded">
                  <div className="text-xs text-blue-700">Novas Salas Necessárias</div>
                  <div className="text-xl font-bold text-blue-600">{formatNumber(calculatorComputed.totals.newClassroomsNeeded)}</div>
                </div>
              </div>

              <h4 className="font-semibold mb-2">Detalhamento por Nível:</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2">Nível</th>
                      <th className="text-center p-2">Alunos</th>
                      <th className="text-center p-2">Salas Nec.</th>
                      <th className="text-center p-2 font-bold">Novas Salas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appliedEducationLevels.map((lvl, idx) => {
                      const levelData = calculatorComputed.byLevel[lvl];
                      return (
                        <tr key={lvl} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="p-2">{EDUCATION_LEVEL_LABELS[lvl]}</td>
                          <td className="text-center p-2">{formatNumber(levelData?.studentsPublic || 0)}</td>
                          <td className="text-center p-2">{formatNumber(levelData?.classroomsNeeded || 0)}</td>
                          <td className="text-center p-2 font-bold text-blue-600">{formatNumber(levelData?.newClassroomsNeeded || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hexagon Summary Table */}
        <Card className="mb-6 print:mb-4 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Resumo dos Hexágonos ({processedHexagons.length} hexágonos selecionados)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-center p-2 w-12">#</th>
                    <th className="text-left p-2">ID Hexágono</th>
                    {appliedEducationLevels.map(lvl => (
                      <th key={lvl} className="text-center p-2">{EDUCATION_LEVEL_LABELS[lvl].substring(0, 10)}</th>
                    ))}
                    <th className="text-center p-2 font-bold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {processedHexagons.slice(0, 50).map((hex, idx) => (
                    <tr key={hex.hexId} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                      <td className="text-center p-2 font-bold">{hex.rank}</td>
                      <td className="p-2 font-mono text-xs">{hex.hexId.substring(0, 15)}</td>
                      {appliedEducationLevels.map(lvl => (
                        <td key={lvl} className="text-center p-2">
                          {hex.byLevel[lvl] > 0 ? `+${hex.byLevel[lvl]}` : hex.byLevel[lvl] || 0}
                        </td>
                      ))}
                      <td className={`text-center p-2 font-bold ${hex.netBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {hex.netBalance > 0 ? `+${hex.netBalance}` : hex.netBalance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {processedHexagons.length > 50 && (
              <p className="text-sm text-muted-foreground mt-2 italic">
                ... e mais {processedHexagons.length - 50} hexágonos
              </p>
            )}
          </CardContent>
        </Card>

        {/* Per-Hexagon Detail Cards */}
        <div className="page-break-before">
          <h2 className="text-xl font-bold mb-4">Detalhamento por Hexágono</h2>
          <p className="text-muted-foreground mb-4">
            Detalhes individuais dos {Math.min(processedHexagons.length, 20)} hexágonos com maior demanda de novas salas.
          </p>

          <div className="space-y-4">
            {processedHexagons.slice(0, 20).map((hex) => (
              <HexagonDetailCard
                key={hex.hexId}
                hexId={hex.hexId}
                rank={hex.rank}
                lat={hex.latitude}
                lon={hex.longitude}
                netBalance={hex.netBalance}
                byLevel={hex.byLevel}
                selectedLevels={appliedEducationLevels}
              />
            ))}
          </div>

          {processedHexagons.length > 20 && (
            <p className="text-sm text-muted-foreground mt-4 italic text-center">
              Mostrando os 20 hexágonos com maior demanda. Total de hexágonos selecionados: {processedHexagons.length}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground print:mt-4">
          <p>Escola no Lugar Certo | Relatório de Demanda de Salas</p>
          <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </div>
  );
}
