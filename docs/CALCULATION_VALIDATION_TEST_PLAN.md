# Calculation Validation Test Plan

## Purpose

This plan defines the test coverage required before publishing the application for government users and IDB stakeholders. The goal is to prove that the map colors, hexagon tooltips, calculator totals, reports, filters, and backend endpoints all use the same calculation contract and do not silently disagree.

The immediate client observations this plan must cover are:

- A blue hexagon, meaning classroom surplus, can show `Excedente: 0 salas` in the tooltip.
- A green hexagon can show `Novas Salas Necessarias: 1` while the per-level tooltip rows show a much larger number for one selected level.

These cases can happen when the underlying fractional value, color rule, total rounding rule, and per-level rounding rule are not tested as one contract.

## Calculation Contract To Freeze First

Before adding broad tests, define one written calculation contract and make tests assert it exactly.

Required decisions:

- Whether the authoritative per-hex value is fractional or integer.
- Which rounding rule applies to positive demand, negative surplus, and exact zero.
- Whether a displayed total must equal the sum of displayed per-level rows.
- Whether surplus from one level may compensate deficit in another level inside the same hexagon.
- Whether surplus from one hexagon may compensate deficit in another hexagon in calculator and report totals.
- Whether a hexagon with `-0.3` surplus should be blue with `Excedente: 1`, blue with `Excedente: <1`, or neutral grey. It must not be blue with `Excedente: 0`.
- Whether color, filter, tooltip, histogram, and report should classify by the same rounded value or by the same fractional value.

Recommended display invariant:

```text
display_total_new_classrooms(hex, selected_levels)
  == sum(display_new_classrooms_by_level(hex, selected_levels))
```

If product rules require compensated totals instead, the tooltip must label that explicitly and tests must assert both values:

```text
gross_new_classrooms = sum(max(0, per_level_extra))
net_extra = sum(per_level_extra)
surplus = abs(min(0, net_extra))
```

## Test Data Strategy

Create deterministic golden fixtures that are small enough for exact manual review and rich enough to cover all edge cases.

Fixture scopes:

- One small state with two municipalities.
- One large synthetic state with many hexagons to exercise pagination and rollups.
- One municipality with resolution 8 source data and precomputed resolution 7, 6, and 5 rollups.
- One state-level resolution 5 rollup.

Fixture cases:

- Exact zero demand.
- Small surplus such as `-0.3`, `-0.49`, `-0.5`, and `-0.51`.
- Small demand such as `0.01`, `0.49`, `0.5`, and `0.51`.
- One level with positive demand and another level with surplus in the same hexagon.
- Multiple selected levels where the total can differ from rounded per-level rows if rounding is done independently.
- Hexagons with no existing classrooms.
- Hexagons with classrooms but no enrollment for one selected level.
- Hexagons with private enrollment, integral enrollment, and nocturnal enrollment.
- Direct resolution 8 data and equivalent rollup rows using `qt_salas_weighted_*`.
- Pagination where the same total is computed from page 1 only, all pages, and count-only metadata.

Golden fixture artifacts:

- `backend/brasil_edu/tests/fixtures/calculation_golden.json`
- `frontend/src/lib/__fixtures__/calculationGolden.ts`
- `docs/calculation-contract.md` with hand-computed examples for every fixture row.

The backend and frontend should consume the same fixture values. Do not maintain two independent golden datasets.

## Frontend Unit Tests

Target files:

- `frontend/src/lib/hexExtras.ts`
- `frontend/src/components/maps/EducationMap.tsx`
- report and histogram helpers that call `computeExtrasPerHex`

Required tests:

- `featuresToPerHexRows` maps all canonical fields and all `qt_salas_weighted_*` fields.
- `computeExtrasPerHex` prefers `qt_salas_weighted_*` fields when present.
- Legacy direct resolution 8 rows without weighted fields still use `qt_salas_utilizadas * qt_mat_*_prop`.
- Sum of per-level fractional extras equals `totalExtra` for selected levels.
- Positive display totals use the same rounding rule everywhere.
- Negative display totals use the same rounding rule everywhere.
- A blue/surplus hexagon never displays `Excedente: 0 salas`.
- A green/demand hexagon never displays a total that contradicts the visible per-level rows.
- Changing selected education levels updates color, total tooltip, per-level tooltip, histogram, and report rows consistently.
- Tooltip variant A and variant B are both covered if they remain in the app.
- Filter inclusion uses the same value that the legend and tooltip communicate.

Immediate regression tests for client screenshots:

- Build a hexagon with `totalExtra = -0.3`; assert final rendered tooltip is not `Excedente: 0 salas`.
- Build a selected-level set where per-level values are `[14.2, -13.4]`; assert the tooltip either shows gross demand `15` plus surplus/compensation, or shows net demand using matching per-level rows. It must not show `Novas Salas Necessarias: 1` beside only `15` and `0` rows without explanation.
- Build a selected-level set where per-level values are `[0.2, 0.2, 0.2]`; assert the total and rows follow the frozen rounding contract.

Suggested commands:

```bash
cd frontend
npm test -- hexExtras
npm test -- EducationMap
```

## Backend Unit And API Tests

Target files:

- `backend/brasil_edu/views.py`
- `backend/brasil_edu/services/hexagon_rollups.py`
- `backend/brasil_edu/tests.py` or split test modules under `backend/brasil_edu/tests/`

Required tests:

- Rollup aggregation preserves `sum(classrooms * level_prop)` for every level.
- Rollup population, public/private enrollment, integral enrollment, nocturnal enrollment, classroom totals, and weighted classroom totals equal canonical resolution 8 aggregation.
- State resolution 5 map endpoint reads `hexagon_rollups`, not `education_data`.
- Municipality resolution 7 map endpoint reads `hexagon_rollups`, not `education_data`.
- Missing rollup returns fast structured `rollup_not_ready` and does not enter Python aggregation.
- Direct resolution 8 map endpoint still reads canonical data.
- `table-baseline` totals from rollups equal canonical source totals within the defined tolerance.
- `calculate-needs` returns the same totals for direct resolution 8 and equivalent rollup resolution 7/6/5 fixtures where the calculation is expected to be equivalent.
- `calculate-needs` per-level values use the same classroom source as the map calculation.
- API response values include enough raw fields for the frontend to reproduce backend calculations.

Endpoint invariant tests:

- For each fixture scope, call map data, baseline, and calculate-needs with the same state, municipality, resolution, selected levels, and parameters.
- Assert that the calculator panel total equals the sum implied by the map data under the frozen contract.
- Assert that report totals match the same contract.
- Assert that all pages combined equal the endpoint summary.

Suggested commands:

```bash
cd backend
python manage.py test brasil_edu
```

## Cross-Layer Golden Tests

Add a script that calls backend endpoints, computes frontend-equivalent values in Node, and writes an audit artifact.

Proposed file:

```text
scripts/audit-calculation-invariants.mjs
```

Inputs:

- `--base-url`
- `--origin`
- `--state-code`
- `--municipality-code`
- `--resolution`
- `--education-levels`
- `--parameters-json`
- `--output-json`

Checks:

- Every returned hexagon has finite numeric inputs.
- Every selected level has a deterministic per-level extra.
- `totalExtra` equals the sum of selected per-level extras before display rounding.
- Display total equals display per-level sum, unless the frozen contract explicitly defines net/gross compensation.
- Color class equals tooltip class: surplus, neutral, or demand.
- Surplus display never rounds to zero while color is blue.
- Demand display never rounds to zero while color is green.
- Histogram bin, report row, map color, and tooltip value agree for the same hexagon.
- Response metadata confirms whether data came from `direct` or `rollup`.

Initial production audit matrix:

- Amazonas, Para, Sao Paulo, Espirito Santo.
- Altamira, Sao Sebastiao, Bauru.
- Resolutions 5, 6, 7, and 8 where supported.
- Single-level selections for all five levels.
- Multi-level selections: all levels, pre-school plus final years, and adjacent pairs.

Suggested command:

```bash
bun scripts/audit-calculation-invariants.mjs \
  --base-url https://escolanolugarcerto.iadb.org/api/v1 \
  --origin https://escolanolugarcerto.iadb.org \
  --state-code 15 \
  --municipality-code 1500602 \
  --resolution 7 \
  --education-levels INF_PRE,FUND_AF \
  --output-json /tmp/calculation-audit-altamira.json
```

## Browser End-To-End Tests

Use Playwright for representative user flows. These tests should use seeded backend fixtures in CI and production audit data outside CI.

Required flows:

- Select a state, select multiple levels, apply resolution 5, hover a surplus hexagon, and assert the tooltip classification and value are coherent.
- Select a municipality, select resolution 7, hover a demand hexagon, and assert total equals visible per-level rows under the contract.
- Change calculator inputs and assert map colors, tooltip values, histogram, and report update together.
- Apply a filter range and assert hidden, grey, blue, green, yellow, and red classes match expected values.
- Generate report and assert report totals match the map/calculator values for the same selection.
- Repeat with direct resolution 8 and rollup resolution 7 for the same municipality.

Screenshots should be saved for IDB review artifacts, but assertions must be data-based, not visual-only.

Suggested command:

```bash
cd frontend
npx playwright test tests/e2e/calculation-invariants.spec.ts
```

## Property-Based And Metamorphic Tests

Add randomized tests after the golden tests are stable.

Properties:

- Reordering hexagons does not change totals.
- Splitting one hexagon into two identical halves preserves aggregate totals within tolerance.
- Combining source hexagons into a rollup preserves aggregate totals within tolerance.
- Adding an unselected education level does not affect selected-level results.
- Increasing students public cannot reduce needed classrooms when all other inputs are fixed.
- Increasing existing classrooms cannot increase new classrooms needed when all other inputs are fixed.
- Increasing seats per classroom cannot increase needed classrooms when all other inputs are fixed.
- Pagination boundaries do not change aggregate totals.

## CI Gates

The deployment workflow should block when any of these fail:

- Backend calculation and rollup tests.
- Frontend calculation, tooltip, report, and histogram tests.
- Cross-layer golden fixture audit.
- Browser calculation invariant tests for seeded data.

The workflow should publish artifacts:

- Golden fixture audit JSON.
- Browser screenshots for the core flows.
- A short calculation invariant summary with pass/fail counts.

## Production Audit Before Public Communication

Before announcing the tool broadly, run a read-only audit against production and store the artifacts.

Required sample:

- All 27 states at state resolution 5.
- All municipalities in Amazonas, Para, Sao Paulo, and Espirito Santo at municipality resolutions 5, 6, and 7.
- The client-reported municipalities: Altamira, Sao Sebastiao, and Bauru.
- Direct resolution 8 samples for at least 30 municipalities across small, medium, and large populations.

Failure policy:

- Any mismatch between color and tooltip classification blocks release.
- Any unexplained mismatch between displayed total and visible per-level rows blocks release.
- Any rollup/direct aggregate mismatch outside tolerance blocks release.
- Any non-finite value, missing weighted classroom field in rollups, or missing rollup for supported scopes blocks release.

## Implementation Sequence

1. Write `docs/calculation-contract.md` with formulas, rounding rules, color thresholds, compensation rules, and examples.
2. Add the shared golden fixture and hand-computed expected results.
3. Add frontend unit tests for `computeExtrasPerHex`, display rounding, tooltip totals, histogram, and reports.
4. Add backend tests for rollup equivalence, endpoint source selection, baseline totals, and calculate-needs totals.
5. Add `scripts/audit-calculation-invariants.mjs` for live backend and production checks.
6. Add Playwright tests for user-visible map, tooltip, filter, calculator, and report behavior.
7. Run the production audit matrix and attach artifacts to the release notes.
8. Only then adjust the UI behavior for the two client-reported tooltip issues, using tests from this plan as regression coverage.

## Acceptance Criteria

The calculation work is ready to ship when:

- Every formula and rounding rule is documented.
- The same golden fixtures pass in backend, frontend, and browser tests.
- Production audit passes for the required states, municipalities, resolutions, and level combinations.
- A blue hexagon cannot display zero surplus.
- A demand hexagon cannot display a total that contradicts its visible per-level rows.
- Rollup and direct-resolution calculations are equivalent within the documented tolerance.
- CI blocks deployment on any calculation invariant failure.
