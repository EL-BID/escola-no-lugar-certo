// Needed Classrooms Calculator: pure functions and types
import type { EducationLevel } from '../types/api';

export type LevelCode = EducationLevel;
export const LEVELS: LevelCode[] = ['INF_CRE', 'INF_PRE', 'FUND_AI', 'FUND_AF', 'MED'];

// Re-export for convenience
export { EDUCATION_LEVEL_LABELS } from './calculatorFields';

export type BaselineLevel = {
  pop: number;                 // population estimate
  totalEnroll: number;         // total enrollments (public + private)
  privateEnroll: number;       // private enrollments
  integralEnrollShare: number; // 0..1
  nocturnalShare: number;      // 0..1
  existingClassrooms: number;  // ceil(sum of QT_SALAS_UTILIZADAS * level PROP)
  seatsPerClass: number;       // default seats per class
};

export type BaselinePayload = Record<LevelCode, BaselineLevel>;

export type EditableInputs = {
  // All in percentages 0..100, editable in form
  pctOutOfSchool: Record<LevelCode, number>;
  pctPrivate: Record<LevelCode, number>;
  pctIntegral: Record<LevelCode, number>;
  pctNocturnal: Record<LevelCode, number>;
  seatsPerClass: Record<LevelCode, number>;
  // existingClassrooms could be read-only but keep it here if you allow edits:
  existingClassrooms: Record<LevelCode, number>;
  // population can be edited for scenarios
  pop: Record<LevelCode, number>;
};

export type DerivedPerLevel = {
  studentsPublic: number;
  totalSeatsNeeded: number;
  classroomsNeeded: number;
  newClassroomsNeeded: number;
};

export type TableOutput = {
  byLevel: Record<LevelCode, DerivedPerLevel>;
  totals: {
    studentsPublic: number;
    totalSeatsNeeded: number;
    classroomsNeeded: number;
    newClassroomsNeeded: number;
  };
};

const ceil0 = (v: number) => Math.ceil(Math.max(0, v));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pctTo01 = (p: number) => clamp01((isFinite(p) ? p : 0) / 100);
const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);

export function buildEditableDefaults(baseline: BaselinePayload): EditableInputs {
  const pctOutOfSchool: EditableInputs['pctOutOfSchool'] = {} as Record<LevelCode, number>;
  const pctPrivate: EditableInputs['pctPrivate'] = {} as Record<LevelCode, number>;
  const pctIntegral: EditableInputs['pctIntegral'] = {} as Record<LevelCode, number>;
  const pctNocturnal: EditableInputs['pctNocturnal'] = {} as Record<LevelCode, number>;
  const seatsPerClass: EditableInputs['seatsPerClass'] = {} as Record<LevelCode, number>;
  const existingClassrooms: EditableInputs['existingClassrooms'] = {} as Record<LevelCode, number>;
  const pop: EditableInputs['pop'] = {} as Record<LevelCode, number>;

  for (const lvl of LEVELS) {
    const b = baseline[lvl];
    const outPct = 100 * (1 - safeDiv(b.totalEnroll, b.pop));
    const privPct = 100 * safeDiv(b.privateEnroll, b.pop);
    const integralPct = 100 * clamp01(b.integralEnrollShare);
    const nocturnalPct = 100 * clamp01(b.nocturnalShare);

    pctOutOfSchool[lvl] = isFinite(outPct) ? Math.max(0, outPct) : 0;
    pctPrivate[lvl] = isFinite(privPct) ? Math.max(0, privPct) : 0;
    pctIntegral[lvl] = integralPct;
    pctNocturnal[lvl] = nocturnalPct;
    seatsPerClass[lvl] = b.seatsPerClass;
    existingClassrooms[lvl] = b.existingClassrooms;
    pop[lvl] = b.pop;
  }

  return { pctOutOfSchool, pctPrivate, pctIntegral, pctNocturnal, seatsPerClass, existingClassrooms, pop };
}

export function computeTable(inputs: EditableInputs): TableOutput {
  const byLevel = {} as Record<LevelCode, DerivedPerLevel>;
  const totals = { studentsPublic: 0, totalSeatsNeeded: 0, classroomsNeeded: 0, newClassroomsNeeded: 0 };

  for (const lvl of LEVELS) {
    const pop = inputs.pop[lvl] ?? 0;

    const studentsPublic =
      pop * (1 - pctTo01(inputs.pctOutOfSchool[lvl]) - pctTo01(inputs.pctPrivate[lvl]));

    const totalSeatsNeeded =
      studentsPublic * (1 + pctTo01(inputs.pctIntegral[lvl])) * (1 - pctTo01(inputs.pctNocturnal[lvl]));

    const seatsPerClass = Math.max(1, Math.floor(inputs.seatsPerClass[lvl] ?? 1));
    const classroomsNeeded = ceil0(totalSeatsNeeded / seatsPerClass);
    const existing = Math.max(0, inputs.existingClassrooms[lvl] ?? 0);
    const newClassroomsNeeded = ceil0(classroomsNeeded - existing);

    byLevel[lvl] = {
      studentsPublic,
      totalSeatsNeeded,
      classroomsNeeded,
      newClassroomsNeeded,
    };

    totals.studentsPublic += studentsPublic;
    totals.totalSeatsNeeded += totalSeatsNeeded;
    totals.classroomsNeeded += classroomsNeeded;
    totals.newClassroomsNeeded += newClassroomsNeeded;
  }

  return { byLevel, totals };
}
