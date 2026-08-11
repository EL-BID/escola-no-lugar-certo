from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Count
from django.db import connection
from django.core.cache import cache
from collections import defaultdict
from time import perf_counter
import logging
import numpy as np
import h3
from .models import State, Municipality, Hexagon, HexagonRollup, EducationData, School
from .serializers import (
    StateSerializer, StateDetailSerializer, MunicipalitySerializer, 
    HexagonEducationSerializer, HexagonEducationSimpleSerializer, 
    HexagonEducationCompactSerializer,
    MunicipalityGeometrySerializer, SchoolSerializer,
    CalculateNeedsRequestSerializer,
)
from .services.hexagon_rollups import rollup_to_feature


logger = logging.getLogger(__name__)

SUPPORTED_RESOLUTIONS = (5, 6, 7, 8)
SOURCE_HEXAGON_RESOLUTION = 8
MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST = 120000
SLOW_ANALYSIS_LOG_SECONDS = 45
DIRECT_COUNT_CACHE_TTL_SECONDS = 24 * 60 * 60
BASELINE_CACHE_TTL_SECONDS = 24 * 60 * 60
MUNICIPALITY_COUNTS_CACHE_TTL_SECONDS = 24 * 60 * 60
ROLLUP_NOT_READY_STATUS = status.HTTP_503_SERVICE_UNAVAILABLE


SEATS_DEFAULTS = {
    'INF_CRE': 15,
    'INF_PRE': 25,
    'FUND_AI': 35,
    'FUND_AF': 40,
    'MED': 40,
}

LEVEL_SUFFIXES = {
    'INF_CRE': 'inf_cre',
    'INF_PRE': 'inf_pre',
    'FUND_AI': 'fund_ai',
    'FUND_AF': 'fund_af',
    'MED': 'med',
}


def estimate_hexagons_from_res8(count_res8, target_resolution):
    if count_res8 <= 0:
        return 0

    if target_resolution == SOURCE_HEXAGON_RESOLUTION:
        return int(count_res8)

    delta = SOURCE_HEXAGON_RESOLUTION - target_resolution
    if delta > 0:
        return max(1, int(round(count_res8 / pow(7, delta))))

    return int(round(count_res8 * pow(7, abs(delta))))


def build_resolution_count_map(actual_counts_by_resolution):
    counts = {
        str(resolution): int(actual_counts_by_resolution.get(resolution, 0) or 0)
        for resolution in SUPPORTED_RESOLUTIONS
    }

    count_res8 = counts.get(str(SOURCE_HEXAGON_RESOLUTION), 0)
    if count_res8 > 0:
        for resolution in (7, 6, 5):
            key = str(resolution)
            if counts[key] <= 0:
                counts[key] = estimate_hexagons_from_res8(count_res8, resolution)

    return counts


def get_municipality_resolution_counts(municipality_ids):
    if not municipality_ids:
        return {}

    counts_by_municipality = defaultdict(dict)
    rows = Hexagon.objects.filter(
        municipality_id__in=municipality_ids,
        resolution__in=SUPPORTED_RESOLUTIONS,
    ).values('municipality_id', 'resolution').annotate(total=Count('id'))

    for row in rows:
        counts_by_municipality[row['municipality_id']][row['resolution']] = row['total']

    return {
        municipality_id: build_resolution_count_map(counts_by_municipality.get(municipality_id, {}))
        for municipality_id in municipality_ids
    }


def get_safe_resolution(requested_resolution, counts_by_resolution):
    requested = max(min(int(requested_resolution), max(SUPPORTED_RESOLUTIONS)), min(SUPPORTED_RESOLUTIONS))

    # If no count metadata is available, keep requested resolution and let endpoint handle empty results.
    if not counts_by_resolution:
        return requested, False, None

    for candidate in range(requested, min(SUPPORTED_RESOLUTIONS) - 1, -1):
        estimated_count = int(counts_by_resolution.get(str(candidate), 0) or 0)

        # Unknown/empty counts should not trigger forced downscaling.
        if estimated_count <= 0:
            continue

        if estimated_count <= MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST:
            adjusted = candidate != requested
            reason = None
            if adjusted:
                reason = (
                    f'auto_adjusted_for_scale:max={MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST};'
                    f'requested_count={counts_by_resolution.get(str(requested), 0)};'
                    f'candidate_count={estimated_count}'
                )
            return candidate, adjusted, reason

    return min(SUPPORTED_RESOLUTIONS), True, (
        f'auto_adjusted_for_scale:max={MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST};'
        f'requested_count={counts_by_resolution.get(str(requested), 0)};'
        f'fallback={min(SUPPORTED_RESOLUTIONS)}'
    )


def attach_hexagon_counts_by_resolution(municipalities):
    """Attach hexagon counts grouped by resolution to municipality instances."""
    municipality_list = list(municipalities)
    municipality_ids = [m.id for m in municipality_list]
    if not municipality_ids:
        return municipality_list

    counts_by_municipality = get_municipality_resolution_counts(municipality_ids)

    for municipality in municipality_list:
        municipality.hexagon_counts_by_resolution = counts_by_municipality.get(
            municipality.id,
            build_resolution_count_map({}),
        )

    return municipality_list


def build_direct_count_cache_key(state_code, municipality_code, municipality_name, resolution):
    municipality_key = municipality_code or municipality_name or 'all'
    return f'education_data_direct_count_v1:{state_code}:{municipality_key}:{resolution}'


def build_endpoint_cache_key(prefix, *parts):
    normalized_parts = [str(part) if part not in (None, '') else 'all' for part in parts]
    return f"{prefix}:{':'.join(normalized_parts)}"


def to_number(value):
    if value is None:
        return 0
    try:
        return float(value)
    except Exception:
        return 0


def rollup_not_ready_payload(state_code, municipality_code, municipality_name, resolution):
    return {
        'error': 'rollup_not_ready',
        'detail': 'Precomputed hexagon rollups are required before serving this request.',
        'state': state_code,
        'municipality': municipality_code or municipality_name,
        'resolution': resolution,
    }


def get_rollup_queryset(state_code, resolution, municipality=None):
    queryset = HexagonRollup.objects.filter(
        state__code=state_code,
        resolution=resolution,
        source_resolution=SOURCE_HEXAGON_RESOLUTION,
    ).select_related('municipality')

    if municipality is not None:
        return queryset.filter(municipality=municipality)

    return queryset.filter(municipality__isnull=True)


def get_coarsest_rollup_queryset(state_code, municipality=None):
    queryset = HexagonRollup.objects.filter(
        state__code=state_code,
        source_resolution=SOURCE_HEXAGON_RESOLUTION,
    )
    if municipality is not None:
        queryset = queryset.filter(municipality=municipality)
    else:
        queryset = queryset.filter(municipality__isnull=True)

    resolution = queryset.order_by('resolution').values_list('resolution', flat=True).first()
    if resolution is None:
        return None, None

    return queryset.filter(resolution=resolution), resolution


def build_baseline_payload_from_aggregate(agg, state_code, municipality=None):
    import math

    def build_level(level_code, nocturnal=False):
        suffix = LEVEL_SUFFIXES[level_code]
        pop = to_number(agg.get(f'pop_{suffix}'))
        public_enroll = to_number(agg.get(f'qt_mat_{suffix}'))
        private_enroll = to_number(agg.get(f'private_qt_mat_{suffix}'))
        int_enroll = to_number(agg.get(f'qt_mat_{suffix}_int'))
        integral_share = (int_enroll / public_enroll) if public_enroll > 0 else 0

        if nocturnal and level_code == 'FUND_AF':
            nocturnal_share = (
                to_number(agg.get('nocturnal_weighted_fund_af')) / public_enroll
                if public_enroll > 0
                else 0
            )
        elif nocturnal and level_code == 'MED':
            nocturnal_share = (
                to_number(agg.get('nocturnal_weighted_med')) / public_enroll
                if public_enroll > 0
                else 0
            )
        else:
            nocturnal_share = 0

        classrooms_key = f'qt_salas_weighted_{suffix}'
        existing_weighted = to_number(agg.get(classrooms_key))
        return {
            'pop': int(round(pop)),
            'totalEnroll': int(round(public_enroll)),
            'privateEnroll': int(round(private_enroll)),
            'integralEnrollShare': float(max(0.0, min(1.0, integral_share))),
            'nocturnalShare': float(max(0.0, min(1.0, nocturnal_share))),
            'existingClassrooms': int(math.ceil(existing_weighted)),
            'seatsPerClass': SEATS_DEFAULTS[level_code],
        }

    return {
        'state': state_code,
        'municipalityId': municipality.id if municipality else None,
        'municipalityName': municipality.name if municipality else None,
        'code_ibge': municipality.code_ibge if municipality else None,
        'levels': {
            'INF_CRE': build_level('INF_CRE', nocturnal=False),
            'INF_PRE': build_level('INF_PRE', nocturnal=False),
            'FUND_AI': build_level('FUND_AI', nocturnal=False),
            'FUND_AF': build_level('FUND_AF', nocturnal=True),
            'MED': build_level('MED', nocturnal=True),
        },
    }


def build_baseline_from_rollups(state_code, municipality=None):
    rollup_qs, resolution = get_coarsest_rollup_queryset(state_code, municipality=municipality)
    if rollup_qs is None:
        return None

    agg = rollup_qs.aggregate(
        pop_inf_cre=Sum('pop_inf_cre'),
        pop_inf_pre=Sum('pop_inf_pre'),
        pop_fund_ai=Sum('pop_fund_ai'),
        pop_fund_af=Sum('pop_fund_af'),
        pop_med=Sum('pop_med'),
        qt_mat_inf_cre=Sum('qt_mat_inf_cre'),
        qt_mat_inf_pre=Sum('qt_mat_inf_pre'),
        qt_mat_fund_ai=Sum('qt_mat_fund_ai'),
        qt_mat_fund_af=Sum('qt_mat_fund_af'),
        qt_mat_med=Sum('qt_mat_med'),
        private_qt_mat_inf_cre=Sum('private_qt_mat_inf_cre'),
        private_qt_mat_inf_pre=Sum('private_qt_mat_inf_pre'),
        private_qt_mat_fund_ai=Sum('private_qt_mat_fund_ai'),
        private_qt_mat_fund_af=Sum('private_qt_mat_fund_af'),
        private_qt_mat_med=Sum('private_qt_mat_med'),
        qt_mat_inf_cre_int=Sum('qt_mat_inf_cre_int'),
        qt_mat_inf_pre_int=Sum('qt_mat_inf_pre_int'),
        qt_mat_fund_ai_int=Sum('qt_mat_fund_ai_int'),
        qt_mat_fund_af_int=Sum('qt_mat_fund_af_int'),
        qt_mat_med_int=Sum('qt_mat_med_int'),
        qt_salas_weighted_inf_cre=Sum('qt_salas_weighted_inf_cre'),
        qt_salas_weighted_inf_pre=Sum('qt_salas_weighted_inf_pre'),
        qt_salas_weighted_fund_ai=Sum('qt_salas_weighted_fund_ai'),
        qt_salas_weighted_fund_af=Sum('qt_salas_weighted_fund_af'),
        qt_salas_weighted_med=Sum('qt_salas_weighted_med'),
        nocturnal_weighted_fund_af=Sum('nocturnal_weighted_fund_af'),
        nocturnal_weighted_med=Sum('nocturnal_weighted_med'),
    )
    payload = build_baseline_payload_from_aggregate(
        agg,
        state_code,
        municipality=municipality,
    )
    payload['metadata'] = {
        'rollup': True,
        'resolution': resolution,
        'source_resolution': SOURCE_HEXAGON_RESOLUTION,
    }
    return payload


@api_view(['GET'])
def health_check(request):
    """Health check endpoint for container orchestration"""
    try:
        # Check database connectivity
        connection.ensure_connection()
        return Response({
            'status': 'healthy',
            'database': 'connected'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'status': 'unhealthy',
            'error': str(e)
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class StateViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for State management"""
    queryset = State.objects.all()
    serializer_class = StateSerializer
    lookup_field = 'code'
    lookup_value_regex = '[0-9]+'
    pagination_class = None
    
    def retrieve(self, request, *args, **kwargs):
        """Get detailed state information with municipalities"""
        instance = self.get_object()
        serializer = StateDetailSerializer(instance)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], pagination_class=None)
    def municipalities(self, request, code=None):
        """List municipalities for state switching"""
        state = self.get_object()
        include_counts_raw = (request.query_params.get('include_counts') or '').strip().lower()
        include_counts = include_counts_raw in ('1', 'true', 'yes')

        municipalities = state.municipalities.only(
            'id',
            'name',
            'code_ibge',
            'area_km2',
            'population',
        ).order_by('name')

        if include_counts:
            municipalities = attach_hexagon_counts_by_resolution(municipalities)
            total_count = len(municipalities)
        else:
            municipalities = list(municipalities)
            total_count = len(municipalities)

        serializer = MunicipalitySerializer(municipalities, many=True)
        return Response({
            'count': total_count,
            'metadata': {
                'include_counts': include_counts,
            },
            'results': serializer.data
        })

    @action(detail=True, methods=['get'], url_path='table-baseline')
    def table_baseline(self, request, code=None):
        """Return aggregated baseline inputs per education level for this state.

        Mirrors municipality baseline structure so frontend can reuse logic.
        """
        state = self.get_object()
        cache_key = build_endpoint_cache_key('state_table_baseline_v2', state.code)
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        response_payload = build_baseline_from_rollups(state.code)
        if response_payload is None:
            return Response(
                rollup_not_ready_payload(state.code, None, None, 'baseline'),
                status=ROLLUP_NOT_READY_STATUS,
            )

        cache.set(cache_key, response_payload, timeout=BASELINE_CACHE_TTL_SECONDS)
        return Response(response_payload)


class MunicipalityViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Municipality management"""
    queryset = Municipality.objects.select_related('state')
    serializer_class = MunicipalitySerializer
    
    def get_queryset(self):
        """Filter by state if provided"""
        queryset = super().get_queryset()

        if self.action == 'list':
            queryset = queryset.only(
                'id',
                'name',
                'code_ibge',
                'area_km2',
                'population',
                'state__code',
            )

        state_code = self.request.query_params.get('state')
        if state_code:
            queryset = queryset.filter(state__code=state_code)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset().order_by('name'))

        page = self.paginate_queryset(queryset)
        if page is not None:
            municipalities = attach_hexagon_counts_by_resolution(page)
            serializer = self.get_serializer(municipalities, many=True)
            return self.get_paginated_response(serializer.data)

        municipalities = list(queryset)
        # Keep lightweight for global listing; include counts when state is filtered.
        if request.query_params.get('state'):
            municipalities = attach_hexagon_counts_by_resolution(municipalities)
        serializer = self.get_serializer(municipalities, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def geometry(self, request, pk=None):
        """Get municipality boundaries for map display"""
        municipality = self.get_object()
        serializer = MunicipalityGeometrySerializer(municipality)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='resolution-counts')
    def resolution_counts(self, request, pk=None):
        """Return cached per-resolution hexagon counts for one municipality."""
        municipality = self.get_object()
        cache_key = build_endpoint_cache_key(
            'municipality_resolution_counts_v1',
            municipality.id,
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        counts = get_municipality_resolution_counts([municipality.id]).get(
            municipality.id,
            build_resolution_count_map({}),
        )
        payload = {
            'municipalityId': municipality.id,
            'municipalityCode': municipality.code_ibge,
            'counts': counts,
        }
        cache.set(
            cache_key,
            payload,
            timeout=MUNICIPALITY_COUNTS_CACHE_TTL_SECONDS,
        )
        return Response(payload)

    @action(detail=True, methods=['get'], url_path='table-baseline')
    def table_baseline(self, request, pk=None):
        """Return aggregated baseline inputs per education level for this municipality.

        Response schema:
        {
          "municipalityId": number,
          "municipalityName": string,
          "state": string,  # state code
          "code_ibge": string | null,
          "levels": {
            "INF_CRE": { ... },
            "INF_PRE": { ... },
            "FUND_AI": { ... },
            "FUND_AF": { ... },
            "MED": { ... }
          }
        }
        """
        municipality = self.get_object()
        cache_key = build_endpoint_cache_key('municipality_table_baseline_v2', municipality.id)
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        response_payload = build_baseline_from_rollups(
            municipality.state.code,
            municipality=municipality,
        )
        if response_payload is None:
            return Response(
                rollup_not_ready_payload(
                    municipality.state.code,
                    municipality.code_ibge,
                    municipality.name,
                    'baseline',
                ),
                status=ROLLUP_NOT_READY_STATUS,
            )

        cache.set(cache_key, response_payload, timeout=BASELINE_CACHE_TTL_SECONDS)
        return Response(response_payload)


class HexagonEducationDataPagination(PageNumberPagination):
    """Paginator for education-data endpoint."""
    page_size = 500
    page_size_query_param = 'page_size'
    max_page_size = 2000


class HexagonViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Hexagon data"""
    queryset = Hexagon.objects.select_related('municipality', 'state', 'education_data')
    serializer_class = HexagonEducationSerializer
    
    def get_queryset(self):
        """Optimize queryset with proper select_related and prefetch_related"""
        return super().get_queryset()

    @action(detail=False, methods=['get'], url_path='education-data', pagination_class=HexagonEducationDataPagination)
    def education_data(self, request):
        """Get aggregated education data for dashboard calculations"""
        started_at = perf_counter()

        # Get query parameters
        state_code = request.query_params.get('state')
        municipality_code = request.query_params.get('municipality_code')
        municipality_name = request.query_params.get('municipality')  # Backward compatibility
        count_only_raw = (request.query_params.get('count_only') or '').strip().lower()
        count_only = count_only_raw in ('1', 'true', 'yes')
        compact_raw = (request.query_params.get('compact') or '').strip().lower()
        compact_mode = compact_raw not in ('0', 'false', 'no')
        resolution_raw = request.query_params.get('resolution', SOURCE_HEXAGON_RESOLUTION)
        try:
            resolution = int(resolution_raw)
        except (TypeError, ValueError):
            resolution = SOURCE_HEXAGON_RESOLUTION
        resolution = max(min(resolution, max(SUPPORTED_RESOLUTIONS)), min(SUPPORTED_RESOLUTIONS))
        resolution_requested = resolution
        resolution_adjusted = False
        resolution_adjust_reason = None
        municipality_resolution_counts = None
        education_levels = request.query_params.get('education_levels', '').split(',')
        education_levels = [level.strip() for level in education_levels if level.strip()]
        skip_total_count_raw = (request.query_params.get('skip_total_count') or '').strip().lower()
        skip_total_count_requested = skip_total_count_raw in ('1', 'true', 'yes')
        total_count_hint_raw = request.query_params.get('total_count_hint')
        try:
            total_count_hint = int(total_count_hint_raw) if total_count_hint_raw is not None else None
        except (TypeError, ValueError):
            total_count_hint = None
        if total_count_hint is not None and total_count_hint < 0:
            total_count_hint = None

        def respond(payload, status_code=status.HTTP_200_OK, source='unknown'):
            duration_seconds = perf_counter() - started_at
            if duration_seconds >= SLOW_ANALYSIS_LOG_SECONDS:
                logger.warning(
                    'slow_education_data_request source=%s state=%s municipality_code=%s municipality_name=%s requested=%s applied=%s duration_s=%.2f',
                    source,
                    state_code,
                    municipality_code,
                    municipality_name,
                    resolution_requested,
                    resolution,
                    duration_seconds,
                )
            return Response(payload, status=status_code)

        compact_only_fields = [
            'id',
            'h3_index',
            'municipality__name',
            'education_data__qt_mat_inf_cre',
            'education_data__qt_mat_inf_pre',
            'education_data__qt_mat_fund_ai',
            'education_data__qt_mat_fund_af',
            'education_data__qt_mat_med',
            'education_data__qt_mat_inf_cre_prop',
            'education_data__qt_mat_inf_pre_prop',
            'education_data__qt_mat_fund_ai_prop',
            'education_data__qt_mat_fund_af_prop',
            'education_data__qt_mat_med_prop',
            'education_data__qt_salas_utilizadas',
        ]
        
        if not state_code:
            return respond({'error': 'State parameter is required'}, status.HTTP_400_BAD_REQUEST)

        should_paginate = (
            request.query_params.get('page') is not None
            or request.query_params.get('page_size') is not None
        )
        paginator = HexagonEducationDataPagination() if should_paginate else None
        skip_total_count = skip_total_count_requested and bool(paginator) and not count_only

        def count_only_metadata(total_count):
            try:
                requested_page_size = int(request.query_params.get('page_size') or HexagonEducationDataPagination.page_size)
            except (TypeError, ValueError):
                requested_page_size = HexagonEducationDataPagination.page_size

            page_size = max(1, min(requested_page_size, HexagonEducationDataPagination.max_page_size))
            total_pages = max(1, (total_count + page_size - 1) // page_size)
            return {
                'total_count': total_count,
                'page': 1,
                'page_size': page_size,
                'total_pages': total_pages,
                'has_next': total_count > page_size,
                'has_previous': False,
                'count_only': True,
            }

        def enrich_metadata(metadata):
            metadata['resolution_requested'] = resolution_requested
            metadata['resolution_applied'] = resolution
            metadata['resolution_auto_adjusted'] = resolution_adjusted
            if resolution_adjust_reason:
                metadata['resolution_adjust_reason'] = resolution_adjust_reason
            if municipality_resolution_counts:
                metadata['municipality_hexagon_counts'] = municipality_resolution_counts
            return metadata

        municipality = None
        if municipality_code or municipality_name:
            municipality_qs = Municipality.objects.filter(state__code=state_code)
            if municipality_code:
                municipality_qs = municipality_qs.filter(code_ibge=municipality_code)
            else:
                municipality_qs = municipality_qs.filter(name=municipality_name)

            municipality = municipality_qs.only('id', 'code_ibge', 'name').first()
            if municipality:
                if resolution_requested >= SOURCE_HEXAGON_RESOLUTION:
                    municipality_resolution_counts = get_municipality_resolution_counts([municipality.id]).get(
                        municipality.id
                    )
                    resolution, resolution_adjusted, resolution_adjust_reason = get_safe_resolution(
                        resolution_requested,
                        municipality_resolution_counts,
                    )

                    if resolution_adjusted:
                        logger.info(
                            'resolution_auto_adjustment_applied municipality_id=%s requested=%s applied=%s reason=%s',
                            municipality.id,
                            resolution_requested,
                            resolution,
                            resolution_adjust_reason,
                        )
            else:
                return respond(
                    {'error': 'Municipality not found'},
                    status.HTTP_404_NOT_FOUND,
                    source='validation',
                )

        if resolution < SOURCE_HEXAGON_RESOLUTION:
            rollup_qs = get_rollup_queryset(
                state_code,
                resolution,
                municipality=municipality,
            ).order_by('id')
            total_count = rollup_qs.count()

            if total_count > 0:
                if count_only:
                    response_data = []
                    pagination_info = count_only_metadata(total_count)
                elif paginator:
                    page_size = paginator.get_page_size(request) or HexagonEducationDataPagination.page_size
                    try:
                        page_number = int(request.query_params.get('page') or 1)
                    except (TypeError, ValueError):
                        page_number = 1
                    page_number = max(1, page_number)

                    start = (page_number - 1) * page_size
                    end = start + page_size
                    page_rows = list(rollup_qs[start:end])
                    response_data = [rollup_to_feature(row) for row in page_rows]
                    total_pages = max(1, (total_count + page_size - 1) // page_size)
                    pagination_info = {
                        'total_count': total_count,
                        'page': page_number,
                        'page_size': page_size,
                        'total_pages': total_pages,
                        'has_next': page_number < total_pages,
                        'has_previous': page_number > 1,
                        'count_skipped': False,
                    }
                else:
                    response_data = [rollup_to_feature(row) for row in rollup_qs]
                    pagination_info = {}

                metadata = {
                    'state': state_code,
                    'resolution': resolution,
                    'total_hexagons': total_count,
                    'total_count': total_count,
                    'aggregated': True,
                    'compact': compact_mode,
                    'rollup': True,
                    'source_resolution': SOURCE_HEXAGON_RESOLUTION,
                    'aggregation_cached': False,
                    'direct_count_cached': False,
                }
                metadata.update(pagination_info)
                if municipality_code or municipality_name:
                    metadata['municipality'] = municipality_code or municipality_name
                metadata = enrich_metadata(metadata)

                return respond({
                    'count': total_count,
                    'metadata': metadata,
                    'results': response_data
                }, source='rollup')

            return respond(
                rollup_not_ready_payload(
                    state_code,
                    municipality_code,
                    municipality_name,
                    resolution,
                ),
                status_code=ROLLUP_NOT_READY_STATUS,
                source='missing_rollup',
            )

        # Attempt direct fetch of hexagons at requested resolution
        direct_qs = Hexagon.objects.filter(
            state__code=state_code,
            resolution=resolution
        ).order_by('id')

        # Filter by municipality (prioritize code_ibge over name)
        if municipality_code:
            direct_qs = direct_qs.filter(municipality__code_ibge=municipality_code)
        elif municipality_name:
            direct_qs = direct_qs.filter(municipality__name=municipality_name)

        pagination_info = {}
        direct_count_cached = False

        def get_direct_total_count():
            nonlocal direct_count_cached
            count_cache_key = build_direct_count_cache_key(
                state_code,
                municipality_code,
                municipality_name,
                resolution,
            )
            cached_total = cache.get(count_cache_key)
            if cached_total is not None:
                direct_count_cached = True
                return int(cached_total)

            computed_total = direct_qs.count()
            cache.set(
                count_cache_key,
                computed_total,
                timeout=DIRECT_COUNT_CACHE_TTL_SECONDS,
            )
            return computed_total

        direct_count = None
        if count_only:
            direct_count = get_direct_total_count()
            has_direct_rows = direct_count > 0
        elif paginator and not skip_total_count:
            direct_count = get_direct_total_count()
            has_direct_rows = direct_count > 0
        else:
            has_direct_rows = direct_qs.exists()

        if has_direct_rows:
            # Normal path (data stored at requested resolution)
            serializer_class = HexagonEducationCompactSerializer if compact_mode else HexagonEducationSimpleSerializer
            if count_only:
                total_count = direct_count if direct_count is not None else direct_qs.count()
                response_data = []
                pagination_info = count_only_metadata(total_count)
            elif paginator:
                page_size = paginator.get_page_size(request) or HexagonEducationDataPagination.page_size
                try:
                    page_number = int(request.query_params.get('page') or 1)
                except (TypeError, ValueError):
                    page_number = 1
                page_number = max(1, page_number)

                start = (page_number - 1) * page_size
                end = start + page_size
                if skip_total_count:
                    page_ids_with_lookahead = list(
                        direct_qs.values_list('id', flat=True)[start:end + 1]
                    )
                    page_ids = page_ids_with_lookahead[:page_size]
                    has_next_from_lookahead = len(page_ids_with_lookahead) > page_size
                    total_count = total_count_hint if total_count_hint is not None else len(page_ids)
                else:
                    total_count = direct_count if direct_count is not None else direct_qs.count()
                    page_ids = list(direct_qs.values_list('id', flat=True)[start:end])
                    has_next_from_lookahead = False

                if page_ids:
                    page_qs = Hexagon.objects.filter(id__in=page_ids).select_related('municipality', 'education_data')
                    if compact_mode:
                        page_qs = page_qs.only(*compact_only_fields)
                    id_position = {hex_id: idx for idx, hex_id in enumerate(page_ids)}
                    ordered_page = sorted(page_qs, key=lambda row: id_position[row.id])
                    serializer = serializer_class(ordered_page, many=True)
                    response_data = serializer.data
                else:
                    response_data = []

                if skip_total_count and total_count_hint is None:
                    pagination_info = {
                        'effective_total_count': len(response_data),
                        'page': page_number,
                        'page_size': page_size,
                        'has_next': has_next_from_lookahead,
                        'has_previous': page_number > 1,
                        'count_skipped': True,
                    }
                else:
                    total_pages = max(1, (total_count + page_size - 1) // page_size)
                    pagination_info = {
                        'total_count': total_count,
                        'page': page_number,
                        'page_size': page_size,
                        'total_pages': total_pages,
                        'has_next': page_number < total_pages,
                        'has_previous': page_number > 1,
                        'count_skipped': skip_total_count,
                    }
            else:
                direct_rows = Hexagon.objects.filter(id__in=direct_qs.values_list('id', flat=True)).select_related(
                    'municipality', 'education_data'
                ).order_by('id')
                if compact_mode:
                    direct_rows = direct_rows.only(*compact_only_fields)
                serializer = serializer_class(direct_rows, many=True)
                response_data = serializer.data
                total_count = len(response_data)
        else:
            total_count = direct_count if direct_count is not None else 0
            response_data = []
            if count_only:
                pagination_info = count_only_metadata(total_count)
            elif total_count == 0:
                return respond(
                    {'error': 'No hexagon data available for state'},
                    status.HTTP_404_NOT_FOUND,
                    source='direct',
                )

        # Metadata
        metadata = {
            'state': state_code,
            'resolution': resolution,
            'total_hexagons': total_count,
            'total_count': total_count,
            'aggregated': False,
            'compact': compact_mode,
            'aggregation_cached': False,
            'direct_count_cached': direct_count_cached,
        }
        metadata.update(pagination_info)
        if municipality_code or municipality_name:
            metadata['municipality'] = municipality_code or municipality_name
        metadata = enrich_metadata(metadata)

        return respond({
            'count': total_count,
            'metadata': metadata,
            'results': response_data
        }, source='direct')
    
    @action(detail=False, methods=['post'], url_path='calculate-needs')
    def calculate_needs(self, request):
        """Calculate classroom needs based on user parameters"""
        serializer = CalculateNeedsRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        state_code = data['state']
        municipality_code = data.get('municipality_code')
        municipality_name = data.get('municipality')  # Backward compatibility
        resolution = data.get('resolution', 8)
        education_levels = data.get('education_levels', [])
        parameters = data['parameters']
        
        aggregated_mode = False
        source_resolution = resolution
        working_records = []  # Each item: {'h3_index': str, 'data': EducationData-like dict, 'hexagon_id': int|None}

        municipality = None
        if municipality_code or municipality_name:
            municipality_qs = Municipality.objects.filter(state__code=state_code)
            if municipality_code:
                municipality_qs = municipality_qs.filter(code_ibge=municipality_code)
            else:
                municipality_qs = municipality_qs.filter(name=municipality_name)
            municipality = municipality_qs.first()
            if municipality is None:
                return Response({'error': 'Municipality not found'}, status=status.HTTP_404_NOT_FOUND)

        if resolution < SOURCE_HEXAGON_RESOLUTION:
            rollup_qs = get_rollup_queryset(
                state_code,
                resolution,
                municipality=municipality,
            ).order_by('id')
            if not rollup_qs.exists():
                return Response(
                    rollup_not_ready_payload(
                        state_code,
                        municipality_code,
                        municipality_name,
                        resolution,
                    ),
                    status=ROLLUP_NOT_READY_STATUS,
                )

            aggregated_mode = True
            source_resolution = SOURCE_HEXAGON_RESOLUTION
            for row in rollup_qs:
                feature = rollup_to_feature(row)
                working_records.append({
                    'h3_index': row.h3_index,
                    'hexagon_id': None,
                    'data': feature['education_data'],
                })
        else:
            direct_qs = self.get_queryset().filter(
                state__code=state_code,
                resolution=resolution
            ).select_related('education_data')
            # Filter by municipality (prioritize code_ibge over name)
            if municipality_code:
                direct_qs = direct_qs.filter(municipality__code_ibge=municipality_code)
            elif municipality_name:
                direct_qs = direct_qs.filter(municipality__name=municipality_name)

            if not direct_qs.exists():
                return Response({'error': 'No hexagon data available for state'}, status=status.HTTP_404_NOT_FOUND)

            for hexagon in direct_qs:
                if not hasattr(hexagon, 'education_data'):
                    continue
                ed = hexagon.education_data
                working_records.append({
                    'h3_index': hexagon.h3_index,
                    'hexagon_id': hexagon.id,
                    'data': ed
                })

        results = []
        total_new_classrooms = 0

        for rec in working_records:
            ed = rec['data']
            calculations = {}
            for level in education_levels:
                level_lower = level.lower()
                pop_field = f'pop_{level_lower}'

                # EducationData instance vs dict handling
                if isinstance(ed, dict):
                    population = ed.get(pop_field, 0)
                    current_classrooms = ed.get(f'qt_salas_weighted_{level_lower}', ed.get('qt_salas_utilizadas', 0))
                else:
                    population = getattr(ed, pop_field, 0)
                    current_classrooms = getattr(ed, 'qt_salas_utilizadas', 0)

                pop_not_in_school_pct = parameters.get(f'pop_not_in_school_pct_{level_lower}', 0)
                students_private_pct = parameters.get(f'students_private_pct_{level_lower}', 0)
                students_integral_pct = parameters.get(f'students_integral_pct_{level_lower}', 0)
                students_per_classroom = parameters.get(f'students_per_classroom_{level_lower}', 25)

                target_population = float(population) * (1 - pop_not_in_school_pct / 100)
                public_students = target_population * (1 - students_private_pct / 100)
                integral_factor = 1 + (students_integral_pct / 100)
                effective_students = public_students * integral_factor
                needed_classrooms = effective_students / max(1, students_per_classroom)
                extra_classrooms = max(0, needed_classrooms - current_classrooms)

                calculations[f'qt_salas_necesarias_total_{level_lower}'] = round(needed_classrooms, 1)
                calculations[f'qt_salas_actuales_{level_lower}'] = current_classrooms
                calculations[f'qt_salas_necesarias_extra_{level_lower}'] = round(extra_classrooms, 1)
                total_new_classrooms += extra_classrooms

            if calculations:
                results.append({
                    'hexagon_id': rec['hexagon_id'],
                    'h3_index': rec['h3_index'],
                    'calculations': calculations
                })

        return Response({
            'results': results,
            'summary': {
                'total_new_classrooms_needed': round(total_new_classrooms),
                'total_hexagons_analyzed': len(results),
                'aggregated': aggregated_mode,
                'source_resolution': source_resolution,
                'resolution': resolution
            }
        })


class AnalyticsView(APIView):
    """View for analytics endpoints"""
    
    def get_base_queryset(self, state_code, municipality_code=None, municipality_name=None):
        """Get base queryset for analytics"""
        queryset = EducationData.objects.all()
        queryset = queryset.filter(hexagon__state__code=state_code)
        
        # Filter by municipality (prioritize code_ibge over name)
        if municipality_code:
            queryset = queryset.filter(hexagon__municipality__code_ibge=municipality_code)
        elif municipality_name:
            queryset = queryset.filter(hexagon__municipality__name=municipality_name)
        
        return queryset


class AnalyticsSummaryView(AnalyticsView):
    """Dashboard summary statistics"""
    
    def get(self, request):
        state_code = request.query_params.get('state')
        municipality_code = request.query_params.get('municipality_code')
        municipality_name = request.query_params.get('municipality')  # Backward compatibility
        
        if not state_code:
            return Response(
                {'error': 'State parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cache_key = build_endpoint_cache_key(
            'analytics_summary_v1',
            state_code,
            municipality_code,
            municipality_name,
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        queryset = self.get_base_queryset(state_code, municipality_code, municipality_name)
        
        # Calculate aggregations
        aggregations = queryset.aggregate(
            # Population totals
            total_pop_inf_cre=Sum('pop_inf_cre'),
            total_pop_inf_pre=Sum('pop_inf_pre'),
            total_pop_fund_ai=Sum('pop_fund_ai'),
            total_pop_fund_af=Sum('pop_fund_af'),
            total_pop_med=Sum('pop_med'),
            
            # Enrollment totals
            total_qt_mat_inf_cre=Sum('qt_mat_inf_cre'),
            total_qt_mat_inf_pre=Sum('qt_mat_inf_pre'),
            total_qt_mat_fund_ai=Sum('qt_mat_fund_ai'),
            total_qt_mat_fund_af=Sum('qt_mat_fund_af'),
            total_qt_mat_med=Sum('qt_mat_med'),
            
            # Infrastructure
            total_classrooms=Sum('qt_salas_utilizadas'),
        )
        
        # Calculate averages
        total_enrollment = (
            (aggregations['total_qt_mat_inf_cre'] or 0) +
            (aggregations['total_qt_mat_inf_pre'] or 0) +
            (aggregations['total_qt_mat_fund_ai'] or 0) +
            (aggregations['total_qt_mat_fund_af'] or 0) +
            (aggregations['total_qt_mat_med'] or 0)
        )
        
        total_classrooms = aggregations['total_classrooms'] or 0
        avg_students_per_classroom = (
            total_enrollment / total_classrooms if total_classrooms > 0 else 0
        )
        
        summary_data = {
            'state': state_code,
            'summary': {
                'total_population': {
                    'inf_cre': int(aggregations['total_pop_inf_cre'] or 0),
                    'inf_pre': int(aggregations['total_pop_inf_pre'] or 0),
                    'fund_ai': int(aggregations['total_pop_fund_ai'] or 0),
                    'fund_af': int(aggregations['total_pop_fund_af'] or 0),
                    'med': int(aggregations['total_pop_med'] or 0)
                },
                'total_enrollment': {
                    'inf_cre': aggregations['total_qt_mat_inf_cre'] or 0,
                    'inf_pre': aggregations['total_qt_mat_inf_pre'] or 0,
                    'fund_ai': aggregations['total_qt_mat_fund_ai'] or 0,
                    'fund_af': aggregations['total_qt_mat_fund_af'] or 0,
                    'med': aggregations['total_qt_mat_med'] or 0
                },
                'infrastructure': {
                    'total_classrooms': total_classrooms,
                    'avg_students_per_classroom': round(avg_students_per_classroom, 1)
                }
            }
        }
        
        if municipality_code or municipality_name:
            summary_data['municipality'] = municipality_code or municipality_name
        
        cache.set(cache_key, summary_data, timeout=5 * 60)
        return Response(summary_data)


class AnalyticsHistogramView(AnalyticsView):
    """Data for range slider and histogram"""
    
    def get(self, request):
        state_code = request.query_params.get('state')
        municipality_code = request.query_params.get('municipality_code')
        municipality_name = request.query_params.get('municipality')
        education_levels = request.query_params.get('education_levels', '').split(',')
        education_levels = [level.strip().lower() for level in education_levels if level.strip()]
        
        if not state_code:
            return Response(
                {'error': 'State parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not education_levels:
            return Response(
                {'error': 'Education levels parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cache_key = build_endpoint_cache_key(
            'analytics_histogram_v1',
            state_code,
            municipality_code,
            municipality_name,
            ','.join(education_levels),
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        queryset = self.get_base_queryset(
            state_code,
            municipality_code=municipality_code,
            municipality_name=municipality_name,
        )
        
        # For simplicity, we'll create histogram for the first education level
        level = education_levels[0]
        field_name = f'qt_mat_{level}'
        
        # Get values for the specified field
        values = [
            v for v in queryset.values_list(field_name, flat=True).iterator()
            if v is not None and v > 0
        ]
        
        if not values:
            empty_payload = {
                'state': state_code,
                'municipality': municipality_code or municipality_name or '',
                'education_levels': education_levels,
                'histogram': {
                    'bins': [],
                    'counts': [],
                    'min_value': 0,
                    'max_value': 0
                }
            }
            cache.set(cache_key, empty_payload, timeout=5 * 60)
            return Response(empty_payload)
        
        # Create histogram
        values_array = np.array(values)
        min_val = int(values_array.min())
        max_val = int(values_array.max())
        
        # Create 10 bins
        num_bins = min(10, len(set(values)))
        bins = np.linspace(min_val, max_val, num_bins + 1)
        counts, bin_edges = np.histogram(values_array, bins=bins)
        
        response_data = {
            'state': state_code,
            'education_levels': education_levels,
            'histogram': {
                'bins': [int(b) for b in bin_edges],
                'counts': [int(c) for c in counts],
                'min_value': min_val,
                'max_value': max_val
            }
        }
        
        if municipality_code or municipality_name:
            response_data['municipality'] = municipality_code or municipality_name
        
        cache.set(cache_key, response_data, timeout=5 * 60)
        return Response(response_data)


class SchoolViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for School data"""
    queryset = School.objects.select_related('municipality')
    serializer_class = SchoolSerializer
    
    def get_queryset(self):
        """Filter schools by query parameters"""
        queryset = super().get_queryset()
        
        state_code = self.request.query_params.get('state')
        municipality_code = self.request.query_params.get('municipality_code')
        municipality_name = self.request.query_params.get('municipality')  # Backward compatibility
        hexagon_h3 = self.request.query_params.get('hexagon')
        
        if state_code:
            queryset = queryset.filter(state__code=state_code)
        
        # Filter by municipality (prioritize code_ibge over name)
        if municipality_code:
            queryset = queryset.filter(municipality__code_ibge=municipality_code)
        elif municipality_name:
            queryset = queryset.filter(municipality__name=municipality_name)
        
        if hexagon_h3:
            queryset = queryset.filter(hexagon__h3_index=hexagon_h3)

        return queryset.only(
            'id',
            'code_school',
            'name_school',
            'municipality__name',
            'geometry',
            'admin_category',
            'urban',
            'qt_salas_utilizadas',
            'ratio_mat_salas',
            'qt_mat_inf_cre',
            'qt_mat_inf_pre',
            'qt_mat_fund_ai',
            'qt_mat_fund_af',
            'qt_mat_med',
        ).order_by('name_school')
    
    def list(self, request, *args, **kwargs):
        """Get individual school data for detailed analysis"""
        queryset = self.get_queryset()
        
        # Apply pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        school_rows = list(queryset)
        serializer = self.get_serializer(school_rows, many=True)
        return Response({
            'count': len(school_rows),
            'results': serializer.data
        })
