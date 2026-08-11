// Helpers to compute per-hex “new classrooms needed” based on table parameters
// Mirrors the logic described in docs/temporal/HEXAGON_MAP_COLORSCALE.md

import type { EducationLevel, HexagonFeature } from '@/types/api';

export type Level = EducationLevel;
export const LEVELS: Level[] = ['INF_CRE', 'INF_PRE', 'FUND_AI', 'FUND_AF', 'MED'];

export type PerHexRow = {
  hexId: string;
  QT_SALAS_UTILIZADAS: number;
  QT_MAT: Record<Level, number>;      // enrollments per level for prop_mat
  QT_MAT_PROP: Record<Level, number>; // per-level classroom proportions (from backend, 0..1)
  QT_SALAS_WEIGHTED?: Partial<Record<Level, number>>; // precomputed sum(classrooms * level prop)
};

export type TableParams = {
  studentsPublic: Record<Level, number>;  // from calculator table (per municipality)
  existingClassrooms: Record<Level, number>; // total municipal existing classrooms (for normalization)
  pctIntegral: Record<Level, number>;     // 0..100
  pctNocturnal: Record<Level, number>;    // 0..100
  seatsPerClass: Record<Level, number>;   // seats per classroom
};

export type ExtraPerHex = {
  hexId: string;
  perLevel: Record<Level, number>; // raw fractional difference: positive demand, negative surplus
  totalExtra: number;              // raw fractional sum retained for aggregate calculations
  perLevelBalance: Record<Level, number>; // displayed balance: negative demand, positive surplus
  netBalance: number;              // sum of rounded selected-level balances
  classroomsNeeded: number;        // absolute missing classrooms when netBalance is negative
  classroomsSurplus: number;       // surplus classrooms when netBalance is positive
};

export type ClassroomBalanceSummary = Pick<
  ExtraPerHex,
  'perLevelBalance' | 'netBalance' | 'classroomsNeeded' | 'classroomsSurplus'
>;

const pct = (p: number) => Math.min(1, Math.max(0, (isFinite(p) ? p : 0) / 100));

export function displayClassroomsNeeded(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

export function displayClassroomsSurplus(value: number): number {
  if (!Number.isFinite(value) || value >= 0) return 0;
  return Math.floor(Math.abs(value));
}

/**
 * Converts the internal difference (needed - existing) into the signed display
 * contract: negative means missing classrooms and positive means surplus.
 */
export function displaySignedClassroomBalance(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return value > 0
    ? -displayClassroomsNeeded(value)
    : displayClassroomsSurplus(value);
}

export function summarizeClassroomBalance(
  perLevel: Partial<Record<Level, number>> | undefined,
  selectedLevels: Level[]
): ClassroomBalanceSummary {
  const perLevelBalance = { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 } as Record<Level, number>;

  for (const lvl of LEVELS) {
    perLevelBalance[lvl] = selectedLevels.includes(lvl)
      ? displaySignedClassroomBalance(perLevel?.[lvl] || 0)
      : 0;
  }

  const netBalance = selectedLevels.reduce((sum, lvl) => sum + perLevelBalance[lvl], 0);
  return {
    perLevelBalance,
    netBalance,
    classroomsNeeded: Math.max(0, -netBalance),
    classroomsSurplus: Math.max(0, netBalance),
  };
}

export function computeExtrasPerHex(
  hexRows: PerHexRow[],
  params: TableParams,
  selectedLevels: Level[]
): ExtraPerHex[] {
  // Precompute denominators for prop_mat per level (sum of QT_MAT across hexes)
  // And precompute sum of raw existing classrooms to normalize against params.existingClassrooms
  const sumQT_MAT: Record<Level, number> = { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 };
  const sumRawExisting: Record<Level, number> = { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 };
  
  for (const row of hexRows) {
    for (const lvl of LEVELS) {
      sumQT_MAT[lvl] += row.QT_MAT[lvl] || 0;
      const rawExisting = row.QT_SALAS_WEIGHTED?.[lvl] ?? (
        (row.QT_SALAS_UTILIZADAS || 0) * (row.QT_MAT_PROP[lvl] || 0)
      );
      sumRawExisting[lvl] += rawExisting;
    }
  }

  const results = hexRows.map((row) => {
    const perLevel: Record<Level, number> = { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 };

    for (const lvl of LEVELS) {
      const denom = sumQT_MAT[lvl] || 0;
      const prop = denom > 0 ? (row.QT_MAT[lvl] || 0) / denom : 0;

      // Redistributed students in public for this hex and level
      const studentsPublicHex = (params.studentsPublic[lvl] || 0) * prop;

      // Seats needed (tempo integral / noturno adjustments)
      const seatsNeeded =
        studentsPublicHex * (1 + pct(params.pctIntegral[lvl])) * (1 - pct(params.pctNocturnal[lvl]));

      const seatsPerClass = Math.max(1, Math.floor(params.seatsPerClass[lvl] || 1));
      const classroomsNeededTotal = seatsNeeded / seatsPerClass;

      // Normalize existing classrooms so the sum across all hexes equals params.existingClassrooms[lvl]
      const rawExisting = row.QT_SALAS_WEIGHTED?.[lvl] ?? (
        (row.QT_SALAS_UTILIZADAS || 0) * (row.QT_MAT_PROP[lvl] || 0)
      );
      const sumRaw = sumRawExisting[lvl];
      const targetTotal = params.existingClassrooms[lvl] || 0;
      
      const existing = sumRaw > 0 
        ? targetTotal * (rawExisting / sumRaw)
        : 0; // If no raw existing found in map, assume 0 (or we could assume uniform distribution, but 0 is safer)

      // Allow negative values so surpluses offset deficits when summed
      const extra = classroomsNeededTotal - existing;
      perLevel[lvl] = extra;
    }

    const totalExtra = selectedLevels.reduce((acc, lvl) => acc + perLevel[lvl], 0);
    const balance = summarizeClassroomBalance(perLevel, selectedLevels);
    return { hexId: row.hexId, perLevel, totalExtra, ...balance };
  });

  return results;
}

// Convenience to map from API features to PerHexRow
export function featuresToPerHexRows(features: HexagonFeature[]): PerHexRow[] {
  const rows = features
    .filter((f): f is HexagonFeature & { education_data: NonNullable<HexagonFeature['education_data']> } => f.education_data != null)
    .map((f) => {
    const e = f.education_data;
    return {
      hexId: f.h3_index,
      QT_SALAS_UTILIZADAS: e.qt_salas_utilizadas || 0,
      QT_MAT: {
        INF_CRE: e.qt_mat_inf_cre || 0,
        INF_PRE: e.qt_mat_inf_pre || 0,
        FUND_AI: e.qt_mat_fund_ai || 0,
        FUND_AF: e.qt_mat_fund_af || 0,
        MED: e.qt_mat_med || 0,
      },
      QT_MAT_PROP: {
        INF_CRE: parseFloat(String(e.qt_mat_inf_cre_prop)) || 0,
        INF_PRE: parseFloat(String(e.qt_mat_inf_pre_prop)) || 0,
        FUND_AI: parseFloat(String(e.qt_mat_fund_ai_prop)) || 0,
        FUND_AF: parseFloat(String(e.qt_mat_fund_af_prop)) || 0,
        MED: parseFloat(String(e.qt_mat_med_prop)) || 0,
      },
      QT_SALAS_WEIGHTED: {
        INF_CRE: parseFloat(String(e.qt_salas_weighted_inf_cre)) || undefined,
        INF_PRE: parseFloat(String(e.qt_salas_weighted_inf_pre)) || undefined,
        FUND_AI: parseFloat(String(e.qt_salas_weighted_fund_ai)) || undefined,
        FUND_AF: parseFloat(String(e.qt_salas_weighted_fund_af)) || undefined,
        MED: parseFloat(String(e.qt_salas_weighted_med)) || undefined,
      },
    } as PerHexRow;
  });

  return rows;
}
