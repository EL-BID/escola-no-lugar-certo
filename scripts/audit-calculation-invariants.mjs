#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  stateCode: '35',
  municipalityCode: '3506003',
  resolution: 7,
  level: 'INF_CRE',
  percentages: [43.09, 41.09, 36.09],
  pageSize: 2000,
};

const LEVEL_SUFFIX = {
  INF_CRE: 'inf_cre',
  INF_PRE: 'inf_pre',
  FUND_AI: 'fund_ai',
  FUND_AF: 'fund_af',
  MED: 'med',
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return Math.min(1, Math.max(0, number(value) / 100));
}

export function displayClassroomsNeeded(value) {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

export function displayClassroomsSurplus(value) {
  return Number.isFinite(value) && value < 0
    ? Math.floor(Math.abs(value))
    : 0;
}

export function displaySignedClassroomBalance(value) {
  if (!Number.isFinite(value) || value === 0) return 0;
  return value > 0
    ? -displayClassroomsNeeded(value)
    : displayClassroomsSurplus(value);
}

export function classifyExtra(value) {
  const balance = displaySignedClassroomBalance(value);
  if (balance > 0) return { kind: 'surplus', value: balance };
  if (balance < 0) return { kind: 'demand', value: Math.abs(balance) };
  return { kind: 'neutral', value: 0 };
}

function displayInterval(display) {
  if (display.kind === 'surplus' && display.value > 0) {
    return { min: -(display.value + 1), max: -display.value };
  }
  if (display.kind === 'demand' && display.value > 0) {
    return { min: display.value - 1, max: display.value };
  }
  return { min: 0, max: 0 };
}

/**
 * Tests whether three rounded displays can come from one affine calculation.
 * Endpoints that are mathematically open are treated as closed; this makes the
 * result conservative (it will never reject a sequence merely due to rounding).
 */
export function isThreePointDisplaySequenceFeasible(percentages, displays) {
  if (percentages.length !== 3 || displays.length !== 3) {
    throw new Error('Exactly three percentages and displays are required.');
  }

  const [p1, p2, p3] = percentages;
  if (p1 === p2) throw new Error('The first two percentages must differ.');

  const [x1, x2, x3] = displays.map(displayInterval);
  const ratio = (p2 - p3) / (p1 - p2);
  const coefficientX2 = 1 + ratio;
  const coefficientX1 = -ratio;
  const candidates = [
    coefficientX2 * x2.min + coefficientX1 * x1.min,
    coefficientX2 * x2.min + coefficientX1 * x1.max,
    coefficientX2 * x2.max + coefficientX1 * x1.min,
    coefficientX2 * x2.max + coefficientX1 * x1.max,
  ];
  const possibleMin = Math.min(...candidates);
  const possibleMax = Math.max(...candidates);

  return possibleMax >= x3.min && possibleMin <= x3.max;
}

function rawExistingForLevel(educationData, suffix) {
  // Mirrors featuresToPerHexRows: a numeric zero becomes undefined and uses the
  // legacy fallback. This behavior is intentionally audited, not corrected here.
  const weighted = number(educationData[`qt_salas_weighted_${suffix}`], Number.NaN) || undefined;
  if (weighted !== undefined) return weighted;
  return number(educationData.qt_salas_utilizadas) * number(educationData[`qt_mat_${suffix}_prop`]);
}

export function calculateSnapshots(features, baselineLevel, level, percentages) {
  const suffix = LEVEL_SUFFIX[level];
  if (!suffix) throw new Error(`Unsupported education level: ${level}`);

  const usable = features.filter((feature) => feature?.education_data);
  const enrollmentTotal = usable.reduce(
    (sum, feature) => sum + number(feature.education_data[`qt_mat_${suffix}`]),
    0,
  );
  const rawExistingTotal = usable.reduce(
    (sum, feature) => sum + rawExistingForLevel(feature.education_data, suffix),
    0,
  );

  const population = number(baselineLevel.pop);
  const privatePct = population > 0
    ? (100 * number(baselineLevel.privateEnroll)) / population
    : 0;
  const integralPct = 100 * number(baselineLevel.integralEnrollShare);
  const nocturnalPct = 100 * number(baselineLevel.nocturnalShare);
  const seatsPerClass = Math.max(1, Math.floor(number(baselineLevel.seatsPerClass, 1)));
  const targetExisting = number(baselineLevel.existingClassrooms);

  const snapshots = usable.map((feature) => {
    const educationData = feature.education_data;
    const enrollment = number(educationData[`qt_mat_${suffix}`]);
    const enrollmentShare = enrollmentTotal > 0 ? enrollment / enrollmentTotal : 0;
    const rawExisting = rawExistingForLevel(educationData, suffix);
    const existing = rawExistingTotal > 0
      ? targetExisting * (rawExisting / rawExistingTotal)
      : 0;

    const results = percentages.map((outOfSchoolPct) => {
      // Mirrors computeTable followed by computeExtrasPerHex.
      const studentsPublicMunicipality = population * (1 - pct(outOfSchoolPct) - pct(privatePct));
      const studentsPublicHex = studentsPublicMunicipality * enrollmentShare;
      const seatsNeeded = studentsPublicHex * (1 + pct(integralPct)) * (1 - pct(nocturnalPct));
      const classroomsNeeded = seatsNeeded / seatsPerClass;
      const extra = classroomsNeeded - existing;
      return {
        outOfSchoolPct,
        studentsPublicMunicipality,
        studentsPublicHex,
        classroomsNeeded,
        existing,
        extra,
        display: classifyExtra(extra),
      };
    });

    const [first, second, third] = results;
    const ratio = percentages.length === 3 && percentages[0] !== percentages[1]
      ? (percentages[1] - percentages[2]) / (percentages[0] - percentages[1])
      : null;
    const affineExpectedThird = ratio == null
      ? null
      : second.extra + ratio * (second.extra - first.extra);

    return {
      h3Index: feature.h3_index,
      enrollment,
      enrollmentShare,
      rawExisting,
      existing,
      results,
      affineResidual: affineExpectedThird == null ? null : third.extra - affineExpectedThird,
    };
  });

  return {
    inputs: {
      population,
      privatePct,
      integralPct,
      nocturnalPct,
      seatsPerClass,
      targetExisting,
      enrollmentTotal,
      rawExistingTotal,
      hexagonCount: usable.length,
    },
    snapshots,
  };
}

export function calculateMultiLevelSnapshots(
  features,
  baselineLevels,
  levels,
  primaryLevel,
  percentages,
) {
  const calculations = new Map();
  for (const level of levels) {
    const baselineLevel = baselineLevels[level];
    if (!baselineLevel) throw new Error(`Baseline has no level ${level}`);
    const defaultOutOfSchoolPct = Math.max(
      0,
      100 * (1 - number(baselineLevel.totalEnroll) / Math.max(1, number(baselineLevel.pop))),
    );
    const levelPercentages = level === primaryLevel
      ? percentages
      : percentages.map(() => defaultOutOfSchoolPct);
    calculations.set(
      level,
      calculateSnapshots(features, baselineLevel, level, levelPercentages),
    );
  }

  const byLevelAndH3 = new Map(
    [...calculations.entries()].map(([level, calculation]) => [
      level,
      new Map(calculation.snapshots.map((snapshot) => [snapshot.h3Index, snapshot])),
    ]),
  );
  const featureByH3 = new Map(features.map((feature) => [feature.h3_index, feature]));
  const primarySnapshots = calculations.get(primaryLevel)?.snapshots ?? [];
  const snapshots = primarySnapshots.map((primarySnapshot) => {
    const results = percentages.map((outOfSchoolPct, resultIndex) => {
      const perLevel = {};
      for (const level of levels) {
        perLevel[level] = byLevelAndH3.get(level)?.get(primarySnapshot.h3Index)?.results[resultIndex];
      }
      const totalExtra = levels.reduce(
        (sum, level) => sum + number(perLevel[level]?.extra),
        0,
      );
      const perLevelBalance = Object.fromEntries(
        levels.map((level) => [
          level,
          displaySignedClassroomBalance(number(perLevel[level]?.extra)),
        ]),
      );
      const netBalance = levels.reduce(
        (sum, level) => sum + number(perLevelBalance[level]),
        0,
      );
      const display = netBalance > 0
        ? { kind: 'surplus', value: netBalance }
        : netBalance < 0
          ? { kind: 'demand', value: Math.abs(netBalance) }
          : { kind: 'neutral', value: 0 };
      return {
        outOfSchoolPct,
        perLevel,
        perLevelBalance,
        totalExtra,
        extra: totalExtra,
        netBalance,
        classroomsNeeded: Math.max(0, -netBalance),
        classroomsSurplus: Math.max(0, netBalance),
        display,
      };
    });
    const [first, second, third] = results;
    const ratio = percentages[0] !== percentages[1]
      ? (percentages[1] - percentages[2]) / (percentages[0] - percentages[1])
      : null;
    const affineExpectedThird = ratio == null
      ? null
      : second.totalExtra + ratio * (second.totalExtra - first.totalExtra);

    return {
      h3Index: primarySnapshot.h3Index,
      tooltipExistingClassrooms: number(
        featureByH3.get(primarySnapshot.h3Index)?.education_data?.qt_salas_utilizadas,
      ),
      results,
      affineResidual: affineExpectedThird == null
        ? null
        : third.totalExtra - affineExpectedThird,
    };
  });

  return {
    inputs: Object.fromEntries(
      [...calculations.entries()].map(([level, calculation]) => [level, calculation.inputs]),
    ),
    snapshots,
  };
}

function auditProgressivePageDrift(pages, baselineLevel, level, percentages, completeSnapshots) {
  if (pages.length <= 1) {
    return {
      applicable: false,
      reason: 'The complete scope fits in one API page.',
      affectedHexagonCount: 0,
      maxAbsoluteDrift: 0,
      worstCase: null,
    };
  }

  const completeByH3 = new Map(completeSnapshots.map((snapshot) => [snapshot.h3Index, snapshot]));
  const affectedH3 = new Set();
  let maxAbsoluteDrift = 0;
  let worstCase = null;
  let cumulativeFeatures = [];

  for (let pageIndex = 0; pageIndex < pages.length - 1; pageIndex += 1) {
    cumulativeFeatures = cumulativeFeatures.concat(pages[pageIndex].results ?? []);
    const partial = calculateSnapshots(
      cumulativeFeatures,
      baselineLevel,
      level,
      percentages,
    );

    for (const snapshot of partial.snapshots) {
      const complete = completeByH3.get(snapshot.h3Index);
      if (!complete) continue;
      const partialExtra = snapshot.results[0].extra;
      const completeExtra = complete.results[0].extra;
      const absoluteDrift = Math.abs(partialExtra - completeExtra);
      if (absoluteDrift > 1e-9) affectedH3.add(snapshot.h3Index);
      if (absoluteDrift > maxAbsoluteDrift) {
        maxAbsoluteDrift = absoluteDrift;
        worstCase = {
          h3Index: snapshot.h3Index,
          loadedPageCount: pageIndex + 1,
          loadedHexagonCount: cumulativeFeatures.length,
          outOfSchoolPct: percentages[0],
          partialExtra,
          partialDisplay: classifyExtra(partialExtra),
          completeExtra,
          completeDisplay: classifyExtra(completeExtra),
          absoluteDrift,
        };
      }
    }
  }

  return {
    applicable: true,
    reason: 'Compared values rendered from partial page sets with the complete scope.',
    affectedHexagonCount: affectedH3.size,
    maxAbsoluteDrift,
    worstCase,
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'help') {
      parsed.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function usage() {
  return `Usage:
  node scripts/audit-calculation-invariants.mjs (--base-url URL | --input-json PATH) [options]

Defaults reproduce the reported scope: Sao Paulo (35), Bauru (3506003),
Creche (INF_CRE), ~5 km2 / H3 resolution 7, percentages 43.09,41.09,36.09.

Options:
  --origin URL
  --input-json PATH
  --state-code CODE
  --municipality-code CODE
  --resolution NUMBER
  --level LEVEL
  --levels CSV
  --primary-level LEVEL
  --percentages CSV
  --page-size NUMBER
  --hex-id H3_INDEX
  --output-json PATH
`;
}

async function getJson(url, origin) {
  const response = await fetch(url, {
    headers: origin ? { Origin: origin } : undefined,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function loadScope(options) {
  if (options.inputJson) {
    const fixture = JSON.parse(await readFile(options.inputJson, 'utf8'));
    const pages = fixture.pages ?? [{ results: fixture.features ?? [], metadata: fixture.metadata ?? {} }];
    return {
      municipality: fixture.municipality,
      baseline: fixture.baseline,
      pages,
      features: pages.flatMap((payload) => payload.results ?? []),
    };
  }

  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const municipalitiesUrl = new URL(`${baseUrl}/states/${options.stateCode}/municipalities/`);
  const municipalities = await getJson(municipalitiesUrl, options.origin);
  const municipality = municipalities.results.find(
    (candidate) => String(candidate.code_ibge) === String(options.municipalityCode),
  );
  if (!municipality) throw new Error(`Municipality ${options.municipalityCode} was not returned by ${municipalitiesUrl}`);

  const baseline = await getJson(
    new URL(`${baseUrl}/municipalities/${municipality.id}/table-baseline/`),
    options.origin,
  );

  const pages = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const url = new URL(`${baseUrl}/hexagons/education-data/`);
    url.searchParams.set('state', options.stateCode);
    url.searchParams.set('municipality_code', options.municipalityCode);
    url.searchParams.set('resolution', String(options.resolution));
    url.searchParams.set('education_levels', options.level);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(options.pageSize));
    url.searchParams.set('compact', 'true');
    const payload = await getJson(url, options.origin);
    pages.push(payload);
    hasNext = Boolean(payload.metadata?.has_next);
    page += 1;
  }

  return {
    municipality,
    baseline,
    pages,
    features: pages.flatMap((payload) => payload.results ?? []),
  };
}

export async function runAudit(options) {
  const scope = await loadScope(options);
  const baselineLevel = scope.baseline.levels?.[options.primaryLevel];
  if (!baselineLevel) throw new Error(`Baseline has no level ${options.primaryLevel}`);

  const calculation = options.levels.length > 1
    ? calculateMultiLevelSnapshots(
        scope.features,
        scope.baseline.levels,
        options.levels,
        options.primaryLevel,
        options.percentages,
      )
    : calculateSnapshots(
        scope.features,
        baselineLevel,
        options.primaryLevel,
        options.percentages,
      );
  const progressivePageDrift = auditProgressivePageDrift(
    scope.pages,
    baselineLevel,
    options.primaryLevel,
    options.percentages,
    calculation.snapshots,
  );
  const reportedDisplays = [
    { kind: 'surplus', value: 3 },
    { kind: 'surplus', value: 2 },
    { kind: 'demand', value: 8 },
  ];
  const exactMatches = calculation.snapshots.filter((snapshot) =>
    snapshot.results.every((result, index) =>
      result.display.kind === reportedDisplays[index]?.kind
      && result.display.value === reportedDisplays[index]?.value
    )
  );
  const selectedSnapshots = options.hexId
    ? calculation.snapshots.filter((snapshot) => snapshot.h3Index === options.hexId)
    : calculation.snapshots;

  const output = {
    generatedAt: new Date().toISOString(),
    scope: {
      stateCode: options.stateCode,
      municipalityCode: options.municipalityCode,
      municipalityId: scope.municipality.id,
      municipalityName: scope.municipality.name,
      resolution: options.resolution,
      levels: options.levels,
      primaryLevel: options.primaryLevel,
      percentages: options.percentages,
      pageCount: scope.pages.length,
      apiMetadata: scope.pages.map((page) => page.metadata),
    },
    calculationInputs: calculation.inputs,
    checks: {
      reportedDisplaySequence: reportedDisplays,
      reportedSequenceMathematicallyFeasibleWithStableInputs:
        options.percentages.length === 3
          ? isThreePointDisplaySequenceFeasible(options.percentages, reportedDisplays)
          : null,
      exactMatchCount: exactMatches.length,
      maxAffineResidual: Math.max(
        0,
        ...calculation.snapshots.map((snapshot) => Math.abs(snapshot.affineResidual ?? 0)),
      ),
      duplicateH3Count:
        scope.features.length - new Set(scope.features.map((feature) => feature.h3_index)).size,
      completeDataLoadedBeforeCalculation: true,
      progressivePageDrift,
    },
    exactMatches,
    snapshots: selectedSnapshots,
  };

  if (options.outputJson) {
    await writeFile(options.outputJson, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  return output;
}

async function main() {
  const raw = parseArgs(process.argv.slice(2));
  if (raw.help || (!raw['base-url'] && !raw['input-json'])) {
    console.log(usage());
    process.exitCode = raw.help ? 0 : 2;
    return;
  }

  const options = {
    baseUrl: raw['base-url'],
    inputJson: raw['input-json'],
    origin: raw.origin,
    stateCode: raw['state-code'] ?? DEFAULTS.stateCode,
    municipalityCode: raw['municipality-code'] ?? DEFAULTS.municipalityCode,
    resolution: number(raw.resolution, DEFAULTS.resolution),
    primaryLevel: raw['primary-level'] ?? raw.level ?? DEFAULTS.level,
    levels: (raw.levels ?? raw.level ?? DEFAULTS.level).split(','),
    percentages: raw.percentages
      ? raw.percentages.split(',').map((value) => number(value, Number.NaN))
      : DEFAULTS.percentages,
    pageSize: number(raw['page-size'], DEFAULTS.pageSize),
    hexId: raw['hex-id'],
    outputJson: raw['output-json'],
  };
  if (!options.levels.includes(options.primaryLevel)) {
    throw new Error('--primary-level must be included in --levels.');
  }
  if (options.percentages.length < 3 || options.percentages.some((value) => !Number.isFinite(value))) {
    throw new Error('--percentages must contain at least three finite numbers.');
  }

  const output = await runAudit(options);
  console.log(JSON.stringify({
    scope: output.scope,
    calculationInputs: output.calculationInputs,
    checks: output.checks,
    exactMatches: output.exactMatches,
    snapshots: options.hexId ? output.snapshots : undefined,
    outputJson: options.outputJson ?? null,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
