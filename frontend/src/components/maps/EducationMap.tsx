import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import type { DeckGLRef } from '@deck.gl/react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { H3HexagonLayerProps } from '@deck.gl/geo-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';
import Map from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { HexagonFeature, EducationLevel } from '../../types/api';
import type { MapViewState } from '../../types/dashboard';
import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { useMunicipalityBaseline, useMunicipalityGeometry, useStateBaseline } from '@/hooks/api';
import { buildEditableDefaults, computeTable, LEVELS } from '@/lib/educationCalculator';
import {
  computeExtrasPerHex,
  displaySignedClassroomBalance,
  featuresToPerHexRows,
} from '@/lib/hexExtras';
import type { ExtraPerHex } from '@/lib/hexExtras';
import { interpolateRdYlGn } from 'd3-scale-chromatic';
// import {_FpsWidget as FpsWidget, ZoomWidget, GimbalWidget, _ThemeWidget as ThemeWidget, _LoadingWidget as LoadingWidget
// } from '@deck.gl/widgets';
// import {LightGlassTheme} from '@deck.gl/widgets';
import { WebMercatorViewport, type PickingInfo } from '@deck.gl/core';
import type { Feature as GeoJSONFeature, FeatureCollection as GeoJSONFeatureCollection } from 'geojson';

// Signed display balance: negative means missing classrooms; zero/positive is blue.
function balanceToColor(netBalance: number, maxMissing: number): [number, number, number, number] {
  if (netBalance >= 0) return [135, 206, 250, 200];

  const missing = Math.abs(netBalance);
  const t = Math.max(0, Math.min(1, maxMissing > 0 ? missing / maxMissing : 0));
  // Reverse: low values -> green, high -> red
  const css = interpolateRdYlGn(1 - t); // returns e.g., 'rgb(26, 150, 65)'
  // Parse 'rgb(r, g, b)' into [r,g,b,a]
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(css);
  if (m) {
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    return [r, g, b, 200];
  }
  // Fallback: light gray
  return [200, 200, 200, 200];
}

// Label utility for tooltip
function getEducationLevelLabel(level: EducationLevel): string {
  switch (level) {
    case 'INF_CRE': return 'Infantil Creche';
    case 'INF_PRE': return 'Infantil Pré-escola';
    case 'FUND_AI': return 'Fundamental Anos Iniciais';
    case 'FUND_AF': return 'Fundamental Anos Finais';
    case 'MED': return 'Ensino Médio';
    default: return level;
  }
}

type HexagonApiPayload =
  | HexagonFeature[]
  | {
    count?: number;
    results?: HexagonFeature[];
    metadata?: unknown;
  };

export interface EducationMapProps {
  hexagonData: HexagonApiPayload | null | undefined;
  // kept for backward compatibility; coloring now uses selected levels from the store
  selectedEducationLevel: EducationLevel;
  onHexagonClick?: (hexagon: HexagonFeature) => void;
  onViewStateChange?: (viewState: MapViewState) => void;
  /** Optional URL to a GeoJSON to overlay (served from public/) */
  geojsonUrl?: string;
}

export function EducationMap({
  hexagonData,
  // selectedEducationLevel kept in props for backward compat; unused now
  onHexagonClick,
  onViewStateChange,
  geojsonUrl,
}: EducationMapProps) {
  const mapViewState = useDashboardStore((s) => s.mapViewState);
  const updateView = useDashboardStore((s) => s.updateMapViewState);
  const appliedMunicipality = useDashboardStore((s) => s.appliedMunicipality);
  const appliedState = useDashboardStore((s) => s.appliedState);
  const selectedLevels = useDashboardStore((s) => s.appliedEducationLevels);
  const selectedLevelsDraft = useDashboardStore((s) => s.selectedEducationLevels);
  const calculatorInputs = useDashboardStore((s) => s.calculatorInputs);
  const calculatorComputed = useDashboardStore((s) => s.calculatorComputed);
  const filterRange = useDashboardStore((s) => s.filterRange);
  const updateFilterRange = useDashboardStore((s) => s.updateFilterRange);
  const [geojsonData, setGeojsonData] = useState<GeoJSONFeatureCollection | null>(null);
  const deckRef = useRef<DeckGLRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFitBoundsRef = useRef<string | null>(null);
  const [hoveredHex, setHoveredHex] = useState<{
    hex: HexagonFeature;
    x: number;
    y: number;
  } | null>(null);
  const [stateBoundary, setStateBoundary] = useState<GeoJSONFeatureCollection | null>(null);

  // Fetch baseline to derive default calculator parameters
  const municipalityId = appliedMunicipality?.id ?? null;
  const { data: municipalityBaseline } = useMunicipalityBaseline(municipalityId);
  const { data: stateBaseline } = useStateBaseline(!municipalityId ? appliedState?.code || null : null);
  const baselineData = municipalityBaseline || stateBaseline;
  const { data: municipalityGeom } = useMunicipalityGeometry(municipalityId);

  // Load optional GeoJSON overlay from a static URL
  useEffect(() => {
    let cancelled = false;
    if (!geojsonUrl) {
      setGeojsonData(null);
      return;
    }
    fetch(geojsonUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((d) => {
        if (!cancelled) setGeojsonData(d);
      })
      .catch(() => {
        if (!cancelled) setGeojsonData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [geojsonUrl]);

  // Load state boundary when we have a state selected and no municipality selected.
  useEffect(() => {
    let cancelled = false;
    if (!appliedState || appliedMunicipality) {
      setStateBoundary(null);
      return;
    }
    // Fetch the Brazil states collection and extract the selected state polygon.
    fetch('/data/brazil_state.geojson')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((collection: GeoJSONFeatureCollection) => {
        if (cancelled) return;
        if (!collection.features) { setStateBoundary(null); return; }
        const code = appliedState.code;
        const match = collection.features.find(f => {
          const props = (f as any).properties || {};
          return parseInt(props.code_state, 10) === parseInt(code, 10);
        });
        if (match) {
          setStateBoundary({
            type: 'FeatureCollection',
            features: [match],
          });
        } else {
          setStateBoundary(null);
        }
      })
      .catch(() => { if (!cancelled) setStateBoundary(null); });
    return () => { cancelled = true; };
  }, [appliedState, appliedMunicipality]);

  // Extract features array from either format
  const features = useMemo<HexagonFeature[]>(() => {
    if (!hexagonData) return [];
    if (Array.isArray(hexagonData)) return hexagonData;
    const results = (hexagonData as { results?: HexagonFeature[] }).results;
    if (Array.isArray(results)) return results as HexagonFeature[];
    return [];
  }, [hexagonData]);

  // Build calculator parameter snapshot prioritizing live calculator values; fallback to baseline defaults
  const tableParams = useMemo(() => {
    // 1) If user has modified calculator, use those live values
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

    // 2) Otherwise, fallback to baseline-derived defaults (keeps old behavior)
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

  // Compute extras per hex and a quick lookup by hex id
  // Use draft selection for coloring if present; fallback to applied
  // When no levels selected, return empty array to show neutral map state
  const levelsForColoring = useMemo<EducationLevel[]>(
    () => (selectedLevelsDraft?.length ? selectedLevelsDraft : selectedLevels || []) as EducationLevel[],
    [selectedLevelsDraft, selectedLevels]
  );

  const { extrasByHex, maxMissing, minMissing } = useMemo(() => {
    if (!features.length || !tableParams) return { extrasByHex: {} as Record<string, ExtraPerHex>, maxMissing: 0, minMissing: 0 };
    const rows = featuresToPerHexRows(features);
    const extras = computeExtrasPerHex(rows, tableParams, levelsForColoring);
    const map: Record<string, ExtraPerHex> = {};
    let m = 0;
    let minPos = Infinity;
    for (const r of extras) {
      map[r.hexId] = r;
      if (r.classroomsNeeded > m) m = r.classroomsNeeded;
      if (r.classroomsNeeded > 0 && r.classroomsNeeded < minPos) minPos = r.classroomsNeeded;
    }
    return { extrasByHex: map, maxMissing: m, minMissing: Number.isFinite(minPos) ? minPos : 0 };
  }, [features, tableParams, levelsForColoring]);

  // When calculator changes alter the domain, reset filter to full range for visibility
  // Only reset when domain changes significantly (avoid fighting with user slider adjustments)
  const prevMapDomainRef = useRef<{ min: number, max: number } | null>(null);

  useEffect(() => {
    if (maxMissing <= 0) return;
    const lower = minMissing > 0 ? Math.min(1, minMissing) : 0;

    // Only reset if domain changed significantly
    const isDomainChange = !prevMapDomainRef.current ||
      Math.abs(prevMapDomainRef.current.min - lower) > 0.1 ||
      Math.abs(prevMapDomainRef.current.max - maxMissing) > 0.1;

    if (isDomainChange) {
      prevMapDomainRef.current = { min: lower, max: maxMissing };
      updateFilterRange([lower, maxMissing]);
    }
  }, [maxMissing, minMissing, updateFilterRange]);

  const layers = useMemo(() => {
    return [
      // Background layer shows only missing-classroom hexagons excluded by the filter.
      new H3HexagonLayer<HexagonFeature>({
        id: 'education-hexagons-grey',
        data: features,
        getHexagon: (d: HexagonFeature) => d.h3_index,
        pickable: true,
        extruded: false,
        getFillColor: (d: HexagonFeature) => {
          const missing = extrasByHex[d.h3_index]?.classroomsNeeded || 0;
          const inRange = missing >= filterRange[0] && missing <= filterRange[1];
          const shouldGrey = !tableParams || (missing > 0 && !inRange);
          return shouldGrey ? [210, 210, 210, 160] : [0, 0, 0, 0];
        },
        getLineColor: [180, 180, 180, 200],
        lineWidthMinPixels: 0.5,
        // Keep hover/click so users can see why it's grey
        onClick: (info: PickingInfo<HexagonFeature>) => {
          if (info.object) onHexagonClick?.(info.object as HexagonFeature);
        },
        onHover: (info: PickingInfo<HexagonFeature>) => {
          if (info.object && info.x !== undefined && info.y !== undefined) {
            setHoveredHex({
              hex: info.object as HexagonFeature,
              x: info.x,
              y: info.y,
            });
          } else {
            setHoveredHex(null);
          }
        },
        updateTriggers: {
          getFillColor: [extrasByHex, filterRange[0], filterRange[1], !!tableParams],
        },
      } as unknown as H3HexagonLayerProps<HexagonFeature>),
      // new TileLayer({
      //   id: 'base-map-tiles',
      //   // Esri World Imagery
      //   data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      //   minZoom: 0,
      //   maxZoom: 18,
      //   tileSize: 256,
      //   opacity: 1,
      //   renderSubLayers: (props) => {
      //     const { boundingBox } = props.tile;
      //     return new BitmapLayer(props, {
      //       data: null,
      //       image: props.data,
      //       bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]]
      //     });
      //   },
      // }),
      // new TileLayer({
      //   id: 'base-map-label-tiles',
      //   // Carto Voyager Only Labels
      //   data: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      //   minZoom: 0,
      //   maxZoom: 22,
      //   tileSize: 256,
      //   opacity: 1.0,
      //   renderSubLayers: (props) => {
      //     const { boundingBox } = props.tile;
      //     return new BitmapLayer(props, {
      //       data: null,
      //       image: props.data,
      //       bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
      //     });
      //   },
      // }),
      new H3HexagonLayer<HexagonFeature>({
        id: 'education-hexagons',
        data: features,
        getHexagon: (d: HexagonFeature) => d.h3_index,
        pickable: true,
        extruded: true,
        elevationScale: 1,
        getElevation: (d: HexagonFeature) => Math.abs(extrasByHex[d.h3_index]?.netBalance || 0),
        getFillColor: (d: HexagonFeature) => balanceToColor(extrasByHex[d.h3_index]?.netBalance || 0, maxMissing),
        // GPU-side filtering uses the displayed number of missing classrooms.
        extensions: [new DataFilterExtension({ filterSize: 1 })],
        // Blue hexagons (zero or surplus) always pass the missing-classroom filter.
        getFilterValue: (d: HexagonFeature) => {
          const missing = extrasByHex[d.h3_index]?.classroomsNeeded || 0;
          return missing === 0 ? (filterRange[0] + filterRange[1]) / 2 : missing;
        },
        filterRange: filterRange,
        // Ensure accessors recompute when calculator-derived values change
        updateTriggers: {
          getElevation: [extrasByHex],
          getFillColor: [extrasByHex, maxMissing],
          // Include filterRange values to force re-computation of getFilterValue
          getFilterValue: [extrasByHex, filterRange[0], filterRange[1]],
        },
        opacity: 0.8,
        onClick: (info: PickingInfo<HexagonFeature>) => {
          if (info.object) onHexagonClick?.(info.object as HexagonFeature);
        },
        onHover: (info: PickingInfo<HexagonFeature>) => {
          if (info.object && info.x !== undefined && info.y !== undefined) {
            setHoveredHex({
              hex: info.object as HexagonFeature,
              x: info.x,
              y: info.y,
            });
          } else {
            setHoveredHex(null);
          }
        },
      } as unknown as H3HexagonLayerProps<HexagonFeature>),
      ...(geojsonData
        ? [
          new GeoJsonLayer({
            id: 'geojson-overlay',
            data: geojsonData,
            pickable: true,
            stroked: true,
            filled: false,
            getLineColor: [255, 0, 0, 220],
            getLineWidth: 2,
            lineWidthMinPixels: 1.5,
          }),
        ]
        : []),
      ...(municipalityGeom
        ? [
          new GeoJsonLayer({
            id: 'municipality-boundary',
            data: municipalityGeom as GeoJSONFeature,
            pickable: false,
            stroked: true,
            filled: false,
            getLineColor: [0, 122, 255, 220],
            getLineWidth: 2.5,
            lineWidthMinPixels: 2,
            parameters: { depthTest: false },
          }),
        ]
        : []),
      // State boundary only when municipality not selected
      ...(!municipalityGeom && stateBoundary
        ? [
          new GeoJsonLayer({
            id: 'state-boundary',
            data: stateBoundary,
            pickable: false,
            stroked: true,
            filled: false,
            getLineColor: [0, 180, 100, 220],
            getLineWidth: 2.5,
            lineWidthMinPixels: 2,
            parameters: { depthTest: false },
          }),
        ]
        : []),
    ];
  }, [features, onHexagonClick, geojsonData, municipalityGeom, extrasByHex, maxMissing, filterRange, tableParams]);

  useEffect(() => {
    // Auto-fit the map whenever we receive a fresh set of hexagon features
    // FIXED: Remove mapViewState and updateView from dependencies to prevent infinite loop
    if (!features.length) {
      lastFitBoundsRef.current = null;
      return;
    }
    const deck = deckRef.current?.deck;
    const container = containerRef.current;
    if (!deck || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    // Since we don't have geometry anymore, we'll use a simpler approach:
    // Let the H3HexagonLayer render first, then use its bounds
    // For now, we'll skip auto-fitting and let the user control the view
    // Or use a default view based on state/municipality if provided

    // TODO: Could use h3-js library to compute bounds from H3 indices if needed
    // For now, commenting out the auto-fit logic
  }, [features]); // Only depend on features to avoid infinite loop

  // Fit to municipality boundary when geometry changes
  useEffect(() => {
    if (!municipalityGeom) return;
    const deck = deckRef.current?.deck;
    const container = containerRef.current;
    if (!deck || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    // Compute bbox from GeoJSON Feature (Polygon or MultiPolygon)
    const geom = municipalityGeom.geometry as any;
    if (!geom || !geom.coordinates) return;

    const extendBbox = (bbox: number[], coord: number[]) => {
      const [x, y] = coord;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return bbox;
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
      return bbox;
    };

    const walkCoords = (coords: any, bbox: number[]) => {
      if (typeof coords[0] === 'number') {
        extendBbox(bbox, coords as number[]);
      } else if (Array.isArray(coords)) {
        for (const c of coords) walkCoords(c, bbox);
      }
    };

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    walkCoords(geom.coordinates, bbox);
    if (!isFinite(bbox[0]) || !isFinite(bbox[1]) || !isFinite(bbox[2]) || !isFinite(bbox[3])) return;

    const sig = `${appliedMunicipality?.id}|${bbox.join(',')}`;
    if (lastFitBoundsRef.current === sig) return;

    const viewport = new WebMercatorViewport({
      width,
      height,
      longitude: mapViewState.longitude,
      latitude: mapViewState.latitude,
      zoom: mapViewState.zoom,
      bearing: (mapViewState as any).bearing ?? 0,
      pitch: (mapViewState as any).pitch ?? 0,
    });

    const { longitude, latitude, zoom } = viewport.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 40 }
    );

    lastFitBoundsRef.current = sig;
    updateView({ ...mapViewState, longitude, latitude, zoom });
  }, [municipalityGeom, appliedMunicipality?.id, mapViewState, updateView]);

  // Fit to state boundary when a state is selected and no municipality is applied
  useEffect(() => {
    if (municipalityGeom || !stateBoundary || !appliedState) return;
    const deck = deckRef.current?.deck;
    const container = containerRef.current;
    if (!deck || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const feature = stateBoundary.features?.[0];
    const geom: any = feature?.geometry;
    if (!geom || !geom.coordinates) return;

    const extendBbox = (bbox: number[], coord: number[]) => {
      const [x, y] = coord;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return bbox;
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
      return bbox;
    };

    const walkCoords = (coords: any, bbox: number[]) => {
      if (typeof coords[0] === 'number') {
        extendBbox(bbox, coords as number[]);
      } else if (Array.isArray(coords)) {
        for (const c of coords) walkCoords(c, bbox);
      }
    };

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    walkCoords(geom.coordinates, bbox);
    if (!isFinite(bbox[0]) || !isFinite(bbox[1]) || !isFinite(bbox[2]) || !isFinite(bbox[3])) return;

    const sig = `state|${appliedState.code}|${bbox.join(',')}`;
    if (lastFitBoundsRef.current === sig) return;

    const viewport = new WebMercatorViewport({
      width,
      height,
      longitude: mapViewState.longitude,
      latitude: mapViewState.latitude,
      zoom: mapViewState.zoom,
      bearing: (mapViewState as any).bearing ?? 0,
      pitch: (mapViewState as any).pitch ?? 0,
    });

    const { longitude, latitude, zoom } = viewport.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 40 }
    );

    lastFitBoundsRef.current = sig;
    updateView({ ...mapViewState, longitude, latitude, zoom });
  }, [stateBoundary, appliedState?.code, municipalityGeom, mapViewState, updateView]);

  // Simple URL-based variant control for tooltip content.
  // ?tooltipVariant=B -> show ALL levels; anything else (or absent) -> current selected logic.
  const tooltipVariant = useMemo<'A' | 'B'>(() => {
    if (typeof window === 'undefined') return 'A';
    const v = new URLSearchParams(window.location.search).get('tooltipVariant');
    return v === 'B' ? 'B' : 'A';
  }, []);

  // Tooltip level list based on variant:
  // Variant A: current selected (draft -> applied -> fallback INF_CRE)
  // Variant B: all LEVELS
  const tooltipLevels: EducationLevel[] = useMemo(() => {
    if (tooltipVariant === 'B') return LEVELS as EducationLevel[];
    return (selectedLevelsDraft?.length ? selectedLevelsDraft : (selectedLevels?.length ? selectedLevels : ['INF_CRE'])) as EducationLevel[];
  }, [tooltipVariant, selectedLevelsDraft, selectedLevels]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <DeckGL
        ref={deckRef}
        viewState={mapViewState}
        controller={true}
        layers={layers}
        onError={(error: Error) => {
          // Some environments can transiently emit this during context/resize churn.
          // Ignore this known non-actionable error to keep the dashboard mounted.
          if (error?.message?.includes('maxTextureDimension2D')) {
            return;
          }
          throw error;
        }}
        onViewStateChange={({ viewState }) => {
          const vs = viewState as unknown as MapViewState;
          updateView(vs);
          onViewStateChange?.(vs);
        }}
        getCursor={({ isDragging, isHovering }) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}
      // widgets={[
      //     new FpsWidget({ placement: 'top-left' }), 
      //     new ZoomWidget({ placement: 'top-left' }),
      //     new GimbalWidget({ placement: 'top-left'}),
      //     new ThemeWidget({ placement: 'top-left' }),
      //     new LoadingWidget({ placement: 'top-left' })
      // ]}
      // style={LightGlassTheme}
      >
        <Map
          mapLib={maplibregl}
          reuseMaps
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          attributionControl={false}
        />


        {/* Tooltip */}
        {hoveredHex && hoveredHex.hex.education_data && (() => {
          const ed = hoveredHex.hex.education_data!;
          const hexExtras = extrasByHex[hoveredHex.hex.h3_index];
          const netBalance = hexExtras?.netBalance || 0;
          const hasBalance = Boolean(tableParams && hexExtras);

          const formatBalance = (balance: number): string => {
            const value = Math.abs(balance).toLocaleString('pt-BR');
            if (balance < 0) return `${value} ${Math.abs(balance) === 1 ? 'sala faltante' : 'salas faltantes'}`;
            if (balance > 0) return `${value} ${balance === 1 ? 'sala excedente' : 'salas excedentes'}`;
            return '0 salas (sem déficit nem excedente)';
          };

          const toFloat = (v: number | string | null | undefined): number => {
            if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
            if (typeof v === 'string') {
              const n = parseFloat(v);
              return Number.isFinite(n) ? n : 0;
            }
            return 0;
          };

          const totalSchoolAgePop =
            toFloat(ed.pop_inf_cre) +
            toFloat(ed.pop_inf_pre) +
            toFloat(ed.pop_fund_ai) +
            toFloat(ed.pop_fund_af) +
            toFloat(ed.pop_med);

          const popByLevel = (lvl: EducationLevel) => {
            switch (lvl) {
              case 'INF_CRE': return Math.round(toFloat(ed.pop_inf_cre));
              case 'INF_PRE': return Math.round(toFloat(ed.pop_inf_pre));
              case 'FUND_AI': return Math.round(toFloat(ed.pop_fund_ai));
              case 'FUND_AF': return Math.round(toFloat(ed.pop_fund_af));
              case 'MED': return Math.round(toFloat(ed.pop_med));
              default: return 0;
            }
          };

          return (
            <div
              className="absolute pointer-events-none bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-50 max-w-xs"
              style={{ left: hoveredHex.x + 10, top: hoveredHex.y + 10 }}
            >
              <div className="text-sm space-y-1">
                {!hasBalance ? (
                  <>
                    <div className="text-xs text-gray-600">
                      <strong>População em idade escolar:</strong> {Math.round(totalSchoolAgePop).toLocaleString('pt-BR')}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="text-xs font-semibold text-gray-700 mb-1">Por nível:</div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {(LEVELS as EducationLevel[]).map((lvl) => (
                          <div key={lvl}>
                            {getEducationLevelLabel(lvl)}: {popByLevel(lvl).toLocaleString('pt-BR')}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-gray-600">
                      <strong>Saldo do Hexágono:</strong> {formatBalance(netBalance)}
                    </div>
                    <div className="text-xs text-gray-600">
                      <strong>Salas Existentes:</strong> {ed.qt_salas_utilizadas.toLocaleString('pt-BR')}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="text-xs font-semibold text-gray-700 mb-1">Por nível:</div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {tooltipLevels.map((lvl) => (
                          <div key={lvl}>
                            {getEducationLevelLabel(lvl)}: {formatBalance(
                              displaySignedClassroomBalance(hexExtras?.perLevel[lvl] || 0)
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {import.meta.env.DEV && (
                  <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                    H3: {hoveredHex.hex.h3_index}
                    <div>Variant: {tooltipVariant}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </DeckGL>

      <div className="pointer-events-auto absolute bottom-1 right-0 z-10">
        <div className="rounded-full bg-card/95 px-2 py-1 text-[10px] leading-none text-card-foreground whitespace-nowrap">
          &copy;{' '}
          <a
            href="https://carto.com/about-carto/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            CARTO
          </a>
          , &copy;{' '}
          <a
            href="https://www.openstreetmap.org/about/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            OpenStreetMap
          </a>{' '}
          contributors
        </div>
      </div>
    </div>
  );
}
