import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  calculateMultiLevelSnapshots,
  calculateSnapshots,
  isThreePointDisplaySequenceFeasible,
} from './audit-calculation-invariants.mjs';

const reportedPercentages = [43.09, 41.09, 36.09];
const reportedDisplays = [
  { kind: 'surplus', value: 3 },
  { kind: 'surplus', value: 2 },
  { kind: 'demand', value: 8 },
];

test('the reported rounded sequence is impossible with stable affine inputs', () => {
  assert.equal(
    isThreePointDisplaySequenceFeasible(reportedPercentages, reportedDisplays),
    false,
  );
});

test('percentage changes are monotonic and affine for a fixed feature set', () => {
  const features = [
    {
      h3_index: 'focus',
      education_data: {
        qt_mat_inf_cre: 60,
        qt_salas_utilizadas: 4,
        qt_mat_inf_cre_prop: 1,
      },
    },
    {
      h3_index: 'neighbor',
      education_data: {
        qt_mat_inf_cre: 40,
        qt_salas_utilizadas: 6,
        qt_mat_inf_cre_prop: 1,
      },
    },
  ];
  const baseline = {
    pop: 1000,
    privateEnroll: 100,
    integralEnrollShare: 0.2,
    nocturnalShare: 0,
    existingClassrooms: 10,
    seatsPerClass: 20,
  };

  const { snapshots } = calculateSnapshots(
    features,
    baseline,
    'INF_CRE',
    reportedPercentages,
  );

  for (const snapshot of snapshots) {
    const extras = snapshot.results.map((result) => result.extra);
    assert.ok(extras[0] <= extras[1]);
    assert.ok(extras[1] <= extras[2]);
    assert.ok(Math.abs(snapshot.affineResidual) < 1e-10);
  }
});

test('changing the feature universe changes a hex result and must not happen mid-edit', () => {
  const focus = {
    h3_index: 'focus',
    education_data: {
      qt_mat_inf_cre: 60,
      qt_salas_utilizadas: 4,
      qt_mat_inf_cre_prop: 1,
    },
  };
  const neighbor = {
    h3_index: 'neighbor',
    education_data: {
      qt_mat_inf_cre: 40,
      qt_salas_utilizadas: 20,
      qt_mat_inf_cre_prop: 1,
    },
  };
  const baseline = {
    pop: 1000,
    privateEnroll: 100,
    integralEnrollShare: 0,
    nocturnalShare: 0,
    existingClassrooms: 24,
    seatsPerClass: 20,
  };

  const partial = calculateSnapshots([focus], baseline, 'INF_CRE', reportedPercentages)
    .snapshots[0].results[1].extra;
  const complete = calculateSnapshots([focus, neighbor], baseline, 'INF_CRE', reportedPercentages)
    .snapshots[0].results[1].extra;

  assert.notEqual(partial, complete);
});

test('reproduces both Bauru screenshot hexagon sequences', async () => {
  const fixture = JSON.parse(await readFile(
    new URL('./fixtures/bauru-screenshot-hexagons.json', import.meta.url),
    'utf8',
  ));
  const levels = ['INF_CRE', 'FUND_AI'];

  const hex50 = calculateMultiLevelSnapshots(
    fixture.features,
    fixture.baseline.levels,
    levels,
    'INF_CRE',
    [43.09, 41.09, 39.09],
  ).snapshots.find((snapshot) => snapshot.h3Index === '87a81c351ffffff');
  assert.deepEqual(
    hex50.results.map((result) => result.display),
    [
      { kind: 'demand', value: 1 },
      { kind: 'demand', value: 1 },
      { kind: 'demand', value: 2 },
    ],
  );
  assert.ok(Math.abs(hex50.affineResidual) < 1e-10);

  const hex45 = calculateMultiLevelSnapshots(
    fixture.features,
    fixture.baseline.levels,
    levels,
    'INF_CRE',
    [43.09, 30.09, 20.09, 5.09],
  ).snapshots.find((snapshot) => snapshot.h3Index === '87a81cadbffffff');
  assert.deepEqual(
    hex45.results.map((result) => result.display),
    [
      { kind: 'surplus', value: 3 },
      { kind: 'surplus', value: 2 },
      { kind: 'neutral', value: 0 },
      { kind: 'demand', value: 1 },
    ],
  );
  assert.ok(Math.abs(hex45.affineResidual) < 1e-10);
});
