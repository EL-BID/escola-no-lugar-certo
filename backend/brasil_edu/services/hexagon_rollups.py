from collections import defaultdict
from decimal import Decimal

import h3
from django.db import transaction

from brasil_edu.models import Hexagon, HexagonRollup, Municipality, State


SOURCE_RESOLUTION = 8
ROLLUP_RESOLUTION = 5

POP_FIELDS = (
    'pop_inf_cre',
    'pop_inf_pre',
    'pop_fund_ai',
    'pop_fund_af',
    'pop_med',
)

ENROLLMENT_FIELDS = (
    'qt_mat_inf_cre',
    'qt_mat_inf_pre',
    'qt_mat_fund_ai',
    'qt_mat_fund_af',
    'qt_mat_med',
)

INTEGRAL_ENROLLMENT_FIELDS = (
    'qt_mat_inf_cre_int',
    'qt_mat_inf_pre_int',
    'qt_mat_fund_ai_int',
    'qt_mat_fund_af_int',
    'qt_mat_med_int',
)

PRIVATE_ENROLLMENT_FIELDS = (
    'private_qt_mat_inf_cre',
    'private_qt_mat_inf_pre',
    'private_qt_mat_fund_ai',
    'private_qt_mat_fund_af',
    'private_qt_mat_med',
)

CLASSROOM_WEIGHT_FIELDS = (
    ('qt_salas_weighted_inf_cre', 'qt_mat_inf_cre_prop'),
    ('qt_salas_weighted_inf_pre', 'qt_mat_inf_pre_prop'),
    ('qt_salas_weighted_fund_ai', 'qt_mat_fund_ai_prop'),
    ('qt_salas_weighted_fund_af', 'qt_mat_fund_af_prop'),
    ('qt_salas_weighted_med', 'qt_mat_med_prop'),
)

ROLLUP_VALUE_FIELDS = (
    *POP_FIELDS,
    *ENROLLMENT_FIELDS,
    *INTEGRAL_ENROLLMENT_FIELDS,
    *PRIVATE_ENROLLMENT_FIELDS,
    'qt_mat_bas_n',
    'qt_salas_utilizadas',
    *(field for field, _ in CLASSROOM_WEIGHT_FIELDS),
    'nocturnal_weighted_fund_af',
    'nocturnal_weighted_med',
)


def _to_decimal(value):
    if value is None:
        return Decimal('0')
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _empty_bucket():
    bucket = {field: Decimal('0') for field in POP_FIELDS}
    bucket.update({field: 0 for field in ENROLLMENT_FIELDS})
    bucket.update({field: 0 for field in INTEGRAL_ENROLLMENT_FIELDS})
    bucket.update({field: 0 for field in PRIVATE_ENROLLMENT_FIELDS})
    bucket['qt_mat_bas_n'] = 0
    bucket['qt_salas_utilizadas'] = 0
    for output_field, _ in CLASSROOM_WEIGHT_FIELDS:
        bucket[output_field] = Decimal('0')
    bucket['nocturnal_weighted_fund_af'] = Decimal('0')
    bucket['nocturnal_weighted_med'] = Decimal('0')
    bucket['source_hexagon_count'] = 0
    return bucket


def _add_source_row_to_bucket(bucket, row):
    for field in POP_FIELDS:
        bucket[field] += _to_decimal(row.get(field))

    for field in ENROLLMENT_FIELDS:
        bucket[field] += int(row.get(field) or 0)

    for field in INTEGRAL_ENROLLMENT_FIELDS:
        bucket[field] += int(row.get(field) or 0)

    for field in PRIVATE_ENROLLMENT_FIELDS:
        bucket[field] += int(row.get(field) or 0)

    nocturnal_enrollments = int(row.get('qt_mat_bas_n') or 0)
    bucket['qt_mat_bas_n'] += nocturnal_enrollments

    classrooms = int(row.get('qt_salas_utilizadas') or 0)
    bucket['qt_salas_utilizadas'] += classrooms

    for output_field, prop_field in CLASSROOM_WEIGHT_FIELDS:
        bucket[output_field] += _to_decimal(classrooms) * _to_decimal(row.get(prop_field))

    bucket['nocturnal_weighted_fund_af'] += (
        _to_decimal(nocturnal_enrollments) * _to_decimal(row.get('qt_mat_fund_af_prop'))
    )
    bucket['nocturnal_weighted_med'] += (
        _to_decimal(nocturnal_enrollments) * _to_decimal(row.get('qt_mat_med_prop'))
    )
    bucket['source_hexagon_count'] += 1


def aggregate_source_rows_to_rollups(source_rows, target_resolution=ROLLUP_RESOLUTION):
    """Aggregate canonical rows into H3 parent buckets.

    The important regression guard is that classrooms are weighted before they are
    summed. Summing classrooms and proportions separately changes frontend color
    results for parent hexagons.
    """
    parent_map = defaultdict(_empty_bucket)

    for row in source_rows:
        parent_index = h3.cell_to_parent(row['h3_index'], target_resolution)
        bucket = parent_map[parent_index]
        _add_source_row_to_bucket(bucket, row)

    return dict(parent_map)


def aggregate_source_rows_to_municipality_rollups(source_rows, target_resolution=ROLLUP_RESOLUTION):
    parent_map = defaultdict(_empty_bucket)

    for row in source_rows:
        municipality_id = row.get('municipality_id')
        if municipality_id is None:
            continue
        parent_index = h3.cell_to_parent(row['h3_index'], target_resolution)
        bucket = parent_map[(municipality_id, parent_index)]
        _add_source_row_to_bucket(bucket, row)

    return dict(parent_map)


def canonical_source_rows_for_scope(state, municipality=None, source_resolution=SOURCE_RESOLUTION):
    fields = [
        'h3_index',
        *[f'education_data__{field}' for field in POP_FIELDS],
        *[f'education_data__{field}' for field in ENROLLMENT_FIELDS],
        *[f'education_data__{field}' for field in INTEGRAL_ENROLLMENT_FIELDS],
        *[f'education_data__{field}' for field in PRIVATE_ENROLLMENT_FIELDS],
        'education_data__qt_mat_bas_n',
        'education_data__qt_salas_utilizadas',
        *[f'education_data__{prop_field}' for _, prop_field in CLASSROOM_WEIGHT_FIELDS],
    ]

    queryset = Hexagon.objects.filter(
        state=state,
        resolution=source_resolution,
    )
    if municipality is not None:
        queryset = queryset.filter(municipality=municipality)

    for row in queryset.values(*fields).iterator(chunk_size=5000):
        normalized = {'h3_index': row['h3_index']}
        for key, value in row.items():
            if key == 'h3_index':
                continue
            normalized[key.replace('education_data__', '')] = value
        yield normalized


def canonical_source_rows_for_state_municipalities(state, source_resolution=SOURCE_RESOLUTION):
    fields = [
        'municipality_id',
        'h3_index',
        *[f'education_data__{field}' for field in POP_FIELDS],
        *[f'education_data__{field}' for field in ENROLLMENT_FIELDS],
        *[f'education_data__{field}' for field in INTEGRAL_ENROLLMENT_FIELDS],
        *[f'education_data__{field}' for field in PRIVATE_ENROLLMENT_FIELDS],
        'education_data__qt_mat_bas_n',
        'education_data__qt_salas_utilizadas',
        *[f'education_data__{prop_field}' for _, prop_field in CLASSROOM_WEIGHT_FIELDS],
    ]

    queryset = Hexagon.objects.filter(
        state=state,
        resolution=source_resolution,
        municipality__isnull=False,
    )

    for row in queryset.values(*fields).iterator(chunk_size=5000):
        normalized = {
            'municipality_id': row['municipality_id'],
            'h3_index': row['h3_index'],
        }
        for key, value in row.items():
            if key in ('municipality_id', 'h3_index'):
                continue
            normalized[key.replace('education_data__', '')] = value
        yield normalized


def canonical_source_rows_for_state(state, source_resolution=SOURCE_RESOLUTION):
    return canonical_source_rows_for_scope(state, source_resolution=source_resolution)


def build_rollups_for_scope(state, municipality=None, target_resolution=ROLLUP_RESOLUTION, source_resolution=SOURCE_RESOLUTION):
    source_rows = canonical_source_rows_for_scope(
        state,
        municipality=municipality,
        source_resolution=source_resolution,
    )
    return aggregate_source_rows_to_rollups(source_rows, target_resolution=target_resolution)


def build_municipality_rollups_for_state(
    state,
    target_resolution=ROLLUP_RESOLUTION,
    source_resolution=SOURCE_RESOLUTION,
):
    source_rows = canonical_source_rows_for_state_municipalities(
        state,
        source_resolution=source_resolution,
    )
    return aggregate_source_rows_to_municipality_rollups(source_rows, target_resolution=target_resolution)


@transaction.atomic
def refresh_rollups_for_scope(
    state_code,
    target_resolution=ROLLUP_RESOLUTION,
    source_resolution=SOURCE_RESOLUTION,
    municipality_code=None,
):
    state = State.objects.get(code=state_code)
    municipality = None
    if municipality_code is not None:
        municipality = Municipality.objects.get(state=state, code_ibge=municipality_code)

    rollups = build_rollups_for_scope(
        state,
        municipality=municipality,
        target_resolution=target_resolution,
        source_resolution=source_resolution,
    )

    delete_qs = HexagonRollup.objects.filter(
        state=state,
        resolution=target_resolution,
    )
    if municipality is None:
        delete_qs = delete_qs.filter(municipality__isnull=True)
    else:
        delete_qs = delete_qs.filter(municipality=municipality)
    delete_qs.delete()

    rows = [
        HexagonRollup(
            state=state,
            municipality=municipality,
            h3_index=h3_index,
            resolution=target_resolution,
            source_resolution=source_resolution,
            **values,
        )
        for h3_index, values in sorted(rollups.items())
    ]

    HexagonRollup.objects.bulk_create(rows, batch_size=5000)
    return len(rows)


@transaction.atomic
def refresh_municipality_rollups_for_state(
    state_code,
    target_resolution=ROLLUP_RESOLUTION,
    source_resolution=SOURCE_RESOLUTION,
):
    state = State.objects.get(code=state_code)
    rollups = build_municipality_rollups_for_state(
        state,
        target_resolution=target_resolution,
        source_resolution=source_resolution,
    )

    HexagonRollup.objects.filter(
        state=state,
        resolution=target_resolution,
        municipality__isnull=False,
    ).delete()

    rows = [
        HexagonRollup(
            state=state,
            municipality_id=municipality_id,
            h3_index=h3_index,
            resolution=target_resolution,
            source_resolution=source_resolution,
            **values,
        )
        for (municipality_id, h3_index), values in sorted(rollups.items())
    ]

    HexagonRollup.objects.bulk_create(rows, batch_size=5000)
    return len(rows)


def build_rollups_for_state(state, target_resolution=ROLLUP_RESOLUTION, source_resolution=SOURCE_RESOLUTION):
    return build_rollups_for_scope(
        state,
        target_resolution=target_resolution,
        source_resolution=source_resolution,
    )


def refresh_rollups_for_state(state_code, target_resolution=ROLLUP_RESOLUTION, source_resolution=SOURCE_RESOLUTION):
    return refresh_rollups_for_scope(
        state_code,
        target_resolution=target_resolution,
        source_resolution=source_resolution,
    )


def refresh_rollups_for_municipality(
    state_code,
    municipality_code,
    target_resolution=ROLLUP_RESOLUTION,
    source_resolution=SOURCE_RESOLUTION,
):
    return refresh_rollups_for_scope(
        state_code,
        target_resolution=target_resolution,
        source_resolution=source_resolution,
        municipality_code=municipality_code,
    )


def rollup_to_feature(row):
    return {
        'hexagon_id': None,
        'h3_index': row.h3_index,
        'municipality_name': row.municipality.name if row.municipality_id else None,
        'education_data': {
            'pop_inf_cre': float(row.pop_inf_cre),
            'pop_inf_pre': float(row.pop_inf_pre),
            'pop_fund_ai': float(row.pop_fund_ai),
            'pop_fund_af': float(row.pop_fund_af),
            'pop_med': float(row.pop_med),
            'qt_mat_inf_cre': row.qt_mat_inf_cre,
            'qt_mat_inf_pre': row.qt_mat_inf_pre,
            'qt_mat_fund_ai': row.qt_mat_fund_ai,
            'qt_mat_fund_af': row.qt_mat_fund_af,
            'qt_mat_med': row.qt_mat_med,
            'qt_mat_inf_cre_int': row.qt_mat_inf_cre_int,
            'qt_mat_inf_pre_int': row.qt_mat_inf_pre_int,
            'qt_mat_fund_ai_int': row.qt_mat_fund_ai_int,
            'qt_mat_fund_af_int': row.qt_mat_fund_af_int,
            'qt_mat_med_int': row.qt_mat_med_int,
            'private_qt_mat_inf_cre': row.private_qt_mat_inf_cre,
            'private_qt_mat_inf_pre': row.private_qt_mat_inf_pre,
            'private_qt_mat_fund_ai': row.private_qt_mat_fund_ai,
            'private_qt_mat_fund_af': row.private_qt_mat_fund_af,
            'private_qt_mat_med': row.private_qt_mat_med,
            'qt_mat_bas_n': row.qt_mat_bas_n,
            'qt_salas_utilizadas': row.qt_salas_utilizadas,
            'qt_salas_weighted_inf_cre': float(row.qt_salas_weighted_inf_cre),
            'qt_salas_weighted_inf_pre': float(row.qt_salas_weighted_inf_pre),
            'qt_salas_weighted_fund_ai': float(row.qt_salas_weighted_fund_ai),
            'qt_salas_weighted_fund_af': float(row.qt_salas_weighted_fund_af),
            'qt_salas_weighted_med': float(row.qt_salas_weighted_med),
            'nocturnal_weighted_fund_af': float(row.nocturnal_weighted_fund_af),
            'nocturnal_weighted_med': float(row.nocturnal_weighted_med),
            # Fallback fields for older clients. New clients use qt_salas_weighted_*.
            'qt_mat_inf_cre_prop': 0,
            'qt_mat_inf_pre_prop': 0,
            'qt_mat_fund_ai_prop': 0,
            'qt_mat_fund_af_prop': 0,
            'qt_mat_med_prop': 0,
        },
    }
