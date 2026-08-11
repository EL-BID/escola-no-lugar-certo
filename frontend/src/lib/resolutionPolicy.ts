export const SUPPORTED_RESOLUTIONS = [5, 6, 7, 8] as const;
export const SOURCE_HEXAGON_RESOLUTION = 8;
export const MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST = 120000;

type ResolutionCountMap = Record<string, number>;

function clampResolution(value: number): number {
  return Math.max(Math.min(value, 8), 5);
}

export function estimateHexagonsFromRes8(countRes8: number, targetResolution: number): number {
  if (countRes8 <= 0) {
    return 0;
  }

  if (targetResolution === SOURCE_HEXAGON_RESOLUTION) {
    return Math.round(countRes8);
  }

  const delta = SOURCE_HEXAGON_RESOLUTION - targetResolution;
  if (delta > 0) {
    return Math.max(1, Math.round(countRes8 / Math.pow(7, delta)));
  }

  return Math.round(countRes8 * Math.pow(7, Math.abs(delta)));
}

export function normalizeResolutionCounts(rawCounts?: Record<string, number>): ResolutionCountMap {
  const counts: ResolutionCountMap = {
    '5': rawCounts?.['5'] ?? 0,
    '6': rawCounts?.['6'] ?? 0,
    '7': rawCounts?.['7'] ?? 0,
    '8': rawCounts?.['8'] ?? 0,
  };

  const countRes8 = counts['8'];
  if (countRes8 > 0) {
    for (const resolution of [7, 6, 5]) {
      const key = String(resolution);
      if (counts[key] <= 0) {
        counts[key] = estimateHexagonsFromRes8(countRes8, resolution);
      }
    }
  }

  return counts;
}

export function getSafeResolution(
  requestedResolution: number,
  rawCounts?: Record<string, number>
): number {
  const requested = clampResolution(requestedResolution);
  const counts = normalizeResolutionCounts(rawCounts);

  const hasAnyCount = SUPPORTED_RESOLUTIONS.some((resolution) => (counts[String(resolution)] ?? 0) > 0);
  if (!hasAnyCount) {
    return requested;
  }

  for (let candidate = requested; candidate >= 5; candidate -= 1) {
    const estimatedCount = counts[String(candidate)] ?? 0;
    if (estimatedCount > 0 && estimatedCount <= MAX_HEXAGONS_PER_MUNICIPALITY_REQUEST) {
      return candidate;
    }
  }

  return 5;
}

export function getAvailableResolutions(rawCounts?: Record<string, number>): number[] {
  const safeMaxResolution = getSafeResolution(8, rawCounts);
  return SUPPORTED_RESOLUTIONS.filter((resolution) => resolution <= safeMaxResolution);
}
