from unittest.mock import patch

import h3
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection

from .models import EducationData, Hexagon, HexagonRollup, Municipality, State
from .services.hexagon_rollups import (
    aggregate_source_rows_to_rollups,
    refresh_municipality_rollups_for_state,
    refresh_rollups_for_municipality,
    refresh_rollups_for_state,
)


class HexagonRollupTests(TestCase):
    def setUp(self):
        from django.contrib.gis.geos import MultiPolygon, Polygon

        self.state = State.objects.create(
            code='42',
            name='Santa Catarina',
            abbrev='SC',
            region='Sul',
        )
        self.municipality = Municipality.objects.create(
            state=self.state,
            name='Florianopolis',
            code_ibge='4205407',
            geometry=MultiPolygon(Polygon((
                (-49.0, -28.0),
                (-48.0, -28.0),
                (-48.0, -27.0),
                (-49.0, -27.0),
                (-49.0, -28.0),
            ))),
        )

    def test_rollup_weights_classrooms_before_summing(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 5)
        children = sorted(h3.cell_to_children(parent, 8))[:2]
        rows = [
            {
                'h3_index': children[0],
                'pop_inf_cre': 10,
                'pop_inf_pre': 0,
                'pop_fund_ai': 0,
                'pop_fund_af': 0,
                'pop_med': 0,
                'qt_mat_inf_cre': 100,
                'qt_mat_inf_pre': 0,
                'qt_mat_fund_ai': 0,
                'qt_mat_fund_af': 0,
                'qt_mat_med': 0,
                'qt_salas_utilizadas': 10,
                'qt_mat_inf_cre_prop': '0.2000',
                'qt_mat_inf_pre_prop': 0,
                'qt_mat_fund_ai_prop': 0,
                'qt_mat_fund_af_prop': 0,
                'qt_mat_med_prop': 0,
            },
            {
                'h3_index': children[1],
                'pop_inf_cre': 20,
                'pop_inf_pre': 0,
                'pop_fund_ai': 0,
                'pop_fund_af': 0,
                'pop_med': 0,
                'qt_mat_inf_cre': 300,
                'qt_mat_inf_pre': 0,
                'qt_mat_fund_ai': 0,
                'qt_mat_fund_af': 0,
                'qt_mat_med': 0,
                'qt_salas_utilizadas': 20,
                'qt_mat_inf_cre_prop': '0.5000',
                'qt_mat_inf_pre_prop': 0,
                'qt_mat_fund_ai_prop': 0,
                'qt_mat_fund_af_prop': 0,
                'qt_mat_med_prop': 0,
            },
        ]

        rollups = aggregate_source_rows_to_rollups(rows, target_resolution=5)
        bucket = rollups[parent]

        # Correct: 10 * 0.2 + 20 * 0.5 = 12.
        self.assertEqual(bucket['qt_salas_weighted_inf_cre'], 12)

        # Legacy parent-shape math would effectively do sum(classrooms) * sum(prop).
        legacy_wrong_value = (10 + 20) * (0.2 + 0.5)
        self.assertEqual(legacy_wrong_value, 21)
        self.assertNotEqual(float(bucket['qt_salas_weighted_inf_cre']), legacy_wrong_value)

    def test_state_resolution_5_endpoint_uses_precomputed_rollup(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 5)
        children = sorted(h3.cell_to_children(parent, 8))[:2]

        for idx, h3_index in enumerate(children):
            hexagon = Hexagon.create_from_h3(h3_index, state=self.state)
            EducationData.objects.create(
                hexagon=hexagon,
                pop_inf_cre=10 + idx,
                qt_mat_inf_cre=100 * (idx + 1),
                qt_salas_utilizadas=10 * (idx + 1),
                qt_mat_inf_cre_prop='0.5000',
            )

        created_count = refresh_rollups_for_state('42', target_resolution=5, source_resolution=8)
        self.assertEqual(created_count, 1)
        self.assertEqual(HexagonRollup.objects.count(), 1)

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(
                '/api/v1/hexagons/education-data/',
                {
                    'state': '42',
                    'resolution': 5,
                    'page': 1,
                    'page_size': 2000,
                    'compact': 'true',
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['metadata']['rollup'])
        self.assertEqual(payload['metadata']['source_resolution'], 8)
        self.assertEqual(payload['count'], 1)
        self.assertEqual(len(payload['results']), 1)

        education_data = payload['results'][0]['education_data']
        self.assertEqual(education_data['qt_mat_inf_cre'], 300)
        self.assertEqual(education_data['qt_salas_weighted_inf_cre'], 15.0)

        queried_sql = '\n'.join(query['sql'].lower() for query in captured.captured_queries)
        self.assertIn('hexagon_rollups', queried_sql)
        self.assertNotIn('education_data', queried_sql)

    def test_municipality_resolution_7_endpoint_uses_precomputed_rollup(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        children = sorted(h3.cell_to_children(parent, 8))[:2]

        for idx, h3_index in enumerate(children):
            hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
            EducationData.objects.create(
                hexagon=hexagon,
                pop_inf_cre=50,
                qt_mat_inf_cre=100 * (idx + 1),
                qt_salas_utilizadas=10 * (idx + 1),
                qt_mat_inf_cre_prop='0.5000',
            )

        created_count = refresh_rollups_for_municipality(
            '42',
            '4205407',
            target_resolution=7,
            source_resolution=8,
        )
        self.assertEqual(created_count, 1)

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(
                '/api/v1/hexagons/education-data/',
                {
                    'state': '42',
                    'municipality_code': '4205407',
                    'resolution': 7,
                    'page': 1,
                    'page_size': 2000,
                    'compact': 'true',
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['metadata']['rollup'])
        self.assertEqual(payload['metadata']['municipality'], '4205407')
        self.assertEqual(payload['metadata']['source_resolution'], 8)
        self.assertEqual(payload['count'], 1)
        self.assertEqual(payload['results'][0]['education_data']['qt_mat_inf_cre'], 300)

        queried_sql = '\n'.join(query['sql'].lower() for query in captured.captured_queries)
        self.assertIn('hexagon_rollups', queried_sql)
        self.assertNotIn('education_data', queried_sql)

    def test_municipality_rollup_endpoint_skips_source_resolution_counts(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        h3_index = sorted(h3.cell_to_children(parent, 8))[0]
        hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
        EducationData.objects.create(
            hexagon=hexagon,
            pop_inf_cre=50,
            qt_mat_inf_cre=100,
            qt_salas_utilizadas=10,
            qt_mat_inf_cre_prop='0.5000',
        )

        refresh_rollups_for_municipality(
            '42',
            '4205407',
            target_resolution=7,
            source_resolution=8,
        )

        with patch('brasil_edu.views.get_municipality_resolution_counts') as resolution_counts:
            response = self.client.get(
                '/api/v1/hexagons/education-data/',
                {
                    'state': '42',
                    'municipality_code': '4205407',
                    'resolution': 7,
                    'page': 1,
                    'page_size': 2000,
                    'compact': 'true',
                },
            )

        self.assertEqual(response.status_code, 200)
        resolution_counts.assert_not_called()

    def test_refresh_municipality_rollups_replaces_stale_source_resolution_rows(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        h3_index = sorted(h3.cell_to_children(parent, 8))[0]
        hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
        EducationData.objects.create(
            hexagon=hexagon,
            pop_inf_cre=50,
            qt_mat_inf_cre=100,
            qt_salas_utilizadas=10,
            qt_mat_inf_cre_prop='0.5000',
        )
        HexagonRollup.objects.create(
            state=self.state,
            municipality=self.municipality,
            h3_index=parent,
            resolution=7,
            source_resolution=7,
            source_hexagon_count=1,
        )

        created_count = refresh_rollups_for_municipality(
            '42',
            '4205407',
            target_resolution=7,
            source_resolution=8,
        )

        self.assertEqual(created_count, 1)
        self.assertEqual(
            HexagonRollup.objects.filter(
                municipality=self.municipality,
                resolution=7,
                h3_index=parent,
            ).count(),
            1,
        )
        self.assertTrue(
            HexagonRollup.objects.filter(
                municipality=self.municipality,
                resolution=7,
                h3_index=parent,
                source_resolution=8,
            ).exists()
        )

    def test_refresh_all_municipality_rollups_for_state_replaces_stale_rows(self):
        from django.contrib.gis.geos import MultiPolygon, Polygon

        second_municipality = Municipality.objects.create(
            state=self.state,
            name='Sao Jose',
            code_ibge='4216602',
            geometry=MultiPolygon(Polygon((
                (-49.0, -28.0),
                (-48.0, -28.0),
                (-48.0, -27.0),
                (-49.0, -27.0),
                (-49.0, -28.0),
            ))),
        )
        fixtures = [
            (self.municipality, h3.latlng_to_cell(-27.59, -48.55, 7), 100),
            (second_municipality, h3.latlng_to_cell(-27.80, -48.60, 7), 200),
        ]

        for municipality, parent, enrollment in fixtures:
            h3_index = sorted(h3.cell_to_children(parent, 8))[0]
            hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=municipality)
            EducationData.objects.create(
                hexagon=hexagon,
                pop_inf_cre=50,
                qt_mat_inf_cre=enrollment,
                qt_salas_utilizadas=10,
                qt_mat_inf_cre_prop='0.5000',
            )
            HexagonRollup.objects.create(
                state=self.state,
                municipality=municipality,
                h3_index=parent,
                resolution=7,
                source_resolution=7,
                source_hexagon_count=1,
            )

        created_count = refresh_municipality_rollups_for_state(
            '42',
            target_resolution=7,
            source_resolution=8,
        )

        self.assertEqual(created_count, 2)
        self.assertEqual(
            HexagonRollup.objects.filter(
                state=self.state,
                municipality__isnull=False,
                resolution=7,
            ).count(),
            2,
        )
        self.assertFalse(
            HexagonRollup.objects.filter(
                state=self.state,
                municipality__isnull=False,
                resolution=7,
                source_resolution=7,
            ).exists()
        )

    def test_missing_municipality_rollup_returns_fast_503(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        h3_index = sorted(h3.cell_to_children(parent, 8))[0]
        hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
        EducationData.objects.create(
            hexagon=hexagon,
            pop_inf_cre=50,
            qt_mat_inf_cre=100,
            qt_salas_utilizadas=10,
            qt_mat_inf_cre_prop='0.5000',
        )

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(
                '/api/v1/hexagons/education-data/',
                {
                    'state': '42',
                    'municipality_code': '4205407',
                    'resolution': 7,
                    'page': 1,
                    'page_size': 2000,
                    'compact': 'true',
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error'], 'rollup_not_ready')
        queried_sql = '\n'.join(query['sql'].lower() for query in captured.captured_queries)
        self.assertNotIn('education_data', queried_sql)

    def test_municipality_baseline_uses_rollups(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        children = sorted(h3.cell_to_children(parent, 8))[:2]

        for idx, h3_index in enumerate(children):
            hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
            EducationData.objects.create(
                hexagon=hexagon,
                pop_inf_cre=100,
                qt_mat_inf_cre=100,
                private_qt_mat_inf_cre=10,
                qt_mat_inf_cre_int=25,
                qt_salas_utilizadas=10,
                qt_mat_inf_cre_prop='0.5000',
            )

        refresh_rollups_for_municipality('42', '4205407', target_resolution=7, source_resolution=8)

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(f'/api/v1/municipalities/{self.municipality.id}/table-baseline/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['metadata']['rollup'])
        self.assertEqual(payload['metadata']['resolution'], 7)
        self.assertEqual(payload['levels']['INF_CRE']['pop'], 200)
        self.assertEqual(payload['levels']['INF_CRE']['totalEnroll'], 200)
        self.assertEqual(payload['levels']['INF_CRE']['privateEnroll'], 20)
        self.assertEqual(payload['levels']['INF_CRE']['integralEnrollShare'], 0.25)
        self.assertEqual(payload['levels']['INF_CRE']['existingClassrooms'], 10)

        queried_sql = '\n'.join(query['sql'].lower() for query in captured.captured_queries)
        self.assertIn('hexagon_rollups', queried_sql)
        self.assertNotIn('education_data', queried_sql)

    def test_calculate_needs_uses_rollups_for_coarse_resolution(self):
        parent = h3.latlng_to_cell(-27.59, -48.55, 7)
        children = sorted(h3.cell_to_children(parent, 8))[:2]

        for h3_index in children:
            hexagon = Hexagon.create_from_h3(h3_index, state=self.state, municipality=self.municipality)
            EducationData.objects.create(
                hexagon=hexagon,
                pop_inf_cre=50,
                qt_salas_utilizadas=4,
                qt_mat_inf_cre_prop='0.2500',
            )

        refresh_rollups_for_municipality('42', '4205407', target_resolution=7, source_resolution=8)

        with CaptureQueriesContext(connection) as captured:
            response = self.client.post(
                '/api/v1/hexagons/calculate-needs/',
                {
                    'state': '42',
                    'municipality_code': '4205407',
                    'resolution': 7,
                    'education_levels': ['INF_CRE'],
                    'parameters': {
                        'pop_not_in_school_pct_inf_cre': 0,
                        'students_private_pct_inf_cre': 0,
                        'students_integral_pct_inf_cre': 0,
                        'students_per_classroom_inf_cre': 10,
                    },
                },
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['summary']['aggregated'])
        self.assertEqual(payload['summary']['source_resolution'], 8)
        self.assertEqual(payload['summary']['total_hexagons_analyzed'], 1)
        self.assertEqual(payload['results'][0]['calculations']['qt_salas_actuales_inf_cre'], 2.0)
        self.assertEqual(payload['results'][0]['calculations']['qt_salas_necesarias_extra_inf_cre'], 8.0)

        queried_sql = '\n'.join(query['sql'].lower() for query in captured.captured_queries)
        self.assertIn('hexagon_rollups', queried_sql)
        self.assertNotIn('education_data', queried_sql)
